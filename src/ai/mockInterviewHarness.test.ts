import { describe, expect, it, vi } from "vitest";
import {
  addMockInterview, appendMockInterviewMessage, applyMockInterviewAnalysis,
  emptyWorkspace, endMockInterview, updateMockInterviewHarness,
} from "../domain/workspace";
import { createMockInterviewHarness, getMockInterviewProgress, recoverMockInterviewRuns, validateMockInterviewAction } from "../domain/mockInterviewHarness";
import { buildMockInterviewHistory, buildMockInterviewKnowledgeContext, MOCK_INPUT_CHARACTER_BUDGET } from "./mockInterviewContext";
import { parseMockInterviewReportResponse, createOpenAICompatibleClient } from "./openAICompatibleClient";
import { MockInterviewRuntime, type MockInterviewRuntimeOptions } from "./mockInterviewRuntime";
import { parseWorkspaceExport } from "../data/workspaceImport";
import type { AIClient, AIMockInterviewTurn } from "./types";
import type { MockInterviewSession, Workspace } from "../domain/types";

const input = {
  company: "星河", role: "Agent 产品经理", round: "业务二面",
  jobDescription: "负责智能体策略、工具调用和评测指标", additionalInfo: "",
  interviewerPrompt: "", targetQuestionCount: 3,
};
const config = { protocol: "openai-compatible" as const, model: "test-model", endpoint: "https://example.com/v1" };
const turn: AIMockInterviewTurn = { message: "请介绍你的项目和本人贡献？", action: "ask", competencyId: "project", shouldEnd: false, endReason: "" };
const feedback = {
  summary: "回答包含实践过程", overallAssessment: "仅根据本次回答观察。", strengths: [], improvements: [],
  nextSteps: [], questionReviews: [], generatedAt: "2026-11-11",
};
const response = (value: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }), { status: 200 });

function fixture() {
  let workspace = addMockInterview(emptyWorkspace(), input).workspace;
  const id = workspace.mockInterviews[0]!.id;
  workspace = updateMockInterviewHarness(workspace, id, createMockInterviewHarness(workspace.mockInterviews[0]!, config)).workspace;
  const append = (role: "interviewer" | "candidate", content: string, kind: "ask" | "followup" | "end" = "ask", competencyId = "project") => {
    workspace = appendMockInterviewMessage(workspace, id, role, content, role === "interviewer" ? { kind, competencyId } : {}).workspace;
    return workspace.mockInterviews[0]!;
  };
  return { id, append, get workspace() { return workspace; }, get session() { return workspace.mockInterviews[0]!; } };
}

describe("mock interview harness policy", () => {
  it("derives JD competencies and counts followups separately from main questions", () => {
    const f = fixture();
    expect(f.session.harness!.plan.map((p) => p.id)).toEqual(["project", "agent", "evaluation"]);
    f.append("interviewer", "介绍项目");
    f.append("candidate", "我设计了评测方案并实际验证指标。");
    f.append("interviewer", "如何验证指标？", "followup");
    f.append("candidate", "先建立基线，然后对照失败样本。");
    expect(getMockInterviewProgress(f.session)).toMatchObject({ mainAsked: 1, mainAnswered: 1, followups: 1, totalAnswers: 2, observedIds: ["project"] });
  });
  it("rejects early ending, duplicate questions, foreign competencies and excess followups", () => {
    const f = fixture();
    expect(() => validateMockInterviewAction(f.session, { ...turn, action: "end", shouldEnd: true })).toThrow("提前结束");
    expect(() => validateMockInterviewAction(f.session, { ...turn, competencyId: "unknown" })).toThrow("计划之外");
    f.append("interviewer", turn.message);
    f.append("candidate", "我负责工具调用，并做过失败恢复测试。");
    expect(() => validateMockInterviewAction(f.session, turn)).toThrow("重复");
    for (let i = 0; i < 2; i++) { f.append("interviewer", `追问${i}`, "followup"); f.append("candidate", "我们记录每个失败原因并回放验证。"); }
    expect(() => validateMockInterviewAction(f.session, { ...turn, message: "再追问", action: "followup" })).toThrow("两层");
  });
  it("accepts explicit stopping and distinguishes insufficient observation from skill mastery", () => {
    const f = fixture();
    f.append("interviewer", "介绍项目");
    f.append("candidate", "我想结束这次面试");
    expect(getMockInterviewProgress(f.session)).toMatchObject({ observedIds: [], endReason: "候选人明确要求结束" });
  });
  it("recovers interrupted turn and report requests without losing messages", () => {
    const f = fixture();
    f.append("interviewer", "介绍项目");
    f.session.harness!.turnStatus = "running";
    f.session.harness!.reportStatus = "running";
    const restored = recoverMockInterviewRuns(f.workspace);
    expect(restored.mockInterviews[0]!.harness).toMatchObject({ turnStatus: "interrupted", reportStatus: "interrupted" });
    expect(restored.mockInterviews[0]!.messages).toEqual(f.session.messages);
  });
});

describe("mock knowledge retrieval and budgets", () => {
  it("keeps verified practice goals even when larger knowledge fills the budget", () => {
    const f = fixture();
    f.workspace.mockInterviews.push({ ...f.session, id: "past", feedback: { ...feedback, evidenceVerified: true, nextSteps: ["练习描述工具选择的依据"] } });
    for (let i = 0; i < 20; i++) f.workspace.syncBlocks.push({
      id: `b${i}`, title: "智能体工具调用评测", body: "评测方案和工具选择。".repeat(400),
      reviewNotes: "", linkedQuestionIds: [], favorite: false, pinned: false, hidden: false, createdAt: "", updatedAt: "",
    });
    const result = buildMockInterviewKnowledgeContext(f.session, f.workspace);
    expect(result.materialIds).toContain("practice:past");
    expect(JSON.stringify(result.context)).toContain("不是本场表现");
    expect(JSON.stringify(result.context).length).toBeLessThanOrEqual(10_000);
  });
  it("falls back to same-role real interviews across companies and normalizes company suffixes", () => {
    const f = fixture();
    const base = { id: "i1", company: "星河科技有限公司", role: input.role, round: "一面", date: "2026-11-10", source: "",
      rawText: "请解释工具调用的失败恢复策略。", status: "reviewed" as const, questionIds: [], createdAt: "", updatedAt: "" };
    f.workspace.interviews.push(base, { ...base, id: "i2", company: "另一家" }, { ...base, id: "sim", simulated: true });
    const result = buildMockInterviewKnowledgeContext(f.session, f.workspace);
    expect(result.materialIds).toContain("interview:i1");
    expect(result.materialIds).not.toContain("interview:i2");
    expect(result.materialIds).not.toContain("interview:sim");
    f.workspace.interviews.splice(0, 1);
    expect(JSON.stringify(buildMockInterviewKnowledgeContext(f.session, f.workspace).context)).toContain("跨公司同岗位");
  });
  it("uses resume graph relationships without exposing hidden blocks or treating practice volume as frequency", () => {
    const f = fixture();
    f.workspace.resumeExperiences.push({ id: "r", type: "工作", title: "智能体评测项目", organization: "", period: "", bullets: ["评测工具调用"],
      linkedQuestionIds: ["q"], linkedSyncBlockIds: ["hidden"], createdAt: "", updatedAt: "" });
    f.workspace.questions.push({ id: "q", title: "非常规复盘", answer: "另一个领域的内容", tags: [], notes: "", sourceInterviewIds: [],
      linkedSyncBlockId: null, createdAt: "", updatedAt: "" });
    f.workspace.syncBlocks.push({ id: "hidden", title: "不能发送的内容", body: "hidden secret", reviewNotes: "", linkedQuestionIds: ["q"],
      favorite: false, pinned: false, hidden: true, createdAt: "", updatedAt: "" });
    const result = buildMockInterviewKnowledgeContext(f.session, f.workspace);
    expect(result.materialIds).toContain("question:q");
    expect(result.materialIds).not.toContain("block:hidden");
    expect(JSON.stringify(result.context)).not.toContain("hidden secret");
    expect(JSON.stringify(result.context)).not.toContain('"frequency"');
  });
  it("preserves the full newest answer and supplies ID-linked excerpts for omitted history", () => {
    const f = fixture();
    for (let i = 0; i < 15; i++) { f.append("interviewer", `问题 ${i} ` + "问".repeat(500)); f.append("candidate", `回答 ${i} ` + "答".repeat(2500)); }
    const history = buildMockInterviewHistory(f.session, 10_000);
    expect(history.recent.at(-1)!.content).toBe(f.session.messages.at(-1)!.content);
    expect(history.omittedCount).toBeGreaterThan(0);
    expect(history.excerpts[0]).toHaveProperty("messageId");
    expect(history.recent.reduce((n, m) => n + m.content.length, 0)).toBeLessThanOrEqual(10_000);
  });
  it("rejects an oversized newest answer instead of silently cutting saved text", () => {
    const f = fixture();
    f.append("interviewer", "请介绍项目");
    f.append("candidate", "答".repeat(20_000));
    expect(() => buildMockInterviewHistory(f.session, 10_000)).toThrow("完整回答");
    expect(f.session.messages.at(-1)!.content).toHaveLength(20_000);
  });
});

describe("report evidence and backup fidelity", () => {
  const reportValue = (questionMessageId: string, messageId: string) => ({
    ...feedback,
    questions: [{ questionMessageId, title: "项目贡献", answer: "模型编造的提升 99%", tags: ["项目"],
      evidenceRefs: [{ messageId, quote: "我负责设计评测方案" }] }],
  });
  it("copies saved answers rather than model inventions and retains exact source offsets on export", () => {
    const f = fixture();
    f.append("interviewer", "请介绍项目贡献");
    f.append("candidate", "当时我负责设计评测方案，也整理了失败样本。");
    const result = parseMockInterviewReportResponse(JSON.stringify(reportValue(f.session.messages[0]!.id, f.session.messages[1]!.id)), f.session);
    expect(result.questions[0]!.answer).toBe(f.session.messages[1]!.content);
    expect(result.questions[0]!.answer).not.toContain("99%");
    expect(result.questions[0]!.evidenceRefs![0]).toMatchObject({ start: 2, quote: "我负责设计评测方案" });
    const ended = endMockInterview(f.workspace, f.id, "user", "测试结束");
    const analyzed = applyMockInterviewAnalysis(ended.workspace, f.id, result.feedback, result.questions);
    const restored = parseWorkspaceExport(JSON.stringify({ ...analyzed.workspace, formatVersion: 11, exportedAt: "2026-11-11" })).workspace;
    expect(restored.mockInterviews[0]!.harness).toEqual(f.session.harness);
    expect(restored.questions[0]!.evidenceRefs).toEqual(result.questions[0]!.evidenceRefs);
    expect(restored.questions[0]!.sourceExcerpt).toBe("我负责设计评测方案");
    restored.questions[0]!.evidenceRefs![0]!.start = 0;
    expect(() => parseWorkspaceExport(JSON.stringify({ ...restored, formatVersion: 11, exportedAt: "2026-11-11" }))).toThrow("原文");
  });
  it("rejects fabricated quotes and evidence belonging to a different question", () => {
    const f = fixture();
    f.append("interviewer", "项目");
    f.append("candidate", "我设计了工具调用的错误恢复。");
    const invalid = reportValue(f.session.messages[0]!.id, f.session.messages[1]!.id);
    expect(() => parseMockInterviewReportResponse(JSON.stringify(invalid), f.session)).toThrow("没有可核验");
    f.append("interviewer", "评测");
    f.append("candidate", "我负责设计评测方案");
    const crossQuestion = reportValue(f.session.messages[0]!.id, f.session.messages[3]!.id);
    expect(() => parseMockInterviewReportResponse(JSON.stringify(crossQuestion), f.session)).toThrow("没有可核验");
  });
  it("drops only invalid report entries while keeping valid evidence", () => {
    const f = fixture();
    f.append("interviewer", "项目");
    f.append("candidate", "我负责设计评测方案");
    const value = { ...reportValue(f.session.messages[0]!.id, f.session.messages[1]!.id),
      strengths: [{ title: "伪造结果", detail: "收入翻倍", evidenceRefs: [{ messageId: "not-real", quote: "收入翻倍" }] }] };
    const result = parseMockInterviewReportResponse(JSON.stringify(value), f.session);
    expect(result.feedback.strengths).toEqual([]);
    expect(result.questions).toHaveLength(1);
    expect(result.feedback.validationWarnings).toHaveLength(1);
  });
});

function runtimeFixture() {
  let workspace: Workspace = emptyWorkspace();
  const calls: string[] = [];
  const client = {
    continueMockInterview: vi.fn(async () => turn),
    generateMockInterviewReport: vi.fn(async () => ({ feedback, questions: [] })),
  } as unknown as AIClient;
  const options: MockInterviewRuntimeOptions = {
    client, config, apiKey: "test-only", get workspace() { return workspace; },
    create: async (value) => { const result = addMockInterview(workspace, value); workspace = result.workspace; return result.session; },
    updateHarness: async (id, harness) => { calls.push(`status:${harness.turnStatus}/${harness.reportStatus}`); const result = updateMockInterviewHarness(workspace, id, harness); workspace = result.workspace; return result.session; },
    append: async (id, role, content, metadata) => { calls.push(`save:${role}`); const result = appendMockInterviewMessage(workspace, id, role, content, metadata); workspace = result.workspace; return result.session; },
    end: async (id, by, reason) => { calls.push("end"); const result = endMockInterview(workspace, id, by, reason); workspace = result.workspace; return result; },
    analyze: async (id, f, q) => { const result = applyMockInterviewAnalysis(workspace, id, f, q); workspace = result.workspace; return result.session; },
    focus: vi.fn(), changed: vi.fn(), answerSaved: vi.fn(),
  };
  return { runtime: new MockInterviewRuntime(() => options), options, client, calls, get workspace() { return workspace; } };
}

describe("durable interview runtime", () => {
  it("allows only one request and saved answer during double submission", async () => {
    const f = runtimeFixture();
    await f.runtime.start(input);
    let release!: (value: AIMockInterviewTurn) => void;
    vi.mocked(f.client.continueMockInterview).mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    const id = f.workspace.mockInterviews[0]!.id;
    const pending = f.runtime.submit(id, "第一份回答");
    await vi.waitFor(() => expect(release).toBeDefined());
    await f.runtime.submit(id, "重复提交");
    release({ ...turn, message: "解释项目取舍", action: "followup" });
    await pending;
    expect(f.workspace.mockInterviews[0]!.messages.filter((m) => m.role === "candidate")).toHaveLength(1);
    expect(f.client.continueMockInterview).toHaveBeenCalledTimes(2);
  });
  it("discards responses after page disposal and pins the original model", async () => {
    const f = runtimeFixture();
    await f.runtime.start(input);
    f.options.config = { ...config, model: "new-global-model" };
    let release!: (value: AIMockInterviewTurn) => void;
    vi.mocked(f.client.continueMockInterview).mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    const id = f.workspace.mockInterviews[0]!.id;
    const pending = f.runtime.submit(id, "我实际负责了工具策略。");
    await vi.waitFor(() => expect(release).toBeDefined());
    expect(vi.mocked(f.client.continueMockInterview).mock.calls.at(-1)![0].model).toBe(config.model);
    f.runtime.dispose();
    release({ ...turn, message: "过期问题", action: "followup" });
    await pending;
    expect(f.workspace.mockInterviews[0]!.messages.at(-1)!.role).toBe("candidate");
    expect(recoverMockInterviewRuns(f.workspace).mockInterviews[0]!.harness!.turnStatus).toBe("interrupted");
  });
  it("saves answers before calls and retry never duplicates an already saved answer", async () => {
    const f = runtimeFixture();
    await f.runtime.start(input);
    const id = f.workspace.mockInterviews[0]!.id;
    vi.mocked(f.client.continueMockInterview).mockRejectedValueOnce(new Error("暂时不可用"));
    await f.runtime.submit(id, "我设计了工具调用和恢复机制。");
    expect(f.workspace.mockInterviews[0]!.harness!.turnStatus).toBe("failed");
    expect(f.options.answerSaved).toHaveBeenCalledOnce();
    vi.mocked(f.client.continueMockInterview).mockResolvedValue({ ...turn, message: "请解释恢复机制", action: "followup" });
    await f.runtime.retry(id);
    expect(f.workspace.mockInterviews[0]!.messages.filter((m) => m.role === "candidate")).toHaveLength(1);
    expect(f.workspace.mockInterviews[0]!.harness!.turnStatus).toBe("idle");
    expect(f.calls.indexOf("save:candidate")).toBeLessThan(f.calls.lastIndexOf("status:running/pending"));
  });
  it("keeps the draft if saving fails and prevents concurrent submissions", async () => {
    const f = runtimeFixture();
    await f.runtime.start(input);
    f.options.append = async () => { throw new Error("本地磁盘失败"); };
    const id = f.workspace.mockInterviews[0]!.id;
    await f.runtime.submit(id, "回答");
    expect(f.options.answerSaved).not.toHaveBeenCalled();
    expect(f.client.continueMockInterview).toHaveBeenCalledOnce();
    expect(f.options.changed).toHaveBeenLastCalledWith({ busy: false, analyzing: false, error: "本地磁盘失败" });
  });
  it("keeps a completed transcript when reports fail and retries only the report", async () => {
    const f = runtimeFixture();
    await f.runtime.start(input);
    const id = f.workspace.mockInterviews[0]!.id;
    vi.mocked(f.client.generateMockInterviewReport).mockRejectedValueOnce(new Error("报告失败"));
    await f.runtime.end(id);
    expect(f.workspace.interviews).toHaveLength(1);
    expect(f.workspace.mockInterviews[0]!.harness!.reportStatus).toBe("failed");
    await f.runtime.retry(id);
    expect(f.workspace.interviews).toHaveLength(1);
    expect(f.workspace.mockInterviews[0]!.harness!.reportStatus).toBe("completed");
    expect(f.client.continueMockInterview).toHaveBeenCalledOnce();
  });
  it("cancels a pending turn before user ending and never saves its stale response", async () => {
    const f = runtimeFixture();
    await f.runtime.start(input);
    let release!: (value: AIMockInterviewTurn) => void;
    vi.mocked(f.client.continueMockInterview).mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    const id = f.workspace.mockInterviews[0]!.id;
    const pending = f.runtime.submit(id, "候选人回答");
    await vi.waitFor(() => expect(release).toBeDefined());
    const ending = f.runtime.end(id);
    release({ ...turn, message: "不得保存的迟到问题" });
    await pending;
    await ending;
    expect(f.workspace.mockInterviews[0]!.status).toBe("completed");
    expect(f.workspace.mockInterviews[0]!.messages.map((m) => m.content)).not.toContain("不得保存的迟到问题");
  });
});

describe("provider repair and bounded input", () => {
  it("retries a temporary provider error once and never retries authentication failures", async () => {
    const f = fixture();
    const fetcher = vi.fn().mockResolvedValueOnce(new Response("unavailable", { status: 503 })).mockResolvedValueOnce(response(turn));
    const result = await createOpenAICompatibleClient(fetcher).continueMockInterview(config, "test", { session: f.session, workspace: f.workspace });
    expect(result.trace!.attempts).toBe(2);
    const denied = vi.fn(async () => new Response("", { status: 401 }));
    await expect(createOpenAICompatibleClient(denied).continueMockInterview(config, "test", { session: f.session, workspace: f.workspace })).rejects.toThrow("鉴权");
    expect(denied).toHaveBeenCalledOnce();
    const unavailable = vi.fn(async () => new Response("", { status: 503 }));
    await expect(createOpenAICompatibleClient(unavailable).continueMockInterview(config, "test", { session: f.session, workspace: f.workspace })).rejects.toThrow("不可用");
    expect(unavailable).toHaveBeenCalledTimes(2);
  });
  it("repairs report evidence once with actual prompt-size traces and no knowledge material", async () => {
    const f = fixture();
    f.append("interviewer", "请介绍贡献");
    f.append("candidate", "我负责评测方案。");
    const valid = { ...feedback, questions: [{ questionMessageId: f.session.messages[0]!.id, title: "贡献",
      tags: [], evidenceRefs: [{ messageId: f.session.messages[1]!.id, quote: "我负责评测方案" }] }] };
    const fetcher = vi.fn().mockResolvedValueOnce(response({ ...feedback, questions: [] })).mockResolvedValueOnce(response(valid));
    const result = await createOpenAICompatibleClient(fetcher).generateMockInterviewReport(config, "test", f.session);
    const messages = JSON.parse(fetcher.mock.calls[1]![1].body).messages;
    expect(result.trace!.attempts).toBe(2);
    expect(result.trace!.inputCharacters).toBe(messages.reduce((n: number, m: { content: string }) => n + m.content.length, 0));
    expect(result.trace!.materialIds).toEqual([]);
    expect(messages[0].content).not.toContain("知识库参考");
    const invalid = vi.fn(async () => response({ ...feedback, questions: [] }));
    await expect(createOpenAICompatibleClient(invalid).generateMockInterviewReport(config, "test", f.session)).rejects.toThrow("没有可核验");
    expect(invalid).toHaveBeenCalledTimes(2);
  });
  it("repairs invalid JSON once, discards the invalid response and records attempts", async () => {
    const f = fixture();
    const fetcher = vi.fn().mockResolvedValueOnce(response({ message: "损坏响应", shouldEnd: "false" })).mockResolvedValueOnce(response(turn));
    const result = await createOpenAICompatibleClient(fetcher).continueMockInterview(config, "test", { session: f.session, workspace: f.workspace });
    expect(result.message).toBe(turn.message);
    expect(result.trace!.attempts).toBe(2);
    expect(result.trace!.inputCharacters).toBeLessThan(MOCK_INPUT_CHARACTER_BUDGET);
    expect(JSON.parse(fetcher.mock.calls[1]![1].body).messages.at(-1).content).toContain("校验未通过");
  });
  it("stops after one failed repair instead of exposing damaged JSON", async () => {
    const f = fixture();
    const fetcher = vi.fn(async () => response({ message: "损坏响应", shouldEnd: "false" }));
    await expect(createOpenAICompatibleClient(fetcher).continueMockInterview(config, "test", { session: f.session, workspace: f.workspace })).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
