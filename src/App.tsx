import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Database,
  Download,
  FileUser,
  FileText,
  ListFilter,
  Home,
  Link2,
  LoaderCircle,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createOpenAICompatibleClient } from "./ai/openAICompatibleClient";
import type {
  AIClient,
  AIProviderConfig,
  AIProviderCredentialId,
} from "./ai/types";
import { AISettingsPanel, InterviewImportDialog } from "./components/AI";
import { QuestionForm, SyncBlockForm } from "./components/Forms";
import { Modal } from "./components/Modal";
import { ResumePage } from "./components/Resume";
import type {
  AIReviewCandidate,
  AtomicQuestion,
  Interview,
  InterviewAIReview,
  InterviewStatus,
  ResumeExperience,
  SaveAIReviewCandidateInput,
  SyncBlock,
  UpdateAIReviewCandidateInput,
} from "./domain/types";
import {
  getRandomQuestion,
  getRecommendedSyncBlocks,
} from "./domain/workspace";
import { useAISettings } from "./hooks/useAISettings";
import { useWorkspace } from "./hooks/useWorkspace";

type View =
  "overview" | "interviews" | "questions" | "sync" | "resume" | "settings";

type Dialog =
  | { kind: "interview" }
  | { kind: "question"; interviewId: string }
  | { kind: "standalone-question" }
  | { kind: "sync"; questionId?: string }
  | null;

const navItems = [
  { id: "overview" as const, label: "概览", icon: Home },
  { id: "interviews" as const, label: "面试记录", icon: FileText },
  { id: "questions" as const, label: "原子问答", icon: CircleHelp },
  { id: "sync" as const, label: "同步块", icon: Link2 },
  { id: "resume" as const, label: "简历经历", icon: FileUser },
  { id: "settings" as const, label: "设置", icon: Settings },
];

const navGroups = [
  { label: "工作台", items: navItems.slice(0, 1) },
  { label: "知识库", items: navItems.slice(1, 5) },
  { label: "系统", items: navItems.slice(5) },
];

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={`brand-mark${compact ? " brand-mark-compact" : ""}`}
      aria-hidden="true"
    >
      <BookOpen />
    </span>
  );
}

const statusLabel: Record<InterviewStatus, string> = {
  draft: "待审核",
  pending: "待审核",
  reviewed: "已审核",
  archived: "已归档",
};

function formatDate(value: string) {
  if (!value) return "日期未知";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(`${value}T00:00:00`));
}

function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: React.ReactNode;
  title: React.ReactNode;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {description ? <p className="page-description">{description}</p> : null}
      </div>
      {action}
    </header>
  );
}

function StatusBadge({ status }: { status: InterviewStatus }) {
  return (
    <span className={`status status-${status}`}>{statusLabel[status]}</span>
  );
}

function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <BookOpen size={28} strokeWidth={1.4} aria-hidden="true" />
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}

function OverviewPage({
  dailyQuestion,
  interviews,
  aiReviews,
  syncBlocks,
  recommendations,
  onNavigate,
  onOpenInterview,
  onOpenQuestion,
  onOpenSync,
  onCreateInterview,
  onUpdateAIReviewCandidate,
  onResolveAIReviewCandidate,
  onAcceptAllAIReviewCandidates,
}: {
  dailyQuestion: AtomicQuestion | null;
  interviews: Interview[];
  aiReviews: InterviewAIReview[];
  syncBlocks: SyncBlock[];
  recommendations: SyncBlock[];
  onNavigate: (view: View) => void;
  onOpenInterview: (id: string) => void;
  onOpenQuestion: (id: string) => void;
  onOpenSync: (id: string) => void;
  onCreateInterview: () => void;
  onUpdateAIReviewCandidate: (
    interviewId: string,
    candidateId: string,
    input: UpdateAIReviewCandidateInput,
  ) => void;
  onResolveAIReviewCandidate: (
    interviewId: string,
    candidateId: string,
    decision: "accepted" | "ignored",
    connectToSuggested?: boolean,
  ) => void;
  onAcceptAllAIReviewCandidates: (interviewId: string) => void;
}) {
  const [reviewDrawerOpen, setReviewDrawerOpen] = useState(false);
  const [activeReviewInterviewId, setActiveReviewInterviewId] = useState<
    string | null
  >(null);
  const recent = [...interviews]
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, 3);
  const pendingReviews = aiReviews
    .flatMap((review) => {
      const interview = interviews.find(
        (item) => item.id === review.interviewId,
      );
      const pendingCount = review.candidates.filter(
        (candidate) => candidate.decision === "pending",
      ).length;
      return interview && pendingCount
        ? [{ interview, review, pendingCount }]
        : [];
    })
    .sort((left, right) =>
      right.review.updatedAt.localeCompare(left.review.updatedAt),
    );
  const activePendingReview =
    pendingReviews.find(
      ({ interview }) => interview.id === activeReviewInterviewId,
    ) ?? pendingReviews[0];
  const today = new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "full",
  }).format(new Date());
  const openReviewDrawer = () => {
    setActiveReviewInterviewId(pendingReviews[0]?.interview.id ?? null);
    setReviewDrawerOpen(true);
  };

  return (
    <div className="page overview-page">
      <section
        className="daily-question-hero"
        aria-labelledby="daily-question-title"
      >
        <header className="daily-question-head">
          <p className="eyebrow">
            <span>{today}</span>
            <span className="daily-question-label">每日一问</span>
          </p>
        </header>

        <div className="daily-question-stage">
          {dailyQuestion ? (
            <button
              className="daily-question-button"
              type="button"
              onClick={() => onOpenQuestion(dailyQuestion.id)}
            >
              <span
                className="daily-question-title"
                id="daily-question-title"
                role="heading"
                aria-level={1}
              >
                <span className="daily-question-quote" aria-hidden="true">
                  “
                </span>
                <span className="daily-question-text">
                  {dailyQuestion.title}
                </span>
                <span className="daily-question-quote" aria-hidden="true">
                  ”
                </span>
              </span>
              <span className="daily-question-action">
                查看回答
                <ChevronRight size={18} aria-hidden="true" />
              </span>
            </button>
          ) : (
            <div className="daily-question-empty">
              <h1 id="daily-question-title">还没有可复习的原子问答</h1>
              <button
                className="button accent"
                onClick={() => onNavigate("questions")}
              >
                前往原子问答
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </section>

      <div className="overview-content">
        {!interviews.length ? (
          <EmptyState
            title="知识库还是空的"
            description="原文会先保存在本机。之后可以手动拆成问答，不需要配置 AI。"
            action={
              <button className="button accent" onClick={onCreateInterview}>
                <Plus size={16} aria-hidden="true" />
                保存第一段面经
              </button>
            }
          />
        ) : (
          <div className="overview-grid">
            <section className="panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">稳定知识</p>
                  <h2>每日推荐同步块</h2>
                </div>
                <span>{recommendations.length} 项</span>
              </div>
              {recommendations.length ? (
                <div className="review-list">
                  {recommendations.map((syncBlock) => (
                    <button
                      className="review-row"
                      key={syncBlock.id}
                      onClick={() => onOpenSync(syncBlock.id)}
                    >
                      <span className="frequency">
                        ×{syncBlock.linkedQuestionIds.length}
                      </span>
                      <span>
                        <strong>{syncBlock.title}</strong>
                        <small>
                          关联 {syncBlock.linkedQuestionIds.length} 个原子问答
                        </small>
                      </span>
                      <ArrowLeft
                        className="arrow-forward"
                        size={15}
                        aria-hidden="true"
                      />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="panel-empty">
                  <p>创建同步块后，这里会推荐需要持续修订的稳定回答。</p>
                  <button
                    className="text-button"
                    onClick={() => onNavigate("sync")}
                  >
                    查看同步块
                  </button>
                </div>
              )}
            </section>

            <section className="panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">最近输入</p>
                  <h2>近期面试</h2>
                </div>
                <button
                  className="text-button"
                  onClick={() => onNavigate("interviews")}
                >
                  全部
                </button>
              </div>
              <div className="recent-list">
                {recent.map((interview) => (
                  <button
                    key={interview.id}
                    onClick={() => onOpenInterview(interview.id)}
                  >
                    <span>
                      <strong>
                        {interview.company}
                        {interview.round ? ` · ${interview.round}` : ""}
                      </strong>
                      <small>
                        {formatDate(interview.date)} ·{" "}
                        {interview.questionIds.length} 个问题
                      </small>
                    </span>
                    <StatusBadge status={interview.status} />
                  </button>
                ))}
              </div>
            </section>

            <section className="panel pending-review-panel">
              <button
                className="pending-review-panel-trigger"
                type="button"
                aria-label={`打开待审核侧边栏，共 ${pendingReviews.length} 场面试`}
                onClick={openReviewDrawer}
              />
              <div className="section-heading">
                <div>
                  <p className="eyebrow">AI 审核</p>
                  <h2>待审核</h2>
                </div>
                <span>{pendingReviews.length} 场</span>
              </div>
              {pendingReviews.length ? (
                <div className="pending-review-preview">
                  {pendingReviews
                    .slice(0, 3)
                    .map(({ interview, pendingCount }) => (
                      <div key={interview.id}>
                        <span>
                          <strong>{interview.company}</strong>
                          <small>
                            {[interview.role, interview.round]
                              .filter(Boolean)
                              .join(" · ") || formatDate(interview.date)}
                          </small>
                        </span>
                        <em>{pendingCount} 条</em>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="pending-review-empty">
                  <CheckCircle2 size={22} aria-hidden="true" />
                  <strong>暂无待审核内容</strong>
                  <small>AI 拆解后的候选会出现在这里。</small>
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      {reviewDrawerOpen
        ? createPortal(
            <div className="interview-ai-drawer-layer">
              <button
                className="interview-ai-drawer-backdrop"
                type="button"
                aria-label="关闭待审核侧边栏"
                onClick={() => setReviewDrawerOpen(false)}
              />
              <aside
                className="overview-review-drawer"
                role="dialog"
                aria-modal="true"
                aria-labelledby="overview-review-drawer-title"
              >
                <header className="overview-review-drawer-head">
                  <div>
                    <p className="eyebrow">AI review queue</p>
                    <h2 id="overview-review-drawer-title">待审核</h2>
                    <span>
                      {pendingReviews.length
                        ? `${pendingReviews.length} 场面试仍有 AI 候选待确认`
                        : "当前没有待确认的 AI 候选"}
                    </span>
                  </div>
                  <button
                    className="icon-button"
                    type="button"
                    title="关闭待审核侧边栏"
                    onClick={() => setReviewDrawerOpen(false)}
                  >
                    <X size={18} aria-hidden="true" />
                  </button>
                </header>

                {activePendingReview ? (
                  <>
                    <nav
                      className="overview-review-queue"
                      aria-label="待审核面试"
                    >
                      {pendingReviews.map(({ interview, pendingCount }) => (
                        <button
                          className={
                            interview.id === activePendingReview.interview.id
                              ? "active"
                              : ""
                          }
                          type="button"
                          key={interview.id}
                          onClick={() =>
                            setActiveReviewInterviewId(interview.id)
                          }
                        >
                          <span>
                            <strong>{interview.company}</strong>
                            <small>
                              {[interview.role, interview.round]
                                .filter(Boolean)
                                .join(" · ") || formatDate(interview.date)}
                            </small>
                          </span>
                          <em>{pendingCount} 条</em>
                        </button>
                      ))}
                    </nav>

                    <div className="overview-review-focus">
                      <header>
                        <div>
                          <span>
                            {formatDate(activePendingReview.interview.date)}
                          </span>
                          <h3>
                            {activePendingReview.interview.company}
                            {activePendingReview.interview.round
                              ? ` · ${activePendingReview.interview.round}`
                              : ""}
                          </h3>
                        </div>
                        <button
                          className="text-button"
                          type="button"
                          onClick={() => {
                            setReviewDrawerOpen(false);
                            onOpenInterview(activePendingReview.interview.id);
                          }}
                        >
                          完整面试
                          <ChevronRight size={14} aria-hidden="true" />
                        </button>
                      </header>
                      <InterviewAIAssistant
                        review={activePendingReview.review}
                        syncBlocks={syncBlocks}
                        reviewRequired={false}
                        configured
                        loading={false}
                        error={null}
                        onStart={() => undefined}
                        onOpenSettings={() => undefined}
                        onUpdate={(candidateId, input) =>
                          onUpdateAIReviewCandidate(
                            activePendingReview.interview.id,
                            candidateId,
                            input,
                          )
                        }
                        onResolve={(
                          candidateId,
                          decision,
                          connectToSuggested,
                        ) =>
                          onResolveAIReviewCandidate(
                            activePendingReview.interview.id,
                            candidateId,
                            decision,
                            connectToSuggested,
                          )
                        }
                        onAcceptAll={() =>
                          onAcceptAllAIReviewCandidates(
                            activePendingReview.interview.id,
                          )
                        }
                      />
                    </div>
                  </>
                ) : (
                  <div className="overview-review-drawer-empty">
                    <CheckCircle2 size={28} aria-hidden="true" />
                    <h3>待审核内容已处理完毕</h3>
                    <p>新的 AI 拆解结果会继续进入这里。</p>
                    <button
                      className="button secondary"
                      type="button"
                      onClick={() => {
                        setReviewDrawerOpen(false);
                        onNavigate("interviews");
                      }}
                    >
                      查看面试记录
                    </button>
                  </div>
                )}
              </aside>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function InterviewsPage({
  interviews,
  questions,
  aiReviews,
  onOpen,
  onCreate,
}: {
  interviews: Interview[];
  questions: AtomicQuestion[];
  aiReviews: InterviewAIReview[];
  onOpen: (id: string) => void;
  onCreate: () => void;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "pending" | "reviewed"
  >("all");
  const [quickFilters, setQuickFilters] = useState({
    role: "",
    company: "",
    date: "",
    tag: "",
  });
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const filterControlRef = useRef<HTMLDivElement>(null);

  const interviewRows = useMemo(() => {
    const questionById = new Map(
      questions.map((question) => [question.id, question]),
    );
    const reviewByInterviewId = new Map(
      aiReviews.map((review) => [review.interviewId, review]),
    );

    return interviews.map((interview) => {
      const pendingCandidates =
        reviewByInterviewId
          .get(interview.id)
          ?.candidates.filter(
            (candidate) => candidate.decision === "pending",
          ) ?? [];
      const tags = [
        ...new Set([
          ...interview.questionIds.flatMap(
            (questionId) => questionById.get(questionId)?.tags ?? [],
          ),
          ...pendingCandidates.flatMap((candidate) => candidate.tags),
        ]),
      ];

      return {
        interview,
        tags,
        visibleQuestionCount:
          interview.questionIds.length + pendingCandidates.length,
      };
    });
  }, [aiReviews, interviews, questions]);

  const filterOptions = useMemo(() => {
    const uniqueValues = (values: string[]) =>
      [...new Set(values.filter(Boolean))].sort((left, right) =>
        left.localeCompare(right, "zh-CN"),
      );

    return {
      roles: uniqueValues(interviews.map((interview) => interview.role)),
      companies: uniqueValues(interviews.map((interview) => interview.company)),
      dates: uniqueValues(
        interviews.map((interview) => interview.date),
      ).reverse(),
      tags: uniqueValues(interviewRows.flatMap((row) => row.tags)),
    };
  }, [interviewRows, interviews]);

  useEffect(() => {
    if (!filterPanelOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (
        filterControlRef.current &&
        !filterControlRef.current.contains(event.target as Node)
      ) {
        setFilterPanelOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFilterPanelOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [filterPanelOpen]);

  const activeQuickFilterCount =
    Object.values(quickFilters).filter(Boolean).length;
  const rows = interviewRows
    .filter(({ interview, tags }) => {
      if (
        statusFilter === "pending" &&
        !["draft", "pending"].includes(interview.status)
      ) {
        return false;
      }
      if (statusFilter === "reviewed" && interview.status !== "reviewed") {
        return false;
      }
      if (quickFilters.role && interview.role !== quickFilters.role) {
        return false;
      }
      if (quickFilters.company && interview.company !== quickFilters.company) {
        return false;
      }
      if (quickFilters.date && interview.date !== quickFilters.date) {
        return false;
      }
      if (quickFilters.tag && !tags.includes(quickFilters.tag)) return false;

      const haystack = [
        interview.company,
        interview.role,
        interview.round,
        interview.rawText,
        ...tags,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query.trim().toLowerCase());
    })
    .sort((left, right) =>
      right.interview.date.localeCompare(left.interview.date),
    );

  return (
    <div className="page interviews-page">
      <PageHeader
        eyebrow="面试记录 · Interview Log"
        title={
          <>
            你的面经，<em>按你的方式</em>整理
          </>
        }
        action={
          <button className="button primary desktop-action" onClick={onCreate}>
            <Plus size={16} aria-hidden="true" />
            新建面试
          </button>
        }
      />
      <div className="toolbar interview-list-toolbar">
        <label className="search-field">
          <Search size={16} aria-hidden="true" />
          <input
            aria-label="搜索面试记录"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索公司 / 岗位 / 内容关键词"
          />
        </label>
        <div className="segmented" aria-label="审核状态筛选">
          {(["all", "reviewed", "pending"] as const).map((value) => (
            <button
              key={value}
              className={statusFilter === value ? "active" : ""}
              onClick={() => setStatusFilter(value)}
            >
              {value === "all"
                ? "全部"
                : value === "pending"
                  ? "待审核"
                  : "已审核"}
            </button>
          ))}
        </div>
        <div className="interview-filter-control" ref={filterControlRef}>
          <button
            className={`button secondary interview-filter-trigger${
              activeQuickFilterCount ? " active" : ""
            }`}
            type="button"
            aria-expanded={filterPanelOpen}
            aria-controls="interview-quick-filters"
            onClick={() => setFilterPanelOpen((current) => !current)}
          >
            <ListFilter size={15} aria-hidden="true" />
            筛选
            {activeQuickFilterCount ? (
              <span className="interview-filter-count">
                {activeQuickFilterCount}
              </span>
            ) : null}
          </button>
          {filterPanelOpen ? (
            <div
              className="interview-filter-panel"
              id="interview-quick-filters"
              role="dialog"
              aria-label="快速筛选面试记录"
            >
              <header>
                <strong>快速筛选</strong>
                <button
                  className="text-button"
                  type="button"
                  disabled={!activeQuickFilterCount}
                  onClick={() =>
                    setQuickFilters({
                      role: "",
                      company: "",
                      date: "",
                      tag: "",
                    })
                  }
                >
                  清除全部
                </button>
              </header>
              <div className="interview-filter-fields">
                <FilterSelect
                  label="岗位名称"
                  value={quickFilters.role}
                  emptyLabel="全部岗位"
                  options={filterOptions.roles}
                  onChange={(role) =>
                    setQuickFilters((current) => ({ ...current, role }))
                  }
                />
                <FilterSelect
                  label="公司"
                  value={quickFilters.company}
                  emptyLabel="全部公司"
                  options={filterOptions.companies}
                  onChange={(company) =>
                    setQuickFilters((current) => ({ ...current, company }))
                  }
                />
                <FilterSelect
                  label="面试时间"
                  value={quickFilters.date}
                  emptyLabel="全部时间"
                  options={filterOptions.dates}
                  formatOption={formatDate}
                  onChange={(date) =>
                    setQuickFilters((current) => ({ ...current, date }))
                  }
                />
                <FilterSelect
                  label="标签"
                  value={quickFilters.tag}
                  emptyLabel="全部标签"
                  options={filterOptions.tags}
                  onChange={(tag) =>
                    setQuickFilters((current) => ({ ...current, tag }))
                  }
                />
              </div>
              <footer>
                <button
                  className="button primary"
                  type="button"
                  onClick={() => setFilterPanelOpen(false)}
                >
                  完成
                </button>
              </footer>
            </div>
          ) : null}
        </div>
      </div>
      {rows.length ? (
        <div className="interview-list">
          {rows.map(({ interview, tags, visibleQuestionCount }) => (
            <button
              className="interview-row"
              key={interview.id}
              onClick={() => onOpen(interview.id)}
            >
              <span className="interview-main">
                <strong>{interview.company}</strong>
                <small>
                  {[interview.role, interview.source, interview.round]
                    .filter(Boolean)
                    .join(" · ") || "未填写岗位和轮次"}
                </small>
              </span>
              <span className="interview-row-mid">
                <span className="interview-date">{interview.date}</span>
                <span className="interview-mobile-count">
                  · {visibleQuestionCount} 个问题
                </span>
                {tags.slice(0, 3).map((tag) => (
                  <span className="tag" key={tag}>
                    {tag}
                  </span>
                ))}
                {tags.length > 3 ? <small>+{tags.length - 3}</small> : null}
              </span>
              <span className="interview-row-end">
                <StatusBadge status={interview.status} />
                <span className="interview-count">
                  {visibleQuestionCount} 个问题
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState
          title={interviews.length ? "没有匹配的面试记录" : "还没有面试记录"}
          description={
            interviews.length
              ? "调整搜索词或筛选条件。"
              : "先完整保存原文，再逐步整理。"
          }
          action={
            !interviews.length ? (
              <button className="button primary" onClick={onCreate}>
                导入面经
              </button>
            ) : null
          }
        />
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  emptyLabel,
  options,
  formatOption = (option) => option,
  onChange,
}: {
  label: string;
  value: string;
  emptyLabel: string;
  options: string[];
  formatOption?: (option: string) => string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <span className="interview-filter-select">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">{emptyLabel}</option>
          {options.map((option) => (
            <option value={option} key={option}>
              {formatOption(option)}
            </option>
          ))}
        </select>
        <ChevronDown size={14} aria-hidden="true" />
      </span>
    </label>
  );
}

function AIAssistantSuggestion({
  candidate,
  index,
  syncBlock,
  onUpdate,
  onResolve,
}: {
  candidate: AIReviewCandidate;
  index: number;
  syncBlock?: SyncBlock;
  onUpdate: (input: UpdateAIReviewCandidateInput) => void;
  onResolve: (
    decision: "accepted" | "ignored",
    connectToSuggested?: boolean,
  ) => void;
}) {
  const [title, setTitle] = useState(candidate.title);
  const [answer, setAnswer] = useState(candidate.answer);
  const [tagsText, setTagsText] = useState(candidate.tags.join("，"));
  const [expanded, setExpanded] = useState(false);

  const persist = () => {
    onUpdate({
      title,
      answer,
      tags: tagsText.split(/[，,]/),
    });
  };

  const resolve = (
    decision: "accepted" | "ignored",
    connectToSuggested = false,
  ) => {
    persist();
    onResolve(decision, connectToSuggested);
  };

  return (
    <article>
      <small>{syncBlock ? "同步候选" : "问答候选"}</small>
      <strong>
        Q{String(index + 1).padStart(2, "0")}{" "}
        {syncBlock ? `建议关联「${syncBlock.title}」` : title}
      </strong>
      <p>
        {candidate.matchReason ||
          candidate.sourceExcerpt ||
          "请结合原文核对后决定。"}
      </p>
      {expanded ? (
        <div className="interview-ai-suggestion-detail">
          <label>
            <span>问题</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label>
            <span>当次回答</span>
            <textarea
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              rows={4}
              placeholder="原文没有明确回答时保持为空"
            />
          </label>
          <label>
            <span>标签</span>
            <input
              value={tagsText}
              onChange={(event) => setTagsText(event.target.value)}
              placeholder="使用逗号分隔"
            />
          </label>
          <blockquote>
            <span>原文依据</span>
            {candidate.sourceExcerpt || "AI 未返回对应原文片段。"}
          </blockquote>
          <button
            className="text-button"
            type="button"
            onClick={() => {
              persist();
              setExpanded(false);
            }}
          >
            保存修改
          </button>
        </div>
      ) : null}
      <footer>
        <button
          className="button primary"
          type="button"
          disabled={!title.trim()}
          onClick={() => resolve("accepted", Boolean(syncBlock))}
        >
          {syncBlock ? "采纳并关联" : "采纳问答"}
        </button>
        <button
          className="button secondary"
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? "收起" : "查看"}
          <ChevronRight size={13} aria-hidden="true" />
        </button>
        <button
          className="button quiet"
          type="button"
          onClick={() => resolve("ignored")}
        >
          忽略
        </button>
      </footer>
    </article>
  );
}

function InterviewAIAssistant({
  review,
  syncBlocks,
  reviewRequired,
  configured,
  loading,
  error,
  onStart,
  onOpenSettings,
  onUpdate,
  onResolve,
  onAcceptAll,
}: {
  review?: InterviewAIReview;
  syncBlocks: SyncBlock[];
  reviewRequired: boolean;
  configured: boolean;
  loading: boolean;
  error: string | null;
  onStart: () => void;
  onOpenSettings: () => void;
  onUpdate: (candidateId: string, input: UpdateAIReviewCandidateInput) => void;
  onResolve: (
    candidateId: string,
    decision: "accepted" | "ignored",
    connectToSuggested?: boolean,
  ) => void;
  onAcceptAll: () => void;
}) {
  const pending =
    review?.candidates.filter(
      (candidate) => candidate.decision === "pending",
    ) ?? [];
  const handled = review ? review.candidates.length - pending.length : 0;

  return (
    <section className="interview-ai-assistant">
      <div className="interview-ai-heading">
        <p className="eyebrow">AI 助理</p>
        {review ? (
          <span>
            {handled}/{review.candidates.length}
          </span>
        ) : null}
      </div>

      {loading ? (
        <div className="interview-ai-empty">
          <LoaderCircle className="spin" size={21} aria-hidden="true" />
          <strong>正在拆解面经</strong>
          <p>识别候选问题、当次回答与同步块建议。</p>
        </div>
      ) : !review && reviewRequired ? (
        <div className="interview-ai-empty">
          <Sparkles size={20} aria-hidden="true" />
          <strong>这场面经尚未拆解</strong>
          <p>原文已保存在本地，可以稍后调用 AI 生成审核清单。</p>
          <button
            className="button primary"
            type="button"
            onClick={configured ? onStart : onOpenSettings}
          >
            <Sparkles size={14} aria-hidden="true" />
            {configured ? "开始 AI 拆解" : "配置 AI 服务"}
          </button>
        </div>
      ) : !review ? (
        <div className="interview-ai-empty complete">
          <CheckCircle2 size={21} aria-hidden="true" />
          <strong>当前没有待处理建议</strong>
          <p>这场面试已经完成整理。</p>
        </div>
      ) : pending.length ? (
        <>
          <div className="interview-ai-summary">
            <strong>{pending.length} 条建议待处理</strong>
            <span>逐条采纳或忽略后自动完成审核。</span>
          </div>
          <div className="interview-ai-suggestions">
            {pending.map((candidate) => {
              const syncBlock = syncBlocks.find(
                (item) => item.id === candidate.suggestedSyncBlockId,
              );
              const candidateIndex = review.candidates.findIndex(
                (item) => item.id === candidate.id,
              );
              return (
                <AIAssistantSuggestion
                  key={candidate.id}
                  candidate={candidate}
                  index={candidateIndex}
                  syncBlock={syncBlock}
                  onUpdate={(input) => onUpdate(candidate.id, input)}
                  onResolve={(decision, connectToSuggested) =>
                    onResolve(candidate.id, decision, connectToSuggested)
                  }
                />
              );
            })}
          </div>
          {pending.length > 1 ? (
            <button
              className="button secondary interview-ai-accept-all"
              type="button"
              onClick={onAcceptAll}
            >
              <CheckCircle2 size={14} aria-hidden="true" />
              全部采纳为原子问答
            </button>
          ) : null}
        </>
      ) : (
        <div className="interview-ai-empty complete">
          <CheckCircle2 size={21} aria-hidden="true" />
          <strong>AI 建议已全部处理</strong>
          <p>采纳的内容已进入原子问答，忽略项仍保留审核记录。</p>
        </div>
      )}

      {error ? (
        <div className="interview-ai-error" role="alert">
          <span>{error}</span>
          <button className="text-button" type="button" onClick={onStart}>
            重试
          </button>
        </div>
      ) : null}
    </section>
  );
}

function InterviewDetail({
  interview,
  questions,
  syncBlocks,
  resumeExperiences,
  aiReview,
  aiClient,
  aiConfig,
  aiApiKey,
  aiConfigured,
  onBack,
  onAddQuestion,
  onOpenSync,
  onOpenResume,
  onCreateSync,
  onSaveAIReview,
  onUpdateAIReviewCandidate,
  onResolveAIReviewCandidate,
  onAcceptAllAIReviewCandidates,
  onOpenAISettings,
}: {
  interview: Interview;
  questions: AtomicQuestion[];
  syncBlocks: SyncBlock[];
  resumeExperiences: ResumeExperience[];
  aiReview?: InterviewAIReview;
  aiClient: AIClient;
  aiConfig: AIProviderConfig;
  aiApiKey: string;
  aiConfigured: boolean;
  onBack: () => void;
  onAddQuestion: () => void;
  onOpenSync: (id: string) => void;
  onOpenResume: (id: string) => void;
  onCreateSync: (questionId: string) => void;
  onSaveAIReview: (
    interviewId: string,
    candidates: SaveAIReviewCandidateInput[],
  ) => void;
  onUpdateAIReviewCandidate: (
    interviewId: string,
    candidateId: string,
    input: UpdateAIReviewCandidateInput,
  ) => void;
  onResolveAIReviewCandidate: (
    interviewId: string,
    candidateId: string,
    decision: "accepted" | "ignored",
    connectToSuggested?: boolean,
  ) => void;
  onAcceptAllAIReviewCandidates: (interviewId: string) => void;
  onOpenAISettings: () => void;
}) {
  const [sourceExpanded, setSourceExpanded] = useState(false);
  const [aiLoading, setAILoading] = useState(false);
  const [aiError, setAIError] = useState<string | null>(null);
  const [mobileAIOpen, setMobileAIOpen] = useState(false);
  const aiControllerRef = useRef<AbortController | null>(null);
  const interviewQuestions = interview.questionIds
    .map((id) => questions.find((question) => question.id === id))
    .filter((question): question is AtomicQuestion => Boolean(question));
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(
    interviewQuestions[0]?.id ?? null,
  );
  const questionNavPanelRef = useRef<HTMLElement>(null);
  const interviewQuestionIds = new Set(interview.questionIds);
  const interviewSyncIds = new Set(
    interviewQuestions
      .map((question) => question.linkedSyncBlockId)
      .filter((id): id is string => Boolean(id)),
  );
  const linkedExperiences = resumeExperiences.filter(
    (experience) =>
      experience.linkedQuestionIds.some((id) => interviewQuestionIds.has(id)) ||
      experience.linkedSyncBlockIds.some((id) => interviewSyncIds.has(id)),
  );
  const answeredCount = interviewQuestions.filter((question) =>
    question.answer.trim(),
  ).length;
  const linkedQuestionCount = interviewQuestions.filter(
    (question) => question.linkedSyncBlockId,
  ).length;
  const linkedSyncBlocks = syncBlocks.filter((syncBlock) =>
    interviewQuestions.some(
      (question) => question.linkedSyncBlockId === syncBlock.id,
    ),
  );

  useEffect(
    () => () => {
      aiControllerRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    if (!mobileAIOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileAIOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileAIOpen]);

  const startAIReview = async () => {
    if (!aiConfigured || aiLoading) return;
    const controller = new AbortController();
    aiControllerRef.current = controller;
    setAILoading(true);
    setAIError(null);
    try {
      const extracted = await aiClient.extractInterview(
        aiConfig,
        aiApiKey,
        { interview, syncBlocks },
        controller.signal,
      );
      onSaveAIReview(
        interview.id,
        extracted.map((candidate) => ({
          ...candidate,
          selected: true,
          connectToSuggested: false,
        })),
      );
    } catch (reason) {
      if (!controller.signal.aborted) {
        setAIError(
          reason instanceof Error ? reason.message : "AI 拆解失败，请重试。",
        );
      }
    } finally {
      if (aiControllerRef.current === controller) {
        aiControllerRef.current = null;
        setAILoading(false);
      }
    }
  };

  const aiAssistantProps = {
    review: aiReview,
    syncBlocks,
    reviewRequired:
      interview.status === "draft" || interview.status === "pending",
    configured: aiConfigured,
    loading: aiLoading,
    error: aiError,
    onStart: () => void startAIReview(),
    onOpenSettings: onOpenAISettings,
    onUpdate: (candidateId: string, input: UpdateAIReviewCandidateInput) =>
      onUpdateAIReviewCandidate(interview.id, candidateId, input),
    onResolve: (
      candidateId: string,
      decision: "accepted" | "ignored",
      connectToSuggested = false,
    ) =>
      onResolveAIReviewCandidate(
        interview.id,
        candidateId,
        decision,
        connectToSuggested,
      ),
    onAcceptAll: () => onAcceptAllAIReviewCandidates(interview.id),
  };
  const pendingAICount =
    aiReview?.candidates.filter((candidate) => candidate.decision === "pending")
      .length ?? 0;

  const keepQuestionVisibleInNav = (questionId: string) => {
    const panel = questionNavPanelRef.current;
    const item = Array.from(
      panel?.querySelectorAll<HTMLElement>("[data-nav-question-id]") ?? [],
    ).find((element) => element.dataset.navQuestionId === questionId);
    if (!panel || !item) return;

    const visibleTop = panel.scrollTop + 88;
    const visibleBottom = panel.scrollTop + panel.clientHeight - 24;
    if (
      item.offsetTop < visibleTop ||
      item.offsetTop + item.offsetHeight > visibleBottom
    ) {
      panel.scrollTo({
        top: Math.max(0, item.offsetTop - 88),
        behavior: "smooth",
      });
    }
  };

  useEffect(() => {
    let animationFrame = 0;

    const syncActiveQuestion = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        const blocks = interviewQuestions
          .map((question) =>
            document.getElementById(`interview-question-${question.id}`),
          )
          .filter((element): element is HTMLElement => Boolean(element));
        if (!blocks.length) return;

        const marker = Math.min(window.innerHeight * 0.35, 240);
        const reachedBottom =
          window.scrollY + window.innerHeight >=
          document.documentElement.scrollHeight - 4;
        let activeBlock = reachedBottom ? blocks[blocks.length - 1] : blocks[0];
        if (!reachedBottom) {
          for (const block of blocks) {
            if (block.getBoundingClientRect().top > marker) break;
            activeBlock = block;
          }
        }

        const questionId = activeBlock.dataset.questionId;
        if (!questionId) return;
        setActiveQuestionId((current) =>
          current === questionId ? current : questionId,
        );
        keepQuestionVisibleInNav(questionId);
      });
    };

    syncActiveQuestion();
    window.addEventListener("scroll", syncActiveQuestion, { passive: true });
    window.addEventListener("resize", syncActiveQuestion);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("scroll", syncActiveQuestion);
      window.removeEventListener("resize", syncActiveQuestion);
    };
  }, [interview.id, interviewQuestions.length]);

  const navigateToQuestion = (questionId: string) => {
    setActiveQuestionId(questionId);
    keepQuestionVisibleInNav(questionId);
    document
      .getElementById(`interview-question-${questionId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="detail-page interview-detail-page">
      <aside
        className="interview-detail-nav"
        aria-label="问题目录"
        ref={questionNavPanelRef}
      >
        <button className="back-button" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden="true" />
          返回面试记录
        </button>
        <div className="interview-detail-nav-heading">
          <span>问题目录</span>
          <span>{interviewQuestions.length}</span>
        </div>
        {interviewQuestions.length ? (
          <nav className="interview-question-nav">
            {interviewQuestions.map((question, index) => (
              <button
                className={activeQuestionId === question.id ? "active" : ""}
                type="button"
                key={question.id}
                data-nav-question-id={question.id}
                aria-current={
                  activeQuestionId === question.id ? "location" : undefined
                }
                onClick={() => navigateToQuestion(question.id)}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{question.title}</strong>
                {question.linkedSyncBlockId ? (
                  <Link2 size={13} aria-label="已关联同步块" />
                ) : null}
              </button>
            ))}
          </nav>
        ) : (
          <p className="interview-detail-nav-empty">尚未拆出问题</p>
        )}

        {linkedExperiences.length ? (
          <div className="interview-nav-resumes">
            <div className="interview-detail-nav-heading">
              <span>关联简历</span>
              <span>{linkedExperiences.length}</span>
            </div>
            {linkedExperiences.map((experience) => (
              <button
                type="button"
                key={experience.id}
                onClick={() => onOpenResume(experience.id)}
              >
                <FileUser size={14} aria-hidden="true" />
                <span>
                  <strong>{experience.title}</strong>
                  <small>{experience.organization || experience.type}</small>
                </span>
                <ChevronRight size={13} aria-hidden="true" />
              </button>
            ))}
          </div>
        ) : null}
      </aside>

      <div className="interview-detail-main">
        <div className="interview-detail-toolbar">
          <span>
            面试记录 <ChevronRight size={13} aria-hidden="true" />
            {interview.company}
            {interview.round ? ` · ${interview.round}` : ""}
          </span>
          <StatusBadge status={interview.status} />
        </div>

        <header className="interview-detail-hero">
          <p className="eyebrow">面试 · {formatDate(interview.date)}</p>
          <h1>
            {interview.company}
            {interview.role ? <em> · {interview.role}</em> : null}
          </h1>
          <p>
            {[interview.round, `来源 ${interview.source || "未填写"}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <button className="button primary" onClick={onAddQuestion}>
            <Plus size={15} aria-hidden="true" />
            添加原子问答
          </button>
        </header>

        {interview.sample ? (
          <div className="notice sample-notice">
            <Sparkles size={15} aria-hidden="true" />
            这是示例记录，可在设置中清空后开始使用自己的内容。
          </div>
        ) : null}

        <button
          className="interview-ai-drawer-trigger"
          type="button"
          onClick={() => setMobileAIOpen(true)}
        >
          <Sparkles size={15} aria-hidden="true" />
          <span>AI 助理</span>
          {pendingAICount ? <strong>{pendingAICount} 条待审核</strong> : null}
          <ChevronRight size={14} aria-hidden="true" />
        </button>

        <section
          className={`source-band ${sourceExpanded ? "expanded" : "collapsed"}`}
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">Source</p>
              <h2>原始面经</h2>
            </div>
            <button
              className="source-toggle"
              type="button"
              aria-expanded={sourceExpanded}
              aria-controls={`source-content-${interview.id}`}
              onClick={() => setSourceExpanded((current) => !current)}
            >
              {sourceExpanded ? "收起" : "展开原始面经"}
              <ChevronDown size={15} aria-hidden="true" />
            </button>
          </div>
          <div
            id={`source-content-${interview.id}`}
            className="source-content"
            aria-hidden={!sourceExpanded}
          >
            <div>
              <p>{interview.rawText}</p>
            </div>
          </div>
        </section>

        <section className="detail-section">
          <div className="interview-question-heading">
            <h2>原子问答</h2>
            <span>
              {aiReview
                ? `AI 提取 · 已确认 ${interviewQuestions.length} / ${aiReview.candidates.length}`
                : `已填写 ${answeredCount} / ${interviewQuestions.length}`}
            </span>
          </div>
          {interviewQuestions.length ? (
            <div className="question-stack">
              {interviewQuestions.map((question, index) => {
                const syncBlock = syncBlocks.find(
                  (item) => item.id === question.linkedSyncBlockId,
                );
                return (
                  <article
                    id={`interview-question-${question.id}`}
                    className="question-block"
                    key={question.id}
                    data-question-id={question.id}
                  >
                    <header>
                      <span>Q{String(index + 1).padStart(2, "0")}</span>
                      <h3>{question.title}</h3>
                    </header>
                    <div className="tag-row">
                      {question.tags.map((tag) => (
                        <span className="tag" key={tag}>
                          {tag}
                        </span>
                      ))}
                    </div>
                    {syncBlock ? (
                      <button
                        className="sync-reference"
                        onClick={() => onOpenSync(syncBlock.id)}
                      >
                        <Link2 size={14} aria-hidden="true" />
                        <span>
                          <small>同步块 · 已关联稳定回答</small>
                          <strong>{syncBlock.title}</strong>
                        </span>
                        <ChevronRight size={15} aria-hidden="true" />
                      </button>
                    ) : null}
                    <div className="interview-question-answer">
                      <span>当次回答</span>
                      <p className={question.answer ? "" : "muted"}>
                        {question.answer || "尚未填写当次回答。"}
                      </p>
                    </div>
                    {!syncBlock ? (
                      <button
                        className="text-button"
                        onClick={() => onCreateSync(question.id)}
                      >
                        <Link2 size={14} aria-hidden="true" />
                        关联到同步块
                      </button>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="panel-empty">
              <p>原文已安全保存。现在把其中的问题逐条拆出来。</p>
            </div>
          )}
        </section>
      </div>

      <aside className="interview-detail-aside" aria-label="记录关系摘要">
        <div className="interview-ai-desktop">
          <InterviewAIAssistant {...aiAssistantProps} />
        </div>

        <section>
          <p className="eyebrow">Progress</p>
          <h2>整理概况</h2>
          <dl className="interview-progress-list">
            <div>
              <dt>原子问答</dt>
              <dd>{interviewQuestions.length}</dd>
            </div>
            <div>
              <dt>已填写回答</dt>
              <dd>
                {answeredCount}/{interviewQuestions.length}
              </dd>
            </div>
            <div>
              <dt>已关联同步块</dt>
              <dd>
                {linkedQuestionCount}/{interviewQuestions.length}
              </dd>
            </div>
          </dl>
        </section>

        <section>
          <p className="eyebrow">Relations</p>
          <h2>同步块关系</h2>
          {linkedSyncBlocks.length ? (
            <div className="interview-related-syncs">
              {linkedSyncBlocks.map((syncBlock) => (
                <button
                  type="button"
                  key={syncBlock.id}
                  onClick={() => onOpenSync(syncBlock.id)}
                >
                  <Link2 size={14} aria-hidden="true" />
                  <span>
                    <strong>{syncBlock.title}</strong>
                    <small>
                      关联 {syncBlock.linkedQuestionIds.length} 个原子问答
                    </small>
                  </span>
                  <ChevronRight size={14} aria-hidden="true" />
                </button>
              ))}
            </div>
          ) : (
            <p className="interview-aside-empty">当前面试还没有关联同步块。</p>
          )}
        </section>

        <section>
          <p className="eyebrow">Source</p>
          <h2>记录信息</h2>
          <dl className="interview-meta-list">
            <div>
              <dt>日期</dt>
              <dd>{formatDate(interview.date)}</dd>
            </div>
            <div>
              <dt>轮次</dt>
              <dd>{interview.round || "未填写"}</dd>
            </div>
            <div>
              <dt>来源</dt>
              <dd>{interview.source || "未填写"}</dd>
            </div>
          </dl>
        </section>
      </aside>
      {mobileAIOpen
        ? createPortal(
            <div className="interview-ai-drawer-layer">
              <button
                className="interview-ai-drawer-backdrop"
                type="button"
                aria-label="关闭 AI 助理"
                onClick={() => setMobileAIOpen(false)}
              />
              <aside
                className="interview-ai-drawer"
                role="dialog"
                aria-modal="true"
                aria-label="AI 助理"
              >
                <button
                  className="icon-button interview-ai-drawer-close"
                  type="button"
                  title="关闭 AI 助理"
                  onClick={() => setMobileAIOpen(false)}
                >
                  <X size={18} aria-hidden="true" />
                </button>
                <InterviewAIAssistant {...aiAssistantProps} />
              </aside>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function QuestionsPage({
  questions,
  interviews,
  syncBlocks,
  onOpenQuestion,
  onCreateQuestion,
}: {
  questions: AtomicQuestion[];
  interviews: Interview[];
  syncBlocks: SyncBlock[];
  onOpenQuestion: (id: string) => void;
  onCreateQuestion: () => void;
}) {
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [timeFilter, setTimeFilter] = useState("");
  const interviewById = useMemo(
    () => new Map(interviews.map((interview) => [interview.id, interview])),
    [interviews],
  );
  const sourceOptions = useMemo(
    () =>
      interviews
        .filter((interview) =>
          questions.some((question) =>
            question.sourceInterviewIds.includes(interview.id),
          ),
        )
        .sort((left, right) => right.date.localeCompare(left.date)),
    [interviews, questions],
  );
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  const now = Date.now();
  const timeWindowDays =
    timeFilter === "7d"
      ? 7
      : timeFilter === "30d"
        ? 30
        : timeFilter === "90d"
          ? 90
          : null;
  const visibleQuestions = questions.filter((question) => {
    if (
      sourceFilter === "standalone" &&
      question.sourceInterviewIds.length > 0
    ) {
      return false;
    }
    if (
      sourceFilter &&
      sourceFilter !== "standalone" &&
      !question.sourceInterviewIds.includes(sourceFilter)
    ) {
      return false;
    }
    if (timeWindowDays) {
      const createdAt = new Date(question.createdAt).getTime();
      if (
        !Number.isFinite(createdAt) ||
        createdAt < now - timeWindowDays * 24 * 60 * 60 * 1000
      ) {
        return false;
      }
    }
    if (!normalizedQuery) return true;

    const sourceText = question.sourceInterviewIds.flatMap((id) => {
      const interview = interviewById.get(id);
      return interview
        ? [interview.company, interview.role, interview.round, interview.date]
        : [];
    });
    return [
      question.title,
      question.answer,
      question.notes,
      ...question.tags,
      ...sourceText,
    ]
      .join(" ")
      .toLocaleLowerCase("zh-CN")
      .includes(normalizedQuery);
  });
  const hasActiveFilters = Boolean(query || sourceFilter || timeFilter);
  const clearFilters = () => {
    setQuery("");
    setSourceFilter("");
    setTimeFilter("");
  };

  return (
    <div className="page questions-page">
      <PageHeader
        eyebrow="原子问答 · Atomic Blocks"
        title={
          <>
            每一个问题
            <br />
            都是<em>一个可以复用的原子</em>
          </>
        }
        description="实例回答保留当时的上下文，稳定回答通过同步块复用。"
        action={
          <button className="button primary" onClick={onCreateQuestion}>
            <Plus size={15} aria-hidden="true" />
            新建原子问答
          </button>
        }
      />
      {questions.length ? (
        <>
          <div className="toolbar question-list-toolbar">
            <label className="search-field">
              <Search size={16} aria-hidden="true" />
              <input
                aria-label="搜索原子问答"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索问题、答案、笔记或标签"
              />
            </label>
            <div className="question-filter-fields">
              <FilterSelect
                label="来源面试"
                value={sourceFilter}
                emptyLabel="全部来源"
                options={[
                  "standalone",
                  ...sourceOptions.map((interview) => interview.id),
                ]}
                formatOption={(option) => {
                  if (option === "standalone") return "独立创建";
                  const interview = interviewById.get(option);
                  return interview
                    ? `${interview.company} · ${interview.role || "岗位未填写"}`
                    : "来源面试已移除";
                }}
                onChange={setSourceFilter}
              />
              <FilterSelect
                label="创建时间"
                value={timeFilter}
                emptyLabel="全部时间"
                options={["7d", "30d", "90d"]}
                formatOption={(option) =>
                  option === "7d"
                    ? "近 7 天"
                    : option === "30d"
                      ? "近 30 天"
                      : "近 90 天"
                }
                onChange={setTimeFilter}
              />
            </div>
            {hasActiveFilters ? (
              <button
                className="text-button question-filter-clear"
                type="button"
                onClick={clearFilters}
              >
                清除条件
              </button>
            ) : null}
          </div>
          <div className="question-filter-summary" aria-live="polite">
            显示 {visibleQuestions.length} / {questions.length} 条
          </div>
        </>
      ) : null}
      {visibleQuestions.length ? (
        <div className="question-list">
          {visibleQuestions.map((question, index) => {
            const interview = interviews.find(
              (item) => item.id === question.sourceInterviewIds[0],
            );
            const syncBlock = syncBlocks.find(
              (item) => item.id === question.linkedSyncBlockId,
            );
            return (
              <button
                className="question-list-row"
                key={question.id}
                onClick={() => onOpenQuestion(question.id)}
              >
                <span className="question-list-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="question-list-content">
                  <strong>{question.title}</strong>
                  <span className="question-list-answer">
                    {question.answer || "尚未填写答案。"}
                  </span>
                  <span className="question-list-meta">
                    {interview
                      ? `${interview.company} · ${interview.role || "岗位未填写"}`
                      : question.sourceInterviewIds.length
                        ? "来源面试已移除"
                        : "独立创建"}
                    {question.tags.length
                      ? ` · ${question.tags.join(" / ")}`
                      : ""}
                  </span>
                </span>
                <span className="question-list-link">
                  {syncBlock ? (
                    <>
                      <Link2 size={13} aria-hidden="true" />
                      <span>{syncBlock.title}</span>
                    </>
                  ) : (
                    <span>未关联同步块</span>
                  )}
                </span>
                <ChevronRight
                  className="question-list-arrow"
                  size={18}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>
      ) : questions.length ? (
        <EmptyState
          title="没有匹配的原子问答"
          description="调整关键词、来源面试或创建时间。"
          action={
            <button className="button secondary" onClick={clearFilters}>
              清除筛选
            </button>
          }
        />
      ) : (
        <EmptyState
          title="还没有原子问答"
          description="可以独立创建，也可以从一场面试详情开始拆解并自动保留来源。"
          action={
            <button className="button primary" onClick={onCreateQuestion}>
              <Plus size={15} aria-hidden="true" />
              新建原子问答
            </button>
          }
        />
      )}
    </div>
  );
}

function QuestionDetail({
  question,
  interviews,
  syncBlocks,
  resumeExperiences,
  backLabel,
  onBack,
  onOpenInterview,
  onOpenSync,
  onOpenResume,
  onUpdate,
}: {
  question: AtomicQuestion;
  interviews: Interview[];
  syncBlocks: SyncBlock[];
  resumeExperiences: ResumeExperience[];
  backLabel: string;
  onBack: () => void;
  onOpenInterview: (id: string) => void;
  onOpenSync: (id: string) => void;
  onOpenResume: (id: string) => void;
  onUpdate: (
    questionId: string,
    input: {
      title: string;
      answer: string;
      notes?: string;
      tags: string[];
    },
  ) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(question.title);
  const [answer, setAnswer] = useState(question.answer);
  const [notes, setNotes] = useState(question.notes ?? "");
  const sourceInterviews = question.sourceInterviewIds
    .map((id) => interviews.find((item) => item.id === id))
    .filter((item): item is Interview => Boolean(item));
  const syncBlock = syncBlocks.find(
    (item) => item.id === question.linkedSyncBlockId,
  );
  const linkedExperiences = resumeExperiences.filter((experience) =>
    experience.linkedQuestionIds.includes(question.id),
  );
  const cancelEditing = () => {
    setTitle(question.title);
    setAnswer(question.answer);
    setNotes(question.notes ?? "");
    setIsEditing(false);
  };
  const save = () => {
    if (!title.trim()) return;
    onUpdate(question.id, {
      title,
      answer,
      notes,
      tags: question.tags,
    });
    setIsEditing(false);
  };

  return (
    <div className="page detail-page question-detail-page">
      <button className="back-button" onClick={onBack}>
        <ArrowLeft size={16} aria-hidden="true" />
        {backLabel}
      </button>
      <PageHeader
        eyebrow="原子问答 · Atomic Block"
        title={
          isEditing ? (
            <textarea
              className="question-title-editor"
              aria-label="问题"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              rows={2}
              autoFocus
            />
          ) : (
            question.title
          )
        }
        description={
          sourceInterviews.length
            ? `来自 ${sourceInterviews.length} 场面试 · 更新于 ${formatDate(question.updatedAt.slice(0, 10))}`
            : "独立创建 · 尚未关联面试记录"
        }
        action={
          isEditing ? (
            <div className="question-edit-actions">
              <button className="button quiet" onClick={cancelEditing}>
                取消
              </button>
              <button
                className="button primary"
                onClick={save}
                disabled={!title.trim()}
              >
                保存
              </button>
            </div>
          ) : (
            <button
              className="button secondary"
              onClick={() => setIsEditing(true)}
            >
              <Pencil size={14} aria-hidden="true" />
              编辑
            </button>
          )
        }
      />

      {question.tags.length ? (
        <div className="tag-row question-detail-tags">
          {question.tags.map((tag) => (
            <span className="tag" key={tag}>
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <div className={`question-document${isEditing ? " editing" : ""}`}>
        <section className="question-document-section">
          <p className="eyebrow">Answer</p>
          <h2>答案</h2>
          {isEditing ? (
            <textarea
              className="question-content-editor"
              aria-label="答案"
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder="写下这道问题的答案。"
              rows={9}
            />
          ) : (
            <div
              className={question.answer ? "answer-body" : "answer-body muted"}
            >
              {question.answer || "尚未填写答案。"}
            </div>
          )}
        </section>

        <section className="question-document-section question-notes-section">
          <p className="eyebrow">Notes</p>
          <h2>笔记</h2>
          {isEditing ? (
            <textarea
              className="question-content-editor notes-editor"
              aria-label="笔记"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="记录补充思路、待查资料或下次需要改进的地方。"
              rows={5}
            />
          ) : (
            <div
              className={question.notes ? "answer-body" : "answer-body muted"}
            >
              {question.notes || "还没有笔记。"}
            </div>
          )}
        </section>
      </div>

      <div className="question-relations">
        <section>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Synchronized knowledge</p>
              <h2>关联同步块</h2>
            </div>
          </div>
          {syncBlock ? (
            <button
              className="relation-row"
              onClick={() => onOpenSync(syncBlock.id)}
            >
              <Link2 size={15} aria-hidden="true" />
              <span>
                <strong>{syncBlock.title}</strong>
                <small>查看同步块正文与复习笔记</small>
              </span>
              <ChevronRight size={15} aria-hidden="true" />
            </button>
          ) : (
            <p className="relation-empty">尚未关联同步块。</p>
          )}
        </section>

        <section>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Sources</p>
              <h2>来源面试</h2>
            </div>
          </div>
          {sourceInterviews.length ? (
            sourceInterviews.map((interview) => (
              <button
                className="relation-row"
                key={interview.id}
                onClick={() => onOpenInterview(interview.id)}
              >
                <FileText size={15} aria-hidden="true" />
                <span>
                  <strong>{interview.company}</strong>
                  <small>
                    {[interview.role, interview.round]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                </span>
                <ChevronRight size={15} aria-hidden="true" />
              </button>
            ))
          ) : (
            <p className="relation-empty">该问题由用户独立创建。</p>
          )}
        </section>

        <section>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Resume evidence</p>
              <h2>关联简历经历</h2>
            </div>
          </div>
          {linkedExperiences.length ? (
            linkedExperiences.map((experience) => (
              <button
                className="relation-row"
                key={experience.id}
                onClick={() => onOpenResume(experience.id)}
              >
                <FileUser size={15} aria-hidden="true" />
                <span>
                  <strong>{experience.title}</strong>
                  <small>{experience.organization || "组织未填写"}</small>
                </span>
                <ChevronRight size={15} aria-hidden="true" />
              </button>
            ))
          ) : (
            <p className="relation-empty">尚未关联简历经历。</p>
          )}
        </section>
      </div>
    </div>
  );
}

function SyncPage({
  syncBlocks,
  questions,
  resumeExperiences,
  selectedId,
  onSelect,
  onCreate,
  onOpenQuestion,
  onOpenResume,
}: {
  syncBlocks: SyncBlock[];
  questions: AtomicQuestion[];
  resumeExperiences: ResumeExperience[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onOpenQuestion: (id: string) => void;
  onOpenResume: (id: string) => void;
}) {
  const selected =
    syncBlocks.find((item) => item.id === selectedId) ?? syncBlocks[0];
  const linkedExperiences = selected
    ? resumeExperiences.filter(
        (experience) =>
          experience.linkedSyncBlockIds.includes(selected.id) ||
          experience.linkedQuestionIds.some((id) =>
            selected.linkedQuestionIds.includes(id),
          ),
      )
    : [];

  return (
    <div className="page">
      <PageHeader
        eyebrow="Synchronized knowledge"
        title="同步块"
        description="牵一发而动全身"
        action={
          <button className="button primary" onClick={onCreate}>
            <Plus size={16} aria-hidden="true" />
            新建同步块
          </button>
        }
      />
      {syncBlocks.length && selected ? (
        <div className="sync-layout">
          <nav className="sync-list" aria-label="同步块列表">
            {syncBlocks.map((syncBlock) => (
              <button
                className={syncBlock.id === selected.id ? "active" : ""}
                key={syncBlock.id}
                onClick={() => onSelect(syncBlock.id)}
              >
                <strong>{syncBlock.title}</strong>
                <small>{syncBlock.linkedQuestionIds.length} 个关联问答</small>
              </button>
            ))}
          </nav>
          <article className="sync-detail">
            <p className="eyebrow">Stable answer</p>
            <h2>{selected.title}</h2>
            <div className="sync-body">{selected.body}</div>
            {selected.reviewNotes ? (
              <aside className="review-note">
                <strong>复习笔记</strong>
                <p>{selected.reviewNotes}</p>
              </aside>
            ) : null}
            <div className="linked-section">
              <h3>关联原子问答 · {selected.linkedQuestionIds.length}</h3>
              {selected.linkedQuestionIds.map((id) => {
                const question = questions.find((item) => item.id === id);
                return question ? (
                  <button
                    className="linked-question-row"
                    key={id}
                    onClick={() => onOpenQuestion(question.id)}
                  >
                    <CircleHelp size={14} aria-hidden="true" />
                    <span>{question.title}</span>
                    <ChevronRight size={14} aria-hidden="true" />
                  </button>
                ) : null;
              })}
            </div>
            <div className="linked-section">
              <h3>关联简历经历 · {linkedExperiences.length}</h3>
              {linkedExperiences.length ? (
                linkedExperiences.map((experience) => (
                  <button
                    className="linked-question-row"
                    key={experience.id}
                    onClick={() => onOpenResume(experience.id)}
                  >
                    <FileUser size={14} aria-hidden="true" />
                    <span>{experience.title}</span>
                    <ChevronRight size={14} aria-hidden="true" />
                  </button>
                ))
              ) : (
                <p className="relation-empty">尚未关联简历经历。</p>
              )}
            </div>
          </article>
        </div>
      ) : (
        <EmptyState
          title="还没有同步块"
          description="当一个问题值得跨面试复用时，为它维护一份稳定回答。"
          action={
            <button className="button primary" onClick={onCreate}>
              创建第一个同步块
            </button>
          }
        />
      )}
    </div>
  );
}

function SettingsPage({
  hasData,
  aiConfig,
  aiLoading,
  aiError,
  onSaveAIConfig,
  getAIApiKey,
  onSetAIApiKey,
  onClearAIApiKey,
  onTestAI,
  onLoadDemo,
  onExport,
  onClear,
}: {
  hasData: boolean;
  aiConfig: AIProviderConfig;
  aiLoading: boolean;
  aiError: string | null;
  onSaveAIConfig: (config: AIProviderConfig) => Promise<void>;
  getAIApiKey: (credentialId: AIProviderCredentialId) => string;
  onSetAIApiKey: (credentialId: AIProviderCredentialId, value: string) => void;
  onClearAIApiKey: (credentialId: AIProviderCredentialId) => void;
  onTestAI: (config: AIProviderConfig, apiKey: string) => Promise<void>;
  onLoadDemo: () => void;
  onExport: () => void;
  onClear: () => void;
}) {
  return (
    <div className="page settings-page">
      <PageHeader
        eyebrow="Local first"
        title="设置"
        description="知识库默认保存在本机；AI 仅在你明确触发时直连所配置的模型服务。"
      />
      <section className="settings-section">
        <div>
          <Database size={20} aria-hidden="true" />
          <span>
            <strong>本地工作区</strong>
            <small>IndexedDB · 当前浏览器配置</small>
          </span>
        </div>
        <CheckCircle2 className="success-icon" size={20} aria-label="可用" />
      </section>
      <AISettingsPanel
        config={aiConfig}
        loading={aiLoading}
        error={aiError}
        onSave={onSaveAIConfig}
        getApiKey={getAIApiKey}
        onSetApiKey={onSetAIApiKey}
        onClearApiKey={onClearAIApiKey}
        onTest={onTestAI}
      />
      <section className="settings-section action-section">
        <div>
          <Download size={20} aria-hidden="true" />
          <span>
            <strong>导出完整备份</strong>
            <small>包含对象关系的版本化 JSON，不包含任何凭据。</small>
          </span>
        </div>
        <button
          className="button secondary"
          onClick={onExport}
          disabled={!hasData}
        >
          导出
        </button>
      </section>
      <section className="settings-section action-section">
        <div>
          <Sparkles size={20} aria-hidden="true" />
          <span>
            <strong>加载示例工作区</strong>
            <small>显式加入虚构内容，用于体验首个闭环。</small>
          </span>
        </div>
        <button className="button secondary" onClick={onLoadDemo}>
          加载示例
        </button>
      </section>
      <section className="settings-section action-section danger-zone">
        <div>
          <Trash2 size={20} aria-hidden="true" />
          <span>
            <strong>清空本地工作区</strong>
            <small>此操作会删除当前浏览器中的全部千面数据。</small>
          </span>
        </div>
        <button className="button danger" onClick={onClear} disabled={!hasData}>
          清空
        </button>
      </section>
    </div>
  );
}

export default function App() {
  const {
    workspace,
    loading,
    error,
    dismissError,
    createInterview,
    updateInterview,
    createQuestion,
    saveAIReview,
    completeAIReview,
    updateAIReviewCandidate,
    resolveAIReviewCandidate,
    acceptAllAIReviewCandidates,
    createStandaloneQuestion,
    updateQuestion,
    linkQuestionToSyncBlock,
    createSyncBlock,
    createResumeExperience,
    updateResumeExperience,
    deleteResumeExperience,
    loadDemo,
    clear,
    exportWorkspace,
  } = useWorkspace();
  const aiSettings = useAISettings();
  const aiClient = useMemo(() => createOpenAICompatibleClient(), []);
  const [view, setView] = useState<View>("overview");
  const [selectedInterviewId, setSelectedInterviewId] = useState<string | null>(
    null,
  );
  const [selectedSyncId, setSelectedSyncId] = useState<string | null>(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(
    null,
  );
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null);
  const [questionReturnView, setQuestionReturnView] =
    useState<View>("questions");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () =>
      window.localStorage.getItem("interview-atlas-sidebar-collapsed") ===
      "true",
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileKnowledgeMenuOpen, setMobileKnowledgeMenuOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [dailyQuestionId, setDailyQuestionId] = useState<string | null>(null);
  const hasSelectedOverviewQuestion = useRef(false);

  useLayoutEffect(() => {
    if (loading || hasSelectedOverviewQuestion.current) return;

    hasSelectedOverviewQuestion.current = true;
    const question = getRandomQuestion(workspace.questions);
    setDailyQuestionId(question?.id ?? null);
  }, [loading, workspace.questions]);

  useEffect(() => {
    if (!mobileKnowledgeMenuOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileKnowledgeMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileKnowledgeMenuOpen]);

  const recommendations = useMemo(
    () => getRecommendedSyncBlocks(workspace),
    [workspace],
  );
  const selectedInterview = workspace.interviews.find(
    (item) => item.id === selectedInterviewId,
  );
  const selectedQuestion = workspace.questions.find(
    (item) => item.id === selectedQuestionId,
  );
  const dailyQuestion =
    workspace.questions.find((item) => item.id === dailyQuestionId) ?? null;
  const hasData =
    workspace.interviews.length +
      workspace.questions.length +
      workspace.syncBlocks.length +
      workspace.resumeExperiences.length >
    0;

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2400);
  };

  const navigate = (next: View) => {
    setView(next);
    setSelectedInterviewId(null);
    setSelectedSyncId(null);
    setSelectedQuestionId(null);
    setSelectedResumeId(null);
    setMobileMenuOpen(false);
    setMobileKnowledgeMenuOpen(false);
  };

  const openKnowledgeView = (next: View) => {
    navigate(next);
    setMobileKnowledgeMenuOpen(true);
  };

  const openInterview = (id: string) => {
    setView("interviews");
    setSelectedInterviewId(id);
    setSelectedQuestionId(null);
  };

  const openSync = (id: string) => {
    setView("sync");
    setSelectedSyncId(id);
    setSelectedInterviewId(null);
    setSelectedQuestionId(null);
  };

  const openQuestion = (id: string) => {
    setQuestionReturnView(view);
    setView("questions");
    setSelectedQuestionId(id);
    setSelectedInterviewId(null);
  };

  const openResume = (id: string) => {
    setView("resume");
    setSelectedResumeId(id);
    setSelectedInterviewId(null);
    setSelectedQuestionId(null);
  };

  const closeQuestion = () => {
    setSelectedQuestionId(null);
    setView(questionReturnView);
  };

  const exportData = () => {
    const payload = JSON.stringify(exportWorkspace(), null, 2);
    const url = URL.createObjectURL(
      new Blob([payload], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `interview-atlas-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    notify("完整备份已导出");
  };

  const clearData = () => {
    if (!window.confirm("确定清空全部本地数据吗？此操作无法撤销。")) return;
    clear();
    navigate("overview");
    notify("本地工作区已清空");
  };

  const toggleSidebar = () => {
    setSidebarCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(
        "interview-atlas-sidebar-collapsed",
        String(next),
      );
      return next;
    });
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <BrandMark />
        <p>正在打开本地知识库…</p>
      </div>
    );
  }

  return (
    <div className={`app-shell${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      <aside className={`sidebar ${mobileMenuOpen ? "mobile-open" : ""}`}>
        <div className="brand" aria-label="千面，interview atlas">
          <BrandMark />
          <span className="brand-name">
            <strong>千面</strong>
            <small>interview atlas</small>
          </span>
          <button
            className="icon-button sidebar-collapse-toggle"
            type="button"
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
            aria-expanded={!sidebarCollapsed}
            title={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen size={18} aria-hidden="true" />
            ) : (
              <PanelLeftClose size={18} aria-hidden="true" />
            )}
          </button>
          <button
            className="icon-button mobile-close"
            onClick={() => setMobileMenuOpen(false)}
            title="关闭导航"
          >
            <X size={18} />
          </button>
        </div>
        <button
          className="button accent import-button"
          onClick={() => {
            setDialog({ kind: "interview" });
            setMobileMenuOpen(false);
          }}
          aria-label="导入面经"
          title={sidebarCollapsed ? "导入面经" : undefined}
        >
          <Plus size={16} aria-hidden="true" />
          <span>导入面经</span>
          <kbd>⌘N</kbd>
        </button>
        <nav>
          {navGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <p>{group.label}</p>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    className={view === item.id ? "active" : ""}
                    key={item.id}
                    onClick={() => navigate(item.id)}
                    title={sidebarCollapsed ? item.label : undefined}
                    aria-label={item.label}
                  >
                    <Icon size={17} aria-hidden="true" />
                    <span>{item.label}</span>
                    {item.id === "interviews" ? (
                      <small>{workspace.interviews.length}</small>
                    ) : item.id === "questions" ? (
                      <small>{workspace.questions.length}</small>
                    ) : item.id === "sync" ? (
                      <small>{workspace.syncBlocks.length}</small>
                    ) : item.id === "resume" ? (
                      <small>{workspace.resumeExperiences.length}</small>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <Database size={15} aria-hidden="true" />
          <span>
            <strong>本地工作区</strong>
            <small>数据未上传</small>
          </span>
        </div>
      </aside>

      {mobileMenuOpen ? (
        <button
          className="mobile-nav-backdrop"
          aria-label="关闭导航"
          onClick={() => setMobileMenuOpen(false)}
        />
      ) : null}

      <main>
        <header className="mobile-header">
          <button
            className="icon-button"
            onClick={() => {
              setMobileKnowledgeMenuOpen(false);
              setMobileMenuOpen(true);
            }}
            title="打开导航"
          >
            <Menu size={20} />
          </button>
          <span className="mobile-brand" aria-label="千面，interview atlas">
            <BrandMark compact />
            <strong>interview atlas</strong>
          </span>
          <span className="mobile-header-spacer" aria-hidden="true" />
        </header>

        {error ? (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button onClick={dismissError}>关闭</button>
          </div>
        ) : null}

        {view === "overview" ? (
          <OverviewPage
            dailyQuestion={dailyQuestion}
            interviews={workspace.interviews}
            aiReviews={workspace.aiReviews}
            syncBlocks={workspace.syncBlocks}
            recommendations={recommendations}
            onNavigate={navigate}
            onOpenInterview={openInterview}
            onOpenQuestion={openQuestion}
            onOpenSync={openSync}
            onCreateInterview={() => setDialog({ kind: "interview" })}
            onUpdateAIReviewCandidate={updateAIReviewCandidate}
            onResolveAIReviewCandidate={resolveAIReviewCandidate}
            onAcceptAllAIReviewCandidates={acceptAllAIReviewCandidates}
          />
        ) : null}

        {view === "interviews" && !selectedInterview ? (
          <InterviewsPage
            interviews={workspace.interviews}
            questions={workspace.questions}
            aiReviews={workspace.aiReviews}
            onOpen={openInterview}
            onCreate={() => setDialog({ kind: "interview" })}
          />
        ) : null}

        {view === "interviews" && selectedInterview ? (
          <InterviewDetail
            key={selectedInterview.id}
            interview={selectedInterview}
            questions={workspace.questions}
            syncBlocks={workspace.syncBlocks}
            resumeExperiences={workspace.resumeExperiences}
            aiReview={workspace.aiReviews.find(
              (review) => review.interviewId === selectedInterview.id,
            )}
            aiClient={aiClient}
            aiConfig={aiSettings.config}
            aiApiKey={aiSettings.apiKey}
            aiConfigured={aiSettings.configured}
            onBack={() => setSelectedInterviewId(null)}
            onAddQuestion={() =>
              setDialog({ kind: "question", interviewId: selectedInterview.id })
            }
            onOpenSync={openSync}
            onOpenResume={openResume}
            onCreateSync={(questionId) =>
              setDialog({ kind: "sync", questionId })
            }
            onSaveAIReview={saveAIReview}
            onUpdateAIReviewCandidate={updateAIReviewCandidate}
            onResolveAIReviewCandidate={resolveAIReviewCandidate}
            onAcceptAllAIReviewCandidates={acceptAllAIReviewCandidates}
            onOpenAISettings={() => navigate("settings")}
          />
        ) : null}

        {view === "questions" && !selectedQuestion ? (
          <QuestionsPage
            questions={workspace.questions}
            interviews={workspace.interviews}
            syncBlocks={workspace.syncBlocks}
            onOpenQuestion={openQuestion}
            onCreateQuestion={() => setDialog({ kind: "standalone-question" })}
          />
        ) : null}

        {view === "questions" && selectedQuestion ? (
          <QuestionDetail
            question={selectedQuestion}
            interviews={workspace.interviews}
            syncBlocks={workspace.syncBlocks}
            resumeExperiences={workspace.resumeExperiences}
            backLabel={
              questionReturnView === "sync"
                ? "返回同步块"
                : questionReturnView === "resume"
                  ? "返回简历经历"
                  : questionReturnView === "overview"
                    ? "返回概览"
                    : "返回原子问答"
            }
            onBack={closeQuestion}
            onOpenInterview={openInterview}
            onOpenSync={openSync}
            onOpenResume={openResume}
            onUpdate={(questionId, input) => {
              updateQuestion(questionId, input);
              notify("原子问答已更新");
            }}
          />
        ) : null}

        {view === "sync" ? (
          <SyncPage
            syncBlocks={workspace.syncBlocks}
            questions={workspace.questions}
            resumeExperiences={workspace.resumeExperiences}
            selectedId={selectedSyncId}
            onSelect={setSelectedSyncId}
            onCreate={() => setDialog({ kind: "sync" })}
            onOpenQuestion={openQuestion}
            onOpenResume={openResume}
          />
        ) : null}

        {view === "resume" ? (
          <ResumePage
            experiences={workspace.resumeExperiences}
            questions={workspace.questions}
            syncBlocks={workspace.syncBlocks}
            focusedId={selectedResumeId}
            onFocus={setSelectedResumeId}
            onOpenQuestion={openQuestion}
            onOpenSync={openSync}
            onCreate={(input) => {
              const experience = createResumeExperience(input);
              notify("简历经历已保存到本地");
              return experience;
            }}
            onUpdate={(experienceId, input) => {
              updateResumeExperience(experienceId, input);
              notify("简历经历修改已应用");
            }}
            onDelete={(experienceId) => {
              if (
                !window.confirm(
                  "确定删除这条简历经历吗？关联的问答和同步块不会被删除。",
                )
              ) {
                return;
              }
              deleteResumeExperience(experienceId);
              setSelectedResumeId(null);
              notify("简历经历已删除");
            }}
          />
        ) : null}

        {view === "settings" ? (
          <SettingsPage
            hasData={hasData}
            aiConfig={aiSettings.config}
            aiLoading={aiSettings.loading}
            aiError={aiSettings.error}
            onSaveAIConfig={aiSettings.saveConfig}
            getAIApiKey={aiSettings.getApiKey}
            onSetAIApiKey={aiSettings.setApiKey}
            onClearAIApiKey={aiSettings.clearApiKey}
            onTestAI={(config, apiKey) =>
              aiClient.testConnection(config, apiKey)
            }
            onLoadDemo={() => {
              if (
                hasData &&
                !window.confirm("加载示例会替换当前工作区，是否继续？")
              ) {
                return;
              }
              loadDemo();
              navigate("overview");
              notify("示例工作区已加载");
            }}
            onExport={exportData}
            onClear={clearData}
          />
        ) : null}
      </main>

      <nav
        className={`bottom-nav ${
          mobileKnowledgeMenuOpen ? "knowledge-expanded" : "overview-expanded"
        }`}
        aria-label="移动端主导航"
      >
        <button
          className={`bottom-overview ${view === "overview" ? "active" : ""}`}
          onClick={() => navigate("overview")}
          aria-current={view === "overview" ? "page" : undefined}
        >
          <Home size={19} aria-hidden="true" />
          <span>概览</span>
        </button>
        <button
          className="bottom-create"
          onClick={() => {
            setMobileKnowledgeMenuOpen(false);
            setDialog({ kind: "interview" });
          }}
          aria-label="创建面试记录"
          title="创建面试记录"
        >
          <span className="bottom-create-icon">
            <Plus size={23} aria-hidden="true" />
          </span>
          <span className="bottom-create-label">创建</span>
        </button>
        <div className="bottom-knowledge">
          {mobileKnowledgeMenuOpen ? (
            <div
              className="bottom-knowledge-tabs"
              id="mobile-knowledge-tabs"
              aria-label="知识库分类"
            >
              {navItems.slice(1, 5).map((item) => {
                const Icon = item.icon;
                const shortLabel =
                  item.id === "interviews"
                    ? "面试"
                    : item.id === "questions"
                      ? "问答"
                      : item.id === "sync"
                        ? "同步"
                        : "简历";

                return (
                  <button
                    className={view === item.id ? "active" : ""}
                    key={item.id}
                    onClick={() => openKnowledgeView(item.id)}
                    aria-label={item.label}
                    aria-current={view === item.id ? "page" : undefined}
                    title={item.label}
                  >
                    <Icon size={16} aria-hidden="true" />
                    <span>{shortLabel}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <button
              className={`bottom-knowledge-toggle ${
                ["interviews", "questions", "sync", "resume"].includes(view)
                  ? "active"
                  : ""
              }`}
              onClick={() => setMobileKnowledgeMenuOpen(true)}
              aria-expanded="false"
              aria-controls="mobile-knowledge-tabs"
            >
              <BookOpen size={19} aria-hidden="true" />
              <span>知识库</span>
            </button>
          )}
        </div>
      </nav>

      {dialog?.kind === "interview" ? (
        <InterviewImportDialog
          client={aiClient}
          config={aiSettings.config}
          configured={aiSettings.configured}
          apiKey={aiSettings.apiKey}
          syncBlocks={workspace.syncBlocks}
          onCreateDraft={createInterview}
          onUpdateDraft={updateInterview}
          onSaveReview={saveAIReview}
          onClose={(savedDraftId) => {
            setDialog(null);
            if (savedDraftId) {
              openInterview(savedDraftId);
              notify("面试已加入待审核");
            }
          }}
          onOpenSettings={(savedDraftId) => {
            setDialog(null);
            navigate("settings");
            if (savedDraftId) notify("原文已保存，可配置 AI 后继续审核");
          }}
          onComplete={(interviewId, candidates) => {
            completeAIReview(interviewId, candidates);
            setDialog(null);
            openInterview(interviewId);
            notify(
              `已审核并保存 ${
                candidates.filter((candidate) => candidate.selected !== false)
                  .length
              } 个原子问答`,
            );
          }}
        />
      ) : null}

      {dialog?.kind === "question" ? (
        <Modal
          title="添加原子问答"
          description="这份回答属于当前面试实例，不会被同步块自动覆盖。"
          onClose={() => setDialog(null)}
        >
          <QuestionForm
            onCancel={() => setDialog(null)}
            onSubmit={(input) => {
              createQuestion(dialog.interviewId, input);
              setDialog(null);
              notify("原子问答已加入当前面试");
            }}
          />
        </Modal>
      ) : null}

      {dialog?.kind === "standalone-question" ? (
        <Modal
          title="新建原子问答"
          description="独立创建的问题可以稍后关联面试记录或同步块。"
          onClose={() => setDialog(null)}
        >
          <QuestionForm
            onCancel={() => setDialog(null)}
            onSubmit={(input) => {
              const question = createStandaloneQuestion(input);
              setDialog(null);
              openQuestion(question.id);
              notify("原子问答已保存到本地");
            }}
          />
        </Modal>
      ) : null}

      {dialog?.kind === "sync" ? (
        <Modal
          title={dialog.questionId ? "关联到同步块" : "创建同步块"}
          description={
            dialog.questionId
              ? "选择已有同步块，或新建一份可持续修订的稳定回答。"
              : "为重复问题维护一份稳定回答，并保留每次面试的实例内容。"
          }
          onClose={() => setDialog(null)}
        >
          <SyncBlockForm
            questions={workspace.questions}
            syncBlocks={workspace.syncBlocks}
            initialQuestionId={dialog.questionId}
            onCancel={() => setDialog(null)}
            onLinkExisting={(syncBlockId) => {
              if (!dialog.questionId) return;
              linkQuestionToSyncBlock(dialog.questionId, syncBlockId);
              setDialog(null);
              openSync(syncBlockId);
              notify("原子问答已关联到同步块");
            }}
            onSubmit={(input) => {
              const syncBlock = createSyncBlock(input);
              setDialog(null);
              openSync(syncBlock.id);
              notify("同步块已保存并建立引用");
            }}
          />
        </Modal>
      ) : null}

      {toast ? (
        <div className="toast" role="status">
          <CheckCircle2 size={15} aria-hidden="true" />
          {toast}
        </div>
      ) : null}

      {!hasData && view !== "settings" ? (
        <button
          className="demo-shortcut"
          onClick={() => {
            loadDemo();
            notify("已加载明确标记的示例内容");
          }}
        >
          <RotateCcw size={14} aria-hidden="true" />
          加载示例
        </button>
      ) : null}
    </div>
  );
}
