import type { Workspace, AIReviewCandidate } from "./types";
import { isAIReviewCandidatePending } from "./workspace";

export type KnowledgeKind = "interview" | "question" | "sync" | "resume";
export interface KnowledgeTarget { kind: KnowledgeKind; id: string }
export const kindLabels: Record<KnowledgeKind, string> = {
  interview: "面试记录", question: "原子问答", sync: "聚合块", resume: "简历经历",
};
export interface KnowledgeDraft {
  title: string; body: string; notes: string; tags: string;
  company: string; role: string; round: string; date: string; source: string;
  organization: string; period: string; type: string;
}
export function knowledgeEntries(workspace: Workspace) {
  return [
    ...workspace.interviews.map(i => ({ kind: "interview" as const, id: i.id,
      title: [i.company, i.role, i.round].filter(Boolean).join(" · "), body: i.rawText, updatedAt: i.updatedAt })),
    ...workspace.questions.map(i => ({ kind: "question" as const, id: i.id, title: i.title, body: i.answer, updatedAt: i.updatedAt })),
    ...workspace.syncBlocks.filter(i => !i.hidden).map(i => ({ kind: "sync" as const, id: i.id, title: i.title, body: i.body, updatedAt: i.updatedAt })),
    ...workspace.resumeExperiences.map(i => ({ kind: "resume" as const, id: i.id, title: i.title, body: i.bullets.join("\n"), updatedAt: i.updatedAt })),
  ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export function draftFor(workspace: Workspace, target: KnowledgeTarget): KnowledgeDraft {
  const entry = knowledgeEntries(workspace).find(i => i.kind === target.kind && i.id === target.id);
  const draft: KnowledgeDraft = { title: entry?.title ?? "", body: entry?.body ?? "", notes: "", tags: "",
    company: "", role: "", round: "", date: "", source: "", organization: "", period: "", type: "" };
  if (target.kind === "sync") draft.notes = workspace.syncBlocks.find(i => i.id === target.id)?.reviewNotes ?? "";
  if (target.kind === "question") {
    const q = workspace.questions.find(i => i.id === target.id);
    draft.notes = q?.notes ?? ""; draft.tags = q?.tags.join("，") ?? "";
  }
  if (target.kind === "interview") {
    const i = workspace.interviews.find(i => i.id === target.id);
    if (i) Object.assign(draft, { company: i.company, role: i.role, round: i.round, date: i.date, source: i.source });
  }
  if (target.kind === "resume") {
    const i = workspace.resumeExperiences.find(i => i.id === target.id);
    if (i) Object.assign(draft, { organization: i.organization, period: i.period, type: i.type });
  }
  return draft;
}
export function relatedTargets(workspace: Workspace, target: KnowledgeTarget): KnowledgeTarget[] {
  const result: KnowledgeTarget[] = [];
  const add = (kind: KnowledgeKind, id: string) => {
    if ((kind !== target.kind || id !== target.id) && !result.some(i => i.kind === kind && i.id === id)) result.push({ kind, id });
  };
  const questions = workspace.questions.filter(q =>
    target.kind === "question" ? q.id === target.id :
    target.kind === "interview" ? q.sourceInterviewIds.includes(target.id) :
    target.kind === "sync" ? workspace.syncBlocks.find(i => i.id === target.id)?.linkedQuestionIds.includes(q.id) :
    workspace.resumeExperiences.find(i => i.id === target.id)?.linkedQuestionIds.includes(q.id));
  for (const q of questions) {
    add("question", q.id);
    q.sourceInterviewIds.forEach(id => add("interview", id));
    if (q.linkedSyncBlockId) add("sync", q.linkedSyncBlockId);
  }
  workspace.resumeExperiences.filter(r =>
    (target.kind === "resume" && r.id === target.id) ||
    (target.kind === "sync" && r.linkedSyncBlockIds.includes(target.id)) ||
    r.linkedQuestionIds.some(id => questions.some(q => q.id === id)))
    .forEach(r => { add("resume", r.id); r.linkedSyncBlockIds.forEach(id => add("sync", id)); });
  return result.filter(t => knowledgeEntries(workspace).some(e => e.kind === t.kind && e.id === t.id));
}
export function reviewProgress(candidates: AIReviewCandidate[]) {
  return { processed: candidates.filter(c => c.questionDecision !== "pending").length,
    total: candidates.length, pendingLinks: candidates.filter(c => c.questionDecision === "accepted" && c.syncDecision === "pending").length,
    pending: candidates.filter(isAIReviewCandidatePending).length };
}
export function sourceMatch(raw: string, excerpt: string): { start: number; end: number } | null {
  if (!excerpt.trim()) return null;
  const start = raw.indexOf(excerpt.trim());
  // Only a unique, exact match is a reliable automatic locator.
  if (start < 0 || raw.indexOf(excerpt.trim(), start + 1) >= 0) return null;
  return { start, end: start + excerpt.trim().length };
}
export function actionableTasks(workspace: Workspace) {
  return [
    ...workspace.interviews.filter(i => !i.simulated).flatMap(i => {
      const review = workspace.aiReviews.find(r => r.interviewId === i.id);
      const p = reviewProgress(review?.candidates ?? []);
      const task = i.extractionTask;
      if (!p.pending && task?.status === "completed") return [];
      if (!p.pending && !task && i.status === "reviewed") return [];
      const state = task && ["failed", "interrupted", "cancelled"].includes(task.status) ? "提取未完成 · 可重试" :
        task && ["queued", "running"].includes(task.status) ? (task.status === "queued" ? "等待提取" : "正在提取") :
        p.total ? `已处理 ${p.processed} / ${p.total} 条${p.pendingLinks ? ` · ${p.pendingLinks} 条待确认关联` : ""}` : "原文已保存 · 开始整理";
      return [{ key: `organize:${i.id}`, id: i.id, type: "organize" as const,
        title: [i.company, i.role].filter(Boolean).join(" · "), state, action: p.total ? "继续核对" : "打开整理",
        updatedAt: review?.updatedAt ?? task?.updatedAt ?? i.updatedAt }];
    }),
    ...workspace.mockInterviews.filter(s => s.status === "active" || !s.feedback).map(s => ({
      key: `mock:${s.id}`, id: s.id, type: "mock" as const, title: `${s.company} · ${s.role}`,
      state: s.status === "active" ? "面试进行中" : "反馈尚未生成 · 可重试",
      action: s.status === "active" ? "继续面试" : "打开复盘", updatedAt: s.messages.at(-1)?.createdAt ?? s.startedAt,
    })),
  ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
