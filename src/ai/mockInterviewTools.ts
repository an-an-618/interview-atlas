import type { MockInterviewSession, MockInterviewToolTrace, Workspace } from "../domain/types";
import { getMockInterviewProgress } from "../domain/mockInterviewHarness";
import { mockExcerpt, mockSearchTerms, normalizeMockCompany } from "./mockInterviewContext";

export const MOCK_TOOL_NAMES = ["search_knowledge", "read_material", "get_related_materials", "get_interview_state"] as const;
export type MockToolName = typeof MOCK_TOOL_NAMES[number];
const kinds = ["resume", "question", "block", "interview"] as const;
type Kind = typeof kinds[number];
interface Material {
  id: string; kind: Kind; title: string; text: string; source: string;
  company: string; role: string; related: string[]; weight: number;
}
const ref = (kind: Kind, id: string) => `${kind}:${id}`;
const clean = (value: string) => value.normalize("NFKC").toLowerCase().replace(/\s/g, "");

/** A workspace-local allowlist. No files, network, writes, hidden blocks or example data. */
export function mockMaterialCatalog(workspace: Workspace): Material[] {
  const interviews = workspace.interviews.filter((i) => !i.sample && !i.simulated);
  const interviewIds = new Set(interviews.map((i) => i.id));
  const questions = workspace.questions.filter((q) => !q.sample);
  const blocks = workspace.syncBlocks.filter((b) => !b.hidden && !b.sample);
  const entries: Material[] = [
    ...workspace.resumeExperiences.map((r): Material => ({
      id: ref("resume", r.id), kind: "resume", title: r.title,
      text: `${r.organization} ${r.period}\n${r.bullets.join("\n")}`, source: "简历经历",
      company: r.organization, role: "", weight: 1,
      related: [...r.linkedQuestionIds.map((id) => ref("question", id)), ...r.linkedSyncBlockIds.map((id) => ref("block", id))],
    })),
    ...questions.map((q): Material => {
      const simulatedOnly = q.sourceInterviewIds.length > 0 && q.sourceInterviewIds.every((id) => workspace.interviews.find((i) => i.id === id)?.simulated);
      return {
        id: ref("question", q.id), kind: "question", title: q.title,
        text: `${q.tags.join(" ")}\n${q.answer}`, source: simulatedOnly ? "过去模拟回答；不是本场证据" : "个人历史问答；不是本场证据",
        company: "", role: "", weight: simulatedOnly ? 0.25 : 1,
        related: [...q.sourceInterviewIds.filter((id) => interviewIds.has(id)).map((id) => ref("interview", id)),
          ...(q.linkedSyncBlockId ? [ref("block", q.linkedSyncBlockId)] : [])],
      };
    }),
    ...blocks.map((b): Material => ({
      id: ref("block", b.id), kind: "block", title: b.title, text: b.body,
      source: "用户维护的聚合回答；不是本场证据", company: "", role: "", weight: 1,
      related: b.linkedQuestionIds.map((id) => ref("question", id)),
    })),
    ...interviews.map((i): Material => ({
      id: ref("interview", i.id), kind: "interview", title: `${i.company} · ${i.role} · ${i.round}`,
      text: i.rawText, company: i.company, role: i.role, source: "真实历史面试；只参考风格", weight: 1.2,
      related: i.questionIds.map((id) => ref("question", id)),
    })),
  ];
  const ids = new Set(entries.map((m) => m.id));
  entries.forEach((m) => { m.related = [...new Set(m.related)].filter((id) => ids.has(id)); });
  // Existing links are navigable in both directions, never by title guessing.
  for (const m of entries) for (const id of [...m.related]) {
    const target = entries.find((item) => item.id === id)!;
    if (!target.related.includes(m.id)) target.related.push(m.id);
  }
  return entries;
}

const properties = {
  reason: { type: "string", maxLength: 200, description: "当前信息缺口与选择此工具的理由" },
  limit: { type: "integer", minimum: 1, maximum: 6 },
  materialId: { type: "string", maxLength: 120, description: "工具结果返回的类型前缀 ID" },
};
export const MOCK_INTERVIEW_TOOLS = MOCK_TOOL_NAMES.map((name) => ({
  type: "function" as const,
  function: {
    name,
    description: {
      search_knowledge: "按项目、能力或事实缺口查找本地知识，仅返回短摘录与来源。",
      read_material: "读取已发现材料的原文范围。截断时明确 incomplete，可选择新范围。",
      get_related_materials: "沿已有简历→问答→聚合块→真实面试关系读取邻接材料。",
      get_interview_state: "读取本场已问、已答、证据记录、剩余预算与可执行动作。",
    }[name],
    parameters: {
      type: "object", additionalProperties: false,
      properties: name === "search_knowledge"
        ? { reason: properties.reason, query: { type: "string", minLength: 2, maxLength: 200 },
          kind: { type: "string", enum: kinds }, company: { type: "string", maxLength: 100 },
          role: { type: "string", maxLength: 100 }, limit: properties.limit }
        : name === "read_material"
          ? { reason: properties.reason, materialId: properties.materialId,
            start: { type: "integer", minimum: 0, maximum: 100_000 },
            length: { type: "integer", minimum: 1, maximum: 2400 } }
          : name === "get_related_materials"
            ? { reason: properties.reason, materialId: properties.materialId, limit: properties.limit }
            : { reason: properties.reason },
      required: name === "search_knowledge" ? ["query", "reason"]
        : name === "get_interview_state" ? ["reason"] : ["materialId", "reason"],
    },
  },
}));

export interface LocalToolResult {
  status: MockInterviewToolTrace["status"]; detail: string; materialIds: string[]; data?: unknown;
}
export function createMockInterviewToolbox(session: MockInterviewSession, workspace: Workspace) {
  const catalog = mockMaterialCatalog(workspace);
  const discovered = new Set<string>();
  const brief = (m: Material, match: string) => ({
    materialId: m.id, title: mockExcerpt(m.title, 200), source: m.source, match,
    snippet: mockExcerpt(m.text, 450), totalCharacters: m.text.length,
    usage: "准备素材，不可作为本场候选人证据",
  });
  return {
    execute(name: string, raw: string, remainingCalls: number): LocalToolResult {
      const error = (detail: string): LocalToolResult => ({ status: "error", detail, materialIds: [] });
      if (!MOCK_TOOL_NAMES.includes(name as MockToolName)) return error("未知工具；只允许已声明的四个只读工具。");
      let a: Record<string, unknown>;
      try {
        if (raw.length > 2000) return error("参数过长。");
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return error("参数必须为 JSON 对象。");
        a = parsed as Record<string, unknown>;
      } catch { return error("参数不是完整 JSON。"); }
      const allowed = {
        search_knowledge: ["query", "kind", "company", "role", "limit", "reason"],
        read_material: ["materialId", "start", "length", "reason"],
        get_related_materials: ["materialId", "limit", "reason"],
        get_interview_state: ["reason"],
      }[name as MockToolName];
      if (Object.keys(a).some((k) => !allowed.includes(k))) return error("包含未允许的参数。");
      if (typeof a.reason !== "string" || !a.reason.trim() || a.reason.length > 200) return error("需要简短的工具选择理由。");
      const integer = (key: string, fallback: number, max: number, min = 1) =>
        a[key] === undefined ? fallback : typeof a[key] === "number" && Number.isInteger(a[key]) && a[key] >= min && a[key] <= max ? a[key] as number : NaN;
      const limit = integer("limit", 4, 6);
      if (!Number.isFinite(limit)) return error("limit 需要为 1–6。");
      if (name === "get_interview_state") {
        const p = getMockInterviewProgress(session);
        return { status: "ok", detail: "本场状态来自已保存消息；证据充分是模型观察，不表示掌握能力。", materialIds: [], data: {
          plan: p.plan, mainAsked: p.mainAsked, mainAnswered: p.mainAnswered,
          currentCompetencyId: p.currentCompetencyId, currentFollowups: p.currentFollowups,
          remainingMainQuestions: Math.max(0, session.targetQuestionCount - p.mainAsked), remainingToolCalls: remainingCalls,
          allowedActions: [p.canAsk && "ask", p.canFollowup && "followup", p.canEnd && "end"].filter(Boolean),
          answeredIds: p.answeredIds,
          observations: (session.harness?.observations ?? []).map((o) => ({
            ...o, gaps: o.gaps.slice(0, 3).map((g) => mockExcerpt(g, 80)), nextFocus: mockExcerpt(o.nextFocus, 100),
            evidenceRefs: o.evidenceRefs.slice(0, 1).map((r) => ({ messageId: r.messageId, quote: mockExcerpt(r.quote, 100) })),
          })),
          questions: session.messages.filter((m) => m.role === "interviewer").slice(-12).map((m) => ({ id: m.id, kind: m.kind, competencyId: m.competencyId, text: mockExcerpt(m.content, 150) })),
        } };
      }
      if (name === "search_knowledge") {
        if (typeof a.query !== "string" || a.query.trim().length < 2 || a.query.length > 200 ||
            a.kind !== undefined && !kinds.includes(a.kind as Kind) ||
            ["company", "role"].some((key) => a[key] !== undefined && (typeof a[key] !== "string" || (a[key] as string).length > 100))) return error("检索词或筛选条件无效。");
        const terms = mockSearchTerms(a.query);
        const matches = catalog.filter((m) =>
          (!a.kind || m.kind === a.kind) && (!a.company || normalizeMockCompany(m.company) === normalizeMockCompany(a.company as string)) &&
          (!a.role || clean(m.role) === clean(a.role as string)))
          .map((m) => ({ m, hits: terms.filter((t) => clean(`${m.title} ${m.text}`).includes(t)) }))
          .filter(({ hits }) => hits.length).sort((x, y) =>
            y.hits.length * y.m.weight - x.hits.length * x.m.weight ||
            Number(normalizeMockCompany(y.m.company) === normalizeMockCompany(session.company)) - Number(normalizeMockCompany(x.m.company) === normalizeMockCompany(session.company)))
          .slice(0, limit);
        matches.forEach(({ m }) => discovered.add(m.id));
        return { status: matches.length ? "ok" : "no_results", detail: matches.length ? "本地关键词与来源权重排序；匹配不等于事实证明。" : "未找到符合条件的本地材料；可改检索词或直接询问候选人。", materialIds: matches.map(({ m }) => m.id),
          data: matches.map(({ m, hits }) => brief(m, `匹配词：${hits.slice(0, 8).join("、")}；权重 ${m.weight}`)) };
      }
      if (typeof a.materialId !== "string" || !discovered.has(a.materialId)) return error("只能读取本轮工具已发现的材料 ID。请先检索。");
      const material = catalog.find((m) => m.id === a.materialId);
      if (!material) return error("材料已不可见或不存在。");
      if (name === "get_related_materials") {
        const related = material.related.map((id) => catalog.find((m) => m.id === id)!).slice(0, limit);
        related.forEach((m) => discovered.add(m.id));
        return { status: related.length ? "ok" : "no_results", detail: related.length ? "返回已有关系中的可见材料。" : "该材料没有可见关联。", materialIds: related.map((m) => m.id), data: related.map((m) => brief(m, `与 ${material.id} 存在已保存关系`)) };
      }
      const start = integer("start", 0, 100_000, 0), length = integer("length", 1600, 2400);
      if (!Number.isFinite(start) || !Number.isFinite(length) || start > material.text.length) return error("原文读取范围无效。");
      const end = Math.min(start + length, material.text.length);
      return { status: start > 0 || end < material.text.length ? "incomplete" : "ok",
        detail: start > 0 || end < material.text.length ? "这是部分原文，不可推断未读取部分。" : "已返回完整材料原文。",
        materialIds: [material.id], data: { ...brief(material, "读取已发现材料"),
          text: material.text.slice(start, end), start, end, totalCharacters: material.text.length } };
    },
  };
}
