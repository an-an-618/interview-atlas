import type { MockInterviewTrace } from "../domain/types";
import type { AIMockInterviewTurn, AIMockInterviewTurnInput, AIProviderConfig } from "./types";
import { createMockInterviewToolbox, MOCK_INTERVIEW_TOOLS, type LocalToolResult } from "./mockInterviewTools";
import { MOCK_INPUT_CHARACTER_BUDGET } from "./mockInterviewContext";
import { MOCK_AGENT_PROMPT_VERSION, MOCK_HARNESS_PROMPT_VERSION } from "../domain/mockInterviewHarness";

export const MAX_MOCK_TOOL_CALLS = 3;
export const MAX_MOCK_MODEL_REQUESTS = 5;
export const MOCK_AGENT_TIME_BUDGET_MS = 120_000;
export interface NativeToolCall {
  id: string; type: "function"; function: { name: string; arguments: string };
}
export interface AgentMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: NativeToolCall[];
  tool_call_id?: string;
}
export class NativeToolsUnsupportedError extends Error {}
interface AgentOptions {
  input: AIMockInterviewTurnInput;
  config: AIProviderConfig;
  messages: AgentMessage[];
  request(messages: AgentMessage[], tools: boolean, signal: AbortSignal, timeout: number, onAttempt: () => void): Promise<AgentMessage>;
  parse(content: string): AIMockInterviewTurn;
  fallback(signal: AbortSignal, onAttempt: () => void): Promise<AIMockInterviewTurn>;
  signal?: AbortSignal;
}

/** Single interviewer, bounded inner loop; the application still owns the outer interview. */
export async function runMockInterviewAgent(options: AgentOptions): Promise<AIMockInterviewTurn> {
  const { input, config, messages } = options;
  const started = Date.now(), controller = new AbortController();
  let deadline = false;
  const abort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => { deadline = true; controller.abort(); }, MOCK_AGENT_TIME_BUDGET_MS);
  const trace: MockInterviewTrace = {
    id: crypto.randomUUID(), operation: "turn", model: config.model, endpoint: config.endpoint,
    promptVersion: MOCK_AGENT_PROMPT_VERSION, inputCharacters: 0, durationMs: 0, attempts: 0, materialIds: [],
    mode: input.session.harness?.mode === "native" ? "native" : "unconfirmed", tools: [], outcome: "running",
  };
  const checkpoint = async () => {
    trace.durationMs = Date.now() - started;
    await input.onTrace?.({ ...trace, tools: [...trace.tools!], materialIds: [...trace.materialIds] });
  };
  const attempt = () => {
    if (Date.now() - started >= MOCK_AGENT_TIME_BUDGET_MS) throw new Error("本轮已达到两分钟时间预算。");
    if (controller.signal.aborted) throw new Error("本轮请求已中断。");
    if (trace.attempts >= MAX_MOCK_MODEL_REQUESTS) throw new Error("已达到本轮模型请求上限，请重试。");
    trace.attempts++;
  };
  const toolbox = createMockInterviewToolbox(input.session, input.workspace);
  const seenIds = new Set<string>(), signatures = new Set<string>();
  let forceFinal = false, repaired = false;
  const complete = async (turn: AIMockInterviewTurn) => {
    trace.action = turn.action; trace.outcome = "completed";
    if (turn.observation) { trace.gaps = turn.observation.gaps; trace.nextFocus = turn.observation.nextFocus; }
    await checkpoint();
    return { ...turn, trace };
  };
  const fallback = async (reason: string) => {
    trace.mode = "fallback"; trace.fallbackReason = reason; trace.promptVersion = MOCK_HARNESS_PROMPT_VERSION;
    await checkpoint();
    const turn = await options.fallback(controller.signal, attempt);
    trace.inputCharacters = Math.max(trace.inputCharacters, turn.trace?.inputCharacters ?? 0);
    trace.materialIds = turn.trace?.materialIds ?? [];
    return complete(turn);
  };
  try {
    if (input.session.harness?.mode === "fallback") {
      return await fallback(input.session.harness.fallbackReason || "本场模型服务不支持原生工具，使用应用检索。");
    }
    while (trace.attempts < MAX_MOCK_MODEL_REQUESTS) {
      const characters = JSON.stringify(messages).length + (forceFinal ? 0 : JSON.stringify(MOCK_INTERVIEW_TOOLS).length);
      trace.inputCharacters = Math.max(trace.inputCharacters, characters);
      if (characters > MOCK_INPUT_CHARACTER_BUDGET) throw new Error("本轮上下文超过预算，已保留回答与调用记录。");
      const remaining = MOCK_AGENT_TIME_BUDGET_MS - (Date.now() - started);
      if (remaining <= 0 || controller.signal.aborted) throw new Error("本轮已达到时间预算，已保留回答，请重试。");
      if (remaining <= 15_000 && !forceFinal) {
        forceFinal = true; trace.budgetReason = "接近时间预算；停止检索并生成问题";
        messages.push({ role: "user", content: "本轮剩余时间有限，停止工具调用并返回合法最终动作；信息不足时询问缺口。" });
      }
      // Reserve one model request to produce a final action.
      if (trace.attempts >= MAX_MOCK_MODEL_REQUESTS - 1) forceFinal = true;
      let reply: AgentMessage;
      try { reply = await options.request(messages, !forceFinal, controller.signal, Math.min(75_000, remaining), attempt); }
      catch (reason) {
        if (reason instanceof NativeToolsUnsupportedError && !trace.tools!.length) {
          return await fallback("模型服务明确拒绝原生工具参数；已切换为应用检索。");
        }
        throw reason;
      }
      if (controller.signal.aborted) throw new Error("本轮请求已中断。");
      if (reply.tool_calls?.length) {
        trace.mode = "native";
        const calls = reply.tool_calls;
        // Reject malformed envelopes: never put fabricated tool-call IDs back into provider history.
        if (calls.length > 8 || calls.some((c) => !c || typeof c.id !== "string" || !c.id || c.id.length > 120 || c.type !== "function" ||
            !c.function || typeof c.function.name !== "string" || c.function.name.length > 100 ||
            typeof c.function.arguments !== "string" || c.function.arguments.length > 2000 ||
            seenIds.has(c.id)) || new Set(calls.map((c) => c.id)).size !== calls.length) {
          throw new Error("模型工具调用协议无效，已保留回答，请重试。");
        }
        messages.push({ role: "assistant", content: reply.content, tool_calls: calls });
        for (const call of calls) {
          seenIds.add(call.id);
          const before = Date.now();
          let signature = `${call.function.name}:${call.function.arguments}`;
          try {
            const args = JSON.parse(call.function.arguments);
            if (args && typeof args === "object" && !Array.isArray(args)) {
              signature = `${call.function.name}:${JSON.stringify(Object.keys(args).filter((k) => k !== "reason").sort().map((k) => [k, args[k]]))}`;
            }
          } catch { /* Invalid arguments still receive a bounded error result. */ }
          const exhausted = forceFinal || trace.tools!.length >= MAX_MOCK_TOOL_CALLS;
          const duplicate = signatures.has(signature);
          const result: LocalToolResult = exhausted || duplicate
            ? { status: "error" as const, detail: exhausted ? "工具预算耗尽；请依据已获材料提问或明确缺少信息。" : "同一调用已执行；请使用已有结果。", materialIds: [] }
            : toolbox.execute(call.function.name, call.function.arguments, Math.max(0, MAX_MOCK_TOOL_CALLS - trace.tools!.length - 1));
          // Keep result text bounded too; a truncated result remains distinct from no results.
          if (JSON.stringify(result).length > 4000) {
            if (Array.isArray(result.data)) {
              while (result.data.length && JSON.stringify(result).length > 3900) result.data.pop();
              const returnedIds = result.data.flatMap((item: unknown) => item && typeof item === "object" && "materialId" in item && typeof item.materialId === "string" ? [item.materialId] : []);
              result.materialIds = returnedIds;
            } else {
              result.data = { excerpt: JSON.stringify(result.data).slice(0, 3000), usage: "截断数据，不可作为完整原文" };
            }
            result.status = "incomplete"; result.detail = "工具结果超过返回预算，已缩短；未返回部分不能推断。";
          }
          signatures.add(signature);
          if (exhausted) trace.budgetReason = "达到工具预算；停止检索并生成问题";
          // Every attempted call counts against the three-call limit, including invalid ones.
          if (!exhausted) {
            let query = "";
            try { const a = JSON.parse(call.function.arguments); query = [a.query, a.materialId, a.kind, a.company, a.role, a.reason].filter((v) => typeof v === "string").join(" · ").slice(0, 600); } catch { /* no raw malformed arguments in traces */ }
            trace.tools!.push({ callId: call.id, name: call.function.name, query, status: result.status,
              materialIds: result.materialIds, durationMs: Date.now() - before, detail: result.detail });
          }
          trace.materialIds = [...new Set([...trace.materialIds, ...result.materialIds])];
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
        }
        if (trace.tools!.length >= MAX_MOCK_TOOL_CALLS) {
          forceFinal = true; trace.budgetReason = "每轮最多三次工具调用";
          messages.push({ role: "user", content: "工具预算已到上限。现在只返回最终动作 JSON；材料不足就针对缺口询问，禁止继续检索或给候选人答案。" });
        }
        await checkpoint();
        continue;
      }
      try {
        if (typeof reply.content !== "string") throw new Error("模型没有返回最终动作。");
        return await complete(options.parse(reply.content));
      } catch (reason) {
        if (repaired || trace.attempts >= MAX_MOCK_MODEL_REQUESTS || controller.signal.aborted) throw reason;
        repaired = true; forceFinal = true;
        messages.push({ role: "user", content: `应用校验未通过：${reason instanceof Error ? reason.message : "无效结果"}。请只重新生成合法最终动作 JSON。` });
      }
    }
    throw new Error("已达到本轮模型请求上限，未生成合法问题；已保留回答，请重试。");
  } catch (reason) {
    trace.outcome = options.signal?.aborted ? "interrupted" : "failed";
    if (deadline) trace.budgetReason = "达到本轮两分钟时间预算";
    await checkpoint();
    throw deadline ? new Error("本轮超过两分钟时间预算，已保存回答与调用记录，可以重试。") : reason;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}
