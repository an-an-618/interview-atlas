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
  SlidersHorizontal,
  Sparkles,
  XCircle,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
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

export function extractionProgressLabel(progress: AIExtractionProgress | null) {
  if (!progress) return "正在准备解析…";
  if (progress.phase === "retrying") return "正在重新尝试解析…";
  return "正在解析面经…";
}

interface AISettingsPanelProps {
  config: AIProviderConfig;
  loading: boolean;
  error: string | null;
  embedded?: boolean;
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
  embedded = false,
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
    <section className="ai-settings">
      <header
        className={`ai-settings-header${embedded ? " embedded" : ""}`}
      >
        {embedded ? (
          <strong>连接状态</strong>
        ) : (
          <div>
            <p className="eyebrow">AI service</p>
            <h2>模型服务</h2>
            <p>
              预设会自动填写服务地址和推荐模型，也可以选择自定义接入。
            </p>
          </div>
        )}
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

      <form className="ai-settings-form" onSubmit={save}>
        <fieldset className="ai-provider-picker">
          <legend>
            <span>选择模型提供方</span>
            <small>每个提供方的密钥在当前浏览器会话中分别保留</small>
          </legend>
          <div className="ai-provider-presets">
            {aiProviderPresets.map((preset) => {
              const active = selectedProviderId === preset.id;
              return (
                <button
                  className={[
                    active ? "active" : "",
                    getApiKey(preset.id) ? "has-credential" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  type="button"
                  key={preset.id}
                  data-provider={preset.id}
                  aria-pressed={active}
                  onClick={() => selectProvider(preset)}
                >
                  <span className="provider-mark" aria-hidden="true">
                    {preset.mark}
                  </span>
                  <span>
                    <strong>{preset.label}</strong>
                    <small>{preset.description}</small>
                  </span>
                  {active ? <Check size={14} aria-hidden="true" /> : null}
                  {getApiKey(preset.id) ? (
                    <span className="provider-key-state">
                      <KeyRound size={10} aria-hidden="true" />
                      已填
                    </span>
                  ) : null}
                </button>
              );
            })}
            <button
              className={[
                selectedProviderId === "custom" ? "active" : "",
                getApiKey("custom") ? "has-credential" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              type="button"
              data-provider="custom"
              aria-pressed={selectedProviderId === "custom"}
              onClick={() => selectProvider(null)}
            >
              <span className="provider-mark" aria-hidden="true">
                <SlidersHorizontal size={16} />
              </span>
              <span>
                <strong>自定义</strong>
                <small>兼容服务</small>
              </span>
              {selectedProviderId === "custom" ? (
                <Check size={14} aria-hidden="true" />
              ) : null}
              {getApiKey("custom") ? (
                <span className="provider-key-state">
                  <KeyRound size={10} aria-hidden="true" />
                  已填
                </span>
              ) : null}
            </button>
          </div>
        </fieldset>

        <section className="ai-provider-config">
          <div className="ai-selected-provider">
            <span
              className="provider-mark large"
              data-provider={selectedPreset?.id ?? "custom"}
              aria-hidden="true"
            >
              {selectedPreset?.mark ?? <SlidersHorizontal size={18} />}
            </span>
            <div>
              <strong>{selectedPreset?.label ?? "自定义服务"}</strong>
              <small>
                {selectedPreset?.description ?? "OpenAI-compatible"}
              </small>
            </div>
            {selectedPreset ? (
              <nav aria-label={`${selectedPreset.label} 接入帮助`}>
                <a
                  href={selectedPreset.consoleUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  获取密钥
                  <ExternalLink size={12} aria-hidden="true" />
                </a>
                <a
                  href={selectedPreset.docsUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  接入文档
                  <ExternalLink size={12} aria-hidden="true" />
                </a>
              </nav>
            ) : null}
          </div>

          <p className="ai-provider-note">
            {selectedPreset?.note ??
              "适用于其他 OpenAI-compatible 服务或本地模型。请自行确认端点支持浏览器跨域请求。"}
          </p>

          <div className="ai-config-fields">
            <label className="ai-endpoint-field">
              <span>服务地址</span>
              <input
                type="url"
                value={draft.endpoint}
                readOnly={Boolean(selectedPreset)}
                onChange={(event) => {
                  setDraft({ ...draft, endpoint: event.target.value });
                  resetConnectionState();
                }}
                placeholder="https://api.example.com/v1"
                required
              />
              <small>
                {selectedPreset
                  ? "已使用该提供方的官方兼容地址。"
                  : "可填写 API 基础地址或完整的 /chat/completions 地址。"}
              </small>
            </label>

            <label>
              <span>模型</span>
              <input
                value={draft.model}
                list={
                  selectedPreset
                    ? `ai-model-options-${selectedPreset.id}`
                    : undefined
                }
                onChange={(event) => {
                  setDraft({ ...draft, model: event.target.value });
                  resetConnectionState();
                }}
                placeholder="输入模型名称"
                required
              />
              {selectedPreset ? (
                <datalist id={`ai-model-options-${selectedPreset.id}`}>
                  {selectedPreset.models.map((model) => (
                    <option value={model} key={model} />
                  ))}
                </datalist>
              ) : null}
              <small>已填入推荐模型，也可以直接输入该提供方的其他模型。</small>
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
                  placeholder="输入当前提供方的 API Key"
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
              <small>仅保存在当前浏览器会话，不进入数据库、备份或日志。</small>
            </label>
          </div>

          {localError || error ? (
            <p className="inline-error" role="alert">
              {localError || error}
            </p>
          ) : null}

          <footer>
            <span>
              <ShieldCheck size={15} aria-hidden="true" />
              内容仅在你主动使用 AI 时发送
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
        </section>
      </form>
      <div className="credential-note">
        <ShieldCheck size={17} aria-hidden="true" />
        <span>
          千面不会通过自有服务器转发请求。第三方模型如何保存和使用数据，由你选择的服务条款决定。
        </span>
      </div>
    </section>
  );
}

export interface ReviewCandidate extends AIExtractionCandidate {
  selected: boolean;
  tagsText: string;
  connectToSuggested: boolean;
}

interface InterviewImportDialogProps {
  config: AIProviderConfig;
  configured: boolean;
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
  const firstLine =
    rawText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? "";
  const metadata = firstLine
    .split(/[·|｜]/)
    .map((part) => part.trim())
    .filter(Boolean);
  const looksLikeQuestion = /^(?:\d+[.)、]|[-*])\s*/.test(firstLine);
  const company = !looksLikeQuestion && metadata[0]
    ? metadata[0].slice(0, 100)
    : "未命名面试";
  const descriptor = !looksLikeQuestion ? metadata[1] ?? "" : "";
  const roundMatch = descriptor.match(
    /((?:技术|业务|主管|HR|hr|终|一|二|三|四|五)面)$/,
  );
  const datePart = metadata.find((part) =>
    /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(part),
  );

  return {
    company,
    role: descriptor.replace(roundMatch?.[1] ?? "", "").trim(),
    round: roundMatch?.[1] ?? "",
    date: datePart
      ? datePart.replace(/[/.]/g, "-")
      : new Date().toISOString().slice(0, 10),
    source: "粘贴导入",
    rawText,
  };
}

export function InterviewImportDialog({
  config,
  configured,
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
}: InterviewImportDialogProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [raw, setRaw] = useState("");
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
      ...candidate, selected: candidate.decision === "pending",
      tagsText: candidate.tags.join("，"),
    })));
    setStep(3);
  }, [task, reviews, draftInterviewId]);

  const saveDraft = () => {
    const input = inferInterviewInput(raw);
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

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  });

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

  return createPortal(
    <div className="modal-layer import-layer" role="presentation">
      <button
        className="modal-backdrop"
        aria-label="关闭导入面经"
        onClick={close}
      />
      <section
        className="import-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-modal-title"
      >
        <header className="import-modal-head">
          <p className="eyebrow">导入面经</p>
          <div>
            <h2 id="import-modal-title">
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
              <div className="import-privacy-note">
                <ShieldCheck size={16} aria-hidden="true" />
                <span>
                  点击 AI 提取时，原文先保存到本地，再直接发送到你配置的
                  <code>{configured ? config.endpoint : " AI 服务"}</code>
                  ；不会经过千面服务器。较长的面经可能需要更多时间，遇到解析异常时会自动尝试恢复。
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
                  <p>关闭弹窗后会继续处理，完成时会通知你。可从概览或面试记录查看进度。</p>
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
                      <label className="import-answer-field">
                        <span>当次回答</span>
                        <textarea
                          value={candidate.answer}
                          onChange={(event) =>
                            updateCandidate(index, {
                              answer: event.target.value,
                            })
                          }
                          disabled={!candidate.selected}
                          rows={3}
                          placeholder="原文没有明确回答时保持为空"
                        />
                      </label>
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
                              ? "改为新问题"
                              : "连接"}
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
    </div>,
    document.body,
  );
}
