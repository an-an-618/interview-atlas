import type { MockInterviewSession, Workspace } from "../domain/types";
import { getMockInterviewProgress } from "../domain/mockInterviewHarness";

export const MOCK_INPUT_CHARACTER_BUDGET = 48_000;
const KNOWLEDGE_BUDGET = 10_000;

const normalize = (text: string) => text.normalize("NFKC").toLowerCase();
export function normalizeMockCompany(text: string): string {
  return normalize(text).replace(/[\p{P}\p{S}\s]/gu, "").replace(/(?:(?:股份)?有限公司|集团|科技)+$/g, "");
}
const stop = new Set(["负责", "工作", "相关", "能力", "要求", "经验", "进行", "以及", "公司", "岗位", "一个", "我们", "项目", "如何"]);
export function mockSearchTerms(value: string): string[] {
  const terms = new Set<string>();
  for (const match of normalize(value).matchAll(/[a-z][a-z0-9+#.-]{1,}|[\u4e00-\u9fff]+/g)) {
    const term = match[0];
    if (/^[a-z]/.test(term)) terms.add(term);
    else for (let i = 0; i < term.length - 1; i++) {
      const pair = term.slice(i, i + 2);
      if (!stop.has(pair)) terms.add(pair);
    }
  }
  return [...terms].slice(0, 160);
}
const matchScore = (value: string, terms: string[]) => {
  const normalized = normalize(value);
  return terms.reduce((score, term) => score + (normalized.includes(term) ? 1 : 0), 0);
};

/** Keep complete paragraphs when possible; any excerpt is explicitly marked. */
export function mockExcerpt(value: string, maximum: number, terms: string[] = []): string {
  if (value.length <= maximum) return value;
  const paragraphs = value.split(/\n+|(?<=[。！？])\s*/).filter(Boolean);
  const ranked = paragraphs.map((text, index) => ({ text, index, score: matchScore(text, terms) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const chosen: typeof ranked = [];
  let length = 0;
  for (const paragraph of ranked) {
    if (length + paragraph.text.length + 1 > maximum - 25) continue;
    chosen.push(paragraph);
    length += paragraph.text.length + 1;
  }
  const excerpt = chosen.length
    ? chosen.sort((a, b) => a.index - b.index).map((item) => item.text).join("\n")
    : value.slice(0, maximum - 25);
  return `${excerpt}\n[原文摘录；其余内容保存在本地]`;
}

export function buildMockInterviewKnowledgeContext(session: MockInterviewSession, workspace: Workspace) {
  const progress = getMockInterviewProgress(session);
  const currentTopic = progress.plan.find((item) => item.id === progress.currentCompetencyId);
  const terms = mockSearchTerms(`${session.role} ${session.jobDescription} ${session.additionalInfo} ${currentTopic?.focus ?? progress.nextCompetency.focus}`);
  const answerTerms = mockSearchTerms(session.messages.filter((m) => m.role === "candidate").at(-1)?.content ?? "").slice(0, 40);
  const relevance = (value: string) => matchScore(value, terms) * 3 + matchScore(value, answerTerms);
  const company = normalizeMockCompany(session.company);
  const role = normalize(session.role).replace(/\s/g, "");
  const realInterviews = workspace.interviews.filter((item) => !item.simulated && !item.sample);
  const hasCompanyHistory = realInterviews.some((item) => normalizeMockCompany(item.company) === company);
  const scoredInterviews = realInterviews.map((item) => {
    const sameCompany = normalizeMockCompany(item.company) === company;
    const sameRole = normalize(item.role).replace(/\s/g, "") === role;
    const topicScore = relevance(`${item.role} ${item.rawText}`);
    return { item, score: (sameCompany ? 100 : 0) + (sameRole ? 40 : 0) + Math.min(topicScore, 30), sameCompany, sameRole };
  }).filter((entry) => hasCompanyHistory ? entry.sameCompany : entry.sameRole)
    .sort((a, b) => b.score - a.score || b.item.date.localeCompare(a.item.date)).slice(0, 4);
  const interviewIds = new Set(scoredInterviews.map(({ item }) => item.id));
  const interviewById = new Map(workspace.interviews.map((item) => [item.id, item]));
  const scoredResumes = workspace.resumeExperiences.map((item) => ({
    item, score: relevance(`${item.title} ${item.organization} ${item.bullets.join(" ")}`),
  })).sort((a, b) => b.score - a.score || b.item.updatedAt.localeCompare(a.item.updatedAt)).slice(0, 4);
  const resumeQuestions = new Set(scoredResumes.flatMap(({ item }) => item.linkedQuestionIds));
  const resumeBlocks = new Set(scoredResumes.flatMap(({ item }) => item.linkedSyncBlockIds));
  const visibleBlocks = new Map(workspace.syncBlocks.filter((item) => !item.hidden).map((item) => [item.id, item]));
  const scoredQuestions = workspace.questions.filter((q) => !q.sample).map((item) => {
    const fromHistory = item.sourceInterviewIds.some((id) => interviewIds.has(id));
    const simulatedOnly = item.sourceInterviewIds.length > 0 && item.sourceInterviewIds.every((id) => interviewById.get(id)?.simulated);
    const graphLinked = resumeQuestions.has(item.id) || !!item.linkedSyncBlockId && resumeBlocks.has(item.linkedSyncBlockId);
    const score = relevance(`${item.title} ${item.tags.join(" ")} ${item.answer}`) + (fromHistory ? 30 : 0) + (graphLinked ? 24 : 0);
    return { item, score: simulatedOnly ? score * 0.25 : score, simulatedOnly, graphLinked, fromHistory };
  }).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score || b.item.updatedAt.localeCompare(a.item.updatedAt)).slice(0, 10);
  const selectedQuestions = new Set(scoredQuestions.map(({ item }) => item.id));
  const scoredBlocks = [...visibleBlocks.values()].filter((item) => !item.sample).map((item) => {
    const graphLinked = resumeBlocks.has(item.id) || item.linkedQuestionIds.some((id) => selectedQuestions.has(id));
    return { item, graphLinked, score: relevance(`${item.title} ${item.body}`) + (graphLinked ? 24 : 0) };
  }).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score || b.item.updatedAt.localeCompare(a.item.updatedAt)).slice(0, 6);

  const pastPractice = workspace.mockInterviews.filter((past) => past.id !== session.id && past.feedback?.evidenceVerified &&
    (normalizeMockCompany(past.company) === company || normalize(past.role).replace(/\s/g, "") === role))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 2);
  const context = {
    priorInterviews: [] as object[], resumeExperiences: [] as object[],
    atomicQuestions: [] as object[], frequentQuestions: [] as object[], practiceGoals: [] as object[],
  };
  const materialIds: string[] = [];
  let used = JSON.stringify(context).length;
  const add = (key: keyof typeof context, value: object, id: string) => {
    const size = JSON.stringify(value).length + 1;
    if (used + size > KNOWLEDGE_BUDGET) return;
    context[key].push(value);
    materialIds.push(id);
    used += size;
  };
  // Reserve room for verified practice goals before adding larger source material.
  for (const past of pastPractice) add("practiceGoals", {
    id: past.id, sourceType: "已核验报告中的练习建议；不是本场表现",
    nextSteps: past.feedback!.nextSteps.slice(0, 3).map((step) => mockExcerpt(step, 180)),
  }, `practice:${past.id}`);
  // Interleave the ranked source categories so transcripts cannot monopolize the budget.
  for (let i = 0; i < 10; i++) {
    const interview = scoredInterviews[i];
    if (interview) add("priorInterviews", {
      id: interview.item.id, updatedAt: interview.item.updatedAt, sourceType: "真实面试",
      company: interview.item.company, role: interview.item.role, round: interview.item.round,
      match: interview.sameCompany ? interview.sameRole ? "同公司同岗位" : "同公司其他岗位" : "跨公司同岗位",
      selectionReason: "公司与岗位匹配，结合 JD 主题排序；仅参考风格",
      transcript: mockExcerpt(interview.item.rawText, 900, terms),
    }, `interview:${interview.item.id}`);
    const resume = scoredResumes[i];
    if (resume) add("resumeExperiences", {
      id: resume.item.id, updatedAt: resume.item.updatedAt, sourceType: "简历经历",
      title: resume.item.title, organization: resume.item.organization, period: resume.item.period,
      selectionReason: "JD、当前主题与项目关系", bullets: resume.item.bullets.slice(0, 5).map((text) => mockExcerpt(text, 220, terms)),
      linkedQuestionIds: resume.item.linkedQuestionIds.slice(0, 10),
      linkedSyncBlockIds: resume.item.linkedSyncBlockIds.filter((id) => visibleBlocks.has(id)).slice(0, 6),
    }, `resume:${resume.item.id}`);
    const question = scoredQuestions[i];
    if (question) add("atomicQuestions", {
      id: question.item.id, updatedAt: question.item.updatedAt,
      sourceType: question.simulatedOnly ? "过去模拟回答（降低权重）" : "个人历史问答",
      selectionReason: question.graphLinked ? "项目关系关联" : question.fromHistory ? "相关历史面试" : "JD 与当前主题",
      title: question.item.title, answer: mockExcerpt(question.item.answer, 450, terms), tags: question.item.tags.slice(0, 4),
      sourceInterviewIds: question.item.sourceInterviewIds.slice(0, 6),
    }, `question:${question.item.id}`);
    const block = scoredBlocks[i];
    if (block) add("frequentQuestions", {
      id: block.item.id, updatedAt: block.item.updatedAt, sourceType: "用户维护的聚合回答",
      selectionReason: block.graphLinked ? "项目或问答关系关联" : "JD 与当前主题",
      title: block.item.title, stableAnswer: mockExcerpt(block.item.body, 550, terms),
      linkedQuestionCount: block.item.linkedQuestionIds.length,
    }, `block:${block.item.id}`);
  }
  return { context, materialIds, characters: used };
}

export function buildMockInterviewHistory(session: MockInterviewSession, budget: number) {
  const recent = [...session.messages];
  const omitted = [];
  while (recent.length > 2 && recent.reduce((n, m) => n + m.content.length, 0) > budget) {
    omitted.push(recent.shift()!);
  }
  if (recent.reduce((n, m) => n + m.content.length, 0) > budget) {
    throw new Error("本轮完整回答超过上下文预算，请缩短本轮回答后重试。原始对话仍保存在本地。");
  }
  const excerpts = omitted.slice(-12).map((message) => ({
    messageId: message.id, role: message.role, competencyId: message.competencyId,
    excerpt: mockExcerpt(message.content, 150),
  }));
  return { recent, excerpts, omittedCount: omitted.length };
}
