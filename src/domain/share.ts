import type { AtomicQuestion, Interview, Workspace } from "./types";

export type ShareTarget = {
  kind: "question" | "aggregate" | "resume" | "interview";
  id: string;
};
export type ShareOption = "source" | "dates" | "tags" | "notes" | "raw" | "watermark";
export type ShareOptions = Record<ShareOption, boolean>;
export const SHARE_GITHUB_URL = "https://github.com/an-an-618/interview-atlas";
export interface ShareSection {
  label: string;
  title?: string;
  body: string;
  items?: string[];
}
export interface ShareDocument {
  kind: ShareTarget["kind"];
  title: string;
  subtitle: string;
  sections: ShareSection[];
  sources: string[];
  dates: string[];
  tags: string[];
  notes: ShareSection[];
  rawText: string;
}

export const shareKindLabels: Record<ShareTarget["kind"], string> = {
  question: "原子问答",
  aggregate: "聚合块",
  resume: "简历经历",
  interview: "面试经历",
};

const unique = (values: string[]) => [...new Set(values.filter(Boolean))];
const day = (value: string) => value.slice(0, 10);
const interviewLabel = (item: Interview) =>
  [item.company, item.role, item.round, item.simulated ? "模拟面试" : ""]
    .filter(Boolean).join(" · ");

function relatedQuestions(workspace: Workspace, questionIds: string[], blockIds: string[] = []) {
  const ids = new Set(questionIds);
  const blocks = new Set(blockIds);
  for (const block of workspace.syncBlocks) {
    if (blocks.has(block.id)) block.linkedQuestionIds.forEach((id) => ids.add(id));
  }
  return workspace.questions.filter((question) =>
    ids.has(question.id) || (question.linkedSyncBlockId && blocks.has(question.linkedSyncBlockId)),
  );
}

function sourceInterviews(workspace: Workspace, questions: AtomicQuestion[]) {
  const ids = new Set(questions.flatMap((question) => question.sourceInterviewIds));
  const questionIds = new Set(questions.map((question) => question.id));
  return workspace.interviews.filter((interview) =>
    ids.has(interview.id) || interview.questionIds.some((id) => questionIds.has(id)),
  );
}

/** Build a read-only snapshot; sharing never changes stored content or relationships. */
export function buildShareDocument(target: ShareTarget, workspace: Workspace): ShareDocument {
  const result: ShareDocument = {
    kind: target.kind, title: "", subtitle: "", sections: [],
    sources: [], dates: [], tags: [], notes: [], rawText: "",
  };
  let questions: AtomicQuestion[] = [];
  let updatedAt = "";
  if (target.kind === "question") {
    const question = workspace.questions.find((item) => item.id === target.id);
    if (!question) throw new Error("原子问答已不存在，请重新选择。");
    result.title = question.title;
    result.sections = [{ label: "回答", body: question.answer || "尚未填写回答。" }];
    result.notes = question.notes.trim() ? [{ label: "笔记", body: question.notes }] : [];
    result.tags = [...question.tags];
    questions = [question];
    updatedAt = question.updatedAt;
  } else if (target.kind === "aggregate") {
    const block = workspace.syncBlocks.find((item) => item.id === target.id);
    if (!block) throw new Error("聚合块已不存在，请重新选择。");
    result.title = block.title;
    result.sections = [{ label: "聚合回答", body: block.body || "尚未填写回答。" }];
    result.notes = block.reviewNotes.trim() ? [{ label: "复习笔记", body: block.reviewNotes }] : [];
    // Related questions are used solely to resolve provenance, never exported.
    questions = relatedQuestions(workspace, block.linkedQuestionIds, [block.id]);
    updatedAt = block.updatedAt;
  } else if (target.kind === "resume") {
    const experience = workspace.resumeExperiences.find((item) => item.id === target.id);
    if (!experience) throw new Error("简历经历已不存在，请重新选择。");
    result.title = experience.title;
    result.subtitle = [experience.type, experience.organization].filter(Boolean).join(" · ");
    result.sections = [{
      label: "经历要点",
      body: experience.bullets.length
        ? experience.bullets.map((bullet) => `• ${bullet}`).join("\n")
        : "尚未填写经历要点。",
    }];
    if (experience.period) result.dates.push(experience.period);
    questions = relatedQuestions(workspace, experience.linkedQuestionIds, experience.linkedSyncBlockIds);
    updatedAt = experience.updatedAt;
  } else {
    const interview = workspace.interviews.find((item) => item.id === target.id);
    if (!interview) throw new Error("面试经历已不存在，请重新选择。");
    result.title = [interview.company, interview.role].filter(Boolean).join(" · ") || "面试经历";
    result.subtitle = [interview.round, interview.simulated ? "模拟面试" : ""].filter(Boolean).join(" · ");
    // Preserve interview order and include legacy one-sided relationships.
    const ids = unique([
      ...interview.questionIds,
      ...workspace.questions.filter((question) => question.sourceInterviewIds.includes(interview.id)).map((question) => question.id),
    ]);
    questions = ids.flatMap((id) => workspace.questions.find((question) => question.id === id) ?? []);
    result.sections = questions.map((question, index) => ({
      label: `问答 ${String(index + 1).padStart(2, "0")}`,
      title: question.title,
      body: question.answer || "尚未填写回答。",
    }));
    result.notes = questions.filter((question) => question.notes.trim()).map((question) => ({
      label: "问答笔记", title: question.title, body: question.notes,
    }));
    result.tags = unique(questions.flatMap((question) => question.tags));
    result.rawText = interview.rawText;
    result.sources = interview.source ? [`记录来源 · ${interview.source}`] : [];
    if (interview.date) result.dates.push(`面试时间 · ${interview.date}`);
    updatedAt = interview.updatedAt;
  }
  if (target.kind !== "interview") {
    const interviews = sourceInterviews(workspace, questions);
    result.sources = unique(interviews.map(interviewLabel));
    result.dates.push(...interviews.filter((item) => item.date).map((item) => `面试时间 · ${item.date}`));
  }
  if (updatedAt) result.dates.push(`更新于 ${day(updatedAt)}`);
  result.dates = unique(result.dates);
  return result;
}

export function defaultShareOptions(document: ShareDocument): ShareOptions {
  return {
    source: false, dates: false, tags: false, notes: false, watermark: false,
    raw: document.kind === "interview" && document.sections.length === 0 && Boolean(document.rawText.trim()),
  };
}

export function shareSections(document: ShareDocument, options: ShareOptions): ShareSection[] {
  const sections: ShareSection[] = [{ label: "title", body: document.title }];
  if (document.subtitle) sections.push({ label: "subtitle", body: document.subtitle });
  if (options.dates && document.dates.length) sections.push({ label: "时间信息", body: document.dates.join("\n") });
  if (options.tags && document.tags.length) sections.push({ label: "标签", body: document.tags.join(" · ") });
  sections.push(...document.sections);
  if (document.sections.length === 0 && !options.raw) {
    sections.push({ label: "问答", body: "尚未整理问答。可打开「原始面试记录」导出原文。" });
  }
  if (options.notes) sections.push(...document.notes);
  if (options.raw && document.rawText.trim()) sections.push({ label: "原始面试记录", body: document.rawText });
  if (options.source && document.sources.length) {
    sections.push({
      label: document.kind === "interview" ? "记录来源" : "来源面试",
      body: document.sources.join("\n"),
      items: document.sources,
    });
  }
  return sections;
}

export function shareFilename(document: ShareDocument, page: number, total: number) {
  const clean = document.title.replace(/[<>:"/\\|?*\u0000-\u001f]/gu, "").trim();
  // Bound UTF-8 filename bytes without splitting an emoji or surrogate pair.
  let safeTitle = "";
  const encoder = new TextEncoder();
  for (const part of new Intl.Segmenter("zh", { granularity: "grapheme" }).segment(clean)) {
    if (encoder.encode(safeTitle + part.segment).length > 160) break;
    safeTitle += part.segment;
  }
  safeTitle ||= "分享";
  return `见字如面-${shareKindLabels[document.kind]}-${safeTitle}-${String(page).padStart(2, "0")}of${String(total).padStart(2, "0")}.png`;
}
