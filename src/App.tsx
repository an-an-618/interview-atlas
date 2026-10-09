import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Database,
  FileUser,
  FileText,
  FolderOpen,
  ListFilter,
  Home,
  Link2,
  LockKeyhole,
  LoaderCircle,
  Menu,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Radio,
  RotateCcw,
  Search,
  Settings,
  Sparkles,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createOpenAICompatibleClient } from "./ai/openAICompatibleClient";
import type {
  AIProviderConfig,
  AIProviderCredentialId,
} from "./ai/types";
import { AISettingsPanel, InterviewImportPage, extractionProgressLabel } from "./components/AI";
import { AnswerEditor } from "./components/AnswerEditor";
import { AnswerOutline } from "./components/AnswerOutline";
import { InterviewForm, QuestionForm, SyncBlockForm } from "./components/Forms";
import { GlobalSearchPage } from "./components/GlobalSearch";
import { InlineAnswer } from "./components/InlineAnswer";
import { InlineText } from "./components/InlineText";
import { InterviewRecorder } from "./components/InterviewRecorder";
import { Modal } from "./components/Modal";
import { MockInterviewPage } from "./components/MockInterview";
import { ResumePage } from "./components/Resume";
import { TranscriptionSettingsPanel } from "./components/TranscriptionSettings";
import { WorkspaceMigration } from "./components/WorkspaceMigration";
import type {
  AIReviewCandidate,
  AtomicQuestion,
  CreateInterviewInput,
  CreateInterviewOrganizationInput,
  CreateQuestionInput,
  Interview,
  InterviewAIReview,
  InterviewOrganization,
  InterviewOrganizationMode,
  InterviewStatus,
  ResumeExperience,
  SyncBlock,
  UpdateAIReviewCandidateInput,
  UpdateSyncBlockInput,
  Workspace,
} from "./domain/types";
import {
  getFavoriteSyncBlocks,
  getRandomQuestion,
  getInterviewQuestionIds,
  isAIReviewCandidatePending,
  searchSyncBlocks,
  sortSyncBlocksByLinkedQuestionCount,
} from "./domain/workspace";
import { useAISettings } from "./hooks/useAISettings";
import { useTranscriptionSettings } from "./hooks/useTranscriptionSettings";
import { useWorkspace } from "./hooks/useWorkspace";
import { useExtractionQueue } from "./hooks/useExtractionQueue";
import { extractionActive, extractionLabel, sortInterviews } from "./ai/extractionQueue";
import type { TranscriptionServiceConfig } from "./recording/settings";

type View =
  | "overview"
  | "review"
  | "search"
  | "create"
  | "mock"
  | "interviews"
  | "questions"
  | "sync"
  | "resume"
  | "settings";

type Dialog =
  | { kind: "question"; interviewId: string }
  | { kind: "standalone-question" }
  | { kind: "sync"; questionId?: string }
  | { kind: "clear-workspace" }
  | null;

type CreateMode = "choose" | "import" | "record";

const navItems = [
  { id: "overview" as const, label: "主页", icon: Home },
  { id: "search" as const, label: "全局搜索", icon: Search },
  { id: "mock" as const, label: "模拟面试", icon: MessageSquareText },
  { id: "interviews" as const, label: "面试记录", icon: FileText },
  { id: "questions" as const, label: "原子问答", icon: CircleHelp },
  { id: "sync" as const, label: "同步块", icon: Link2 },
  { id: "resume" as const, label: "简历经历", icon: FileUser },
  { id: "settings" as const, label: "设置", icon: Settings },
];

const knowledgeNavItems = navItems.filter((item) =>
  ["interviews", "questions", "sync", "resume"].includes(item.id),
);

const navGroups = [
  {
    label: "工作台",
    items: navItems.filter((item) =>
      ["overview", "search", "mock"].includes(item.id),
    ),
  },
  { label: "知识库", items: knowledgeNavItems },
  {
    label: "系统",
    items: navItems.filter((item) => item.id === "settings"),
  },
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

function StatusBadge({ status, task }: { status: InterviewStatus; task?: Interview["extractionTask"] }) {
  return (
    <span className={`status status-${status}`}>{task && task.status !== "completed" ? extractionLabel(task) : statusLabel[status]}</span>
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

function CreatePage({
  onImport,
  onRecord,
}: {
  onImport: () => void;
  onRecord: () => void;
}) {
  const modes = [
    {
      id: "01",
      title: "导入面经",
      description: "粘贴已有面经、复盘笔记或逐字稿，再由 AI 拆解为可审核的原子问答。",
      meta: "文本导入 · AI 辅助拆解",
      icon: Upload,
      action: onImport,
    },
    {
      id: "02",
      title: "录制面试",
      description: "同时记录面试官的系统音频与候选人的麦克风音频，转写后继续进入导入流程。",
      meta: "双端录音 · macOS 桌面版",
      icon: Radio,
      action: onRecord,
    },
  ];

  return (
    <div className="page create-page">
      <PageHeader
        eyebrow="新建"
        title="从哪里开始？"
        description="选择一种方式创建面试记录。无论从文本还是录音开始，内容都会先保存在本地。"
      />
      <div className="create-mode-list">
        {modes.map((mode) => {
          const Icon = mode.icon;
          return (
            <button type="button" key={mode.id} onClick={mode.action}>
              <span className="create-mode-number">{mode.id}</span>
              <span className="create-mode-icon">
                <Icon size={24} strokeWidth={1.6} aria-hidden="true" />
              </span>
              <span className="create-mode-copy">
                <strong>{mode.title}</strong>
                <span>{mode.description}</span>
                <small>{mode.meta}</small>
              </span>
              <ChevronRight size={20} aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function OverviewPage({
  dailyQuestion,
  interviews,
  aiReviews,
  syncBlocks,
  favoriteSyncBlocks,
  onNavigate,
  onOpenInterview,
  onOpenQuestion,
  onOpenSync,
  onCreateInterview,
  onOpenMockInterviewRoom,
  onOpenAIReview,
}: {
  dailyQuestion: AtomicQuestion | null;
  interviews: Interview[];
  aiReviews: InterviewAIReview[];
  syncBlocks: SyncBlock[];
  favoriteSyncBlocks: SyncBlock[];
  onNavigate: (view: View) => void;
  onOpenInterview: (id: string) => void;
  onOpenQuestion: (id: string) => void;
  onOpenSync: (id: string) => void;
  onCreateInterview: () => void;
  onOpenMockInterviewRoom: () => void;
  onOpenAIReview: (id: string) => void;
}) {
  const recent = [...interviews]
    .sort(sortInterviews)
    .slice(0, 5);
  const pendingReviews = interviews
    .flatMap((interview) => {
      const review = aiReviews.find((item) => item.interviewId === interview.id);
      const pendingCount = review?.candidates.filter(
        isAIReviewCandidatePending,
      ).length ?? 0;
      return pendingCount || (interview.extractionTask && interview.extractionTask.status !== "completed")
        ? [{ interview, review, pendingCount }]
        : [];
    })
    .sort((left, right) => sortInterviews(left.interview, right.interview));
  const today = new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "full",
  }).format(new Date());
  const dailyQuestionSource = dailyQuestion?.sourceInterviewIds
    .map((id) => interviews.find((interview) => interview.id === id))
    .find((interview): interview is Interview => Boolean(interview));
  const dailyQuestionSourceLabel = dailyQuestionSource
    ? [
        dailyQuestionSource.company,
        dailyQuestionSource.role,
        dailyQuestionSource.round,
        dailyQuestionSource.date
          ? formatDate(dailyQuestionSource.date)
          : "",
      ]
        .filter(Boolean)
        .join(" · ")
    : "";
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
              <span className="daily-question-copy">
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
                {dailyQuestionSourceLabel ? (
                  <span className="daily-question-source">
                    <span aria-hidden="true">——</span>
                    <span>{dailyQuestionSourceLabel}</span>
                  </span>
                ) : null}
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
        {!interviews.length && !syncBlocks.length ? (
          <EmptyState
            title="知识库还是空的"
            description="原文会先保存在本机。之后可以手动拆成问答，不需要配置 AI。"
            action={
              <button className="button accent" onClick={onCreateInterview}>
                <Plus size={16} aria-hidden="true" />
                新建第一条记录
              </button>
            }
          />
        ) : (
          <div className="overview-grid">
            <section className="panel">
              <div className="section-heading">
                <div>
                  <h2>同步块收藏夹</h2>
                </div>
                <span>{favoriteSyncBlocks.length} 项</span>
              </div>
              {favoriteSyncBlocks.length ? (
                <div className="review-list favorite-sync-list">
                  {favoriteSyncBlocks.map((syncBlock) => (
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
                  <p>在同步块页面点亮星标，常用回答会集中显示在这里。</p>
                  <button
                    className="text-button"
                    onClick={() => onNavigate("sync")}
                  >
                    去收藏同步块
                  </button>
                </div>
              )}
            </section>

            <section className="panel">
              <div className="section-heading">
                <div>
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
                    <StatusBadge status={interview.status} task={interview.extractionTask} />
                  </button>
                ))}
              </div>
            </section>

            <section className="panel pending-review-panel">
              <div className="section-heading">
                <div>
                  <h2>待审核</h2>
                </div>
                <span>{pendingReviews.length} 场</span>
              </div>
              {pendingReviews.length ? (
                <div className="pending-review-preview">
                  {pendingReviews
                    .slice(0, 5)
                    .map(({ interview, pendingCount }) => (
                      <button
                        type="button"
                        key={interview.id}
                        onClick={() => onOpenAIReview(interview.id)}
                      >
                        <span>
                          <strong>{interview.company}</strong>
                          <small>
                            {[interview.role, interview.round]
                              .filter(Boolean)
                              .join(" · ") || formatDate(interview.date)}
                          </small>
                        </span>
                        <em>{interview.extractionTask && interview.extractionTask.status !== "completed" ? extractionLabel(interview.extractionTask) : `${pendingCount} 条`}</em>
                        <ChevronRight size={14} aria-hidden="true" />
                      </button>
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

      <button
        className="overview-mock-room-entry"
        type="button"
        onClick={onOpenMockInterviewRoom}
      >
        <span className="overview-mock-room-icon">
          <MessageSquareText size={25} aria-hidden="true" />
        </span>
        <span className="overview-mock-room-copy">
          <small>AI Mock Interview</small>
          <strong>进入模拟面试间</strong>
        </span>
        <span className="overview-mock-room-action">
          开始模拟
          <ChevronRight size={18} aria-hidden="true" />
        </span>
      </button>
    </div>
  );
}

function InterviewsPage({
  interviews,
  organizations,
  questions,
  aiReviews,
  onOpen,
  onCreateOrganization,
  onDeleteOrganization,
  onDelete,
}: {
  interviews: Interview[];
  organizations: InterviewOrganization[];
  questions: AtomicQuestion[];
  aiReviews: InterviewAIReview[];
  onOpen: (id: string) => void;
  onCreateOrganization: (
    input: CreateInterviewOrganizationInput,
  ) => InterviewOrganization;
  onDeleteOrganization: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
}) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const deletingInterview = interviews.find((item) => item.id === deletingId);
  const deleteQuestionCount = deletingInterview
    ? getInterviewQuestionIds({ interviews, questions }, deletingInterview.id).length
    : 0;
  const closeDelete = () => {
    if (!deleting) {
      setDeletingId(null);
      setDeleteError("");
    }
  };
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
  const [organizerOpen, setOrganizerOpen] = useState(false);
  const [organizerModalOpen, setOrganizerModalOpen] = useState(false);
  const [activeCollection, setActiveCollection] = useState<{
    organizationId: string;
    collectionId: string;
  } | null>(null);
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
            (candidate) => candidate.questionDecision === "pending",
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

  useEffect(() => {
    if (!activeCollection) return;
    const organization = organizations.find(
      (item) => item.id === activeCollection.organizationId,
    );
    if (
      !organization?.collections.some(
        (collection) => collection.id === activeCollection.collectionId,
      )
    ) {
      setActiveCollection(null);
    }
  }, [activeCollection, organizations]);

  const activeQuickFilterCount =
    Object.values(quickFilters).filter(Boolean).length +
    (statusFilter === "all" ? 0 : 1);
  const activeOrganization = activeCollection
    ? organizations.find(
        (organization) => organization.id === activeCollection.organizationId,
      )
    : undefined;
  const selectedCollection = activeOrganization?.collections.find(
    (collection) => collection.id === activeCollection?.collectionId,
  );
  const rows = interviewRows
    .filter(({ interview, tags }) => {
      if (
        selectedCollection &&
        !selectedCollection.interviewIds.includes(interview.id)
      ) {
        return false;
      }
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
      sortInterviews(left.interview, right.interview),
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
        <button
          className={`button secondary interview-organize-trigger${
            organizerOpen ? " active" : ""
          }`}
          type="button"
          aria-expanded={organizerOpen}
          onClick={() => setOrganizerOpen((current) => !current)}
        >
          <FolderOpen size={15} aria-hidden="true" />
          整理
          {organizations.length ? (
            <span className="interview-organize-count">
              {organizations.length}
            </span>
          ) : null}
        </button>
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
                  onClick={() => {
                    setStatusFilter("all");
                    setQuickFilters({
                      role: "",
                      company: "",
                      date: "",
                      tag: "",
                    });
                  }}
                >
                  清除全部
                </button>
              </header>
              <div className="interview-filter-fields">
                <FilterSelect
                  label="审核状态"
                  value={statusFilter === "all" ? "" : statusFilter}
                  emptyLabel="全部状态"
                  options={["reviewed", "pending"]}
                  formatOption={(option) =>
                    option === "reviewed" ? "已审核" : "待审核"
                  }
                  onChange={(status) =>
                    setStatusFilter(
                      status === ""
                        ? "all"
                        : (status as "pending" | "reviewed"),
                    )}
                />
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
      {organizerOpen ? (
        <section className="interview-organizer" aria-label="已保存的整理">
          <header>
            <div>
              <span className="eyebrow">整理视图</span>
              <strong>按集合查看面试记录</strong>
            </div>
            <button
              className="button secondary"
              type="button"
              disabled={!interviews.length}
              onClick={() => setOrganizerModalOpen(true)}
            >
              <Plus size={15} aria-hidden="true" />
              新建整理
            </button>
          </header>
          {organizations.length ? (
            <div className="interview-organizer-list">
              {organizations.map((organization) => (
                <section className="interview-organization" key={organization.id}>
                  <header>
                    <div>
                      <strong>{organization.title}</strong>
                      <small>{organization.collections.length} 个集合</small>
                    </div>
                    <button
                      className="icon-button"
                      type="button"
                      aria-label={`删除整理：${organization.title}`}
                      title="删除整理"
                      onClick={() => onDeleteOrganization(organization.id)}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </header>
                  <div className="interview-collection-list">
                    {organization.collections.map((collection) => {
                      const active =
                        activeCollection?.organizationId === organization.id &&
                        activeCollection.collectionId === collection.id;
                      return (
                        <button
                          className={`interview-collection-pill${
                            active ? " active" : ""
                          }`}
                          type="button"
                          key={collection.id}
                          onClick={() =>
                            setActiveCollection(
                              active
                                ? null
                                : {
                                    organizationId: organization.id,
                                    collectionId: collection.id,
                                  },
                            )
                          }
                        >
                          <span>{collection.label}</span>
                          <small>{collection.interviewIds.length}</small>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="interview-organizer-empty">
              <p>还没有保存的整理。选择公司、岗位、轮次、时间或标签即可自动聚合。</p>
            </div>
          )}
        </section>
      ) : null}
      {selectedCollection ? (
        <div className="active-interview-collection">
          <span>
            <strong>{selectedCollection.label}</strong>
            {activeOrganization ? ` · ${activeOrganization.title}` : ""}
          </span>
          <button
            className="text-button"
            type="button"
            onClick={() => setActiveCollection(null)}
          >
            查看全部
          </button>
        </div>
      ) : null}
      {rows.length ? (
        <div className="interview-list">
          {rows.map(({ interview, tags, visibleQuestionCount }) => (
            <article
              className="interview-row"
              key={interview.id}
            >
              <button className="interview-open" onClick={() => onOpen(interview.id)}>
              <span className="interview-main">
                <span className="interview-title-line">
                  <strong>{interview.company}</strong>
                  {interview.simulated ? (
                    <span className="simulation-badge compact">模拟面</span>
                  ) : null}
                </span>
                <small>
                  {[interview.role, interview.round]
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
                <StatusBadge status={interview.status} task={interview.extractionTask} />
                <span className="interview-count">
                  {visibleQuestionCount} 个问题
                </span>
              </span>
              </button>
              <button
                className="icon-button interview-delete"
                aria-label={`删除面试记录：${interview.company}`}
                title="删除面试记录"
                onClick={() => { setDeleteError(""); setDeletingId(interview.id); }}
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </article>
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
        />
      )}
      {organizerModalOpen ? (
        <InterviewOrganizerModal
          interviews={interviews}
          interviewRows={interviewRows}
          onClose={() => setOrganizerModalOpen(false)}
          onSave={(input) => {
            const organization = onCreateOrganization(input);
            setOrganizerOpen(true);
            setOrganizerModalOpen(false);
            const firstCollection = organization.collections[0];
            if (firstCollection) {
              setActiveCollection({
                organizationId: organization.id,
                collectionId: firstCollection.id,
              });
            }
          }}
        />
      ) : null}
      {deletingInterview ? (
        <Modal title="删除面试记录？" eyebrow="永久删除" className="interview-delete-modal" onClose={closeDelete}>
          <div className="interview-delete-body">
            <div className="interview-delete-record">
              <FileText size={20} aria-hidden="true" />
              <div>
                <strong>{deletingInterview.company}</strong>
                <span>{[deletingInterview.role || "岗位未填写", deletingInterview.round, deletingInterview.date].filter(Boolean).join(" · ")}</span>
              </div>
            </div>
            <div className="interview-delete-scope">
              <div>
                <h3>将永久删除</h3>
                <p>这条面试记录及原文、<strong>{deleteQuestionCount} 个原子问答</strong>和 AI 审核记录，并解除相关引用。</p>
              </div>
              <div>
                <h3>仍然保留</h3>
                <p>关联的同步块、简历经历，以及它们的其他内容与关联。</p>
              </div>
            </div>
            <p className="interview-delete-note">若其中的问答被其他面试共用，该问答也会一并删除。</p>
            {deleteError ? <p className="inline-error" role="alert">{deleteError}</p> : null}
          </div>
          <footer className="form-actions interview-delete-actions">
            <span>此操作无法撤销</span>
            <button className="button quiet" autoFocus disabled={deleting} onClick={closeDelete}>取消</button>
            <button className="button danger" disabled={deleting} onClick={async () => {
              setDeleting(true);
              setDeleteError("");
              try {
                await onDelete(deletingInterview.id);
                setDeletingId(null);
              } catch (reason) {
                setDeleteError(reason instanceof Error ? reason.message : "删除失败，请重试。");
              } finally {
                setDeleting(false);
              }
            }}>{deleting ? "正在删除…" : "确认永久删除"}</button>
          </footer>
        </Modal>
      ) : null}
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

const organizationModeOptions: Array<{
  value: InterviewOrganizationMode;
  label: string;
  title: string;
}> = [
  { value: "company", label: "公司", title: "按公司整理" },
  { value: "role", label: "职位", title: "按职位整理" },
  { value: "round", label: "轮次", title: "按轮次整理" },
  { value: "date", label: "时间", title: "按时间整理" },
  { value: "tag", label: "标签", title: "按标签整理" },
  { value: "custom", label: "自定义", title: "自定义整理" },
];

function buildPresetInterviewCollections(
  mode: Exclude<InterviewOrganizationMode, "custom">,
  interviewRows: Array<{
    interview: Interview;
    tags: string[];
  }>,
): CreateInterviewOrganizationInput["collections"] {
  const groups = new Map<string, string[]>();
  interviewRows.forEach(({ interview, tags }) => {
    let values: string[];
    if (mode === "company") values = [interview.company || "公司未填写"];
    else if (mode === "role") values = [interview.role || "职位未填写"];
    else if (mode === "round") values = [interview.round || "轮次未填写"];
    else if (mode === "date") {
      values = [
        interview.date
          ? `${interview.date.slice(0, 4)}年${interview.date.slice(5, 7)}月`
          : "时间未填写",
      ];
    } else {
      values = tags;
    }

    values.filter(Boolean).forEach((value) => {
      groups.set(value, [...(groups.get(value) ?? []), interview.id]);
    });
  });

  return [...groups.entries()]
    .map(([label, interviewIds]) => ({ label, interviewIds }))
    .sort(
      (left, right) =>
        right.interviewIds.length - left.interviewIds.length ||
        left.label.localeCompare(right.label, "zh-CN"),
    );
}

function InterviewOrganizerModal({
  interviews,
  interviewRows,
  onClose,
  onSave,
}: {
  interviews: Interview[];
  interviewRows: Array<{
    interview: Interview;
    tags: string[];
  }>;
  onClose: () => void;
  onSave: (input: CreateInterviewOrganizationInput) => void;
}) {
  const [mode, setMode] = useState<InterviewOrganizationMode>("company");
  const [title, setTitle] = useState("按公司整理");
  const [customCollections, setCustomCollections] = useState<
    Array<{ key: string; label: string; interviewIds: string[] }>
  >(() => [{ key: crypto.randomUUID(), label: "", interviewIds: [] }]);
  const [error, setError] = useState("");
  const presetCollections =
    mode === "custom"
      ? []
      : buildPresetInterviewCollections(mode, interviewRows);
  const collections =
    mode === "custom"
      ? customCollections.map(({ label, interviewIds }) => ({
          label,
          interviewIds,
        }))
      : presetCollections;

  const updateCustomCollection = (
    key: string,
    update: Partial<{ label: string; interviewIds: string[] }>,
  ) => {
    setCustomCollections((current) =>
      current.map((collection) =>
        collection.key === key ? { ...collection, ...update } : collection,
      ),
    );
  };

  return (
    <Modal
      title="新建整理"
      eyebrow="面试记录 · Organize"
      description="保存后会形成可反复打开的集合视图。"
      className="interview-organizer-modal"
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setError("");
          try {
            onSave({ title, mode, collections });
          } catch (reason) {
            setError(
              reason instanceof Error ? reason.message : "整理保存失败，请重试。",
            );
          }
        }}
      >
        <fieldset className="organizer-mode-fieldset">
          <legend>整理方式</legend>
          <div className="organizer-mode-grid">
            {organizationModeOptions.map((option) => (
              <button
                className={mode === option.value ? "active" : ""}
                type="button"
                aria-pressed={mode === option.value}
                key={option.value}
                onClick={() => {
                  setMode(option.value);
                  setTitle(option.title);
                  setError("");
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>
        <label>
          整理名称
          <input
            value={title}
            maxLength={40}
            placeholder="例如：目标公司"
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        {mode === "custom" ? (
          <section className="custom-collection-editor">
            <header>
              <div>
                <strong>自定义枚举值</strong>
                <small>设置选项名称，并选择纳入该集合的面试记录。</small>
              </div>
              <button
                className="button secondary"
                type="button"
                onClick={() =>
                  setCustomCollections((current) => [
                    ...current,
                    {
                      key: crypto.randomUUID(),
                      label: "",
                      interviewIds: [],
                    },
                  ])
                }
              >
                <Plus size={14} aria-hidden="true" />
                添加选项
              </button>
            </header>
            <div className="custom-collection-list">
              {customCollections.map((collection, index) => (
                <section className="custom-collection" key={collection.key}>
                  <header>
                    <label>
                      选项名称
                      <input
                        value={collection.label}
                        maxLength={30}
                        placeholder={`例如：${index === 0 ? "重点跟进" : "备选机会"}`}
                        onChange={(event) =>
                          updateCustomCollection(collection.key, {
                            label: event.target.value,
                          })
                        }
                      />
                    </label>
                    <button
                      className="icon-button"
                      type="button"
                      disabled={customCollections.length === 1}
                      aria-label="删除选项"
                      title="删除选项"
                      onClick={() =>
                        setCustomCollections((current) =>
                          current.filter((item) => item.key !== collection.key),
                        )
                      }
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </header>
                  <div className="custom-interview-picker">
                    {interviews.map((interview) => {
                      const checked = collection.interviewIds.includes(
                        interview.id,
                      );
                      return (
                        <label key={interview.id}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              updateCustomCollection(collection.key, {
                                interviewIds: checked
                                  ? collection.interviewIds.filter(
                                      (id) => id !== interview.id,
                                    )
                                  : [...collection.interviewIds, interview.id],
                              })
                            }
                          />
                          <span>
                            <strong>{interview.company || "公司未填写"}</strong>
                            <small>
                              {[interview.role, interview.round, interview.date]
                                .filter(Boolean)
                                .join(" · ")}
                            </small>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </section>
        ) : (
          <section className="preset-collection-preview">
            <header>
              <strong>自动聚合结果</strong>
              <small>{presetCollections.length} 个集合</small>
            </header>
            {presetCollections.length ? (
              <div>
                {presetCollections.map((collection) => (
                  <span className="interview-collection-pill" key={collection.label}>
                    <span>{collection.label}</span>
                    <small>{collection.interviewIds.length}</small>
                  </span>
                ))}
              </div>
            ) : (
              <p>当前面试记录中没有可用于此方式的内容。</p>
            )}
          </section>
        )}
        {error ? <p className="inline-error" role="alert">{error}</p> : null}
        <footer className="form-actions">
          <button className="button quiet" type="button" onClick={onClose}>
            取消
          </button>
          <button
            className="button primary"
            type="submit"
            disabled={!title.trim() || !collections.some(
              (collection) =>
                collection.label.trim() && collection.interviewIds.length,
            )}
          >
            保存整理
          </button>
        </footer>
      </form>
    </Modal>
  );
}

function AIQuestionReviewCard({
  candidate,
  index,
  onUpdate,
  onResolve,
}: {
  candidate: AIReviewCandidate;
  index: number;
  onUpdate: (input: UpdateAIReviewCandidateInput) => void;
  onResolve: (decision: "accepted" | "ignored") => void;
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

  const resolveQuestion = (decision: "accepted" | "ignored") => {
    persist();
    setExpanded(false);
    onResolve(decision);
  };

  return (
    <article
      className={`ai-question-review-card ${candidate.questionDecision}`}
    >
      <header>
        <span>Q{String(index + 1).padStart(2, "0")}</span>
        {candidate.questionDecision === "pending" ? (
          <strong>待审核</strong>
        ) : (
          <strong className={`ai-review-decision-status ${candidate.questionDecision}`}>
            {candidate.questionDecision === "accepted" ? (
              <CheckCircle2 size={14} aria-hidden="true" />
            ) : null}
            {candidate.questionDecision === "accepted" ? "已采纳" : "已忽略"}
          </strong>
        )}
      </header>
      <h3>{title}</h3>
      <div className="ai-question-review-answer">
        <span>候选回答</span>
        <AnswerOutline
          answer={answer}
          emptyText="原文中没有明确回答。"
          className="compact"
        />
      </div>
      <blockquote>
        <span>原文依据</span>
        {candidate.sourceExcerpt || "AI 未返回对应原文片段。"}
      </blockquote>
      {candidate.tags.length ? (
        <div className="tag-row">
          {candidate.tags.map((tag) => (
            <span className="tag" key={tag}>{tag}</span>
          ))}
        </div>
      ) : null}
      {candidate.questionDecision === "pending" && expanded ? (
        <div className="interview-ai-suggestion-detail">
          <label>
            <span>问题</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <div className="answer-editor-field">
            <span>当次回答</span>
            <AnswerEditor
              value={answer}
              onChange={setAnswer}
              label="当次回答"
              minRows={4}
              placeholder="原文没有明确回答时保持为空"
            />
          </div>
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
      {candidate.questionDecision === "pending" ? (
        <footer>
          <button
            className="button secondary"
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? "收起详情" : "查看详情"}
            <ChevronRight size={13} aria-hidden="true" />
          </button>
          <div>
            <button
              className="button quiet"
              type="button"
              onClick={() => resolveQuestion("ignored")}
            >
              忽略
            </button>
            <button
              className="button primary"
              type="button"
              disabled={!title.trim()}
              onClick={() => resolveQuestion("accepted")}
            >
              采纳为原子问答
            </button>
          </div>
        </footer>
      ) : null}
    </article>
  );
}

function AISyncReviewCard({
  candidate,
  index,
  syncBlock,
  onResolve,
}: {
  candidate: AIReviewCandidate;
  index: number;
  syncBlock?: SyncBlock;
  onResolve: (decision: "accepted" | "ignored") => void;
}) {
  return (
    <article className={`ai-sync-review-card ${candidate.syncDecision}`}>
      <header>
        <span>关联建议 {String(index + 1).padStart(2, "0")}</span>
        {candidate.syncDecision === "pending" ? (
          <strong>待审核</strong>
        ) : (
          <strong className={`ai-review-decision-status ${candidate.syncDecision}`}>
            {candidate.syncDecision === "accepted" ? (
              <CheckCircle2 size={14} aria-hidden="true" />
            ) : null}
            {candidate.syncDecision === "accepted" ? "已关联" : "已忽略"}
          </strong>
        )}
      </header>
      <div className="ai-sync-review-route">
        <div>
          <span>原子问答</span>
          <strong>{candidate.title}</strong>
        </div>
        <Link2 size={18} aria-hidden="true" />
        <div>
          <span>目标同步块</span>
          <strong>{syncBlock?.title ?? "同步块已不存在"}</strong>
        </div>
      </div>
      {candidate.matchReason ? <p>{candidate.matchReason}</p> : null}
      {syncBlock?.body ? (
        <blockquote>
          <span>稳定回答摘要</span>
          {syncBlock.body}
        </blockquote>
      ) : null}
      {candidate.syncDecision === "pending" ? (
        <footer>
          <button
            className="button quiet"
            type="button"
            onClick={() => onResolve("ignored")}
          >
            忽略关联
          </button>
          <button
            className="button primary"
            type="button"
            disabled={!syncBlock}
            onClick={() => onResolve("accepted")}
          >
            <Link2 size={14} aria-hidden="true" />
            确认关联
          </button>
        </footer>
      ) : null}
    </article>
  );
}

function AIReviewPage({
  interview,
  review,
  syncBlocks,
  configured,
  onBack,
  onOpenInterview,
  onStartExtraction,
  onCancelExtraction,
  onOpenSettings,
  onUpdate,
  onResolveQuestion,
  onResolveSync,
  onAcceptAll,
}: {
  interview: Interview;
  review?: InterviewAIReview;
  syncBlocks: SyncBlock[];
  configured: boolean;
  onBack: () => void;
  onOpenInterview: () => void;
  onStartExtraction: () => void;
  onCancelExtraction: () => void;
  onOpenSettings: () => void;
  onUpdate: (candidateId: string, input: UpdateAIReviewCandidateInput) => void;
  onResolveQuestion: (
    candidateId: string,
    decision: "accepted" | "ignored",
  ) => void;
  onResolveSync: (
    candidateId: string,
    decision: "accepted" | "ignored",
  ) => void;
  onAcceptAll: () => void;
}) {
  const [sourceExpanded, setSourceExpanded] = useState(false);
  const loading = extractionActive(interview.extractionTask);
  const pendingQuestions = review?.candidates.filter(
    (candidate) => candidate.questionDecision === "pending",
  ) ?? [];
  const acceptedQuestions = review?.candidates.filter(
    (candidate) => candidate.questionDecision === "accepted",
  ) ?? [];
  const syncCandidates = acceptedQuestions.filter(
    (candidate) => candidate.suggestedSyncBlockId,
  );
  const pendingSync = syncCandidates.filter(
    (candidate) => candidate.syncDecision === "pending",
  );
  const questionsComplete = Boolean(review) && pendingQuestions.length === 0;
  const reviewComplete =
    questionsComplete && pendingSync.length === 0;

  return (
    <div className="page ai-review-page">
      <header className="ai-review-page-toolbar">
        <button className="back-button" type="button" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden="true" />
          返回
        </button>
        <button className="text-button" type="button" onClick={onOpenInterview}>
          查看完整面试
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      </header>

      <section className="ai-review-page-hero">
        <div>
          <p className="eyebrow">AI 解析审核 · {formatDate(interview.date)}</p>
          <h1>
            {interview.company}
            {interview.role ? <em> · {interview.role}</em> : null}
          </h1>
          <p>
            {[interview.round, interview.source].filter(Boolean).join(" · ") ||
              "面试记录"}
          </p>
        </div>
        {review ? (
          <div className={`ai-review-overall-status ${reviewComplete ? "complete" : ""}`}>
            {reviewComplete ? (
              <CheckCircle2 size={18} aria-hidden="true" />
            ) : (
              <Sparkles size={18} aria-hidden="true" />
            )}
            <span>
              <small>审核状态</small>
              <strong>{reviewComplete ? "已全部完成" : "正在审核"}</strong>
            </span>
          </div>
        ) : null}
      </section>

      <section className={`source-band ${sourceExpanded ? "expanded" : "collapsed"}`}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Source</p>
            <h2>原始面经</h2>
          </div>
          <button
            className="source-toggle"
            type="button"
            aria-expanded={sourceExpanded}
            onClick={() => setSourceExpanded((current) => !current)}
          >
            {sourceExpanded ? "收起" : "展开核对原文"}
            <ChevronDown size={15} aria-hidden="true" />
          </button>
        </div>
        <div className="source-content" aria-hidden={!sourceExpanded}>
          <div><p>{interview.rawText}</p></div>
        </div>
      </section>

      {loading ? (
        <div className="ai-review-page-state">
          <LoaderCircle className="spin" size={21} aria-hidden="true" />
          <strong>
            {interview.extractionTask?.status === "queued"
              ? "排队中"
              : "正在拆解面经"}
          </strong>
          <p aria-live="polite">
            {interview.extractionTask?.status === "queued"
              ? "前一条面经完成后会自动开始。"
              : extractionProgressLabel(interview.extractionTask?.progress ?? null)}
          </p>
          <p>切换页面后会继续处理，完成时会通知你。</p>
          <button className="text-button" type="button" onClick={onCancelExtraction}>
            取消拆解
          </button>
        </div>
      ) : !review ? (
        <div className="ai-review-page-state">
          <Sparkles size={20} aria-hidden="true" />
          <strong>这场面经尚未拆解</strong>
          <p>原文已保存在本地，可以稍后调用 AI 生成审核清单。</p>
          <button
            className="button primary"
            type="button"
            onClick={configured ? onStartExtraction : onOpenSettings}
          >
            <Sparkles size={14} aria-hidden="true" />
            {configured ? "开始 AI 拆解" : "配置 AI 服务"}
          </button>
        </div>
      ) : (
        <>
          <nav className="ai-review-stage-nav" aria-label="审核进度">
            <a href="#question-review-stage" className={questionsComplete ? "complete" : "active"}>
              <span>{questionsComplete ? <CheckCircle2 size={15} /> : "1"}</span>
              <strong>审核原子问答</strong>
              <small>{review.candidates.length - pendingQuestions.length}/{review.candidates.length}</small>
            </a>
            <i aria-hidden="true" />
            <a
              href="#sync-review-stage"
              className={reviewComplete ? "complete" : questionsComplete ? "active" : "locked"}
            >
              <span>{reviewComplete ? <CheckCircle2 size={15} /> : "2"}</span>
              <strong>审核同步块</strong>
              <small>{syncCandidates.length - pendingSync.length}/{syncCandidates.length}</small>
            </a>
          </nav>

          <section className="ai-review-stage" id="question-review-stage">
            <header>
              <span className="ai-review-stage-number">01</span>
              <div>
                <p className="eyebrow">Atomic questions</p>
                <h2>审核原子问答</h2>
                <p>逐条核对问题、回答和原文依据。采纳后才会写入原子问答库。</p>
              </div>
              <strong>{pendingQuestions.length ? `${pendingQuestions.length} 条待处理` : "已完成"}</strong>
            </header>
            <div className="ai-question-review-list">
              {review.candidates.map((candidate, index) => (
                <AIQuestionReviewCard
                  key={candidate.id}
                  candidate={candidate}
                  index={index}
                  onUpdate={(input) => onUpdate(candidate.id, input)}
                  onResolve={(decision) => onResolveQuestion(candidate.id, decision)}
                />
              ))}
            </div>
            {pendingQuestions.length > 1 ? (
              <footer className="ai-review-stage-actions">
                <button className="button secondary" type="button" onClick={onAcceptAll}>
                  <CheckCircle2 size={15} aria-hidden="true" />
                  全部采纳为原子问答
                </button>
              </footer>
            ) : null}
          </section>

          <section
            className={`ai-review-stage ai-sync-review-stage${questionsComplete ? "" : " locked"}`}
            id="sync-review-stage"
          >
            <header>
              <span className="ai-review-stage-number">02</span>
              <div>
                <p className="eyebrow">Sync blocks</p>
                <h2>审核同步块关联</h2>
                <p>只处理已采纳问答的关联建议。忽略关联不会影响上一步保存的问答。</p>
              </div>
              <strong>
                {!questionsComplete
                  ? "等待上一步"
                  : pendingSync.length
                    ? `${pendingSync.length} 条待处理`
                    : "已完成"}
              </strong>
            </header>
            {!questionsComplete ? (
              <div className="ai-sync-review-locked">
                <LockKeyhole size={22} aria-hidden="true" />
                <strong>先完成原子问答审核</strong>
                <p>所有问答均采纳或忽略后，这里的同步块关联建议才会开放。</p>
              </div>
            ) : syncCandidates.length ? (
              <div className="ai-sync-review-list">
                {syncCandidates.map((candidate, index) => (
                  <AISyncReviewCard
                    key={candidate.id}
                    candidate={candidate}
                    index={index}
                    syncBlock={syncBlocks.find(
                      (item) => item.id === candidate.suggestedSyncBlockId,
                    )}
                    onResolve={(decision) => onResolveSync(candidate.id, decision)}
                  />
                ))}
              </div>
            ) : (
              <div className="ai-review-page-state complete">
                <CheckCircle2 size={21} aria-hidden="true" />
                <strong>没有需要审核的同步块关联</strong>
                <p>已采纳的原子问答会独立保存在问答库中。</p>
              </div>
            )}
          </section>

          {reviewComplete ? (
            <div className="ai-review-complete-banner">
              <CheckCircle2 size={20} aria-hidden="true" />
              <div>
                <strong>本次 AI 解析审核已完成</strong>
                <p>原子问答和同步块关联均已按你的决策保存。</p>
              </div>
              <button className="button secondary" type="button" onClick={onOpenInterview}>
                返回面试详情
              </button>
            </div>
          ) : null}
        </>
      )}

      {interview.extractionTask?.error ? (
        <div className="ai-review-page-error" role="alert">
          <span>{interview.extractionTask.error}</span>
          <button className="text-button" type="button" onClick={onStartExtraction}>
            重试
          </button>
        </div>
      ) : null}
    </div>
  );
}

function InterviewDetail({
  interview,
  questions,
  syncBlocks,
  resumeExperiences,
  aiReview,
  onBack,
  onAddQuestion,
  onOpenSync,
  onOpenResume,
  onCreateSync,
  onOpenAIReview,
  onOpenMockInterview,
  onUpdateInterview,
  onUpdateQuestion,
}: {
  interview: Interview;
  questions: AtomicQuestion[];
  syncBlocks: SyncBlock[];
  resumeExperiences: ResumeExperience[];
  aiReview?: InterviewAIReview;
  onBack: () => void;
  onAddQuestion: () => void;
  onOpenSync: (id: string) => void;
  onOpenResume: (id: string) => void;
  onCreateSync: (questionId: string) => void;
  onOpenAIReview: () => void;
  onOpenMockInterview: (id: string) => void;
  onUpdateInterview: (id: string, input: CreateInterviewInput) => void;
  onUpdateQuestion: (id: string, input: CreateQuestionInput) => void;
}) {
  const [editingInfo, setEditingInfo] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const editingQuestion = questions.find((item) => item.id === editingQuestionId);
  const [sourceExpanded, setSourceExpanded] = useState(false);
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

  const pendingAICount =
    aiReview?.candidates.filter(isAIReviewCandidatePending).length ?? 0;
  const aiReviewStatus = extractionActive(interview.extractionTask)
    ? extractionLabel(interview.extractionTask)
    : pendingAICount
      ? `${pendingAICount} 条待审核`
      : aiReview
        ? "审核已完成"
        : "尚未解析";

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
          <StatusBadge status={interview.status} task={interview.extractionTask} />
        </div>

        <header className="interview-detail-hero">
          <div className="interview-detail-kicker">
            <p className="eyebrow">面试 · {formatDate(interview.date)}</p>
            {interview.simulated ? (
              <button
                className="simulation-badge"
                type="button"
                onClick={() =>
                  interview.mockInterviewId
                    ? onOpenMockInterview(interview.mockInterviewId)
                    : undefined
                }
                disabled={!interview.mockInterviewId}
                title="查看模拟面试反馈"
              >
                <Sparkles size={12} aria-hidden="true" />
                模拟面
              </button>
            ) : null}
          </div>
          <h1>
            {interview.company}
            {interview.role ? <em> · {interview.role}</em> : null}
          </h1>
          <p>
            {[interview.round, `来源 ${interview.source || "未填写"}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <div className="interview-edit-actions">
            <button className="button secondary" onClick={() => setEditingInfo(true)}>
              <Pencil size={15} aria-hidden="true" />
              编辑基础信息
            </button>
            <button className="button primary" onClick={onAddQuestion}>
              <Plus size={15} aria-hidden="true" />
              添加原子问答
            </button>
          </div>
        </header>

        {interview.sample ? (
          <div className="notice sample-notice">
            <Sparkles size={15} aria-hidden="true" />
            这是示例记录，可在设置中清空后开始使用自己的内容。
          </div>
        ) : null}

        <button
          className="interview-ai-review-trigger"
          type="button"
          onClick={onOpenAIReview}
        >
          <Sparkles size={15} aria-hidden="true" />
          <span>AI 解析审核</span>
          <strong>{aiReviewStatus}</strong>
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
                      <button className="text-button question-edit-trigger" onClick={() => setEditingQuestionId(question.id)} aria-label={`编辑原子问答：${question.title}`}>
                        <Pencil size={14} aria-hidden="true" />
                        编辑
                      </button>
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
                      <AnswerOutline
                        answer={question.answer}
                        emptyText="尚未填写当次回答。"
                        className="compact"
                      />
                    </div>
                    {question.notes ? (
                      <div className="interview-question-answer">
                        <span>笔记</span>
                        <p>{question.notes}</p>
                      </div>
                    ) : null}
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

      {editingInfo ? (
        <Modal title="编辑面试基础信息" onClose={() => setEditingInfo(false)}>
          <InterviewForm initialValue={interview} onCancel={() => setEditingInfo(false)} onSubmit={(input) => {
            onUpdateInterview(interview.id, input);
            setEditingInfo(false);
          }} />
        </Modal>
      ) : null}
      {editingQuestion ? (
        <Modal title="编辑原子问答" description="保存后，原子问答模块与所有引用位置同步更新。" onClose={() => setEditingQuestionId(null)}>
          <QuestionForm initialValue={editingQuestion} onCancel={() => setEditingQuestionId(null)} onSubmit={(input) => {
            onUpdateQuestion(editingQuestion.id, input);
            setEditingQuestionId(null);
          }} />
        </Modal>
      ) : null}
      <aside className="interview-detail-aside" aria-label="记录关系摘要">
        <div className="interview-ai-desktop-entry">
          <p className="eyebrow">AI 解析审核</p>
          <h2>{aiReviewStatus}</h2>
          <p>在独立页面中依次审核原子问答和同步块关联。</p>
          <button className="button primary" type="button" onClick={onOpenAIReview}>
            <Sparkles size={14} aria-hidden="true" />
            进入审核页
          </button>
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
                placeholder="搜索问题、回答、笔记或标签"
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
                    {question.answer || "尚未填写回答。"}
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
          <p className="eyebrow">Response</p>
          <h2>回答</h2>
          {isEditing ? (
            <AnswerEditor
              value={answer}
              onChange={setAnswer}
              className="question-content-editor"
              placeholder="写下这道问题的回答。"
              minRows={9}
            />
          ) : (
            <AnswerOutline answer={question.answer} className="answer-body" />
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
  onUpdate,
}: {
  syncBlocks: SyncBlock[];
  questions: AtomicQuestion[];
  resumeExperiences: ResumeExperience[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onOpenQuestion: (id: string) => void;
  onOpenResume: (id: string) => void;
  onUpdate: (id: string, input: UpdateSyncBlockInput) => void;
}) {
  const [query, setQuery] = useState("");
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const sortedSyncBlocks = useMemo(
    () => sortSyncBlocksByLinkedQuestionCount(syncBlocks),
    [syncBlocks],
  );
  const favoriteSyncBlocks = useMemo(
    () => getFavoriteSyncBlocks({ syncBlocks }),
    [syncBlocks],
  );
  const scopedSyncBlocks = showFavoritesOnly
    ? favoriteSyncBlocks
    : sortedSyncBlocks;
  const visibleSyncBlocks = useMemo(
    () => searchSyncBlocks(scopedSyncBlocks, query),
    [query, scopedSyncBlocks],
  );
  const selected =
    visibleSyncBlocks.find((item) => item.id === selectedId) ??
    visibleSyncBlocks[0];
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
    <div className="page sync-page">
      <PageHeader
        eyebrow="Synchronized knowledge"
        title="同步块"
        description="牵一发而动全身，盘活你的知识资产"
        action={
          <button className="button primary" onClick={onCreate}>
            <Plus size={16} aria-hidden="true" />
            新建同步块
          </button>
        }
      />
      {syncBlocks.length ? (
        <div className="toolbar sync-search-toolbar">
          <label className="search-field">
            <Search size={16} aria-hidden="true" />
            <input
              aria-label="搜索同步块"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={
                showFavoritesOnly
                  ? "搜索收藏同步块"
                  : "搜索标题、稳定回答或复习笔记"
              }
            />
          </label>
          <div className="segmented sync-scope-filter" aria-label="同步块范围">
            <button
              className={showFavoritesOnly ? "" : "active"}
              type="button"
              aria-pressed={!showFavoritesOnly}
              onClick={() => setShowFavoritesOnly(false)}
            >
              全部
            </button>
            <button
              className={showFavoritesOnly ? "active" : ""}
              type="button"
              aria-pressed={showFavoritesOnly}
              onClick={() => setShowFavoritesOnly(true)}
            >
              <Star
                size={14}
                fill={showFavoritesOnly ? "currentColor" : "none"}
                aria-hidden="true"
              />
              收藏
            </button>
          </div>
          <span className="sync-search-summary" aria-live="polite">
            显示 {visibleSyncBlocks.length} / {scopedSyncBlocks.length} 个
          </span>
        </div>
      ) : null}
      {visibleSyncBlocks.length && selected ? (
        <div className="sync-layout">
          <nav className="sync-list" aria-label="同步块列表">
            {visibleSyncBlocks.map((syncBlock) => (
              <div
                className={`sync-list-item${
                  syncBlock.id === selected.id ? " active" : ""
                }`}
                key={syncBlock.id}
              >
                <button
                  className="sync-list-select"
                  type="button"
                  onClick={() => onSelect(syncBlock.id)}
                >
                  <strong>{syncBlock.title}</strong>
                  <small>{syncBlock.linkedQuestionIds.length} 个关联问答</small>
                </button>
                <button
                  className={`sync-favorite-button${
                    syncBlock.favorite ? " active" : ""
                  }`}
                  type="button"
                  aria-label={
                    syncBlock.favorite
                      ? `取消收藏「${syncBlock.title}」`
                      : `收藏「${syncBlock.title}」`
                  }
                  aria-pressed={syncBlock.favorite}
                  title={syncBlock.favorite ? "取消收藏" : "收藏"}
                  onClick={() =>
                    onUpdate(syncBlock.id, {
                      favorite: !syncBlock.favorite,
                    })
                  }
                >
                  <Star
                    size={17}
                    fill={syncBlock.favorite ? "currentColor" : "none"}
                    aria-hidden="true"
                  />
                </button>
              </div>
            ))}
          </nav>
          <article className="sync-detail" key={selected.id}>
            <header className="sync-detail-header">
              <div>
                <p className="eyebrow">Stable answer</p>
                <h2>
                  <InlineText
                    value={selected.title}
                    label="同步块标题"
                    placeholder="填写同步块标题"
                    required
                    onSave={(title) => onUpdate(selected.id, { title })}
                  />
                </h2>
              </div>
              <button
                className={`sync-detail-favorite${
                  selected.favorite ? " active" : ""
                }`}
                type="button"
                aria-label={selected.favorite ? "取消收藏同步块" : "收藏同步块"}
                aria-pressed={selected.favorite}
                title={selected.favorite ? "取消收藏" : "收藏"}
                onClick={() =>
                  onUpdate(selected.id, { favorite: !selected.favorite })
                }
              >
                <Star
                  size={22}
                  fill={selected.favorite ? "currentColor" : "none"}
                  aria-hidden="true"
                />
              </button>
            </header>
            <div className="sync-body">
              <InlineAnswer
                value={selected.body}
                label="稳定回答"
                placeholder="点击填写稳定回答"
                onSave={(body) => onUpdate(selected.id, { body })}
              />
            </div>
            <aside className="review-note">
              <strong>复习笔记</strong>
              <p>
                <InlineText
                  value={selected.reviewNotes}
                  label="复习笔记"
                  placeholder="点击填写复习笔记"
                  multiline
                  onSave={(reviewNotes) => onUpdate(selected.id, { reviewNotes })}
                />
              </p>
            </aside>
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
      ) : syncBlocks.length ? (
        <EmptyState
          title={
            showFavoritesOnly && !favoriteSyncBlocks.length
              ? "还没有收藏的同步块"
              : showFavoritesOnly
                ? "没有匹配的收藏同步块"
                : "没有匹配的同步块"
          }
          description={
            showFavoritesOnly && !favoriteSyncBlocks.length
              ? "点亮同步块右侧的星标，即可在这里集中查看。"
              : "调整关键词，或清除搜索查看当前范围内的同步块。"
          }
          action={
            <button
              className="button secondary"
              type="button"
              onClick={() => {
                if (showFavoritesOnly && !favoriteSyncBlocks.length) {
                  setShowFavoritesOnly(false);
                } else {
                  setQuery("");
                }
              }}
            >
              {showFavoritesOnly && !favoriteSyncBlocks.length
                ? "查看全部同步块"
                : "清除搜索"}
            </button>
          }
        />
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
  transcriptionConfig,
  transcriptionConfigured,
  transcriptionLoading,
  transcriptionError,
  onSaveTranscriptionConfig,
  onClearTranscriptionConfig,
  onLoadDemo,
  onRestore,
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
  transcriptionConfig: TranscriptionServiceConfig;
  transcriptionConfigured: boolean;
  transcriptionLoading: boolean;
  transcriptionError: string | null;
  onSaveTranscriptionConfig: (
    config: TranscriptionServiceConfig,
  ) => Promise<void>;
  onClearTranscriptionConfig: () => Promise<void>;
  onLoadDemo: () => void;
  onRestore: (workspace: Workspace) => Promise<void>;
  onExport: () => void;
  onClear: () => void;
}) {
  const [expandedGroup, setExpandedGroup] = useState<
    "ai" | "data" | null
  >(null);
  const aiExpanded = expandedGroup === "ai";
  const dataExpanded = expandedGroup === "data";
  const storageScope = isTauri()
    ? "桌面应用专属存储"
    : "当前网页地址专属存储";

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
            <small>IndexedDB · {storageScope}</small>
          </span>
        </div>
        <CheckCircle2 className="success-icon" size={20} aria-label="可用" />
      </section>

      <div className="settings-groups">
        <section className={`settings-group${aiExpanded ? " expanded" : ""}`}>
          <button
            className="settings-group-trigger"
            type="button"
            aria-expanded={aiExpanded}
            aria-controls="settings-ai-panel"
            onClick={() => setExpandedGroup(aiExpanded ? null : "ai")}
          >
            <div>
              <Sparkles size={20} aria-hidden="true" />
              <span>
                <strong>AI 服务</strong>
                <small>配置文本模型与语音转写提供方、密钥和连接状态。</small>
              </span>
            </div>
            <ChevronDown size={19} aria-hidden="true" />
          </button>
          <div
            className="settings-group-content"
            id="settings-ai-panel"
            hidden={!aiExpanded}
          >
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
            <TranscriptionSettingsPanel
              config={transcriptionConfig}
              configured={transcriptionConfigured}
              loading={transcriptionLoading}
              error={transcriptionError}
              onSave={onSaveTranscriptionConfig}
              onClear={onClearTranscriptionConfig}
            />
          </div>
        </section>

        <section
          className={`settings-group${dataExpanded ? " expanded" : ""}`}
        >
          <button
            className="settings-group-trigger"
            type="button"
            aria-expanded={dataExpanded}
            aria-controls="settings-data-panel"
            onClick={() => setExpandedGroup(dataExpanded ? null : "data")}
          >
            <div>
              <Database size={20} aria-hidden="true" />
              <span>
                <strong>数据管理</strong>
                <small>备份、迁移、示例数据与本地数据清理。</small>
              </span>
            </div>
            <ChevronDown size={19} aria-hidden="true" />
          </button>
          <div
            className="settings-group-content data-settings-content"
            id="settings-data-panel"
            hidden={!dataExpanded}
          >
            <section className="settings-section action-section">
              <div>
                <Upload size={20} aria-hidden="true" />
                <span>
                  <strong>导出 JSON 备份</strong>
                  <small>
                    下载当前工作区的全部数据与关联关系，可用于换机迁移或恢复；不含
                    AI API Key。
                  </small>
                </span>
              </div>
              <button
                className="button secondary"
                onClick={onExport}
                disabled={!hasData}
              >
                下载备份
              </button>
            </section>
            <WorkspaceMigration hasData={hasData} onRestore={onRestore} />
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
                  <small>此操作会永久删除{storageScope}中的全部数据。</small>
                </span>
              </div>
              <button
                className="button danger"
                onClick={onClear}
                disabled={!hasData}
              >
                清空
              </button>
            </section>
          </div>
        </section>
      </div>
    </div>
  );
}

function ClearWorkspaceDialog({
  workspace,
  onClose,
  onConfirm,
}: {
  workspace: Workspace;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [verification, setVerification] = useState("");
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState("");
  const canConfirm = verification.trim() === "清空";
  const storageScope = isTauri() ? "桌面应用" : "当前网页地址";

  return (
    <Modal
      title="清空本地工作区？"
      eyebrow="高风险操作"
      description="数据清空后无法撤销。建议先下载 JSON 备份。"
      className="workspace-clear-modal"
      onClose={clearing ? () => undefined : onClose}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (!canConfirm || clearing) return;
          setClearing(true);
          setClearError("");
          try {
            await onConfirm();
          } catch (reason) {
            setClearError(
              reason instanceof Error ? reason.message : "清空失败，请重试。",
            );
            setClearing(false);
          }
        }}
      >
        <div className="workspace-clear-summary">
          <Trash2 size={20} aria-hidden="true" />
          <p>
            将删除 {workspace.interviews.length} 条面试记录、
            {workspace.questions.length} 个原子问答、
            {workspace.syncBlocks.length} 个同步块和
            {workspace.resumeExperiences.length} 条简历经历，以及相关审核与复习数据。
          </p>
        </div>
        <p className="workspace-clear-scope">
          本次操作仅作用于{storageScope}的本地工作区。
        </p>
        <label htmlFor="workspace-clear-verification">
          输入“清空”以确认
          <input
            id="workspace-clear-verification"
            value={verification}
            onChange={(event) => setVerification(event.target.value)}
            autoComplete="off"
            autoFocus
            disabled={clearing}
          />
        </label>
        {clearError ? (
          <p className="inline-error" role="alert">
            {clearError}
          </p>
        ) : null}
        <footer className="form-actions workspace-clear-actions">
          <button
            className="button quiet"
            type="button"
            disabled={clearing}
            onClick={onClose}
          >
            取消
          </button>
          <button
            className="button danger"
            type="submit"
            disabled={!canConfirm || clearing}
          >
            {clearing ? "正在清空…" : "确认永久清空"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

export default function App() {
  const {
    workspace,
    loading,
    error,
    dismissError,
    createInterview,
    createMockInterview,
    appendMockInterviewMessage,
    endMockInterview,
    applyMockInterviewAnalysis,
    updateInterview,
    createInterviewOrganization,
    deleteInterviewOrganization,
    deleteInterview,
    createQuestion,
    saveAIReview,
    saveExtractionTask,
    markExtractionRead,
    completeAIReview,
    updateAIReviewCandidate,
    resolveAIReviewQuestion,
    resolveAIReviewSync,
    acceptAllAIReviewCandidates,
    createStandaloneQuestion,
    updateQuestion,
    linkQuestionToSyncBlock,
    createSyncBlock,
    updateSyncBlock,
    createResumeExperience,
    updateResumeExperience,
    deleteResumeExperience,
    loadDemo,
    clear,
    restoreWorkspace,
    exportWorkspace,
  } = useWorkspace();
  const aiSettings = useAISettings();
  const transcriptionSettings = useTranscriptionSettings();
  const aiClient = useMemo(() => createOpenAICompatibleClient(), []);
  const extraction = useExtractionQueue(
    aiClient, aiSettings.config, aiSettings.apiKey, workspace.syncBlocks, saveExtractionTask,
  );
  const [view, setView] = useState<View>("overview");
  const [selectedInterviewId, setSelectedInterviewId] = useState<string | null>(
    null,
  );
  const [reviewReturnView, setReviewReturnView] = useState<
    "overview" | "interviews"
  >("overview");
  const [selectedSyncId, setSelectedSyncId] = useState<string | null>(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(
    null,
  );
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null);
  const [selectedMockInterviewId, setSelectedMockInterviewId] = useState<
    string | null
  >(null);
  const [mockLobbyView, setMockLobbyView] = useState<"home" | "setup">("home");
  const [questionReturnView, setQuestionReturnView] =
    useState<View>("questions");
  const [createMode, setCreateMode] = useState<CreateMode>("choose");
  const [createInitialRaw, setCreateInitialRaw] = useState("");
  const [createInitialSource, setCreateInitialSource] = useState<string | undefined>();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () =>
      window.localStorage.getItem("interview-atlas-sidebar-collapsed") ===
      "true",
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileKnowledgeMenuOpen, setMobileKnowledgeMenuOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const [dailyQuestionId, setDailyQuestionId] = useState<string | null>(null);
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");

  useEffect(() => () => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
  }, []);

  useLayoutEffect(() => {
    if (
      loading ||
      (dailyQuestionId &&
        workspace.questions.some((question) => question.id === dailyQuestionId))
    ) {
      return;
    }

    const question = getRandomQuestion(workspace.questions);
    setDailyQuestionId(question?.id ?? null);
  }, [dailyQuestionId, loading, workspace.questions]);

  useEffect(() => {
    if (!mobileKnowledgeMenuOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileKnowledgeMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileKnowledgeMenuOpen]);

  const favoriteSyncBlocks = useMemo(
    () => getFavoriteSyncBlocks(workspace),
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
      workspace.interviewOrganizations.length +
      workspace.questions.length +
      workspace.syncBlocks.length +
      workspace.resumeExperiences.length +
      workspace.mockInterviews.length >
    0;

  const notify = (message: string) => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToast(message);
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 3_000);
  };

  const navigate = (
    next: View,
    options?: { mockLobbyView?: "home" | "setup" },
  ) => {
    setView(next);
    setMockLobbyView(
      next === "mock" ? options?.mockLobbyView ?? "home" : "home",
    );
    if (next !== "create") {
      setCreateMode("choose");
      setCreateInitialRaw("");
      setCreateInitialSource(undefined);
    }
    setSelectedInterviewId(null);
    setSelectedSyncId(null);
    setSelectedQuestionId(null);
    setSelectedResumeId(null);
    setSelectedMockInterviewId(null);
    setMobileMenuOpen(false);
    setMobileKnowledgeMenuOpen(false);
  };

  const openCreate = () => {
    navigate("create");
    setCreateMode("choose");
  };

  const openImport = (initialRaw = "", initialSource?: string) => {
    navigate("create");
    setCreateInitialRaw(initialRaw);
    setCreateInitialSource(initialSource);
    setCreateMode("import");
  };

  const openRecorder = () => {
    navigate("create");
    setCreateMode("record");
  };

  useEffect(() => {
    const openNewPage = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        openCreate();
      } else if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault();
        navigate("search");
      }
    };
    window.addEventListener("keydown", openNewPage);
    return () => window.removeEventListener("keydown", openNewPage);
  });

  const openKnowledgeView = (next: View) => {
    navigate(next);
  };

  const openInterview = (id: string) => {
    setView("interviews");
    setSelectedInterviewId(id);
    setSelectedQuestionId(null);
  };

  const openAIReview = (id: string) => {
    setReviewReturnView(view === "overview" ? "overview" : "interviews");
    setView("review");
    setSelectedInterviewId(id);
    setSelectedSyncId(null);
    setSelectedQuestionId(null);
    setSelectedResumeId(null);
    setMobileMenuOpen(false);
    setMobileKnowledgeMenuOpen(false);
  };

  const closeAIReview = () => {
    if (reviewReturnView === "overview") {
      navigate("overview");
      return;
    }
    if (selectedInterviewId) {
      openInterview(selectedInterviewId);
      return;
    }
    navigate("interviews");
  };

  const openMockInterview = (id: string) => {
    setView("mock");
    setSelectedMockInterviewId(id);
    setSelectedInterviewId(null);
    setSelectedQuestionId(null);
    setSelectedSyncId(null);
    setSelectedResumeId(null);
    setMobileMenuOpen(false);
    setMobileKnowledgeMenuOpen(false);
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

  const clearData = async () => {
    extraction.reset();
    await clear();
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
    <div
      className={`app-shell${sidebarCollapsed ? " sidebar-collapsed" : ""}${
        view === "create" && createMode !== "choose"
          ? " create-detail-open"
          : ""
      }`}
    >
      <aside className={`sidebar ${mobileMenuOpen ? "mobile-open" : ""}`}>
        <div className="brand" aria-label="见字·如面，Interview Atlas">
          <BrandMark />
          <span className="brand-name">
            <strong>见字·如面</strong>
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
          className={`button accent import-button${view === "create" ? " active" : ""}`}
          onClick={openCreate}
          aria-label="新建"
          title={sidebarCollapsed ? "新建" : undefined}
        >
          <Plus size={16} aria-hidden="true" />
          <span>新建</span>
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
                    {item.id === "mock" ? (
                      <small>{workspace.mockInterviews.length}</small>
                    ) : item.id === "interviews" ? (
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

      <main className={view === "sync" ? "sync-workspace" : undefined}>
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
          <span className="mobile-brand" aria-label="见字·如面，Interview Atlas">
            <BrandMark compact />
            <span>
              <strong>见字·如面</strong>
              <small>interview atlas</small>
            </span>
          </span>
          <button
            className={`icon-button mobile-search${
              view === "search" ? " active" : ""
            }`}
            type="button"
            onClick={() => navigate("search")}
            aria-label="打开全局搜索"
            title="全局搜索"
          >
            <Search size={19} aria-hidden="true" />
          </button>
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
            favoriteSyncBlocks={favoriteSyncBlocks}
            onNavigate={navigate}
            onOpenInterview={openInterview}
            onOpenQuestion={openQuestion}
            onOpenSync={openSync}
            onCreateInterview={openCreate}
            onOpenMockInterviewRoom={() =>
              navigate("mock", { mockLobbyView: "setup" })
            }
            onOpenAIReview={openAIReview}
          />
        ) : null}

        {view === "review" && selectedInterview ? (
          <AIReviewPage
            key={selectedInterview.id}
            interview={selectedInterview}
            review={workspace.aiReviews.find(
              (review) => review.interviewId === selectedInterview.id,
            )}
            syncBlocks={workspace.syncBlocks}
            configured={aiSettings.configured}
            onBack={closeAIReview}
            onOpenInterview={() => openInterview(selectedInterview.id)}
            onStartExtraction={() => {
              extraction.start(selectedInterview);
            }}
            onCancelExtraction={() => extraction.cancel(selectedInterview.id)}
            onOpenSettings={() => navigate("settings")}
            onUpdate={(candidateId, input) =>
              updateAIReviewCandidate(selectedInterview.id, candidateId, input)
            }
            onResolveQuestion={(candidateId, decision) =>
              resolveAIReviewQuestion(
                selectedInterview.id,
                candidateId,
                decision,
              )
            }
            onResolveSync={(candidateId, decision) =>
              resolveAIReviewSync(selectedInterview.id, candidateId, decision)
            }
            onAcceptAll={() =>
              acceptAllAIReviewCandidates(selectedInterview.id)
            }
          />
        ) : null}

        {view === "search" ? (
          <GlobalSearchPage
            workspace={workspace}
            query={globalSearchQuery}
            onQueryChange={setGlobalSearchQuery}
            onOpenInterview={openInterview}
            onOpenQuestion={openQuestion}
            onOpenSync={openSync}
            onOpenResume={openResume}
            onOpenAssetPage={(type) =>
              navigate(
                type === "interview"
                  ? "interviews"
                  : type === "question"
                    ? "questions"
                    : type === "sync"
                      ? "sync"
                      : "resume",
              )
            }
          />
        ) : null}

        {view === "create" && createMode === "choose" ? (
          <CreatePage onImport={() => openImport()} onRecord={openRecorder} />
        ) : null}

        {view === "create" && createMode === "import" ? (
          <InterviewImportPage
            key={`${createInitialSource ?? "manual"}-${createInitialRaw ? "with-raw" : "empty"}`}
            config={aiSettings.config}
            configured={aiSettings.configured}
            initialRaw={createInitialRaw}
            initialSource={createInitialSource}
            interviews={workspace.interviews}
            reviews={workspace.aiReviews}
            onStartExtraction={extraction.start}
            onCancelExtraction={extraction.cancel}
            syncBlocks={workspace.syncBlocks}
            onCreateDraft={createInterview}
            onUpdateDraft={updateInterview}
            onSaveReview={saveAIReview}
            onClose={(savedDraftId) => {
              setCreateMode("choose");
              setCreateInitialRaw("");
              setCreateInitialSource(undefined);
              if (savedDraftId) {
                notify("面经已保存，可在主页或面试记录查看处理状态");
              }
            }}
            onOpenSettings={(savedDraftId) => {
              navigate("settings");
              if (savedDraftId) notify("原文已保存，可配置 AI 后继续审核");
            }}
            onComplete={(interviewId, candidates) => {
              completeAIReview(interviewId, candidates);
              markExtractionRead(interviewId);
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

        {view === "create" && createMode === "record" ? (
          <InterviewRecorder
            credentials={transcriptionSettings.credentials}
            transcriptionConfigured={transcriptionSettings.configured}
            transcriptionLoading={transcriptionSettings.loading}
            onBack={() => setCreateMode("choose")}
            onOpenSettings={() => navigate("settings")}
            onUseTranscript={(transcript) =>
              openImport(transcript, "讯飞双端录音")
            }
          />
        ) : null}

        {view === "mock" ? (
          <MockInterviewPage
            workspace={workspace}
            focusedId={selectedMockInterviewId}
            initialLobbyView={mockLobbyView}
            configured={aiSettings.configured}
            config={aiSettings.config}
            apiKey={aiSettings.apiKey}
            client={aiClient}
            onFocus={setSelectedMockInterviewId}
            onCreate={createMockInterview}
            onAppendMessage={appendMockInterviewMessage}
            onEnd={endMockInterview}
            onApplyAnalysis={applyMockInterviewAnalysis}
            onOpenSettings={() => navigate("settings")}
            onOpenInterview={openInterview}
          />
        ) : null}

        {view === "interviews" && !selectedInterview ? (
          <InterviewsPage
            interviews={workspace.interviews}
            organizations={workspace.interviewOrganizations}
            questions={workspace.questions}
            aiReviews={workspace.aiReviews}
            onOpen={openInterview}
            onCreateOrganization={createInterviewOrganization}
            onDeleteOrganization={(id) => {
              deleteInterviewOrganization(id);
              notify("整理已删除");
            }}
            onDelete={async (id) => {
              extraction.cancel(id);
              await deleteInterview(id);
              notify("面试记录及所属原子问答已永久删除");
            }}
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
            onBack={() => setSelectedInterviewId(null)}
            onAddQuestion={() =>
              setDialog({ kind: "question", interviewId: selectedInterview.id })
            }
            onOpenSync={openSync}
            onOpenResume={openResume}
            onCreateSync={(questionId) =>
              setDialog({ kind: "sync", questionId })
            }
            onOpenAIReview={() => openAIReview(selectedInterview.id)}
            onOpenMockInterview={openMockInterview}
            onUpdateInterview={(id, input) => {
              updateInterview(id, input);
              notify("面试基础信息已更新");
            }}
            onUpdateQuestion={(id, input) => {
              updateQuestion(id, input);
              notify("原子问答已同步更新");
            }}
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
                    ? "返回主页"
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
            onUpdate={updateSyncBlock}
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
            transcriptionConfig={transcriptionSettings.config}
            transcriptionConfigured={transcriptionSettings.configured}
            transcriptionLoading={transcriptionSettings.loading}
            transcriptionError={transcriptionSettings.error}
            onSaveTranscriptionConfig={transcriptionSettings.saveConfig}
            onClearTranscriptionConfig={transcriptionSettings.clearConfig}
            onLoadDemo={() => {
              if (
                hasData &&
                !window.confirm("加载示例会替换当前工作区，是否继续？")
              ) {
                return;
              }
              extraction.reset();
              loadDemo();
              navigate("overview");
              notify("示例工作区已加载");
            }}
            onRestore={async (nextWorkspace) => {
              extraction.reset();
              await restoreWorkspace(nextWorkspace);
              navigate("overview");
              notify("备份已导入并替换当前工作区");
            }}
            onExport={exportData}
            onClear={() => setDialog({ kind: "clear-workspace" })}
          />
        ) : null}
      </main>

      {mobileKnowledgeMenuOpen ? (
        <button
          className="mobile-bottom-nav-backdrop"
          type="button"
          aria-label="关闭知识库菜单"
          onClick={() => setMobileKnowledgeMenuOpen(false)}
        />
      ) : null}

      <nav
        className={`bottom-nav${mobileKnowledgeMenuOpen ? " menu-open" : ""}${
          mobileMenuOpen || (view === "create" && createMode !== "choose")
            ? " nav-hidden"
            : ""
        }`}
        aria-label="移动端主导航"
      >
        <button
          className={`bottom-overview ${view === "overview" ? "active" : ""}`}
          onClick={() => navigate("overview")}
          aria-current={view === "overview" ? "page" : undefined}
        >
          <Home size={19} aria-hidden="true" />
          <span>主页</span>
        </button>
        <button
          className={`bottom-mock ${view === "mock" ? "active" : ""}`}
          onClick={() => navigate("mock")}
          aria-current={view === "mock" ? "page" : undefined}
        >
          <MessageSquareText size={19} aria-hidden="true" />
          <span>模拟</span>
        </button>
        <button
          className={`bottom-create${view === "create" ? " active" : ""}`}
          onClick={openCreate}
          aria-label="新建"
          title="新建"
        >
          <span className="bottom-create-icon">
            <Plus size={23} aria-hidden="true" />
          </span>
          <span className="bottom-create-label">新建</span>
        </button>
        <div className="bottom-knowledge">
          <button
            className={`bottom-knowledge-toggle ${
              ["interviews", "questions", "sync", "resume"].includes(view)
                ? "active"
                : ""
            }`}
            onClick={() =>
              setMobileKnowledgeMenuOpen((current) => !current)
            }
            aria-expanded={mobileKnowledgeMenuOpen}
            aria-haspopup="menu"
            aria-controls="mobile-knowledge-tabs"
          >
            <BookOpen size={19} aria-hidden="true" />
            <span>知识库</span>
          </button>
          {mobileKnowledgeMenuOpen ? (
            <div
              className="bottom-knowledge-panel"
              id="mobile-knowledge-tabs"
              aria-label="知识库分类"
              role="menu"
            >
              {knowledgeNavItems.map((item) => {
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
                    role="menuitem"
                  >
                    <Icon size={16} aria-hidden="true" />
                    <span>{shortLabel}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </nav>

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
          className="sync-block-modal"
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
            resumeExperiences={workspace.resumeExperiences}
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

      {dialog?.kind === "clear-workspace" ? (
        <ClearWorkspaceDialog
          workspace={workspace}
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await clearData();
            setDialog(null);
          }}
        />
      ) : null}

      <div className="extraction-notifications" aria-live="polite" aria-label="AI 处理通知">
        {workspace.interviews.filter((item) => item.extractionTask?.unread).map((interview) => (
          <div className="extraction-notification" key={interview.extractionTask!.id}>
            <div>
              <strong>{interview.extractionTask!.status === "completed" ? "AI 解析已完成" : "AI 解析未完成"}</strong>
              <p>{interview.company}</p>
              <button className="text-button" onClick={() => {
                setDialog(null);
                markExtractionRead(interview.id);
                openAIReview(interview.id);
              }}>{interview.extractionTask!.status === "completed" ? "查看并审核" : "查看并重试"}</button>
            </div>
            <button className="icon-button" aria-label={`关闭 ${interview.company} 的处理通知`} onClick={() => markExtractionRead(interview.id)}>
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>

      {toast ? (
        <div className="toast" role="status">
          <CheckCircle2 size={15} aria-hidden="true" />
          {toast}
        </div>
      ) : null}

      {!hasData && view !== "settings" && view !== "mock" ? (
        <button
          className="demo-shortcut"
          onClick={() => {
            extraction.reset();
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
