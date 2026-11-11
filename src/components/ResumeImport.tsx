import { Check, FileText, LoaderCircle, ShieldCheck, Sparkles, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AIProviderConfig, AIResumeCandidate, AIResumeInput } from "../ai/types";
import { RESUME_EXPERIENCE_TYPES } from "../ai/resumeExtraction";
import {
  prepareResumeDocument, RESUME_FILE_ACCEPT, validateResumeFile,
  type PreparedResumeDocument,
} from "../documents/resumeDocument";
import type { CreateResumeExperienceInput, ResumeExperience } from "../domain/types";
import { Modal } from "./Modal";

interface ResumeImportProps {
  config: AIProviderConfig;
  aiReady: boolean;
  experiences: ResumeExperience[];
  onOpenSettings: () => void;
  onParse: (input: AIResumeInput, signal: AbortSignal) => Promise<AIResumeCandidate[]>;
  onImport: (inputs: CreateResumeExperienceInput[]) => Promise<void>;
  onClose: () => void;
}

interface ResumeDraft extends AIResumeCandidate {
  selected: boolean;
  duplicate: boolean;
  bulletText: string;
}

function fingerprint(value: Pick<AIResumeCandidate, "title" | "organization" | "period">): string {
  return [value.title, value.organization, value.period]
    .map((part) => part.normalize("NFKC").replace(/\s+/gu, "").toLowerCase()).join("|");
}

export function ResumeImport({
  config, aiReady, experiences, onOpenSettings, onParse, onImport, onClose,
}: ResumeImportProps) {
  const [file, setFile] = useState<File | null>(null);
  const [document, setDocument] = useState<PreparedResumeDocument | null>(null);
  const [consent, setConsent] = useState(false);
  const [visionConfirmed, setVisionConfirmed] = useState(false);
  const [phase, setPhase] = useState<"idle" | "reading" | "parsing" | "saving">("idle");
  const [drafts, setDrafts] = useState<ResumeDraft[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const saving = useRef(false);
  const active = useRef(true);
  const busy = phase !== "idle";

  useEffect(() => {
    active.current = true;
    const previousFocus = window.document.activeElement;
    const previousOverflow = window.document.body.style.overflow;
    window.document.body.style.overflow = "hidden";
    window.document.querySelector<HTMLButtonElement>(".resume-import-modal .modal-header button")?.focus({ preventScroll: true });
    return () => {
      active.current = false;
      controller.current?.abort();
      window.document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    setConsent(false);
    setVisionConfirmed(false);
  }, [config.endpoint, config.model]);

  const close = () => {
    if (saving.current) return;
    if (drafts?.length && !window.confirm("关闭将丢弃尚未导入的解析结果，确定关闭吗？")) return;
    controller.current?.abort();
    onClose();
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      } else if (event.key === "Tab") {
        const modal = window.document.querySelector(".resume-import-modal");
        const controls = Array.from(modal?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary',
        ) ?? []).filter((control) => control.getClientRects().length > 0);
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && window.document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && window.document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const selectFile = async (next: File | undefined) => {
    if (!next || busy) return;
    setError(null);
    setDocument(null);
    setDrafts(null);
    setFile(null);
    setVisionConfirmed(false);
    try {
      validateResumeFile(next);
      setFile(next);
      setPhase("reading");
      const request = new AbortController();
      controller.current = request;
      const prepared = await prepareResumeDocument(next, request.signal);
      if (active.current && !request.signal.aborted) setDocument(prepared);
    } catch (reason) {
      if (active.current && !controller.current?.signal.aborted) {
        setError(reason instanceof Error ? reason.message : "无法读取简历文件。");
      }
    } finally {
      if (active.current) setPhase("idle");
    }
  };

  const parse = async () => {
    if (!document || !consent || !aiReady || busy ||
      (document.input.kind === "images" && !visionConfirmed)) return;
    const request = new AbortController();
    controller.current = request;
    setError(null);
    setPhase("parsing");
    try {
      const candidates = await onParse(document.input, request.signal);
      if (!active.current || request.signal.aborted) return;
      const existing = new Set(experiences.map(fingerprint));
      setDrafts(candidates.map((candidate) => {
        const key = fingerprint(candidate);
        const duplicate = existing.has(key);
        existing.add(key);
        return { ...candidate, duplicate, selected: !duplicate, bulletText: candidate.bullets.join("\n") };
      }));
    } catch (reason) {
      if (active.current && !request.signal.aborted) {
        setError(reason instanceof Error ? reason.message : "简历解析失败，请重试。");
      }
    } finally {
      if (active.current) setPhase("idle");
    }
  };

  const updateDraft = (index: number, patch: Partial<ResumeDraft>) => {
    setDrafts((current) => current?.map((draft, position) => position === index ? { ...draft, ...patch } : draft) ?? null);
  };
  const selected = drafts?.filter((draft) => draft.selected) ?? [];
  const save = async () => {
    if (saving.current || busy || !selected.length || selected.some((draft) => !draft.title.trim())) return;
    saving.current = true;
    setPhase("saving");
    setError(null);
    try {
      await onImport(selected.map((draft) => ({
        type: draft.type,
        title: draft.title,
        organization: draft.organization,
        period: draft.period,
        bullets: draft.bulletText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
        linkedQuestionIds: [],
        linkedSyncBlockIds: [],
      })));
      if (active.current) onClose();
    } catch (reason) {
      if (active.current) setError(reason instanceof Error ? reason.message : "本地导入失败，解析结果已保留，请重试。");
    } finally {
      saving.current = false;
      if (active.current) setPhase("idle");
    }
  };

  return (
    <Modal
      className="resume-import-modal"
      eyebrow={drafts ? "核对后导入 · Resume" : "简历解析 · Resume"}
      title={drafts ? "确认简历经历" : "从简历提取经历"}
      description={drafts ? "核对、修改并选择要导入的经历。确认后追加到当前本地经历库。" : "在本机读取文件，使用全局配置的 LLM 解析经历。"}
      onClose={close}
    >
      <div className="resume-import-scroll" aria-busy={busy}>
        <section className="resume-import-privacy" aria-label="简历数据处理说明">
          <ShieldCheck size={20} aria-hidden="true" />
          <div>
            <strong>简历数据如何处理</strong>
            <p>文件仅在本机读取。点击「同意并开始解析」后，简历文字会直接发送给全局配置的 LLM API；图片简历会发送整张图片，模型服务商将能读取这些内容。</p>
            <p>除这次模型 API 调用外，千面不会将简历或解析结果上传到自身服务器或其他云端存储。简历原文件不由应用保存，确认导入的经历仅保存在当前本地工作区。</p>
            <p>模型服务商可能按其自身政策处理或留存数据，千面无法保证服务商不留存。建议上传前移除电话、邮箱、证件号等敏感信息。</p>
          </div>
        </section>
        <div className="resume-import-destination">
          <span>当前全局模型</span><strong>{config.model || "尚未配置"}</strong>
          <span>发送至 API 地址</span><code>{config.endpoint || "尚未配置"}</code>
        </div>

        {drafts === null ? (
          <>
            {!aiReady ? (
              <div className="resume-import-settings">
                <p>请先在全局设置中选择模型并配置当前服务的 API Key。本机模型可不填 Key。</p>
                <button className="button secondary" onClick={onOpenSettings} disabled={busy}>前往模型设置</button>
              </div>
            ) : null}
            <label className="resume-import-upload">
              <Upload size={23} strokeWidth={1.5} aria-hidden="true" />
              <strong>{file ? file.name : "选择简历文件"}</strong>
              <span>Word（.docx）、PDF、TXT、Markdown、PNG / JPEG / WebP · 最大 10 MB</span>
              <input
                aria-label="选择简历文件"
                type="file" accept={RESUME_FILE_ACCEPT} disabled={busy}
                onChange={(event) => {
                  const next = event.target.files?.[0];
                  event.target.value = "";
                  void selectFile(next);
                }}
              />
            </label>
            <p className="resume-import-hint">PDF 支持可提取文字的文件，最多 30 页。扫描版请先 OCR，或逐张上传简历图片并使用支持图片输入的模型。旧版 .doc 请另存为 .docx。</p>
            {document?.warnings.map((warning) => <p className="resume-import-warning" key={warning}>{warning}</p>)}
            {document?.input.kind === "text" ? (
              <details className="resume-import-source">
                <summary><FileText size={14} aria-hidden="true" /> 查看即将发送的文字 · {document.input.text.length.toLocaleString()} 字符</summary>
                <pre>{document.input.text}</pre>
              </details>
            ) : null}
            {document?.input.kind === "images" ? (
              <label className="resume-import-check">
                <input type="checkbox" checked={visionConfirmed} disabled={busy} onChange={(event) => setVisionConfirmed(event.target.checked)} />
                <span>我确认当前模型支持 OpenAI 兼容的图片输入；图片解析可能产生更高费用。</span>
              </label>
            ) : null}
            <label className="resume-import-check">
              <input type="checkbox" checked={consent} disabled={busy} onChange={(event) => setConsent(event.target.checked)} />
              <span>我已阅读以上说明，同意将这份简历内容发送给当前配置的模型服务商进行解析。</span>
            </label>
          </>
        ) : (
          <>
            <div className="resume-import-review-heading">
              <strong>解析出 {drafts.length} 段经历 · 已选择 {selected.length} 段</strong>
              {drafts.length ? <button className="button quiet" disabled={busy} onClick={() => setDrafts((current) => current?.map((draft) => ({ ...draft, selected: selected.length !== drafts.length })) ?? null)}>
                {selected.length === drafts.length ? "取消全选" : "全选"}
              </button> : null}
            </div>
            <p className="resume-import-hint">AI 可能遗漏或误读内容，请对照原简历核对职责、数字和日期。疑似已有的经历默认不勾选；导入只会新增经历。</p>
            {!drafts.length ? <p className="empty-inline">没有识别到独立经历。请检查原文，或更换模型后重新解析。</p> : null}
            {drafts.map((draft, index) => (
              <article className={`resume-import-candidate ${draft.selected ? "selected" : ""}`} key={index}>
                <label className="resume-import-check">
                  <input type="checkbox" checked={draft.selected} disabled={busy} onChange={(event) => updateDraft(index, { selected: event.target.checked })} />
                  <strong>经历 {index + 1}{draft.duplicate ? " · 与已有经历或其他结果的标题、组织和时间相同" : ""}</strong>
                </label>
                <div className="form-grid">
                  <label><span>经历类型</span><select value={draft.type} disabled={busy} onChange={(event) => updateDraft(index, { type: event.target.value })}>
                    {RESUME_EXPERIENCE_TYPES.map((type) => <option key={type}>{type}</option>)}
                  </select></label>
                  <label><span>标题 *</span><input value={draft.title} maxLength={300} disabled={busy} onChange={(event) => updateDraft(index, { title: event.target.value })} aria-invalid={draft.selected && !draft.title.trim()} /></label>
                  <label><span>组织</span><input value={draft.organization} maxLength={300} disabled={busy} onChange={(event) => updateDraft(index, { organization: event.target.value })} /></label>
                  <label><span>时间</span><input value={draft.period} maxLength={200} disabled={busy} onChange={(event) => updateDraft(index, { period: event.target.value })} /></label>
                </div>
                <label><span>经历要点 · 每行一条</span><textarea rows={4} value={draft.bulletText} disabled={busy} onChange={(event) => updateDraft(index, { bulletText: event.target.value })} /></label>
                <details className="resume-import-source"><summary>查看模型引用的原文</summary><pre>{draft.sourceExcerpt}</pre></details>
              </article>
            ))}
          </>
        )}
        {error ? <p className="resume-import-error" role="alert">{error}</p> : null}
        {busy ? <p className="resume-import-progress" role="status"><LoaderCircle size={16} className="spin" aria-hidden="true" />
          {phase === "reading" ? "正在本机读取文件，尚未发送简历…" : phase === "parsing" ? "正在调用全局 LLM 解析简历，请稍候。关闭弹窗会取消本次解析。" : "正在将所选经历保存到本地…"}
        </p> : null}
      </div>
      <footer className="resume-import-actions">
        <button className="button quiet" disabled={phase === "saving"} onClick={close}>{busy && phase !== "saving" ? "取消并关闭" : "取消"}</button>
        {drafts !== null ? (
          <>
            <button className="button secondary" disabled={busy} onClick={() => { setDrafts(null); setError(null); }}>返回文件</button>
            <button className="button primary" disabled={busy || !selected.length || selected.some((draft) => !draft.title.trim())} onClick={() => void save()}>
              <Check size={15} aria-hidden="true" /> 导入 {selected.length} 段经历
            </button>
          </>
        ) : (
          <button className="button primary" disabled={busy || !document || !consent || !aiReady || (document.input.kind === "images" && !visionConfirmed)} onClick={() => void parse()}>
            <Sparkles size={15} aria-hidden="true" /> 同意并开始解析
          </button>
        )}
      </footer>
    </Modal>
  );
}
