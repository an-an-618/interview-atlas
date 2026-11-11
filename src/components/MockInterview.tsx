import {
  ArrowLeft,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleStop,
  DoorOpen,
  FileText,
  History,
  LoaderCircle,
  MessageSquareText,
  RotateCcw,
  Send,
  Settings,
  Sparkles,
  Target,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  DEFAULT_MOCK_INTERVIEWER_PROMPT,
} from "../ai/openAICompatibleClient";
import { MockInterviewRuntime, type MockInterviewRuntimeOptions } from "../ai/mockInterviewRuntime";
import { normalizeMockCompany } from "../ai/mockInterviewContext";
import { getMockInterviewProgress } from "../domain/mockInterviewHarness";
import type { MockInterviewHarness, MockInterviewMessage } from "../domain/types";
import mockInterviewScene from "../assets/mock-interview-scene.png";
import mockInterviewer from "../assets/mock-interviewer.png";
import type {
  AIClient,
  AIProviderConfig,
} from "../ai/types";
import type {
  CreateMockInterviewInput,
  MockInterviewFeedback,
  MockInterviewMessageRole,
  MockInterviewQuestionInput,
  MockInterviewSession,
  Workspace,
} from "../domain/types";

interface MockInterviewPageProps {
  workspace: Workspace;
  focusedId: string | null;
  initialLobbyView?: "home" | "setup";
  configured: boolean;
  config: AIProviderConfig;
  apiKey: string;
  client: AIClient;
  onFocus: (id: string | null) => void;
  onCreate: (input: CreateMockInterviewInput) => Promise<MockInterviewSession>;
  onAppendMessage: (
    sessionId: string,
    role: MockInterviewMessageRole,
    content: string,
    metadata?: Pick<MockInterviewMessage, "kind" | "competencyId">,
  ) => Promise<MockInterviewSession>;
  onUpdateHarness: (sessionId: string, harness: MockInterviewHarness) => Promise<MockInterviewSession>;
  onEnd: (
    sessionId: string,
    endedBy: "ai" | "user",
    endReason: string,
  ) => Promise<{ session: MockInterviewSession }>;
  onApplyAnalysis: (
    sessionId: string,
    feedback: MockInterviewFeedback,
    questions: MockInterviewQuestionInput[],
  ) => Promise<MockInterviewSession>;
  onOpenSettings: () => void;
  onOpenInterview: (id: string) => void;
}

function formatSessionDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function providerHost(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return endpoint;
  }
}

function MockInterviewLobby({
  workspace,
  sessions,
  initialView,
  configured,
  config,
  onStart,
  onFocus,
  onOpenSettings,
}: {
  workspace: Workspace;
  sessions: MockInterviewSession[];
  initialView: "home" | "setup";
  configured: boolean;
  config: AIProviderConfig;
  onStart: (input: CreateMockInterviewInput) => Promise<void>;
  onFocus: (id: string) => void;
  onOpenSettings: () => void;
}) {
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [round, setRound] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [additionalInfo, setAdditionalInfo] = useState("");
  const [targetQuestionCount, setTargetQuestionCount] = useState(8);
  const [interviewerPrompt, setInterviewerPrompt] = useState(
    DEFAULT_MOCK_INTERVIEWER_PROMPT,
  );
  const [lobbyView, setLobbyView] = useState<"home" | "setup" | "history">(
    initialView,
  );
  const [promptOpen, setPromptOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matchingCompanyCount = useMemo(
    () =>
      workspace.interviews.filter(
        (interview) =>
          !interview.simulated && !interview.sample &&
          normalizeMockCompany(interview.company) === normalizeMockCompany(company),
      ).length,
    [company, workspace.interviews],
  );
  const matchingRoleCount = useMemo(
    () =>
      workspace.interviews.filter(
        (interview) =>
          !interview.simulated && !interview.sample &&
          normalizeMockCompany(interview.company) === normalizeMockCompany(company) &&
          interview.role.trim().toLocaleLowerCase("zh-CN") ===
            role.trim().toLocaleLowerCase("zh-CN"),
      ).length,
    [company, role, workspace.interviews],
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!company.trim() || !role.trim() || starting) return;
    setStarting(true);
    setError(null);
    try {
      await onStart({
        company,
        role,
        round,
        jobDescription,
        additionalInfo,
        interviewerPrompt,
        targetQuestionCount,
      });
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "无法开始模拟面试，请重试。",
      );
    } finally {
      setStarting(false);
    }
  };

  if (lobbyView === "home") {
    return (
      <div className="page mock-interview-lobby mock-lobby-home">
        <header className="mock-lobby-header">
          <div>
            <p className="eyebrow">AI Mock Interview</p>
            <h1>
              你的面试私教<span>，在线模拟</span>
            </h1>
            <p>
              面试官会参考本地知识库中的相关记录、简历经历与高频问题。回答过程只推进面试，反馈统一在结束后生成。
            </p>
          </div>
          <img
            className="mock-lobby-scene"
            src={mockInterviewScene}
            alt="面试官与候选人进行模拟面试"
          />
        </header>

        <section className="mock-entry-actions" aria-label="模拟面试入口">
          <button
            className="mock-entry-action primary"
            type="button"
            onClick={() => setLobbyView("setup")}
          >
            <DoorOpen size={20} aria-hidden="true" />
            <span>进入面试间</span>
            <ChevronRight size={17} aria-hidden="true" />
          </button>
          <button
            className="mock-entry-action secondary"
            type="button"
            onClick={() => setLobbyView("history")}
          >
            <History size={20} aria-hidden="true" />
            <span>查看历史模拟</span>
            <ChevronRight size={17} aria-hidden="true" />
          </button>
        </section>
      </div>
    );
  }

  if (lobbyView === "history") {
    return (
      <div className="page mock-interview-lobby mock-history-page">
        <button
          className="back-button mock-lobby-back"
          type="button"
          onClick={() => setLobbyView("home")}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          返回模拟面试
        </button>
        <header className="mock-subpage-header">
          <div>
            <p className="eyebrow">Interview Archive</p>
            <h1>历史模拟</h1>
            <p>回看已完成的模拟面试、逐字稿与反馈报告。</p>
          </div>
          <span>{sessions.length} 场记录</span>
        </header>

        {sessions.length ? (
          <div className="mock-history-list full">
            {sessions.map((session) => (
              <button
                type="button"
                key={session.id}
                onClick={() => onFocus(session.id)}
              >
                <span className="mock-history-state">
                  {session.status === "active" ? "进行中" : "已结束"}
                </span>
                <strong>{session.company}</strong>
                <span>{session.role}</span>
                <small>
                  {formatSessionDate(session.startedAt)} ·{" "}
                  {
                    session.messages.filter(
                      (message) => message.role === "candidate",
                    ).length
                  }{" "}
                  次回答
                </small>
                <ChevronRight size={15} aria-hidden="true" />
              </button>
            ))}
          </div>
        ) : (
          <div className="mock-history-empty full">
            <MessageSquareText size={28} strokeWidth={1.3} aria-hidden="true" />
            <h2>还没有历史模拟</h2>
            <p>完成的模拟面试会保留在这里。</p>
            <button
              className="button primary"
              type="button"
              onClick={() => setLobbyView("setup")}
            >
              <DoorOpen size={16} aria-hidden="true" />
              进入面试间
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="page mock-interview-lobby mock-setup-page">
      <button
        className="back-button mock-lobby-back"
        type="button"
        onClick={() => setLobbyView("home")}
      >
        <ArrowLeft size={16} aria-hidden="true" />
        返回模拟面试
      </button>

      <header className="mock-setup-intro">
        <img src={mockInterviewer} alt="模拟面试官" />
        <div>
          <p className="eyebrow">Your Interviewer</p>
          <h1>面试官已就位</h1>
          <p>确认本次面试信息，面试官会据此调整轮次、重点和追问方式。</p>
        </div>
      </header>

      <form className="mock-setup" onSubmit={submit}>
        <div className="mock-section-heading">
          <span>01</span>
          <div>
            <h2>本次面试</h2>
            <p>公司和岗位用于匹配知识库中的历史风格与轮次。</p>
          </div>
        </div>

        <div className="mock-setup-grid">
          <label>
            <span>公司</span>
            <span className="mock-input-with-icon">
              <Building2 size={15} aria-hidden="true" />
              <input
                value={company}
                onChange={(event) => setCompany(event.target.value)}
                placeholder="例如：字节跳动"
                maxLength={120}
                required
              />
            </span>
          </label>
          <label>
            <span>岗位名称</span>
            <span className="mock-input-with-icon">
              <BriefcaseBusiness size={15} aria-hidden="true" />
              <input
                value={role}
                onChange={(event) => setRole(event.target.value)}
                placeholder="例如：AI 产品经理"
                maxLength={120}
                required
              />
            </span>
          </label>
          <label>
            <span>目标轮次</span>
            <input
              value={round}
              onChange={(event) => setRound(event.target.value)}
              placeholder="留空则根据历史记录推断"
              maxLength={80}
            />
          </label>
          <label>
            <span>目标问题数</span>
            <select
              value={targetQuestionCount}
              onChange={(event) =>
                setTargetQuestionCount(Number(event.target.value))
              }
            >
              <option value={6}>6 题 · 快速</option>
              <option value={8}>8 题 · 标准</option>
              <option value={12}>12 题 · 深入</option>
            </select>
          </label>
        </div>

        <label>
          <span>岗位 JD</span>
          <textarea
            value={jobDescription}
            onChange={(event) => setJobDescription(event.target.value)}
            placeholder="粘贴岗位职责和要求，面试官会据此调整考察重点。"
            maxLength={20000}
            rows={6}
          />
        </label>
        <label>
          <span>其他补充信息</span>
          <textarea
            value={additionalInfo}
            onChange={(event) => setAdditionalInfo(event.target.value)}
            placeholder="例如：希望重点考察 Agent 策略、这是业务二面、避免纯算法题。"
            maxLength={8000}
            rows={3}
          />
        </label>

        <section className="mock-context-preview">
          <header>
            <BookOpen size={17} aria-hidden="true" />
            <div>
              <strong>知识库联动</strong>
              <small>
                {matchingRoleCount
                  ? `找到 ${matchingRoleCount} 场同公司同岗位记录，将优先学习其轮次与追问风格。`
                  : matchingCompanyCount
                    ? `找到 ${matchingCompanyCount} 场同公司记录，将参考公司面试风格。`
                    : "暂无同公司历史记录，将从简历、问答和聚合块中选择素材。"}
              </small>
            </div>
          </header>
          <dl>
            <div>
              <dt>面试记录</dt>
              <dd>{workspace.interviews.length}</dd>
            </div>
            <div>
              <dt>简历经历</dt>
              <dd>{workspace.resumeExperiences.length}</dd>
            </div>
            <div>
              <dt>原子问答</dt>
              <dd>{workspace.questions.length}</dd>
            </div>
            <div>
              <dt>聚合块</dt>
              <dd>{workspace.syncBlocks.length}</dd>
            </div>
          </dl>
        </section>

        <section className={`mock-prompt-editor${promptOpen ? " open" : ""}`}>
          <button
            type="button"
            aria-expanded={promptOpen}
            onClick={() => setPromptOpen((current) => !current)}
          >
            <span>
              <Sparkles size={16} aria-hidden="true" />
              <strong>面试官 System Prompt</strong>
              <small>
                可编辑面试风格与考察重点；结束、输出和报告流程不可修改。
              </small>
            </span>
            <ChevronDown size={17} aria-hidden="true" />
          </button>
          {promptOpen ? (
            <div>
              <textarea
                value={interviewerPrompt}
                onChange={(event) => setInterviewerPrompt(event.target.value)}
                maxLength={30000}
                rows={12}
                aria-label="可编辑的面试官 System Prompt"
              />
              <button
                className="text-button"
                type="button"
                onClick={() =>
                  setInterviewerPrompt(DEFAULT_MOCK_INTERVIEWER_PROMPT)
                }
              >
                <RotateCcw size={13} aria-hidden="true" />
                恢复默认
              </button>
            </div>
          ) : null}
        </section>

        <footer className="mock-setup-footer">
          <div>
            {configured ? (
              <>
                <CheckCircle2 size={15} aria-hidden="true" />
                <span>
                  将请求 {providerHost(config.endpoint)} · {config.model}
                </span>
              </>
            ) : (
              <>
                <Settings size={15} aria-hidden="true" />
                <span>开始前需要配置 AI 服务</span>
              </>
            )}
          </div>
          {configured ? (
            <button
              className="button primary"
              type="submit"
              disabled={starting || !company.trim() || !role.trim()}
            >
              {starting ? (
                <LoaderCircle className="spin" size={16} aria-hidden="true" />
              ) : (
                <MessageSquareText size={16} aria-hidden="true" />
              )}
              {starting ? "正在生成第一问" : "开始模拟面试"}
            </button>
          ) : (
            <button
              className="button primary"
              type="button"
              onClick={onOpenSettings}
            >
              <Settings size={16} aria-hidden="true" />
              配置 AI 服务
            </button>
          )}
        </footer>
        <p className="mock-data-note">
          每轮按岗位与当前回答选择素材，最多参考 4 场真实面试、10 条问答、
          6 个聚合块、4 条简历经历及 2 场已核验练习建议，材料总量受限。
          API Key 仍只保留在当前会话。
        </p>
        {error ? (
          <p className="mock-inline-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </div>
  );
}

function MockInterviewChat({
  session,
  busy,
  error,
  answer,
  onAnswerChange,
  onSend,
  onRetry,
  onEnd,
  onBack,
}: {
  session: MockInterviewSession;
  busy: boolean;
  error: string | null;
  answer: string;
  onAnswerChange: (value: string) => void;
  onSend: () => void;
  onRetry: () => void;
  onEnd: () => void;
  onBack: () => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const progress = getMockInterviewProgress(session);
  const pendingResponse = session.messages.at(-1)?.role === "candidate";

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [busy, session.messages.length]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (answer.trim() && !busy) onSend();
    }
  };

  return (
    <div className="mock-chat-page">
      <header className="mock-chat-header">
        <button className="back-button" type="button" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden="true" />
          返回模拟面试
        </button>
        <div>
          <span className="mock-live-dot" aria-hidden="true" />
          <span>模拟进行中</span>
        </div>
        <button
          className="button secondary"
          type="button"
          onClick={onEnd}
        >
          <CircleStop size={15} aria-hidden="true" />
          结束面试
        </button>
      </header>

      <section className="mock-chat-meta">
        <div>
          <p className="eyebrow">Mock Interview</p>
          <h1>{session.company}</h1>
          <span>
            {[session.role, session.round || "轮次由 AI 推断"]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
        <dl>
          <div>
            <dt>进度</dt>
            <dd>
              {progress.mainAnswered}/{session.targetQuestionCount} 主问题
            </dd>
          </div>
          <div>
            <dt>开始于</dt>
            <dd>{formatSessionDate(session.startedAt)}</dd>
          </div>
        </dl>
      </section>

      {session.harness ? (
        <div className="mock-plan-progress" aria-label="面试考察进度">
          <span>追问 {progress.followups} 次</span>
          {progress.plan.map((item) => {
            const asked = session.messages.some((m) => m.role === "interviewer" && m.competencyId === item.id && m.kind !== "end");
            const answered = progress.answeredIds.includes(item.id);
            const observation = session.harness?.observations?.find((o) => o.competencyId === item.id);
            return (
              <span key={item.id} className={answered ? "observed" : ""}>
                {answered ? "已答 · " : asked ? "已问 · " : "待问 · "}{item.title}
                {session.status === "completed" && observation?.evidenceSufficient ? " · 证据已核验" : ""}
              </span>
            );
          })}
        </div>
      ) : null}

      <MockInterviewReferences session={session} />

      <div className="mock-conversation" aria-live="polite">
        {session.messages.map((message) => (
          <article
            className={`mock-message ${message.role}`}
            key={message.id}
          >
            <div className="mock-message-avatar" aria-hidden="true">
              {message.role === "interviewer" ? (
                <img src={mockInterviewer} alt="" />
              ) : (
                "我"
              )}
            </div>
            <div>
              <header>
                <strong>
                  {message.role === "interviewer" ? "面试官" : "你的回答"}
                </strong>
                <time>{formatSessionDate(message.createdAt)}</time>
              </header>
              <p>{message.content}</p>
            </div>
          </article>
        ))}
        {busy ? (
          <div className="mock-typing">
            <LoaderCircle className="spin" size={15} aria-hidden="true" />
            面试官正在组织下一问
          </div>
        ) : null}
        {(!session.messages.length || pendingResponse) && !busy && !error ? (
          <div className="mock-chat-retry">
            <p>{pendingResponse ? "回答已保存，继续生成下一问。" : "第一问尚未生成。"}</p>
            <button className="button primary" type="button" onClick={onRetry}>
              <Sparkles size={15} aria-hidden="true" />
              {pendingResponse ? "继续面试" : "生成第一问"}
            </button>
          </div>
        ) : null}
        {error ? (
          <div className="mock-chat-error" role="alert">
            <span>{error}</span>
            <button className="text-button" type="button" onClick={onRetry}>
              重试本轮
            </button>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      <footer className="mock-composer">
        <div>
          <textarea
            value={answer}
            onChange={(event) => onAnswerChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入你的回答…"
            maxLength={20000}
            rows={3}
            disabled={busy || Boolean(error) || !progress.waitingForAnswer}
            aria-label="输入面试回答"
          />
          <button
            type="button"
            title="发送回答"
            aria-label="发送回答"
            disabled={
              busy ||
              Boolean(error) ||
              !answer.trim() ||
              !progress.waitingForAnswer
            }
            onClick={onSend}
          >
            <Send size={18} aria-hidden="true" />
          </button>
        </div>
        <span>Enter 发送 · Shift + Enter 换行</span>
      </footer>
    </div>
  );
}

function MockInterviewReferences({ session }: { session: MockInterviewSession }) {
  const harness = session.harness;
  if (!harness) return null;
  const progress = getMockInterviewProgress(session);
  return (
    <div className="mock-reference-mode">
      <span>参考方式 · {harness.mode === "native" ? "按需取材" : harness.mode === "fallback" ? "应用预选材料" : "按需取材待确认"}</span>
      {harness.mode === "fallback" ? <p>{harness.fallbackReason} {session.status === "active" ? "面试可以继续。" : ""}</p> : null}
      {session.status === "completed" ? (
        <div className="mock-plan-progress" aria-label="面试考察与证据状态">
          {progress.plan.map((item) => {
            const asked = session.messages.some((m) => m.role === "interviewer" && m.competencyId === item.id && m.kind !== "end");
            const answered = progress.answeredIds.includes(item.id);
            const sufficient = harness.observations?.find((o) => o.competencyId === item.id)?.evidenceSufficient;
            return <span key={item.id}>{item.title} · {answered ? "已答" : asked ? "已问" : "未问"} · {sufficient ? "证据已核验" : "信息不足"}</span>;
          })}
        </div>
      ) : null}
      {session.status === "completed" && harness.traces.length ? (
        <details className="mock-reference-log">
          <summary>查看本场取材记录</summary>
          <p>材料只用于准备问题。证据核验确认原话与来源，充分性由模型观察，不表示已经掌握能力。</p>
          {harness.traces.filter((t) => t.operation === "turn").map((trace, index) => (
            <article key={trace.id}>
              <strong>请求 {index + 1} · {trace.action === "followup" ? "追问" : trace.action === "end" ? "结束" : trace.action === "ask" ? "主问题" : "未完成"} · {(trace.durationMs / 1000).toFixed(1)} 秒</strong>
              <span>{trace.attempts} 次模型请求 · {trace.tools?.length ?? 0} 次工具调用</span>
              {trace.tools?.map((tool) => (
                <p key={tool.callId}>
                  <code>{tool.name}</code> · {({ ok: "已找到", no_results: "无结果", incomplete: "部分原文", error: "调用错误" })[tool.status]}
                  <br />{tool.query}<br />{tool.materialIds.join("、") || tool.detail}
                </p>
              ))}
              {trace.budgetReason ? <p>{trace.budgetReason}</p> : null}
              {trace.gaps?.length ? <p>待澄清：{trace.gaps.join("；")}</p> : null}
              {trace.nextFocus ? <p>下一步：{trace.nextFocus}</p> : null}
            </article>
          ))}
        </details>
      ) : null}
    </div>
  );
}

function FeedbackColumn({
  title,
  items,
  tone,
}: {
  title: string;
  items: MockInterviewFeedback["strengths"];
  tone: "positive" | "attention";
}) {
  return (
    <section className={`mock-feedback-column ${tone}`}>
      <h2>{title}</h2>
      {items.length ? (
        items.map((item) => (
          <article key={`${item.title}-${item.detail}`}>
            <strong>{item.title}</strong>
            <p>{item.detail}</p>
          </article>
        ))
      ) : (
        <p className="mock-feedback-empty">当前逐字稿没有足够证据形成判断。</p>
      )}
    </section>
  );
}

function MockInterviewReport({
  session,
  analyzing,
  error,
  onRetry,
  onBack,
  onOpenInterview,
}: {
  session: MockInterviewSession;
  analyzing: boolean;
  error: string | null;
  onRetry: () => void;
  onBack: () => void;
  onOpenInterview: (id: string) => void;
}) {
  const feedback = session.feedback;
  return (
    <div className="page mock-report-page">
      <button className="back-button" type="button" onClick={onBack}>
        <ArrowLeft size={16} aria-hidden="true" />
        返回模拟面试
      </button>
      <header className="mock-report-header">
        <div>
          <p className="eyebrow">Interview Report</p>
          <h1>{session.company} 模拟面试反馈</h1>
          <p>
            {[session.role, session.round || "AI 推断轮次"]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <span className="simulation-badge">
          <Sparkles size={13} aria-hidden="true" />
          模拟面
        </span>
      </header>

      <MockInterviewReferences session={session} />

      {analyzing ? (
        <section className="mock-report-loading">
          <LoaderCircle className="spin" size={24} aria-hidden="true" />
          <div>
            <strong>面试记录已保存，正在生成反馈</strong>
            <p>评估员正在核对逐字稿，并自动拆分原子问答。</p>
          </div>
        </section>
      ) : feedback ? (
        <>
          {feedback.validationWarnings?.length ? (
            <div className="mock-report-validation" role="status">
              部分反馈未通过原文核验，已排除：{feedback.validationWarnings.join(" ")}
            </div>
          ) : null}
          <section className="mock-report-summary">
            <span>总体观察</span>
            <h2>{feedback.summary}</h2>
            <p>{feedback.overallAssessment}</p>
            <dl>
              <div>
                <dt>完成回答</dt>
                <dd>
                  {
                    session.messages.filter(
                      (message) => message.role === "candidate",
                    ).length
                  }
                </dd>
              </div>
              <div>
                <dt>原子问答</dt>
                <dd>{session.questionIds.length}</dd>
              </div>
              <div>
                <dt>结束方式</dt>
                <dd>{session.endedBy === "ai" ? "AI 主动结束" : "用户结束"}</dd>
              </div>
            </dl>
          </section>

          <div className="mock-feedback-grid">
            <FeedbackColumn
              title="有效表现"
              items={feedback.strengths}
              tone="positive"
            />
            <FeedbackColumn
              title="需要改进"
              items={feedback.improvements}
              tone="attention"
            />
          </div>

          <section className="mock-next-steps">
            <div className="mock-section-heading compact">
              <Target size={18} aria-hidden="true" />
              <div>
                <h2>下一步准备</h2>
                <p>基于本次逐字稿生成</p>
              </div>
            </div>
            <ol>
              {feedback.nextSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>

          {feedback.questionReviews.length ? (
            <section className="mock-question-reviews">
              <header>
                <h2>逐题反馈</h2>
                <span>{feedback.questionReviews.length} 题</span>
              </header>
              {feedback.questionReviews.map((review, index) => (
                <details key={`${review.question}-${index}`}>
                  <summary>
                    <span>Q{String(index + 1).padStart(2, "0")}</span>
                    <strong>{review.question}</strong>
                    <ChevronDown size={16} aria-hidden="true" />
                  </summary>
                  <div>
                    <p>{review.assessment}</p>
                    {review.evidence ? (
                      <blockquote>{review.evidence}</blockquote>
                    ) : null}
                    {review.suggestion ? (
                      <p>
                        <strong>改进方向</strong>
                        {review.suggestion}
                      </p>
                    ) : null}
                  </div>
                </details>
              ))}
            </section>
          ) : null}
        </>
      ) : (
        <section className="mock-report-loading error">
          <FileText size={24} aria-hidden="true" />
          <div>
            <strong>面试记录已经保存，反馈报告尚未生成</strong>
            <p>{error || "可以重新调用 AI 生成报告和原子问答。"}</p>
            <button className="button primary" type="button" onClick={onRetry}>
              <RotateCcw size={15} aria-hidden="true" />
              重新生成
            </button>
          </div>
        </section>
      )}

      <footer className="mock-report-actions">
        {session.interviewId ? (
          <button
            className="button secondary"
            type="button"
            onClick={() => onOpenInterview(session.interviewId!)}
          >
            <FileText size={15} aria-hidden="true" />
            查看知识库面试记录
          </button>
        ) : null}
        <button className="button quiet" type="button" onClick={onBack}>
          返回历史模拟
        </button>
      </footer>
    </div>
  );
}

export function MockInterviewPage({
  workspace,
  focusedId,
  initialLobbyView = "home",
  configured,
  config,
  apiKey,
  client,
  onFocus,
  onCreate,
  onAppendMessage,
  onUpdateHarness,
  onEnd,
  onApplyAnalysis,
  onOpenSettings,
  onOpenInterview,
}: MockInterviewPageProps) {
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runtimeRef = useRef<MockInterviewRuntime | null>(null);
  const runtimeOptionsRef = useRef<MockInterviewRuntimeOptions>(null!);
  const session =
    workspace.mockInterviews.find((item) => item.id === focusedId) ?? null;
  const sessions = [...workspace.mockInterviews].sort((left, right) =>
    right.startedAt.localeCompare(left.startedAt),
  );

  runtimeOptionsRef.current = {
    client, config, apiKey, workspace, create: onCreate, append: onAppendMessage,
    updateHarness: onUpdateHarness, end: onEnd, analyze: onApplyAnalysis,
    focus: (id) => { setAnswer(""); setError(null); onFocus(id); },
    answerSaved: () => setAnswer(""),
    changed: (state) => { setBusy(state.busy); setAnalyzing(state.analyzing); setError(state.error); },
  };
  useEffect(() => {
    const runtime = new MockInterviewRuntime(() => runtimeOptionsRef.current);
    runtimeRef.current = runtime;
    return () => { runtime.dispose(); runtimeRef.current = null; };
  }, []);

  const start = async (input: CreateMockInterviewInput) => {
    if (!configured) {
      onOpenSettings();
      return;
    }
    await runtimeRef.current?.start(input);
  };

  const sendAnswer = async () => {
    if (!session || !answer.trim() || busy) return;
    await runtimeRef.current?.submit(session.id, answer);
  };

  const endByUser = async () => {
    if (!session) return;
    if (
      !window.confirm(
        "确定结束本次模拟面试吗？当前对话会保存到面试记录，并生成反馈报告。",
      )
    ) {
      return;
    }
    await runtimeRef.current?.end(session.id);
  };

  if (!session) {
    return (
      <MockInterviewLobby
        key={initialLobbyView}
        workspace={workspace}
        sessions={sessions}
        initialView={initialLobbyView}
        configured={configured}
        config={config}
        onStart={start}
        onFocus={onFocus}
        onOpenSettings={onOpenSettings}
      />
    );
  }

  if (session.status === "completed") {
    return (
      <MockInterviewReport
        session={session}
        analyzing={analyzing}
        error={error || session.harness?.error || null}
        onRetry={() => void runtimeRef.current?.retry(session.id)}
        onBack={() => {
          setError(null);
          onFocus(null);
        }}
        onOpenInterview={onOpenInterview}
      />
    );
  }

  return (
    <MockInterviewChat
      session={session}
      busy={busy}
      error={error || session.harness?.error || null}
      answer={answer}
      onAnswerChange={setAnswer}
      onSend={() => void sendAnswer()}
      onRetry={() => void runtimeRef.current?.retry(session.id)}
      onEnd={() => void endByUser()}
      onBack={() => {
        setError(null);
        onFocus(null);
      }}
    />
  );
}
