import { ArrowRight, CheckCircle2, ChevronDown, FileText, Link2, Plus, RotateCcw, Search } from "lucide-react";
import { Button, IconButton } from "./UI";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AIReviewCandidate, CreateInterviewInput, CreateQuestionInput, Interview, UpdateAIReviewCandidateInput, Workspace } from "../domain/types";
import { reviewProgress, sourceMatch } from "../domain/workbench";
import { extractionLabel } from "../ai/extractionQueue";
import { useWorkbenchState } from "../hooks/useWorkbenchState";
import { Modal } from "./Modal";
import { AnswerEditor } from "./AnswerEditor";
import { QuestionForm } from "./Forms";
import { EmptyState } from "./PageLayout";

type Commit = (interviewId: string, candidateId: string, input: UpdateAIReviewCandidateInput | null,
  decision?: { kind: "question" | "sync"; value: "accepted" | "ignored" }) => Promise<void>;
type QuestionFilter = "pending" | "links" | "all";
const summaryPosition = "__summary__";
const awaitingLink = (c: AIReviewCandidate) => c.questionDecision === "accepted" && c.syncDecision === "pending";
const candidateStatus = (c: AIReviewCandidate) => c.questionDecision === "pending" ? "待核对" :
  c.questionDecision === "ignored" ? "已跳过" : awaitingLink(c) ? "已保存 · 待关联" : "已保存";
function taskStatus(interview: Interview, candidates: AIReviewCandidate[]) {
  if (interview.extractionTask && interview.extractionTask.status !== "completed") return extractionLabel(interview.extractionTask);
  const p = reviewProgress(candidates);
  if (p.total - p.processed) return `${p.total - p.processed} 条待核对`;
  if (p.pendingLinks) return `${p.pendingLinks} 条待关联`;
  return p.total || interview.status === "reviewed" ? "已整理" : "待提取问答";
}
function needsOrganizing(interview: Interview, candidates: AIReviewCandidate[]) {
  if (candidates.some(c => c.questionDecision === "pending" || awaitingLink(c))) return true;
  if (interview.extractionTask && interview.extractionTask.status !== "completed") return true;
  return !candidates.length && interview.status !== "reviewed";
}
export function OrganizeWorkspace({ workspace, selectedId, onSelect, onCommit, onCreate, onManual, onExtract, onCancel,
  onRecord, onSettings, onOpenInterview, configured, importRequested = false, onImported }: {
  workspace: Workspace; selectedId: string | null; onSelect: (id: string) => void; onCommit: Commit;
  onCreate: (input: CreateInterviewInput) => Promise<Interview>; onManual: (id: string, input: CreateQuestionInput) => Promise<void>;
  onExtract: (interview: Interview) => void; onCancel: (id: string) => void; onRecord: () => void;
  onSettings: () => void; onOpenInterview: (id: string) => void; configured: boolean;
  importRequested?: boolean; onImported: () => void;
}) {
  const [positions, setPositions] = useWorkbenchState<Record<string, string>>("candidates", {});
  const [, setLast] = useWorkbenchState<{ key: string; at: string } | null>("last-task", null);
  const [importing, setImporting] = useState(importRequested);
  const [manual, setManual] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [interviewsOpen, setInterviewsOpen] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [filters, setFilters] = useWorkbenchState<Record<string, QuestionFilter>>("organize-question-filters", {});
  const [query, setQuery] = useWorkbenchState("organize-query", "");
  const [onlyPending, setOnlyPending] = useWorkbenchState("organize-pending", false);
  const sourceButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (importRequested) setImporting(true); }, [importRequested]);
  const tasks = [...workspace.interviews].filter(i => !i.simulated).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
  const visibleTasks = tasks.filter(i => `${i.company} ${i.role} ${i.round}`.toLowerCase().includes(query.trim().toLowerCase()))
    .filter(i => !onlyPending || needsOrganizing(i, workspace.aiReviews.find(r => r.interviewId === i.id)?.candidates ?? []));
  const interview = tasks.find(i => i.id === selectedId) ?? tasks[0];
  const review = workspace.aiReviews.find(r => r.interviewId === interview?.id);
  const candidates = review?.candidates ?? [];
  const progress = reviewProgress(candidates);
  const extracting = !!interview?.extractionTask && ["queued", "running"].includes(interview.extractionTask.status);
  const position = positions[interview?.id ?? ""];
  const candidate = position === summaryPosition ? undefined :
    candidates.find(c => c.id === position) ?? candidates.find(c => c.questionDecision === "pending") ??
    candidates.find(awaitingLink);
  const pendingCount = progress.total - progress.processed;
  const filter = filters[interview?.id ?? ""] ?? (pendingCount ? "pending" : progress.pendingLinks ? "links" : "all");
  const filteredCandidates = candidates.filter(c => filter === "all" || (filter === "pending" ? c.questionDecision === "pending" : awaitingLink(c)));
  const candidateIndex = candidates.findIndex(c => c.id === candidate?.id);
  const manualCount = workspace.questions.filter(q => q.sourceInterviewIds.includes(interview?.id ?? "") &&
    !candidates.some(c => c.createdQuestionId === q.id)).length;
  const setFilter = (value: QuestionFilter) => {
    if (interview) setFilters(f => ({ ...f, [interview.id]: value }));
  };
  useEffect(() => {
    // Keep the current item stable when saving changes its decision.
    if (interview && candidate && position !== candidate.id) setPositions(p => ({ ...p, [interview.id]: candidate.id }));
  }, [interview?.id, candidate?.id, position, setPositions]);
  const remember = (id: string, candidateId?: string) => {
    onSelect(id);
    if (candidateId) setPositions(p => ({ ...p, [id]: candidateId }));
    setLast({ key: `organize:${id}`, at: new Date().toISOString() });
    setDirectoryOpen(false);
    setInterviewsOpen(false);
  };
  const next = (kind: "question" | "sync") => {
    if (!interview || !candidate) return;
    const index = candidates.findIndex(c => c.id === candidate.id);
    const following = [...candidates.slice(index + 1), ...candidates.slice(0, index)].find(c => kind === "question" ? c.questionDecision === "pending" : awaitingLink(c));
    if (following) remember(interview.id, following.id);
    else remember(interview.id, summaryPosition);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(".organize-editor-heading")?.focus({ preventScroll: false }));
  };
  const openPending = (kind: QuestionFilter) => {
    const first = candidates.find(c => kind === "pending" ? c.questionDecision === "pending" : awaitingLink(c));
    if (interview && first) { setFilter(kind); remember(interview.id, first.id); }
  };
  const source = <OriginalSource raw={interview?.rawText ?? ""} excerpt={candidate?.sourceExcerpt ?? ""}/>;
  const closeSource = () => { setSourceOpen(false); requestAnimationFrame(() => sourceButton.current?.focus()); };
  return <div className="page organize-page">
      <header className="workbench-heading"><div><h1>整理面经</h1><p className="muted">把面经里的问题和当次回答，整理到知识库。</p></div>
      <div className="workspace-actions"><Button icon="record" disabled={saveBusy} onClick={onRecord}>录制面试</Button>
        <Button variant="primary" icon="import" disabled={saveBusy} onClick={() => setImporting(true)}>导入面经</Button></div></header>
    {interview ? <section className="organize-interview-bar" aria-label="当前整理的面经">
      <div className="organize-interview-title"><FileText size={20} aria-hidden="true"/><div>
        <span className="eyebrow">正在整理</span><h2>{interview.company || "未命名面经"}</h2>
        <p>{[interview.role, interview.round, interview.date].filter(Boolean).join(" · ")}</p></div></div>
      <div className="organize-progress"><span>{progress.total ? `已核对 ${progress.processed} / ${progress.total} 条` : taskStatus(interview, candidates)}</span>
        {progress.total ? <progress value={progress.processed} max={progress.total} aria-label="问答核对进度"/> : null}</div>
      <button className="button secondary" disabled={saveBusy} onClick={() => setInterviewsOpen(true)}>切换面经 <ChevronDown size={14}/></button>
    </section> : null}
    {interview && candidates.length ? <div className="organize-mobile-tools"><button className="button secondary" disabled={saveBusy}
      aria-expanded={directoryOpen} aria-controls="organize-questions" onClick={() => setDirectoryOpen(o => !o)}>
      {directoryOpen ? "收起问答列表" : "选择问答"} <ChevronDown size={14}/></button><span>{pendingCount ? `${pendingCount} 条待核对` : progress.pendingLinks ? `${progress.pendingLinks} 条待关联` : "问答已核对完"}</span></div> : null}
    <div className={`organize-grid ${!candidates.length ? "without-questions" : ""}`}>
      {candidates.length ? <aside id="organize-questions" className={`workspace-directory ${directoryOpen ? "mobile-expanded" : ""}`}>
        <header><h2>这份面经的问答</h2><span>{progress.total} 条</span></header>
        <nav className="organize-question-filters" aria-label="问答状态">
          {([["pending", "待核对", pendingCount], ["links", "待关联", progress.pendingLinks], ["all", "全部", progress.total]] as const).map(([id, label, count]) =>
            <button key={id} aria-pressed={filter === id} className={filter === id ? "active" : ""} disabled={saveBusy} onClick={() => setFilter(id)}>{label}<span>{count}</span></button>)}
        </nav>
        <div className="candidate-directory">{filteredCandidates.map(c => <button disabled={saveBusy} aria-current={candidate?.id === c.id ? "true" : undefined}
          className={`directory-row ${candidate?.id === c.id ? "active" : ""}`} key={c.id} onClick={() => interview && remember(interview.id, c.id)}>
          <strong><span className="question-number">{String(candidates.indexOf(c)+1).padStart(2,"0")}</span>{c.title}</strong>
          <small>{candidateStatus(c)}</small>
        </button>)}</div>
        {!filteredCandidates.length ? <p className="organize-list-empty">{filter === "pending" ? "没有待核对的问答。" : filter === "links" ? "没有待确认的关联。" : "还没有问答。"}
          <button className="text-button" onClick={() => setFilter("all")}>查看全部问答</button></p> : null}
        <footer className="organize-directory-footer"><button className="text-button" disabled={saveBusy} onClick={() => interview && remember(interview.id, summaryPosition)}>查看整理进度 <ArrowRight size={14}/></button></footer>
      </aside> : null}
      <section className="candidate-panel">
        {interview ? <>
          <header className="organize-editor-heading" tabIndex={-1}><div><p className="eyebrow">{candidate ? `第 ${candidateIndex + 1} / ${progress.total} 条问答` : "接下来"}</p>
            <h2>{candidate ? candidate.questionDecision === "pending" ? "核对问题与回答" : awaitingLink(candidate) ? "确认这条问答的关联" : "查看已处理问答" : progress.total ? "整理进度" : "从这份面经开始"}</h2></div>
            <button ref={sourceButton} className="text-button" onClick={() => setSourceOpen(true)}><FileText size={15}/>查看原文</button></header>
          {candidate ? <div className="organize-item-navigation"><span>{candidate.questionDecision === "pending" ? "修改内容后保存，问答就会进入知识库。" : candidateStatus(candidate)}</span>
            <div><IconButton icon="back" label="上一条问答" disabled={saveBusy || candidateIndex <= 0} onClick={() => remember(interview.id, candidates[candidateIndex-1].id)}/>
              <IconButton icon="next" label="下一条问答" disabled={saveBusy || candidateIndex >= candidates.length-1} onClick={() => remember(interview.id, candidates[candidateIndex+1].id)}/></div></div> : null}
          {candidates.length && extracting && interview.extractionTask ? <div className="workspace-notice" role="status"><p>{extractionLabel(interview.extractionTask)}，离开页面后仍可回来续办。</p>
            <button className="button secondary" onClick={() => onCancel(interview.id)}>取消提取</button></div> : null}
          {candidate ? <CandidateEditor key={`${interview.id}:${candidate.id}`} candidate={candidate} workspace={workspace}
            onSave={async (input, decision) => { setSaveBusy(true); try { await onCommit(interview.id, candidate.id, input, decision);
              setLast({ key: `organize:${interview.id}`, at: new Date().toISOString() });
            } finally { setSaveBusy(false); } }} onNext={next}/> : progress.total ? <div className="organize-completion">
              <CheckCircle2 size={32} strokeWidth={1.4} aria-hidden="true"/><h3>{pendingCount ? `还有 ${pendingCount} 条问答待核对` : "这份面经的问答已核对完"}</h3>
              <p>已保存 {candidates.filter(c => c.questionDecision === "accepted").length} 条，已跳过 {candidates.filter(c => c.questionDecision === "ignored").length} 条。</p>
              {progress.pendingLinks ? <p>{progress.pendingLinks} 条问答可关联到已有聚合块，把同一主题的回答放在一起。问答已保存，关联可以稍后处理。</p> : null}
              <div className="workspace-actions">{pendingCount ? <button className="button primary" onClick={() => openPending("pending")}>继续核对 <ArrowRight size={15}/></button> :
                progress.pendingLinks ? <button className="button primary" onClick={() => openPending("links")}><Link2 size={15}/>处理待确认关联</button> : null}
                <button className={`button ${pendingCount || progress.pendingLinks ? "secondary" : "primary"}`} onClick={() => onOpenInterview(interview.id)}>去知识库查看</button></div>
            </div> : <EmptyState title={extracting ? "AI 正在提取问答" : interview.extractionTask?.error ? "提取未完成，原文已保留" : "先提取问答，再逐条核对"}
              description={extracting ? "提取完成后，问答会出现在这里。你可以先离开，之后回来继续核对。" : interview.extractionTask?.error || "AI 会从这份面经中提取问题和回答。你可以修改、保存，也可以跳过不需要的内容。"} action={<div className="workspace-actions">{extracting ?
                <button className="button secondary" onClick={() => onCancel(interview.id)}>取消提取</button> : <button className="button primary"
                onClick={() => configured ? onExtract(interview) : onSettings()}><RotateCcw size={15}/>{configured ? interview.extractionTask?.error ? "重试提取问答" : "提取问答" : "先配置 AI 服务"}</button>}
                <button className="button secondary" onClick={() => setManual(true)}>手动添加问答</button></div>}/>}
          {candidate && interview.extractionTask && ["failed","interrupted","cancelled"].includes(interview.extractionTask.status) ? <button className="button secondary" onClick={() => configured ? onExtract(interview) : onSettings()}>重试提取</button> : null}
          <footer className="organize-utility-footer"><button className="text-button" disabled={saveBusy} onClick={() => setManual(true)}><Plus size={14}/>补充一条问答</button>
            <button className="text-button" disabled={saveBusy} onClick={() => onOpenInterview(interview.id)}>{manualCount ? `已手动保存 ${manualCount} 条 · 查看` : "面经资料与已保存问答"} <ArrowRight size={14}/></button></footer>
        </> : <EmptyState title="从一份面经开始" description="导入面经 → 核对问答 → 保存到知识库。每次只需处理一条，离开后可以继续。" action={<button className="button primary" onClick={() => setImporting(true)}><Plus size={16}/>导入第一份面经</button>}/>}
      </section>
    </div>
    {sourceOpen ? <Modal title="原始面经" eyebrow="核对资料" description="对照这条问答的出处，关闭后继续编辑。" className="organize-source-modal" onClose={closeSource}>{source}</Modal> : null}
    {interviewsOpen ? <Modal title="选择要整理的面经" eyebrow={`${tasks.length} 份面经`} className="organize-select-modal" onClose={() => setInterviewsOpen(false)}>
      <div className="organize-select-body">
        <label className="search-field"><Search size={17} aria-hidden="true"/><input aria-label="搜索面经" placeholder="搜索公司、岗位或轮次" value={query} onChange={e => setQuery(e.target.value)}/></label>
        <div className="organize-select-toolbar"><label className="workspace-check"><input type="checkbox" checked={onlyPending} onChange={e => setOnlyPending(e.target.checked)}/>只看还没整理完的面经</label>
          <span role="status">显示 {visibleTasks.length} 份</span></div>
        <div className="organize-interview-list">{visibleTasks.map(i =>
          <button key={i.id} className={`directory-row ${interview?.id === i.id ? "active" : ""}`} onClick={() => remember(i.id)}>
            <div className="organize-interview-row-heading"><strong>{i.company || "未命名面经"}</strong>
              <span>{taskStatus(i, workspace.aiReviews.find(r => r.interviewId === i.id)?.candidates ?? [])}{interview?.id === i.id ? " · 当前" : ""}</span></div>
            <small>{[i.role, i.round, i.date].filter(Boolean).join(" · ")}</small></button>)}</div>
        {!visibleTasks.length ? <p className="organize-list-empty">没有符合条件的面经。试试其他关键词，或取消筛选。</p> : null}
      </div>
    </Modal> : null}
    {importing ? <ImportDraft onCreate={async input => { const i = await onCreate(input); remember(i.id); setImporting(false); onImported(); }}
      onClose={() => { setImporting(false); onImported(); }}/>: null}
    {manual && interview ? <ManualQuestion onClose={() => setManual(false)} onSave={input => onManual(interview.id, input).then(() => setManual(false))}/> : null}
  </div>;
}

function OriginalSource({ raw, excerpt }: { raw: string; excerpt: string }) {
  const match = sourceMatch(raw, excerpt);
  const mark = useRef<HTMLElement>(null);
  const text = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!mark.current || !text.current) return;
    const container = text.current;
    const top = mark.current.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
    container.scrollTo({ top: Math.max(0, top - container.clientHeight / 2),
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }, [excerpt]);
  return <><p className="source-location" role="status">{match ? "已定位原文片段" : excerpt ? "无法可靠定位，请核对全文" : "按原有段落展示"}</p>
    <div ref={text} className="original-text">{match ? <>{raw.slice(0,match.start)}<mark ref={mark}>{raw.slice(match.start,match.end)}</mark>{raw.slice(match.end)}</> : raw || "还没有原文。"}</div></>;
}

function CandidateEditor({ candidate, workspace, onSave, onNext }: { candidate: AIReviewCandidate; workspace: Workspace;
  onSave: (input: UpdateAIReviewCandidateInput | null, decision?: { kind: "question" | "sync"; value: "accepted" | "ignored" }) => Promise<void>;
  onNext: (kind: "question" | "sync") => void }) {
  const [draft, setDraft] = useWorkbenchState(`candidate-draft:${candidate.id}`, { title: candidate.title, answer: candidate.answer, tags: candidate.tags.join("，") });
  const [busy,setBusy] = useState(false); const lock = useRef(false);
  const [error,setError] = useState("");
  const editor = useRef<HTMLDivElement>(null);
  const target = workspace.syncBlocks.find(b => b.id === candidate.suggestedSyncBlockId);
  const pending = candidate.questionDecision === "pending";
  useLayoutEffect(() => {
    const container = editor.current;
    if (!container) return;
    const resize = () => container.querySelectorAll<HTMLTextAreaElement>("textarea").forEach(field => {
      field.style.height = "auto";
      field.style.height = `${field.scrollHeight}px`;
    });
    resize();
    let width = container.getBoundingClientRect().width;
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width !== width) { width = entry.contentRect.width; resize(); }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [draft.title, draft.answer, pending]);
  const commit = async (kind: "question" | "sync", value: "accepted" | "ignored", advance = false) => {
    if (lock.current || (kind === "question" && value === "accepted" && !draft.title.trim())) return;
    lock.current = true; setBusy(true); setError("");
    try { await onSave(kind === "question" ? { title: draft.title, answer: draft.answer, tags: draft.tags.split(/[,，]/).filter(Boolean) } : null, { kind, value });
      if (advance) onNext(kind);
    } catch(e) { setError(e instanceof Error ? e.message : "保存失败，请重试。"); }
    finally { lock.current = false; setBusy(false); }
  };
  return <div ref={editor} className="candidate-editor">
    <label className="organize-question-field"><span>问题</span><textarea aria-label="候选问题" value={pending ? draft.title : candidate.title} disabled={!pending || busy} rows={2} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}/></label>
    <div className="form-field organize-answer-field"><span>当次回答</span>{pending ? <AnswerEditor value={draft.answer} disabled={busy} onChange={answer => setDraft(d => ({ ...d, answer }))} minRows={3}/> : <p className="preserved-answer">{candidate.answer || "这条问答没有记录回答。"}</p>}</div>
    <details className="organize-tags"><summary>标签{draft.tags ? ` · ${draft.tags}` : "（选填）"}</summary>
      <label><span>用逗号分隔，方便以后检索</span><input aria-label="候选标签" value={pending ? draft.tags : candidate.tags.join("，")} disabled={!pending || busy} onChange={e => setDraft(d => ({ ...d, tags:e.target.value }))}/></label></details>
    {error ? <p className="form-error" role="alert">{error} 待提交内容已保留。</p> : null}
    {pending ? <footer className="organize-save-actions"><span>草稿自动保留</span><div className="workspace-actions"><button className="button quiet" disabled={busy} onClick={() => commit("question","ignored",true)}>跳过这条</button>
      <button className="button secondary" disabled={busy || !draft.title.trim()} onClick={() => commit("question","accepted")}>保存这条</button>
      <Button variant="primary" icon="confirm" loading={busy} disabled={!draft.title.trim()} onClick={() => commit("question","accepted",true)}>保存并下一条</Button></div></footer> : null}
    {candidate.suggestedSyncBlockId && candidate.questionDecision !== "ignored" ? <section className="suggested-relation">
      {pending ? <details><summary><Link2 size={14}/>可选：保存后关联到「{target?.title || "目标已不存在"}」</summary>
        <p>{candidate.matchReason || "把同一主题的回答放在一起。"}</p><p className="muted">先保存问答，关联可以稍后确认。</p></details> : <>
        <p className="eyebrow">可选 · 把同主题的问答放在一起</p><h3><Link2 size={17}/>{target?.title || "建议目标已不存在"}</h3>
        <p>{candidate.matchReason || "请对照内容后决定。"}</p><details><summary>对照聚合块内容</summary><p className="preserved-answer">{target?.body || "目标内容已不存在，可以选择暂不关联。"}</p></details>
        <p className="muted">{candidate.syncDecision === "pending" ? "这条问答已保存。确认关联只会建立联系，不会改写聚合块。" : candidate.syncDecision === "accepted" ? "已确认关联" : "已忽略关联，问答仍保留。"}</p>
        {candidate.syncDecision === "pending" ? <div className="workspace-actions"><button className="button secondary" disabled={busy} onClick={() => commit("sync","ignored",true)}>暂不关联并继续</button>
          <button className="button primary" disabled={busy || !target || !candidate.createdQuestionId} onClick={() => commit("sync","accepted",true)}>{busy ? "保存中…" : "确认关联并继续"}</button></div> : null}</>}
    </section> : null}
  </div>;
}
function ImportDraft({ onCreate, onClose }: { onCreate: (input: CreateInterviewInput) => Promise<void>; onClose: () => void }) {
  const [draft,setDraft] = useWorkbenchState<CreateInterviewInput>("import-draft", { company:"", role:"", round:"", date:new Date().toLocaleDateString("en-CA"), source:"文本导入", rawText:"" });
  const [busy,setBusy] = useState(false); const [error,setError] = useState("");
  const lock = useRef(false);
  return <Modal title="导入面经" description="先保存原文，随后在整理工作区启动提取或手动核对。" onClose={onClose}>
    <form onSubmit={async e => { e.preventDefault(); if(lock.current || !draft.rawText.trim()) return; lock.current=true; setBusy(true); setError("");
      try { await onCreate({ ...draft, company: draft.company.trim() || "未命名面经" }); setDraft({ ...draft, company:"",role:"",round:"",rawText:"" }); }
      catch(e) { setError(e instanceof Error ? e.message : "原文保存失败"); } finally { lock.current=false; setBusy(false); } }}>
      <div className="interview-metadata-fields">{(["company","role","round","date"] as const).map((f,i) => <label key={f}><span>{["公司","岗位","轮次","日期"][i]}</span>
        <input aria-label={["公司","岗位","轮次","日期"][i]} type={f === "date" ? "date" : "text"} value={draft[f]} onChange={e => setDraft(d => ({ ...d,[f]:e.target.value }))}/></label>)}</div>
      <label><span>面试原文</span><textarea autoFocus aria-label="面试原文" rows={12} required value={draft.rawText} onChange={e => setDraft(d => ({ ...d,rawText:e.target.value }))}/></label>
      {error ? <p className="form-error" role="alert">{error}</p> : null}<footer className="form-actions"><button type="button" className="button quiet" onClick={onClose}>稍后再写</button>
        <Button type="submit" variant="primary" icon="save" loading={busy}>保存并进入整理</Button></footer>
    </form>
  </Modal>;
}
function ManualQuestion({ onClose,onSave }: { onClose:()=>void; onSave:(input:CreateQuestionInput)=>Promise<void> }) {
  const [busy,setBusy]=useState(false); const [error,setError]=useState("");
  return <Modal title="手动添加问答" onClose={onClose}>{error ? <p role="alert" className="form-error">{error}</p>:null}<fieldset disabled={busy}>
    <QuestionForm onCancel={onClose} onSubmit={async input => { if(busy)return;setBusy(true);try{await onSave(input);}catch(e){setError(String(e));}finally{setBusy(false);}}}/></fieldset></Modal>;
}
