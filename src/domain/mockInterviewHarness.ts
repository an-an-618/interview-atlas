import type {
  MockInterviewHarness, MockInterviewMessage, MockInterviewPlanItem,
  MockInterviewSession, Workspace,
} from "./types";

export const MOCK_HARNESS_PROMPT_VERSION = "mock-harness-1";
export const MOCK_AGENT_PROMPT_VERSION = "mock-agent-2";
export const MAX_MOCK_FOLLOWUPS = 2;

const specialties: Array<MockInterviewPlanItem & { pattern: RegExp }> = [
  { id: "agent", title: "Agent 策略", focus: "任务边界、工具选择、运行控制与失败恢复", pattern: /agent|智能体|harness|工具调用/i },
  { id: "evaluation", title: "评测与验证", focus: "指标、样本、失败案例、基线与验证结果", pattern: /评测|评估|实验|验证|指标|evaluation|eval|a\/b/i },
  { id: "engineering", title: "工程与性能", focus: "方案取舍、性能瓶颈、可靠性与技术证据", pattern: /前端|后端|开发|工程师|性能|架构|react|python|java|系统设计/i },
  { id: "product", title: "产品与业务", focus: "用户需求、业务目标、优先级与结果", pattern: /产品|运营|业务|用户|增长|商业/i },
  { id: "data", title: "数据分析", focus: "数据质量、分析依据、因果与不确定性", pattern: /数据|统计|分析|算法|机器学习|sql/i },
];

export function createMockInterviewPlan(session: Pick<MockInterviewSession, "role" | "jobDescription" | "additionalInfo" | "targetQuestionCount">): MockInterviewPlanItem[] {
  const source = `${session.role} ${session.jobDescription} ${session.additionalInfo}`;
  const matched = specialties.filter((item) => item.pattern.test(source))
    .map(({ id, title, focus }) => ({ id, title, focus }));
  return [
    { id: "project", title: "项目经历", focus: "本人贡献、决策依据、实际结果与反思" },
    ...matched,
    { id: "collaboration", title: "协作与反思", focus: "分歧处理、协作方式与失败后的调整" },
  ].slice(0, Math.min(5, session.targetQuestionCount));
}

export function createMockInterviewHarness(
  session: MockInterviewSession,
  config: { model: string; endpoint: string },
): MockInterviewHarness {
  return {
    version: 1, plan: createMockInterviewPlan(session),
    model: config.model, endpoint: config.endpoint,
    promptVersion: MOCK_AGENT_PROMPT_VERSION,
    turnStatus: "idle", reportStatus: session.feedback ? "completed" : "pending",
    error: "", traces: [],
    mode: "unconfirmed", observations: [],
  };
}

export function candidateWantsToEnd(content: string): boolean {
  return /(?:结束|停止|终止|不再继续)(?:本次|这次|这场|模拟)?(?:面试|练习)|(?:我|现在)(?:想|要|希望)(?:结束|停止)|(?:无法|不能|不想)继续|(?:end|stop|quit)\s+(?:the\s+)?interview/i.test(content);
}

export function isRefusal(content: string): boolean {
  return /^(?:不知道|不清楚|不会|无法回答|跳过|拒绝回答|不想回答|没有经验|不回答)[。.!！\s]*$/i.test(content.trim());
}

export function normalizeMockQuestion(content: string): string {
  return content.normalize("NFKC").toLowerCase().replace(/[\p{P}\p{S}\s]/gu, "");
}

/** Progress is derived from saved messages, never from the model's claimed counters. */
export function getMockInterviewProgress(session: MockInterviewSession) {
  const plan = session.harness?.plan ?? createMockInterviewPlan(session);
  let mainAsked = 0;
  let mainAnswered = 0;
  let followups = 0;
  let totalAnswers = 0;
  let current: MockInterviewMessage | undefined;
  let answeredCurrentMain = false;
  let currentFollowups = 0;
  const observed = new Set<string>();
  const answeredIds = new Set<string>();
  for (const message of session.messages) {
    if (message.role === "interviewer" && message.kind !== "end") {
      if (message.kind !== "followup") {
        mainAsked++;
        currentFollowups = 0;
        answeredCurrentMain = false;
      } else {
        followups++;
        currentFollowups++;
      }
      current = message;
    } else if (message.role === "candidate") {
      totalAnswers++;
      if (current) answeredIds.add(current.competencyId ?? plan[(mainAsked - 1) % plan.length]?.id ?? "project");
      if (current && !answeredCurrentMain) {
        mainAnswered++;
        answeredCurrentMain = true;
      }
      if (current && !isRefusal(message.content) && !candidateWantsToEnd(message.content) && message.content.trim().length >= 8) {
        // "Observed" means we have an answer, not a judgement that the skill is mastered.
        observed.add(current.competencyId ?? plan[(mainAsked - 1) % plan.length]?.id ?? "project");
      }
    }
  }
  const last = session.messages.at(-1);
  const refusalCount = session.messages.filter((m) => m.role === "candidate").slice(-2).filter((m) => isRefusal(m.content)).length;
  const endReason = last?.role === "candidate" && candidateWantsToEnd(last.content)
    ? "候选人明确要求结束"
    : refusalCount >= 2 ? "候选人连续两次无法作答"
    : totalAnswers >= session.targetQuestionCount * (MAX_MOCK_FOLLOWUPS + 1) ? "达到本场回答预算；未覆盖能力保留为信息不足"
    : mainAnswered >= session.targetQuestionCount && (observed.size >= plan.length || currentFollowups >= MAX_MOCK_FOLLOWUPS)
      ? "达到主问题目标；本场观察结束" : "";
  const nextCompetency = plan.find((item) => !observed.has(item.id)) ?? plan[mainAsked % plan.length]!;
  return {
    plan, mainAsked, mainAnswered, followups, totalAnswers, currentFollowups,
    currentCompetencyId: current?.competencyId ?? plan[Math.max(0, mainAsked - 1) % plan.length]?.id,
    observedIds: [...observed], answeredIds: [...answeredIds], nextCompetency,
    waitingForAnswer: last?.role === "interviewer" && last.kind !== "end",
    canAsk: mainAsked < session.targetQuestionCount,
    canFollowup: !!current && last?.role === "candidate" && currentFollowups < MAX_MOCK_FOLLOWUPS,
    canEnd: !!endReason || mainAnswered >= session.targetQuestionCount,
    endReason,
  };
}

export interface MockInterviewAction {
  message: string;
  shouldEnd: boolean;
  endReason: string;
  action: "ask" | "followup" | "end";
  competencyId: string;
}

export function validateMockInterviewAction(session: MockInterviewSession, turn: MockInterviewAction): void {
  const progress = getMockInterviewProgress(session);
  if (!progress.plan.some((item) => item.id === turn.competencyId) && turn.action !== "end") {
    throw new Error("面试官返回了计划之外的考察主题。");
  }
  if (turn.action === "end") {
    if (!progress.canEnd) throw new Error("尚未完成主问题目标，不能提前结束。");
    return;
  }
  if (progress.waitingForAnswer) throw new Error("上一问尚未回答，不能继续提问。");
  if (turn.action === "ask" && !progress.canAsk) throw new Error("主问题目标已达到，请追问当前主题或结束。");
  if (turn.action === "followup" && (!progress.canFollowup || turn.competencyId !== progress.currentCompetencyId)) {
    throw new Error("追问必须延续当前主题且不得超过两层。");
  }
  const normalized = normalizeMockQuestion(turn.message);
  if (session.messages.some((m) => m.role === "interviewer" && normalizeMockQuestion(m.content) === normalized)) {
    throw new Error("面试官重复了已经提出的问题。");
  }
}

export function recoverMockInterviewRuns(workspace: Workspace): Workspace {
  return {
    ...workspace,
    mockInterviews: workspace.mockInterviews.map((session) => {
      const harness = session.harness;
      if (!harness || (harness.turnStatus !== "running" && harness.reportStatus !== "running")) return session;
      return {
        ...session,
        harness: {
          ...harness,
          turnStatus: harness.turnStatus === "running" ? "interrupted" as const : harness.turnStatus,
          reportStatus: harness.reportStatus === "running" ? "interrupted" as const : harness.reportStatus,
          error: "上次请求被中断，已保存的对话仍在，可以重试。",
        },
      };
    }),
  };
}
