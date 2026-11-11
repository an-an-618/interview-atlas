import type {
  MockInterviewEvidence, MockInterviewFeedbackItem, MockInterviewSession, MockInterviewObservation,
} from "../domain/types";
import type { AIMockInterviewReport, AIMockInterviewTurn } from "./types";
import { StructuredOutputError } from "./interviewExtraction";

type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, maximum: number) => typeof value === "string" ? value.trim().slice(0, maximum) : "";
const list = (value: unknown): RecordValue[] => Array.isArray(value) ? value.filter(record) : [];

export function parseMockTurnValue(value: RecordValue): AIMockInterviewTurn {
  if (typeof value.message !== "string" || !value.message.trim() || value.message.length > 4_000 ||
      typeof value.shouldEnd !== "boolean" || typeof value.endReason !== "string" ||
      !["ask", "followup", "end"].includes(String(value.action)) || typeof value.competencyId !== "string" ||
      value.competencyId.length > 80 || value.endReason.length > 500 ||
      value.shouldEnd !== (value.action === "end") ||
      value.action !== "end" && !value.competencyId.trim()) {
    throw new StructuredOutputError("面试官返回格式无效，需要重新生成本轮。");
  }
  return {
    message: value.message.trim(), shouldEnd: value.shouldEnd,
    endReason: value.shouldEnd ? value.endReason.trim() || "完成本场面试" : "",
    action: value.action as AIMockInterviewTurn["action"], competencyId: value.competencyId.trim(),
  };
}

export function parseMockObservation(value: unknown, session: MockInterviewSession): MockInterviewObservation | undefined {
  if (value === undefined || value === null) return undefined;
  if (!record(value) || typeof value.evidenceSufficient !== "boolean" ||
      !Array.isArray(value.gaps) || value.gaps.length > 6 ||
      value.gaps.some((gap) => typeof gap !== "string" || !gap.trim() || gap.length > 200) ||
      typeof value.nextFocus !== "string" || value.nextFocus.length > 300 ||
      !session.harness?.plan.some((p) => p.id === value.competencyId) || !Array.isArray(value.evidenceRefs)) {
    throw new StructuredOutputError("本轮观察字段无效。");
  }
  const refs = resolveMockEvidence(value.evidenceRefs, session);
  const latest = session.messages.at(-1);
  const question = [...session.messages].reverse().find((m) => m.role === "interviewer" && m.kind !== "end");
  if (latest?.role !== "candidate" || value.competencyId !== question?.competencyId ||
      value.evidenceRefs.length !== refs.length || refs.some((r) => r.messageId !== latest.id) ||
      value.evidenceSufficient && (!refs.length || value.gaps.length > 0)) {
    throw new StructuredOutputError("本轮观察必须引用当前主题最新候选人回答的连续原文；有缺口时不能标记证据充分。");
  }
  return {
    competencyId: String(value.competencyId), evidenceRefs: refs, evidenceSufficient: value.evidenceSufficient,
    gaps: value.gaps as string[], nextFocus: value.nextFocus.trim(),
  };
}

/** Match exact candidate text, retaining offsets into the saved, unmodified message. */
export function resolveMockEvidence(value: unknown, session: MockInterviewSession): MockInterviewEvidence[] {
  const refs = list(value);
  if (!refs.length || refs.length > 12) return [];
  const result: MockInterviewEvidence[] = [];
  for (const ref of refs) {
    const quote = text(ref.quote, 2_000);
    const message = session.messages.find((m) => m.id === ref.messageId && m.role === "candidate");
    const start = message && quote ? message.content.indexOf(quote) : -1;
    if (!message || start < 0 || quote.length < 2) return [];
    result.push({ messageId: message.id, quote, start, end: start + quote.length });
  }
  return result;
}

function answeredQuestion(value: RecordValue, session: MockInterviewSession) {
  const index = session.messages.findIndex((m) => m.id === value.questionMessageId && m.role === "interviewer" && m.kind !== "end");
  if (index < 0) return null;
  const candidates: string[] = [];
  for (let i = index + 1; i < session.messages.length; i++) {
    const message = session.messages[i]!;
    if (message.role === "interviewer" && message.kind !== "followup") break;
    if (message.role === "candidate") candidates.push(message.id);
  }
  const refs = resolveMockEvidence(value.evidenceRefs, session);
  if (!refs.length || refs.some((ref) => !candidates.includes(ref.messageId))) return null;
  return refs;
}

export function parseVerifiedMockReport(value: RecordValue, session: MockInterviewSession): AIMockInterviewReport {
  if (typeof value.summary !== "string" || typeof value.overallAssessment !== "string" ||
      !value.summary.trim() || !value.overallAssessment.trim() ||
      ["strengths", "improvements", "nextSteps", "questionReviews", "questions"].some((key) => !Array.isArray(value[key]))) {
    throw new StructuredOutputError("反馈报告缺少必要字段，请重试。");
  }
  const warnings: string[] = [];
  let validatedEvidence = 0;
  const items = (raw: unknown, category: string): MockInterviewFeedbackItem[] => list(raw).slice(0, 8).flatMap((item) => {
    const evidenceRefs = resolveMockEvidence(item.evidenceRefs, session);
    if (!text(item.title, 200) || !text(item.detail, 2_000) || !evidenceRefs.length) {
      warnings.push(`${category}中的一项缺少有效原文引用，已排除。`);
      return [];
    }
    validatedEvidence++;
    return [{ title: text(item.title, 200), detail: text(item.detail, 2_000), evidenceRefs }];
  });
  const strengths = items(value.strengths, "优点");
  const improvements = items(value.improvements, "改进项");
  const questionReviews = list(value.questionReviews).slice(0, 30).flatMap((item) => {
    const evidenceRefs = answeredQuestion(item, session);
    if (!evidenceRefs || !text(item.assessment, 2_000)) {
      warnings.push("一项逐题评价无法对应本场已回答的问题，已排除。");
      return [];
    }
    validatedEvidence++;
    return [{
      question: text(item.question, 300) || session.messages.find((m) => m.id === item.questionMessageId)!.content.slice(0, 300),
      assessment: text(item.assessment, 2_000), evidence: evidenceRefs.map((ref) => ref.quote).join("\n"),
      suggestion: text(item.suggestion, 2_000), questionMessageId: String(item.questionMessageId), evidenceRefs,
    }];
  });
  const seen = new Set<string>();
  const questions = list(value.questions).slice(0, 40).flatMap((item) => {
    const evidenceRefs = answeredQuestion(item, session);
    const id = String(item.questionMessageId);
    if (!evidenceRefs || !text(item.title, 300) || seen.has(id)) {
      warnings.push("一项原子问答缺少真实问答证据或重复，已排除。");
      return [];
    }
    seen.add(id);
    validatedEvidence++;
    // Use complete saved answers for automatic knowledge ingestion. The model's rewritten answer cannot invent facts.
    const answerIds = new Set(evidenceRefs.map((ref) => ref.messageId));
    const answer = session.messages.filter((m) => answerIds.has(m.id)).map((m) => m.content).join("\n\n");
    return [{
      title: text(item.title, 300), answer,
      tags: Array.isArray(item.tags) ? [...new Set(item.tags.map((tag) => text(tag, 32)).filter(Boolean))].slice(0, 4) : [],
      sourceExcerpt: evidenceRefs.map((ref) => ref.quote).join("\n"), questionMessageId: id, evidenceRefs,
    }];
  });
  if (session.messages.some((m) => m.role === "candidate") && !validatedEvidence) {
    throw new StructuredOutputError("报告没有可核验的候选人原文证据，已保留逐字稿，请重新生成报告。");
  }
  return {
    feedback: {
      summary: text(value.summary, 2_000), overallAssessment: text(value.overallAssessment, 4_000),
      strengths, improvements,
      nextSteps: Array.isArray(value.nextSteps) ? value.nextSteps.map((step) => text(step, 1_000)).filter(Boolean).slice(0, 10) : [],
      questionReviews, generatedAt: new Date().toISOString(),
      validationWarnings: [...new Set(warnings)], evidenceVerified: validatedEvidence > 0,
    },
    questions,
  };
}
