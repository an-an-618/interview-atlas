import { afterEach, describe, expect, it, vi } from "vitest";
import { addMockInterview, appendMockInterviewMessage, emptyWorkspace, updateMockInterviewHarness } from "../domain/workspace";
import { createMockInterviewHarness, getMockInterviewProgress } from "../domain/mockInterviewHarness";
import { createOpenAICompatibleClient, buildMockInterviewSystemPrompt } from "./openAICompatibleClient";
import { createMockInterviewToolbox, mockMaterialCatalog } from "./mockInterviewTools";
import { parseMockObservation } from "./mockInterviewProtocol";
import { parseWorkspaceExport } from "../data/workspaceImport";
import { MOCK_AGENT_TIME_BUDGET_MS } from "./mockInterviewAgent";
import { MockInterviewRuntime, type MockInterviewRuntimeOptions } from "./mockInterviewRuntime";
import type { MockInterviewTrace } from "../domain/types";

const config = { protocol: "openai-compatible" as const, model: "mock-model", endpoint: "https://example.com/v1" };
const question = { message: "请说明这个项目中你本人的决策？", action: "ask", competencyId: "project", shouldEnd: false, endReason: "" };
function fixture(answer = false) {
  let workspace = addMockInterview(emptyWorkspace(), {
    company: "星河", role: "Agent 产品经理", round: "二面", jobDescription: "工具调用与评测",
    additionalInfo: "", interviewerPrompt: "", targetQuestionCount: 3,
  }).workspace;
  const id = workspace.mockInterviews[0]!.id;
  workspace = updateMockInterviewHarness(workspace, id, createMockInterviewHarness(workspace.mockInterviews[0]!, config)).workspace;
  if (answer) {
    workspace = appendMockInterviewMessage(workspace, id, "interviewer", "介绍项目", { kind: "ask", competencyId: "project" }).workspace;
    workspace = appendMockInterviewMessage(workspace, id, "candidate", "我们优化了召回策略，让覆盖率提高了。").workspace;
  }
  const base = { createdAt: "2026-11-11", updatedAt: "2026-11-11" };
  workspace.resumeExperiences.push({ ...base, id: "r", type: "项目", title: "召回评测", organization: "星河", period: "",
    bullets: ["召回策略工具调用的对照验证。".repeat(300)], linkedQuestionIds: ["q"], linkedSyncBlockIds: ["hidden"] });
  workspace.questions.push({ ...base, id: "q", title: "验证方法", answer: "召回评测采用对照实验。", tags: [], notes: "",
    sourceInterviewIds: ["i"], linkedSyncBlockId: "b" },
    { ...base, id: "sample", title: "召回样例", answer: "不发送", tags: [], notes: "", sourceInterviewIds: [], linkedSyncBlockId: null, sample: true });
  workspace.syncBlocks.push({ ...base, id: "b", title: "评测聚合", body: "召回策略归因验证", reviewNotes: "", linkedQuestionIds: ["q"],
    hidden: false, favorite: false, pinned: false },
    { ...base, id: "hidden", title: "召回隐藏材料", body: "hidden-secret", reviewNotes: "", linkedQuestionIds: ["q"],
      hidden: true, favorite: false, pinned: false });
  workspace.interviews.push({ ...base, id: "i", company: "星河科技有限公司", role: "Agent 产品经理", round: "一面", date: "2026-11-11",
    source: "", rawText: "召回归因面试", questionIds: ["q"], status: "reviewed" },
    { ...base, id: "sim", company: "星河", role: "", round: "", date: "", source: "", rawText: "模拟材料",
      questionIds: [], status: "reviewed", simulated: true });
  return { workspace, session: workspace.mockInterviews[0]! };
}
const reply = (value: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }));
const toolReply = (name: string, args: Record<string, unknown>, id: string = crypto.randomUUID()) =>
  new Response(JSON.stringify({ choices: [{ message: { content: null, tool_calls: [
    { id, type: "function", function: { name, arguments: JSON.stringify({ reason: "澄清验证方法", ...args }) } },
  ] } }] }));
const requestBody = (init: RequestInit | undefined) => JSON.parse(String(init?.body));
afterEach(() => vi.useRealTimers());

describe("workspace-local readonly tools", () => {
  it("searches with provenance and navigates only discovered, visible graph edges", () => {
    const f = fixture(), box = createMockInterviewToolbox(f.session, f.workspace);
    const exec = (name: string, args: object) => box.execute(name, JSON.stringify({ reason: "查询验证方法", ...args }), 2);
    expect(exec("read_material", { materialId: "resume:r" }).status).toBe("error");
    const found = exec("search_knowledge", { query: "召回", kind: "resume" });
    expect(found.materialIds).toEqual(["resume:r"]);
    expect(JSON.stringify(found.data)).toContain("匹配词");
    expect(exec("read_material", { materialId: "resume:r", length: 300 }).status).toBe("incomplete");
    const neighbors = exec("get_related_materials", { materialId: "resume:r" });
    expect(neighbors.materialIds).toEqual(["question:q"]);
    expect(exec("get_related_materials", { materialId: "question:q" }).materialIds).toContain("block:b");
    expect(exec("get_related_materials", { materialId: "question:q" }).materialIds).toContain("interview:i");
    expect(JSON.stringify(mockMaterialCatalog(f.workspace))).not.toMatch(/hidden-secret|question:sample|interview:sim/);
  });
  it("distinguishes no results, invalid params and partial reads", () => {
    const f = fixture(), box = createMockInterviewToolbox(f.session, f.workspace);
    const exec = (name: string, args: object) => box.execute(name, JSON.stringify({ reason: "补充事实", ...args }), 2);
    expect(exec("search_knowledge", { query: "不存在的外星主题xyz" }).status).toBe("no_results");
    expect(exec("search_knowledge", { query: "召回", company: "别的公司" }).status).toBe("no_results");
    expect(exec("search_knowledge", { query: "召回", company: "星河", kind: "interview" }).materialIds).toEqual(["interview:i"]);
    for (const args of [{ query: "召回", limit: 10 }, { query: "召回", kind: "file" }, { query: "召回", url: "https://example.com" }])
      expect(exec("search_knowledge", args).status).toBe("error");
    expect(box.execute("delete_material", "{}", 2).status).toBe("error");
    expect(box.execute("search_knowledge", "{", 2).status).toBe("error");
    exec("search_knowledge", { query: "召回", kind: "resume" });
    expect(exec("read_material", { materialId: "resume:r", start: -1 }).status).toBe("error");
    expect(exec("read_material", { materialId: "resume:r", start: 99999 }).status).toBe("error");
  });
  it("keeps asked, answered and evidence sufficiency separate", () => {
    const f = fixture(true);
    expect(getMockInterviewProgress(f.session).answeredIds).toEqual(["project"]);
    const result = createMockInterviewToolbox(f.session, f.workspace).execute("get_interview_state", '{"reason":"检查剩余预算"}', 1);
    expect(result.data).toMatchObject({ mainAsked: 1, mainAnswered: 1, remainingToolCalls: 1, observations: [] });
    const prompt = buildMockInterviewSystemPrompt(f.session, f.workspace, true);
    expect(prompt).not.toContain("召回策略工具调用的对照验证");
    expect(prompt).toContain("latestCandidateMessageId");
  });
});

describe("native interviewer decision loop", () => {
  it("echoes native calls and IDs, uses returned evidence to read then ask, and traces progress", async () => {
    const f = fixture(true), checkpoints: MockInterviewTrace[] = [];
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(toolReply("search_knowledge", { query: "召回", kind: "resume" }, "search1"))
      .mockResolvedValueOnce(toolReply("read_material", { materialId: "resume:r", length: 300 }, "read1"))
      .mockResolvedValueOnce(reply({ ...question, action: "followup", message: "覆盖率的提高如何归因于你的方案？",
        observation: { competencyId: "project", evidenceSufficient: false, gaps: ["本人贡献与归因缺口"],
          nextFocus: "验证个人贡献", evidenceRefs: [{ messageId: f.session.messages.at(-1)!.id, quote: "让覆盖率提高了" }] } }));
    const turn = await createOpenAICompatibleClient(fetcher).continueMockInterview(config, "", {
      ...f, onTrace: async (t) => { checkpoints.push(structuredClone(t)); },
    });
    const second = requestBody(fetcher.mock.calls[1]![1]);
    expect(second.messages.find((m: { role: string }) => m.role === "assistant" && "tool_calls" in m).tool_calls[0].id).toBe("search1");
    expect(second.messages.find((m: { role: string }) => m.role === "tool").tool_call_id).toBe("search1");
    expect(turn.trace).toMatchObject({ mode: "native", attempts: 3, action: "followup", outcome: "completed" });
    expect(turn.trace!.tools!.map((t) => t.status)).toEqual(["ok", "incomplete"]);
    expect(turn.observation!.evidenceRefs[0]).toMatchObject({ quote: "让覆盖率提高了", start: 10 });
    expect(checkpoints.map((t) => t.outcome)).toEqual(["running", "running", "completed"]);
    expect(JSON.stringify(turn.trace)).not.toContain("Authorization");
  });
  it("returns no_results and malformed calls to the model as distinct bounded outcomes", async () => {
    const f = fixture(), fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(toolReply("search_knowledge", { query: "不存在的外星主题xyz" }))
      .mockResolvedValueOnce(toolReply("unknown_tool", {}))
      .mockResolvedValueOnce(reply(question));
    const turn = await createOpenAICompatibleClient(fetcher).continueMockInterview(config, "", f);
    expect(turn.trace!.tools!.map((t) => t.status)).toEqual(["no_results", "error"]);
    const third = requestBody(fetcher.mock.calls[2]![1]);
    expect(third.messages.filter((m: { role: string }) => m.role === "tool").map((m: { content: string }) => JSON.parse(m.content).status)).toEqual(["no_results", "error"]);
  });
  it("counts invalid or duplicate calls, stops after three, and reserves a final model request", async () => {
    const f = fixture(), fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(toolReply("search_knowledge", { query: "召回" }))
      .mockResolvedValueOnce(toolReply("search_knowledge", { query: "召回", reason: "不同理由" }))
      .mockResolvedValueOnce(toolReply("get_interview_state", {}))
      .mockResolvedValueOnce(reply(question));
    const turn = await createOpenAICompatibleClient(fetcher).continueMockInterview(config, "", f);
    expect(turn.trace!.tools).toHaveLength(3);
    expect(turn.trace!.tools![1]!.detail).toContain("已执行");
    expect(requestBody(fetcher.mock.calls[3]![1]).tools).toBeUndefined();
    expect(turn.trace!.budgetReason).toContain("三次");
  });
  it("limits oversized batches and uncooperative models without displaying raw tool text", async () => {
    const f = fixture(), fetcher = vi.fn<typeof fetch>(async () => toolReply("get_interview_state", {}));
    await expect(createOpenAICompatibleClient(fetcher).continueMockInterview(config, "", f)).rejects.toThrow("上限");
    expect(fetcher).toHaveBeenCalledTimes(5);
    const oversized = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ choices: [{ message: { content: null, tool_calls: Array.from({ length: 9 }, (_, i) => ({
      id: String(i), type: "function", function: { name: "get_interview_state", arguments: '{"reason":"查看状态"}' },
    })) } }] })));
    await expect(createOpenAICompatibleClient(oversized).continueMockInterview(config, "", f)).rejects.toThrow("协议无效");
    expect(oversized).toHaveBeenCalledTimes(1);
  });
  it("rejects reused native IDs and malformed tool arguments envelopes", async () => {
    const f = fixture(), fetcher = vi.fn<typeof fetch>(async () => toolReply("get_interview_state", {}, "same-id"));
    await expect(createOpenAICompatibleClient(fetcher).continueMockInterview(config, "", f)).rejects.toThrow("协议无效");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("explicitly falls back only on unsupported tools and remembers it in this session", async () => {
    const f = fixture(), fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{"error":{"message":"unsupported parameter: tools"}}', { status: 400 }))
      .mockResolvedValueOnce(reply(question));
    const turn = await createOpenAICompatibleClient(fetcher).continueMockInterview(config, "", f);
    expect(turn.trace).toMatchObject({ mode: "fallback", attempts: 2 });
    expect(turn.trace!.fallbackReason).toContain("明确拒绝");
    expect(requestBody(fetcher.mock.calls[1]![1]).tools).toBeUndefined();
    f.session.harness!.mode = "fallback"; f.session.harness!.fallbackReason = turn.trace!.fallbackReason;
    const next = vi.fn<typeof fetch>(async () => reply(question));
    await createOpenAICompatibleClient(next).continueMockInterview(config, "", f);
    expect(next).toHaveBeenCalledTimes(1);
    expect(requestBody(next.mock.calls[0]![1]).tools).toBeUndefined();
  });
  it("does not label a content-only reply as verified tool capability or hide auth failures", async () => {
    const f = fixture(), plain = vi.fn<typeof fetch>(async () => reply(question));
    const turn = await createOpenAICompatibleClient(plain).continueMockInterview(config, "", f);
    expect(turn.trace!.mode).toBe("unconfirmed");
    const forbidden = vi.fn<typeof fetch>(async () => new Response("tools unauthorized", { status: 401 }));
    await expect(createOpenAICompatibleClient(forbidden).continueMockInterview(config, "", f)).rejects.toThrow("API Key");
    expect(forbidden).toHaveBeenCalledTimes(1);
  });
  it("rejects too much current context before transport", async () => {
    const f = fixture(true); f.session.messages.at(-1)!.content = "答".repeat(48000);
    const fetcher = vi.fn<typeof fetch>();
    await expect(createOpenAICompatibleClient(fetcher).continueMockInterview(config, "", f)).rejects.toThrow("预算");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("checkpoints errors and cancellation and aborts at the total time limit", async () => {
    vi.useFakeTimers();
    const f = fixture(), checkpoints: MockInterviewTrace[] = [];
    const fetcher = vi.fn<typeof fetch>()
      .mockImplementationOnce(async () => new Promise((resolve) => { setTimeout(() => resolve(toolReply("get_interview_state", {})), 60_000); }))
      .mockImplementation(async (_url, init) => new Promise((_resolve, reject) => {
        init!.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      }));
    const operation = createOpenAICompatibleClient(fetcher).continueMockInterview(config, "", { ...f, onTrace: async (t) => { checkpoints.push(structuredClone(t)); } });
    const assertion = expect(operation).rejects.toThrow(/超时|预算/);
    await vi.advanceTimersByTimeAsync(MOCK_AGENT_TIME_BUDGET_MS);
    await assertion;
    expect(checkpoints.at(-1)).toMatchObject({ outcome: "failed" });
    expect(checkpoints.at(-1)!.tools).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("keeps a failed native loop retryable and preserves its last tool checkpoint", async () => {
    const f = fixture(), traces: MockInterviewTrace[] = [], controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>(async () => {
      if (fetcher.mock.calls.length === 1) return toolReply("search_knowledge", { query: "召回" });
      controller.abort();
      throw new DOMException("Aborted", "AbortError");
    });
    await expect(createOpenAICompatibleClient(fetcher).continueMockInterview(config, "", { ...f, onTrace: async (t) => { traces.push(structuredClone(t)); } }, controller.signal)).rejects.toThrow("取消");
    expect(traces.at(-1)).toMatchObject({ outcome: "interrupted", mode: "native" });
    expect(traces.at(-1)!.materialIds.length).toBeGreaterThan(0);
  });
  it("retains failed tool traces when rendered runtime options lag completed writes", async () => {
    const f = fixture(true), rendered = structuredClone(f.workspace);
    let persisted = f.workspace;
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(toolReply("search_knowledge", { query: "召回" }))
      .mockImplementation(async () => new Response("temporary failure", { status: 503 }));
    const options: MockInterviewRuntimeOptions = {
      workspace: rendered, config, apiKey: "", client: createOpenAICompatibleClient(fetcher),
      create: async () => f.session,
      updateHarness: async (id, harness) => {
        const updated = updateMockInterviewHarness(persisted, id, harness);
        persisted = updated.workspace;
        return updated.session;
      },
      append: async () => { throw new Error("Unexpected append"); },
      end: async () => { throw new Error("Unexpected end"); },
      analyze: async () => { throw new Error("Unexpected analysis"); },
      focus: vi.fn(), changed: vi.fn(),
    };
    await new MockInterviewRuntime(() => options).retry(f.session.id);
    const harness = persisted.mockInterviews[0]!.harness!;
    expect(harness.turnStatus).toBe("failed");
    expect(harness.traces).toHaveLength(1);
    expect(harness.traces[0]).toMatchObject({ mode: "native", outcome: "failed", attempts: 3 });
    expect(harness.traces[0]!.tools).toHaveLength(1);
  });
  it("keeps immediate fallback checkpoints running so reload can recover them", async () => {
    const f = fixture(true);
    f.session.harness!.mode = "fallback";
    const rendered = structuredClone(f.workspace);
    let persisted = f.workspace;
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    const options: MockInterviewRuntimeOptions = {
      workspace: rendered, config, apiKey: "", client: createOpenAICompatibleClient(fetcher),
      create: async () => f.session,
      updateHarness: async (id, harness) => {
        const updated = updateMockInterviewHarness(persisted, id, harness); persisted = updated.workspace; return updated.session;
      },
      append: async () => { throw new Error("Unexpected append"); },
      end: async () => { throw new Error("Unexpected end"); },
      analyze: async () => { throw new Error("Unexpected analysis"); },
      focus: vi.fn(), changed: vi.fn(),
    };
    const runtime = new MockInterviewRuntime(() => options), pending = runtime.retry(f.session.id);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(persisted.mockInterviews[0]!.harness!.turnStatus).toBe("running");
    runtime.dispose();
    await pending;
    expect(persisted.mockInterviews[0]!.harness).toMatchObject({ turnStatus: "interrupted", mode: "fallback" });
  });
});

describe("current-session evidence and backups", () => {
  it("validates exact current candidate quotes and excludes historical, stale, foreign-topic and contradictory claims", () => {
    const f = fixture(true), candidate = f.session.messages.at(-1)!;
    const value = { competencyId: "project", evidenceSufficient: false, gaps: ["个人贡献"], nextFocus: "核验本人决策",
      evidenceRefs: [{ messageId: candidate.id, quote: "我们优化了召回策略" }] };
    expect(parseMockObservation(value, f.session)!.evidenceRefs[0]!.start).toBe(0);
    for (const invalid of [
      { ...value, evidenceSufficient: true }, { ...value, competencyId: "agent" },
      { ...value, evidenceRefs: [{ messageId: "question:q", quote: "召回评测采用对照实验。" }] },
      { ...value, evidenceRefs: [{ messageId: candidate.id, quote: "我亲自提升了99%" }] },
    ]) expect(() => parseMockObservation(invalid, f.session)).toThrow();
    expect(parseMockObservation({ ...value, evidenceSufficient: true, gaps: [] }, f.session)!.evidenceSufficient).toBe(true);
  });
  it("retains new trace and observation fields on backup and rejects corrupted offsets", async () => {
    const f = fixture(true), candidate = f.session.messages.at(-1)!;
    f.workspace.resumeExperiences[0]!.linkedSyncBlockIds = []; // Drop intentionally hidden fixture edge for import's existing relationship rules.
    f.workspace.syncBlocks[1]!.linkedQuestionIds = [];
    f.workspace.interviews.pop();
    f.session.harness!.observations = [parseMockObservation({ competencyId: "project", evidenceSufficient: false,
      gaps: ["本人贡献"], nextFocus: "追问", evidenceRefs: [{ messageId: candidate.id, quote: "覆盖率提高了" }] }, f.session)!];
    f.session.harness!.traces = [{ id: "t", operation: "turn", model: config.model, endpoint: config.endpoint,
      promptVersion: "mock-agent-2", inputCharacters: 100, durationMs: 5, attempts: 1, materialIds: ["resume:r"], mode: "native",
      outcome: "completed", gaps: ["本人贡献"], nextFocus: "追问", tools: [{ callId: "c", name: "search_knowledge",
        query: "召回", status: "ok", materialIds: ["resume:r"], durationMs: 1, detail: "匹配" }] }];
    const exportValue = () => JSON.stringify({ ...f.workspace, formatVersion: 11, exportedAt: "2026-11-11" });
    expect(parseWorkspaceExport(exportValue()).workspace.mockInterviews[0]!.harness).toEqual(f.session.harness);
    f.session.harness!.observations[0]!.evidenceRefs[0]!.start = 0;
    expect(() => parseWorkspaceExport(exportValue())).toThrow("原文");
  });
});
