import { ChevronLeft, ChevronRight, Download, Image, LoaderCircle, Share2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  defaultShareOptions, shareFilename, shareKindLabels,
  type ShareDocument, type ShareOption,
} from "../domain/share";
import { layoutSharePages, type SharePage } from "../domain/shareLayout";
import {
  canvasPng, createShareMeasure, downloadShareImages, loadShareFonts, renderSharePage,
  type ShareImageFile,
} from "../platform/shareImage";
import { Modal } from "./Modal";

export function ShareButton({ onClick, disabled = false }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button className="button secondary share-trigger" type="button" onClick={onClick} disabled={disabled}>
      <Share2 size={14} aria-hidden="true" />
      分享
    </button>
  );
}

const optionLabels: Record<ShareOption, [string, string]> = {
  source: ["来源面试", "展示关联面试的公司、岗位与轮次"],
  dates: ["时间信息", "展示面试日期、经历时间与更新日期"],
  tags: ["标签", "展示内容标签"],
  notes: ["笔记", "附上笔记与复习补充"],
  raw: ["原始面试记录", "附上完整原文，可能增加图片页数"],
  watermark: ["产品水印", "在页脚注明制图支持与产品 GitHub 地址"],
};

export function ShareModal({ document, onClose }: { document: ShareDocument; onClose: () => void }) {
  const [options, setOptions] = useState(() => defaultShareOptions(document));
  const [pages, setPages] = useState<SharePage[]>([]);
  const [current, setCurrent] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const preview = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const available = useMemo(() => [
    ...(document.sources.length ? ["source" as const] : []),
    ...(document.dates.length ? ["dates" as const] : []),
    ...(document.tags.length ? ["tags" as const] : []),
    ...(document.notes.length ? ["notes" as const] : []),
    ...(document.rawText.trim() ? ["raw" as const] : []),
    "watermark" as const,
  ], [document]);

  useEffect(() => {
    let active = true;
    loadShareFonts().then(() => { if (active) setReady(true); })
      .catch(() => { if (active) setError("字体加载失败，请关闭后重试。"); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      setPages(layoutSharePages(document, options, createShareMeasure()));
      setCurrent(0);
      setError("");
      setNotice("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "图片排版失败，请重试。");
    }
  }, [document, options, ready]);
  useEffect(() => {
    const host = preview.current;
    if (!host || !pages[current]) return;
    const canvas = renderSharePage(document, pages[current]!, current, pages.length, options);
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", `${document.title}，第 ${current + 1} 页，共 ${pages.length} 页`);
    host.replaceChildren(canvas);
    return () => { canvas.remove(); };
  }, [document, pages, current, options]);
  useEffect(() => {
    previousFocus.current = window.document.activeElement as HTMLElement | null;
    const oldOverflow = window.document.body.style.overflow;
    window.document.body.style.overflow = "hidden";
    const modal = dialog.current?.closest<HTMLElement>('[role="dialog"]');
    modal?.querySelector<HTMLButtonElement>('button[title="关闭"]')?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) { event.preventDefault(); onCloseRef.current(); }
      if (event.key !== "Tab" || !modal) return;
      const focusable = Array.from(modal.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), [tabindex="0"]',
      ));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && window.document.activeElement === first) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && window.document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    };
    window.document.addEventListener("keydown", handleKey);
    return () => {
      window.document.body.style.overflow = oldOverflow;
      window.document.removeEventListener("keydown", handleKey);
      previousFocus.current?.focus();
    };
  }, []);

  const download = async (all: boolean) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const indexes = all ? pages.map((_, index) => index) : [current];
      const files: ShareImageFile[] = [];
      for (const index of indexes) {
        const canvas = renderSharePage(document, pages[index]!, index, pages.length, options);
        files.push({ name: shareFilename(document, index + 1, pages.length), blob: await canvasPng(canvas) });
        canvas.width = 0;
        canvas.height = 0;
      }
      const destination = await downloadShareImages(files);
      setNotice(destination === "desktop"
        ? `${files.length} 张图片已保存至系统下载文件夹。`
        : files.length > 1
          ? `已发起 ${files.length} 张图片下载。若浏览器拦截多文件下载，请允许后重试，或逐页下载。`
          : "已发起图片下载，请在浏览器下载列表查看。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : typeof cause === "string" ? cause : "下载失败，请重试；已下载的页面可保留。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`分享${shareKindLabels[document.kind]}`}
      eyebrow="图片分享"
      description="3:4 竖图 · 1080 × 1440 px · PNG"
      className="share-modal"
      onClose={() => { if (!busy) onClose(); }}
    >
      <div className="share-body" ref={dialog}>
        <aside className="share-settings">
          <div className="share-setting-heading">
            <Image size={17} aria-hidden="true" />
            <strong>图片内容</strong>
          </div>
          <p className="share-essential">
            {document.kind === "interview" ? document.sections.length ? "包含本场全部已整理问答" : "尚未整理问答，可分享原始记录" : document.kind === "resume" ? "包含经历标题、组织和全部要点" : "包含完整问题与回答"}
          </p>
          <fieldset disabled={busy}>
            <legend>可选信息</legend>
            {available.map((key) => (
              <label className="share-option" key={key}>
                <span>
                  <strong>{key === "source" && document.kind === "interview" ? "记录来源" : optionLabels[key][0]}</strong>
                  <small>{key === "source" && document.kind === "interview" ? "展示导入或记录的来源" : optionLabels[key][1]}</small>
                </span>
                <input type="checkbox" checked={options[key]} onChange={(event) => setOptions((value) => ({ ...value, [key]: event.target.checked }))} />
              </label>
            ))}
          </fieldset>
          <p className="share-local-note">图片在本机生成。{defaultShareOptions(document).raw ? "已默认包含原始记录，其余可选信息默认关闭。" : "可选信息默认关闭。"}可在预览中确认分享内容。</p>
        </aside>
        <section className="share-preview-section" aria-label="分享图片预览" aria-busy={!pages.length}>
          <div className="share-preview-toolbar">
            <span>图片预览</span>
            <span>{pages.length ? `${pages.length} 张图片` : "正在排版…"}</span>
          </div>
          <div className="share-canvas-wrap" ref={preview}>
            {!pages.length ? <LoaderCircle className="spin" size={24} aria-label="正在生成预览" /> : null}
          </div>
          <div className="share-pagination" aria-label="图片翻页">
            <button className="icon-button" type="button" aria-label="上一张图片" disabled={current === 0 || busy} onClick={() => setCurrent((value) => value - 1)}>
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <span aria-live="polite">{pages.length ? `${current + 1} / ${pages.length}` : "—"}</span>
            <button className="icon-button" type="button" aria-label="下一张图片" disabled={current >= pages.length - 1 || busy} onClick={() => setCurrent((value) => value + 1)}>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
        </section>
      </div>
      <footer className="share-footer">
        <div className="share-export-status" aria-live="polite">
          {error ? <p className="share-error" role="alert">{error}</p> : notice ? <p>{notice}</p> : (
            <p>{pages.length > 1 ? `内容较长，已自动排成 ${pages.length} 张图片，正文完整保留。` : "确认预览后，下载图片即可分享。"}</p>
          )}
        </div>
        <div className="share-download-actions">
          {pages.length > 1 ? <button className="button secondary" type="button" disabled={busy} onClick={() => void download(false)}>下载当前页</button> : null}
          <button className="button primary" type="button" disabled={busy || !pages.length} onClick={() => void download(true)}>
            {busy ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
            {busy ? "正在导出…" : pages.length > 1 ? `下载全部 ${pages.length} 张` : "下载图片"}
          </button>
        </div>
      </footer>
    </Modal>
  );
}
