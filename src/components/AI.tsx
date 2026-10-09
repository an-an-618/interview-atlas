import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  KeyRound,
  LoaderCircle,
  PlugZap,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type {
  AIExtractionCandidate,
  AIExtractionProgress,
  AIProviderCredentialId,
  AIProviderConfig,
  AIProviderPresetId,
} from "../ai/types";
import {
  aiProviderPresets,
  matchAIProviderPreset,
} from "../ai/types";
import type {
  CreateInterviewInput,
  Interview,
  InterviewAIReview,
  SaveAIReviewCandidateInput,
  SyncBlock,
} from "../domain/types";
import { extractionLabel } from "../ai/extractionQueue";
import { handleExternalLinkClick } from "../platform/openExternalLink";
import { AnswerEditor } from "./AnswerEditor";

export function extractionProgressLabel(progress: AIExtractionProgress | null) {
  if (!progress) return "正在准备解析…";
  if (progress.phase === "retrying") return "正在重新尝试解析…";
  if (progress.stage === "inventory") return "正在通读全文，识别面试问题…";
  if (progress.stage === "coverage") return "正在复查全文中的遗漏问题…";
  if (progress.stage === "answers") return "正在整理每个问题的当次回答…";
  if (progress.stage === "matching") return "正在查找可关联的同步块…";
  return "正在解析面经…";
}

interface AISettingsPanelProps {
  config: AIProviderConfig;
  loading: boolean;
  error: string | null;
  onSave: (config: AIProviderConfig) => Promise<void>;
  getApiKey: (credentialId: AIProviderCredentialId) => string;
  onSetApiKey: (credentialId: AIProviderCredentialId, value: string) => void;
  onClearApiKey: (credentialId: AIProviderCredentialId) => void;
  onTest: (config: AIProviderConfig, apiKey: string) => Promise<void>;
}

export function AISettingsPanel({
  config,
  loading,
  error,
  onSave,
  getApiKey,
  onSetApiKey,
  onClearApiKey,
  onTest,
}: AISettingsPanelProps) {
  const [draft, setDraft] = useState(config);
  const [selectedProviderId, setSelectedProviderId] = useState<
    AIProviderPresetId | "custom"
  >(() => matchAIProviderPreset(config)?.id ?? "custom");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">(
    "idle",
  );
  const [testState, setTestState] = useState<
    "idle" | "testing" | "success" | "error"
  >("idle");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(config);
    setSelectedProviderId(matchAIProviderPreset(config)?.id ?? "custom");
  }, [config]);

  const selectedPreset = aiProviderPresets.find(
    (preset) => preset.id === selectedProviderId,
  );
  const apiKey = getApiKey(selectedProviderId);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaveState("saving");
    setLocalError(null);
    let connectionVerified = testState === "success";
    try {
      if (!connectionVerified) {
        setTestState("testing");
        await onTest(draft, apiKey);
        connectionVerified = true;
        setTestState("success");
      }
      await onSave(draft);
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 1800);
    } catch (reason) {
      setSaveState("idle");
      setTestState(connectionVerified ? "success" : "error");
      setLocalError(
        reason instanceof Error
          ? reason.message
          : connectionVerified
            ? "AI 配置保存失败。"
            : "AI 配置验证失败。",
      );
    }
  };

  const test = async () => {
    setTestState("testing");
    setLocalError(null);
    try {
      await onTest(draft, apiKey);
      setTestState("success");
    } catch (reason) {
      setTestState("error");
      setLocalError(
        reason instanceof Error ? reason.message : "AI 连接测试失败。",
      );
    }
  };

  const resetConnectionState = () => {
    setTestState("idle");
    setLocalError(null);
  };

  const selectProvider = (
    preset: (typeof aiProviderPresets)[number] | null,
  ) => {
    const nextId = preset?.id ?? "custom";
    setSelectedProviderId(nextId);
    if (!preset) {
      setDraft({
        protocol: "openai-compatible",
        endpoint: "",
        model: "",
      });
      resetConnectionState();
      return;
    }
    setDraft({
      protocol: "openai-compatible",
      endpoint: preset.endpoint,
      model: preset.model,
    });
    resetConnectionState();
  };

  return (
    <section className="service-config-section ai-settings">
      <header className="service-config-header">
        <div>
          <Sparkles size={20} aria-hidden="true" />
          <div>
            <strong>AI 解析服务</strong>
            <small>用于面经拆解、原子问答提取与模拟面试。</small>
          </div>
        </div>
        <span className={`connection-state state-${testState}`}>
          {testState === "testing" ? (
            <LoaderCircle className="spin" size={15} aria-hidden="true" />
          ) : testState === "success" ? (
            <CheckCircle2 size={15} aria-hidden="true" />
          ) : testState === "error" ? (
            <XCircle size={15} aria-hidden="true" />
          ) : (
            <PlugZap size={15} aria-hidden="true" />
          )}
          {testState === "testing"
            ? "测试中"
            : testState === "success"
              ? "连接可用"
              : testState === "error"
                ? "连接失败"
                : "尚未测试"}
        </span>
      </header>

      <form className="service-config-form" onSubmit={save}>
        <div className="service-field-grid parsing-service-fields">
          <label>
            <span>服务商</span>
            <select
              value={selectedProviderId}
              onChange={(event) => {
                const nextId = event.target.value;
                selectProvider(
                  aiProviderPresets.find((preset) => preset.id === nextId) ??
                    null,
                );
              }}
            >
              {aiProviderPresets.map((preset) => (
                <option value={preset.id} key={preset.id}>
                  {preset.label}
                </option>
              ))}
              <option value="custom">自定义兼容服务</option>
            </select>
          </label>

          <label>
            <span>模型</span>
            {selectedPreset ? (
              <select
                value={draft.model}
                onChange={(event) => {
                  setDraft({ ...draft, model: event.target.value });
                  resetConnectionState();
                }}
                required
              >
                {!selectedPreset.models.includes(draft.model) ? (
                  <option value={draft.model}>{draft.model}</option>
                ) : null}
                {selectedPreset.models.map((model) => (
                  <option value={model} key={model}>
                    {model}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={draft.model}
                onChange={(event) => {
                  setDraft({ ...draft, model: event.target.value });
                  resetConnectionState();
                }}
                placeholder="输入模型名称"
                required
              />
            )}
          </label>

          <label>
            <span>API Key</span>
            <div className="secret-input">
              <KeyRound size={16} aria-hidden="true" />
              <input
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(event) => {
                  onSetApiKey(selectedProviderId, event.target.value);
                  resetConnectionState();
                }}
                placeholder="输入当前服务商的 API Key"
              />
              {apiKey ? (
                <button
                  type="button"
                  onClick={() => {
                    onClearApiKey(selectedProviderId);
                    resetConnectionState();
                  }}
                >
                  清除
                </button>
              ) : null}
            </div>
          </label>

          {!selectedPreset ? (
            <label className="service-endpoint-field">
              <span>服务地址</span>
              <input
                type="url"
                value={draft.endpoint}
                onChange={(event) => {
                  setDraft({ ...draft, endpoint: event.target.value });
                  resetConnectionState();
                }}
                placeholder="https://api.example.com/v1"
                required
              />
            </label>
          ) : null}
        </div>

        <div className="service-provider-meta">
          <p>
            {selectedPreset?.note ??
              "适用于其他 OpenAI-compatible 服务或本地模型，请确认端点支持浏览器跨域请求。"}
          </p>
          {selectedPreset ? (
            <nav aria-label={`${selectedPreset.label} 接入帮助`}>
              <a
                href={selectedPreset.consoleUrl}
                target="_blank"
                rel="noreferrer"
                onClick={handleExternalLinkClick}
              >
                获取密钥
                <ExternalLink size={12} aria-hidden="true" />
              </a>
              <a
                href={selectedPreset.docsUrl}
                target="_blank"
                rel="noreferrer"
                onClick={handleExternalLinkClick}
              >
                接入文档
                <ExternalLink size={12} aria-hidden="true" />
              </a>
            </nav>
          ) : null}
        </div>

        {localError || error ? (
          <p className="inline-error" role="alert">
            {localError || error}
          </p>
        ) : null}

        <footer className="service-config-footer">
          <span>
            <ShieldCheck size={15} aria-hidden="true" />
            API Key 仅保留在当前会话
          </span>
          <div>
            <button
              className="button secondary"
              type="button"
              onClick={test}
              disabled={loading || testState === "testing"}
            >
              {testState === "testing" ? (
                <LoaderCircle className="spin" size={15} aria-hidden="true" />
              ) : (
                <PlugZap size={15} aria-hidden="true" />
              )}
              测试连接
            </button>
            <button
              className="button primary"
              type="submit"
              disabled={loading || saveState === "saving"}
            >
              {saveState === "saved" ? (
                <Check size={15} aria-hidden="true" />
              ) : null}
              {saveState === "saving"
                ? "验证中"
                : saveState === "saved"
                  ? "已启用"
                  : testState === "success"
                    ? "保存并启用"
                    : "验证并启用"}
            </button>
          </div>
        </footer>
      </form>
    </section>
  );
}

export interface ReviewCandidate extends AIExtractionCandidate {
  selected: boolean;
  tagsText: string;
  connectToSuggested: boolean;
}

interface InterviewImportPageProps {
  config: AIProviderConfig;
  configured: boolean;
  initialRaw?: string;
  initialSource?: string;
  interviews: Interview[];
  reviews: InterviewAIReview[];
  onStartExtraction: (interview: Interview) => string;
  onCancelExtraction: (interviewId: string) => void;
  syncBlocks: SyncBlock[];
  onCreateDraft: (input: CreateInterviewInput) => Interview;
  onUpdateDraft: (
    interviewId: string,
    input: CreateInterviewInput,
  ) => Interview;
  onSaveReview: (
    interviewId: string,
    candidates: SaveAIReviewCandidateInput[],
  ) => void;
  onComplete: (
    interviewId: string,
    candidates: SaveAIReviewCandidateInput[],
  ) => void;
  onClose: (savedDraftId?: string) => void;
  onOpenSettings: (savedDraftId?: string) => void;
}

const sampleInterview = `字节跳动 · 前端二面 · 2026-09-24 · 60min
1. 讲一下 React Fiber 的调度机制，追问 lane 优先级
2. hydration 失败怎么排查
3. tree-shaking 为什么依赖 ESM
4. 跨域下如何共享登录态
5. 和产品经理意见冲突的一次经历`;

export function inferInterviewInput(rawText: string): CreateInterviewInput {
  const lines = rawText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const firstLine = (lines[0] ?? "").replace(/^#{1,6}\s+/, "");
  const metadata = firstLine
    .split(/[·|｜]/)
    .map((part) => part.trim())
    .filter(Boolean);
  const isDialogue = /^(?:\d+[.)、]|[-*]\s|发言人|说话人|speaker\b|面试官|候选人|采访者|受访者|[QA问答]\s*[:：])|[？?]/i.test(firstLine);
  const labelled = (label: string) => {
    const pattern = new RegExp(`^(?:${label})\\s*[:：]\\s*([^|｜·]+)`, "i");
    return lines.slice(0, 20).map((line) => line.match(pattern)?.[1]?.trim()).find(Boolean);
  };
  // Only a short, delimited heading is evidence for an unlabelled company.
  const heading = !isDialogue && metadata.length >= 2 &&
    (metadata[0]?.length ?? 0) <= 40 && !/[:：。！!]/.test(metadata[0] ?? "");
  const company = labelled("公司(?:名称|名)?|面试公司") ||
    (heading ? metadata[0] : "") || "未命名面试";
  const descriptor = heading ? metadata[1] ?? "" : "";
  const roundPattern = /(?:技术|业务|主管|HR|终|一|二|三|四|五)面|第[一二三四五\d]+轮/gi;
  const roundMatch = descriptor.match(roundPattern)?.[0];
  const role = labelled("岗位(?:名称|名)?|职位(?:名称)?|面试岗位") ??
    descriptor.replace(roundPattern, "").replace(/面经(?:\.(?:docx?|txt|md|pdf))?$/i, "").trim();
  const datePart = labelled("面试日期|日期") ??
    (heading ? metadata.find((part) => /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(part)) : undefined);
  const dateMatch = datePart?.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);

  return {
    company,
    role,
    round: labelled("面试轮次|轮次") ?? roundMatch ??
      (heading ? metadata.slice(2).find((part) => /^(?:(?:技术|业务|主管|HR|终|一|二|三|四|五)面|第[一二三四五\d]+轮)$/i.test(part)) : "") ?? "",
    date: dateMatch
      ? `${dateMatch[1]}-${dateMatch[2]!.padStart(2, "0")}-${dateMatch[3]!.padStart(2, "0")}`
      : new Date().toISOString().slice(0, 10),
    source: "粘贴导入",
    rawText,
  };
}

export function InterviewImportPage({
  config,
  configured,
  initialRaw = "",
  initialSource,
  interviews,
  reviews,
  onStartExtraction,
  onCancelExtraction,
  syncBlocks,
  onCreateDraft,
  onUpdateDraft,
  onSaveReview,
  onComplete,
  onClose,
  onOpenSettings,
}: InterviewImportPageProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [raw, setRaw] = useState(initialRaw);
  const [metadataOverrides, setMetadataOverrides] = useState<
    Partial<CreateInterviewInput>
  >(initialSource ? { source: initialSource } : {});
  const inferredInput = { ...inferInterviewInput(raw), ...metadataOverrides };
  const [localError, setError] = useState<string | null>(null);
  const [draftInterviewId, setDraftInterviewId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ReviewCandidate[]>([]);
  const task = interviews.find((item) => item.id === draftInterviewId)?.extractionTask;
  const extractionProgress = task?.progress ?? null;
  const progress = task?.status === "completed" ? 100
    : extractionProgress ? Math.floor(extractionProgress.completed / extractionProgress.total * 100) : 0;
  const error = localError ?? (step === 2 ? task?.error : null);
  const loadedTask = useRef<string | null>(null);
  useEffect(() => {
    if (task?.status !== "completed" || loadedTask.current === task.id) return;
    const review = reviews.find((item) => item.interviewId === draftInterviewId);
    if (!review) return;
    loadedTask.current = task.id;
    setCandidates(review.candidates.map((candidate) => ({
      ...candidate,
      selected: candidate.questionDecision === "pending",
      connectToSuggested: false,
      tagsText: candidate.tags.join("，"),
    })));
    setStep(3);
  }, [task, reviews, draftInterviewId]);

  const saveDraft = () => {
    const input = { ...inferredInput, company: inferredInput.company.trim() || "未命名面试" };
    const interview = draftInterviewId
      ? onUpdateDraft(draftInterviewId, input)
      : onCreateDraft(input);
    if (!draftInterviewId) setDraftInterviewId(interview.id);
    return interview;
  };

  const serializeCandidates = (
    values: ReviewCandidate[],
  ): SaveAIReviewCandidateInput[] =>
    values.map((candidate) => ({
      title: candidate.title,
      answer: candidate.answer,
      tags: candidate.tagsText.split(/[，,]/),
      sourceExcerpt: candidate.sourceExcerpt,
      suggestedSyncBlockId: candidate.suggestedSyncBlockId,
      matchReason: candidate.matchReason,
      selected: candidate.selected,
      connectToSuggested: candidate.connectToSuggested,
    }));

  const startExtraction = () => {
    if (!raw.trim()) return;
    if (!configured) {
      setError("尚未配置 AI 服务。可以先保存原文，或前往设置完成配置。");
      return;
    }

    const interview = saveDraft();
    setError(null);
    setStep(2);
    onStartExtraction(interview);
  };

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (
        step === 1 &&
        (event.metaKey || event.ctrlKey) &&
        event.key === "Enter"
      ) {
        event.preventDefault();
        void startExtraction();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  });

  const cancelExtraction = () => {
    if (draftInterviewId) onCancelExtraction(draftInterviewId);
    setError(null);
    setStep(1);
  };

  const updateCandidate = (
    index: number,
    update: Partial<ReviewCandidate>,
  ) => {
    setCandidates((current) =>
      current.map((candidate, candidateIndex) =>
        candidateIndex === index ? { ...candidate, ...update } : candidate,
      ),
    );
  };

  const selectedCount = candidates.filter(
    (candidate) => candidate.selected && candidate.title.trim(),
  ).length;
  const matchCount = candidates.filter(
    (candidate) => candidate.suggestedSyncBlockId,
  ).length;
  const currentStage =
    progress >= 100
      ? "完成 · 原文已保存在本地"
      : task?.status === "queued" ? extractionLabel(task) : extractionProgressLabel(extractionProgress);

  const close = () => {
    if (step === 3 && draftInterviewId) {
      onSaveReview(draftInterviewId, serializeCandidates(candidates));
    }
    onClose(draftInterviewId ?? undefined);
  };

  const saveRawOnly = () => {
    if (!raw.trim()) return;
    onClose(saveDraft().id);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draftInterviewId) return;
    onComplete(draftInterviewId, serializeCandidates(candidates));
  };

  const saveReviewForLater = () => {
    if (!draftInterviewId) return;
    onSaveReview(draftInterviewId, serializeCandidates(candidates));
    onClose(draftInterviewId);
  };

  return (
      <section
        className="create-detail-page import-workspace"
        aria-labelledby="import-page-title"
      >
        <header className="import-modal-head">
          <button className="back-button create-detail-back" type="button" onClick={close}>
            <ArrowLeft size={16} aria-hidden="true" />
            返回新建
          </button>
          <p className="eyebrow">导入面经</p>
          <div>
            <h2 id="import-page-title">
              {step === 1
                ? "粘贴一段面试原文"
                : step === 2
                  ? "AI 正在为你拆解…"
                  : `识别到 ${candidates.length} 个原子问答块`}
            </h2>
            <div className="import-steps" aria-label={`当前第 ${step} 步`}>
              {[["1", "粘贴"], ["2", "AI 拆解"], ["3", "保存本地"]].map(
                ([number, label], index) => (
                  <span key={number}>
                    <span className={step >= index + 1 ? "active" : ""}>
                      <b>{number}</b>
                      <em>{label}</em>
                    </span>
                    {index < 2 ? (
                      <ChevronRight size={12} aria-hidden="true" />
                    ) : null}
                  </span>
                ),
              )}
            </div>
          </div>
        </header>

        <div className="import-modal-body">
          {step === 1 ? (
            <div className="import-paste-step">
              <p>
                面经拆解之后，保存在本地。AI 会帮你拆分成原子问答块。
              </p>
              <textarea
                autoFocus
                value={raw}
                onChange={(event) => {
                  setRaw(event.target.value);
                  setError(null);
                }}
                placeholder="在这里粘贴面经原文..."
                aria-label="面试原文"
              />
              <button
                className="button quiet import-sample"
                type="button"
                onClick={() => setRaw(sampleInterview)}
              >
                <Sparkles size={12} aria-hidden="true" />
                试试示例文本
              </button>
              <div className="import-metadata-section">
                <header>
                  <strong>基础信息</strong>
                  <span>用于归档和后续检索</span>
                </header>
                <div className="interview-metadata-fields import-metadata-fields">
                  {([["company", "公司名"], ["role", "岗位名"], ["round", "面试轮次"], ["date", "面试日期"]] as const).map(([field, label]) => (
                    <label key={field}>
                      <span>{label}</span>
                      <input
                        type={field === "date" ? "date" : "text"}
                        value={inferredInput[field]}
                        onChange={(event) => setMetadataOverrides((current) => ({ ...current, [field]: event.target.value }))}
                      />
                    </label>
                  ))}
                </div>
                <p>未识别的信息可手动填写，也可稍后在面试详情中修改。</p>
              </div>
              <div className="import-privacy-note">
                <ShieldCheck size={16} aria-hidden="true" />
                <span>
                  点击 AI 提取时，原文先保存到本地，再直接发送到你配置的
                  <code>{configured ? config.endpoint : " AI 服务"}</code>
                  ；不会经过见字·如面服务器。较长的面经可能需要更多时间，遇到解析异常时会自动尝试恢复。
                </span>
              </div>
              {error ? (
                <div className="import-config-error" role="alert">
                  <span>{error}</span>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => {
                      const draftId = raw.trim() ? saveDraft().id : undefined;
                      onOpenSettings(draftId);
                    }}
                  >
                    打开 AI 设置
                  </button>
                </div>
              ) : null}
            </div>
          ) : step === 2 ? (
            <div className="import-loading">
              <div className="import-orbit" aria-hidden="true">
                <span />
                <Sparkles size={23} />
              </div>
              <h3 aria-live="polite">{error ? "拆解没有完成" : currentStage}</h3>
              <p>
                {error
                  ? error
                  : "正在识别候选问题、实例回答，并匹配已有同步块。"}
              </p>
              {error ? <p>原文草稿已保存在本地，可以稍后从面试记录重新拆解。</p> : null}
              {!error ? (
                <>
                  <div className="import-progress">
                    <span style={{ width: `${Math.round(progress)}%` }} />
                    <strong>{Math.round(progress)}%</strong>
                  </div>
                  <p>离开当前页面后会继续处理，完成时会通知你。可从主页或面试记录查看进度。</p>
                  <button className="button secondary" type="button" onClick={close}>在后台继续</button>
                </>
              ) : (
                <button
                  className="button primary"
                  type="button"
                  onClick={() => void startExtraction()}
                >
                  重新拆解
                </button>
              )}
            </div>
          ) : (
            <form id="import-review-form" onSubmit={submit}>
              <div className="import-summary">
                <span>
                  <strong>{candidates.length}</strong>
                  原子问答块
                </span>
                <span>
                  <strong>{matchCount}</strong>
                  匹配到同步块
                </span>
                <span>
                  <strong>{candidates.length - matchCount}</strong>
                  全新问题
                </span>
              </div>
              <p className="import-review-help">
                逐条检查并修改；取消勾选可跳过，匹配关系需要你明确确认。
              </p>
              <div className="import-candidate-list">
                {candidates.map((candidate, index) => {
                  const syncBlock = syncBlocks.find(
                    (block) => block.id === candidate.suggestedSyncBlockId,
                  );
                  return (
                    <article
                      className={`import-candidate ${
                        candidate.selected ? "selected" : ""
                      }`}
                      key={`${index}-${candidate.sourceExcerpt}`}
                    >
                      <header>
                        <span className="import-candidate-number">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <input
                          aria-label={`第 ${index + 1} 个问题`}
                          value={candidate.title}
                          onChange={(event) =>
                            updateCandidate(index, {
                              title: event.target.value,
                            })
                          }
                          disabled={!candidate.selected}
                        />
                        <label className="import-candidate-check">
                          <input
                            type="checkbox"
                            checked={candidate.selected}
                            onChange={(event) =>
                              updateCandidate(index, {
                                selected: event.target.checked,
                              })
                            }
                          />
                          <span>
                            {candidate.selected ? <Check size={12} /> : null}
                          </span>
                        </label>
                      </header>
                      <label className="import-inline-field">
                        <span>标签</span>
                        <input
                          value={candidate.tagsText}
                          onChange={(event) =>
                            updateCandidate(index, {
                              tagsText: event.target.value,
                            })
                          }
                          disabled={!candidate.selected}
                          placeholder="使用逗号分隔"
                        />
                      </label>
                      <div className="import-answer-field">
                        <span>当次回答</span>
                        <AnswerEditor
                          value={candidate.answer}
                          onChange={(answer) =>
                            updateCandidate(index, {
                              answer,
                            })
                          }
                          disabled={!candidate.selected}
                          minRows={3}
                          label={`第 ${index + 1} 条候选的当次回答`}
                          placeholder="原文没有明确回答时保持为空"
                        />
                      </div>
                      {syncBlock ? (
                        <div
                          className={`import-match ${
                            candidate.connectToSuggested ? "accepted" : ""
                          }`}
                        >
                          <PlugZap size={13} aria-hidden="true" />
                          <span>
                            {candidate.connectToSuggested
                              ? "将连接到"
                              : "建议连接到"}
                            「{syncBlock.title}」
                          </span>
                          <button
                            className={
                              candidate.connectToSuggested
                                ? "button quiet"
                                : "button primary"
                            }
                            type="button"
                            onClick={() =>
                              updateCandidate(index, {
                                connectToSuggested:
                                  !candidate.connectToSuggested,
                              })
                            }
                            disabled={!candidate.selected}
                          >
                            {candidate.connectToSuggested
                              ? "取消关联"
                              : "采纳关联建议"}
                          </button>
                        </div>
                      ) : (
                        <div className="import-match new">
                          <Sparkles size={13} aria-hidden="true" />
                          新问题 · 保存后作为独立原子问答入库
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </form>
          )}
        </div>

        <footer className="import-modal-foot">
          {step === 1 ? (
            <>
              <button className="button quiet" type="button" onClick={close}>
                取消
              </button>
              <div>
                <button
                  className="button secondary"
                  type="button"
                  disabled={!raw.trim()}
                  onClick={saveRawOnly}
                >
                  保存并稍后审核
                </button>
                <button
                  className="button primary"
                  type="button"
                  disabled={!raw.trim()}
                  onClick={() => void startExtraction()}
                >
                  <Sparkles size={14} aria-hidden="true" />
                  AI 提取
                  <kbd>⌘ ↵</kbd>
                </button>
              </div>
            </>
          ) : step === 2 ? (
            <>
              <button
                className="button quiet"
                type="button"
                onClick={cancelExtraction}
              >
                <ArrowLeft size={14} aria-hidden="true" />
                取消拆解并修改
              </button>
              <span>原文草稿已保存在本地</span>
            </>
          ) : (
            <>
              <button
                className="button quiet"
                type="button"
                onClick={() => setStep(1)}
              >
                <ArrowLeft size={14} aria-hidden="true" />
                返回修改
              </button>
              <div>
                <button
                  className="button secondary import-keep-review"
                  type="button"
                  onClick={saveReviewForLater}
                >
                  稍后审核
                </button>
                <button
                  className="button primary"
                  type="submit"
                  form="import-review-form"
                  disabled={!selectedCount}
                >
                  <Check size={14} aria-hidden="true" />
                  保存到本地 · {selectedCount}
                </button>
              </div>
            </>
          )}
        </footer>
      </section>
  );
}
