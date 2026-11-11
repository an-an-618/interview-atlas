import type {
  CreateMockInterviewInput, MockInterviewFeedback, MockInterviewHarness,
  MockInterviewMessage, MockInterviewQuestionInput, MockInterviewSession, Workspace,
} from "../domain/types";
import { createMockInterviewHarness, getMockInterviewProgress, validateMockInterviewAction } from "../domain/mockInterviewHarness";
import type { AIClient, AIProviderConfig } from "./types";

export interface MockInterviewRuntimeOptions {
  client: AIClient;
  config: AIProviderConfig;
  apiKey: string;
  workspace: Workspace;
  create(input: CreateMockInterviewInput): Promise<MockInterviewSession>;
  updateHarness(id: string, harness: MockInterviewHarness): Promise<MockInterviewSession>;
  append(id: string, role: MockInterviewMessage["role"], content: string, metadata?: Pick<MockInterviewMessage, "kind" | "competencyId">): Promise<MockInterviewSession>;
  end(id: string, endedBy: "ai" | "user", reason: string): Promise<{ session: MockInterviewSession }>;
  analyze(id: string, feedback: MockInterviewFeedback, questions: MockInterviewQuestionInput[]): Promise<MockInterviewSession>;
  focus(id: string): void;
  answerSaved?(): void;
  changed(state: { busy: boolean; analyzing: boolean; error: string | null }): void;
}

/** One owner for request locks, cancellation, durable checkpoints and idempotent retry. */
export class MockInterviewRuntime {
  private controller: AbortController | null = null;
  private disposed = false;
  private pending: Promise<void> | null = null;
  constructor(private readonly options: () => MockInterviewRuntimeOptions) {}

  private find(id: string) {
    const session = this.options().workspace.mockInterviews.find((item) => item.id === id);
    if (!session) throw new Error("未找到模拟面试会话。");
    return session;
  }
  private async initialize(session: MockInterviewSession) {
    if (session.harness) return session;
    return this.options().updateHarness(session.id, createMockInterviewHarness(session, this.options().config));
  }
  private async run(work: (signal: AbortSignal) => Promise<void>) {
    if (this.controller || this.disposed) return;
    const controller = new AbortController();
    this.controller = controller;
    this.options().changed({ busy: true, analyzing: false, error: null });
    const operation = (async () => {
      let error: string | null = null;
      try { await work(controller.signal); }
      catch (reason) { if (!controller.signal.aborted) error = reason instanceof Error ? reason.message : "模拟面试请求失败，请重试。"; }
      finally {
        if (this.controller === controller) this.controller = null;
        if (!this.disposed) this.options().changed({ busy: false, analyzing: false, error });
      }
    })();
    this.pending = operation;
    await operation;
    if (this.pending === operation) this.pending = null;
  }

  async start(input: CreateMockInterviewInput) {
    await this.run(async (signal) => {
      const created = await this.options().create(input);
      this.options().focus(created.id);
      await this.turn(await this.initialize(created), signal);
    });
  }

  async submit(id: string, answer: string) {
    await this.run(async (signal) => {
      let session = await this.initialize(this.find(id));
      if (session.status !== "active" || !getMockInterviewProgress(session).waitingForAnswer || !answer.trim()) return;
      session = await this.options().append(id, "candidate", answer);
      this.options().answerSaved?.();
      await this.turn(session, signal);
    });
  }

  async retry(id: string) {
    await this.run(async (signal) => {
      const session = await this.initialize(this.find(id));
      if (session.status === "completed") await this.report(session, signal);
      else if (!getMockInterviewProgress(session).waitingForAnswer) await this.turn(session, signal);
    });
  }

  async end(id: string) {
    // User ending also cancels an in-flight model turn before saving the current transcript.
    this.controller?.abort();
    await this.pending;
    await this.run(async (signal) => {
      const session = await this.initialize(this.find(id));
      if (session.status !== "active") return;
      const ended = await this.options().end(id, "user", "用户主动结束模拟面试");
      await this.report(ended.session, signal);
    });
  }

  private async turn(session: MockInterviewSession, signal: AbortSignal) {
    const harness = session.harness!;
    const progress = getMockInterviewProgress(session);
    if (progress.endReason) {
      const closing = await this.options().append(session.id, "interviewer", "感谢你的回答，本次模拟面试到这里结束。", { kind: "end" });
      const ended = await this.options().end(closing.id, "ai", progress.endReason);
      await this.report(ended.session, signal);
      return;
    }
    const messageCount = session.messages.length;
    session = await this.options().updateHarness(session.id, { ...harness, turnStatus: "running", error: "" });
    let traceCheckpoint = session;
    try {
      const options = this.options();
      const config: AIProviderConfig = { protocol: "openai-compatible", model: harness.model, endpoint: harness.endpoint };
      if (options.config.endpoint.replace(/\/+$/, "") !== harness.endpoint.replace(/\/+$/, "")) throw new Error("本场已固定原模型服务，请恢复开场时的服务设置后重试。");
      const turn = await options.client.continueMockInterview(config, options.apiKey, {
        session, workspace: options.workspace,
        onTrace: async (trace) => {
          const current = this.find(session.id);
          if (current.status !== "active" || current.messages.length !== messageCount) return;
          traceCheckpoint = await this.options().updateHarness(session.id, {
            ...current.harness!, promptVersion: trace.promptVersion, mode: trace.mode, fallbackReason: trace.fallbackReason,
            turnStatus: "running", error: "",
            traces: [...new Map([...current.harness!.traces, ...traceCheckpoint.harness!.traces]
              .filter((t) => t.id !== trace.id).map((t) => [t.id, t])).values(), trace].slice(-80),
          });
        },
      }, signal);
      if (signal.aborted || this.disposed) return;
      validateMockInterviewAction(session, turn);
      const latest = this.find(session.id);
      if (latest.status !== "active" || latest.messages.length !== messageCount) {
        throw new Error("会话已发生变化，本轮过期响应已丢弃。");
      }
      const updated = await options.append(session.id, "interviewer", turn.message, { kind: turn.action, competencyId: turn.competencyId });
      const checkpoint = await options.updateHarness(session.id, {
        ...updated.harness!, turnStatus: "idle", error: "",
        mode: turn.trace?.mode ?? updated.harness!.mode,
        fallbackReason: turn.trace?.fallbackReason ?? updated.harness!.fallbackReason,
        observations: turn.observation
          ? [...(updated.harness!.observations ?? []).filter((o) => o.competencyId !== turn.observation!.competencyId), turn.observation]
          : updated.harness!.observations,
        traces: [...updated.harness!.traces.filter((t) => t.id !== turn.trace?.id), ...(turn.trace ? [turn.trace] : [])].slice(-80),
      });
      if (turn.shouldEnd) {
        const ended = await options.end(session.id, "ai", turn.endReason);
        await this.report(ended.session, signal);
      }
      return checkpoint;
    } catch (reason) {
      const latest = this.find(session.id);
      // React's rendered options can lag an awaited write; retain the durable trace checkpoint.
      const checkpointHarness = latest.status === "active" && latest.messages.length === messageCount
        ? { ...latest.harness!, ...traceCheckpoint.harness! } : latest.harness!;
      await this.options().updateHarness(session.id, {
        ...checkpointHarness, turnStatus: signal.aborted ? "interrupted" : "failed",
        error: signal.aborted ? "请求已中断，可以重试。" : reason instanceof Error ? reason.message : "本轮请求失败。",
      });
      throw reason;
    }
  }

  private async report(session: MockInterviewSession, signal: AbortSignal) {
    if (session.feedback) return;
    const harness = session.harness!;
    this.options().changed({ busy: true, analyzing: true, error: null });
    session = await this.options().updateHarness(session.id, { ...harness, reportStatus: "running", error: "" });
    try {
      const options = this.options();
      const config: AIProviderConfig = { protocol: "openai-compatible", model: harness.model, endpoint: harness.endpoint };
      if (options.config.endpoint.replace(/\/+$/, "") !== harness.endpoint.replace(/\/+$/, "")) throw new Error("本场已固定原模型服务，请恢复开场时的服务设置后重试。");
      const report = await options.client.generateMockInterviewReport(config, options.apiKey, session, signal);
      if (signal.aborted || this.disposed) return;
      const updated = await options.analyze(session.id, report.feedback, report.questions);
      await options.updateHarness(session.id, {
        ...updated.harness!, turnStatus: "idle", reportStatus: "completed", error: "",
        traces: [...updated.harness!.traces, ...(report.trace ? [report.trace] : [])].slice(-80),
      });
    } catch (reason) {
      const latest = this.find(session.id);
      await this.options().updateHarness(session.id, {
        ...latest.harness!, reportStatus: signal.aborted ? "interrupted" : "failed",
        error: signal.aborted ? "报告生成被中断，可以重试。" : reason instanceof Error ? reason.message : "报告生成失败。",
      });
      throw reason;
    }
  }
  dispose() {
    this.disposed = true;
    this.controller?.abort();
  }
}
