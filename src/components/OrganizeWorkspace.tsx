import { ArrowLeft, Check, FileText, Plus, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
  const [query, setQuery] = useWorkbenchState("organize-query", "");
  const [onlyPending, setOnlyPending] = useWorkbenchState("organize-pending", false);
  const sourceButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (importRequested) setImporting(true); }, [importRequested]);
  const tasks = [...workspace.interviews].filter(i => !i.simulated).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
  const interview = tasks.find(i => i.id === selectedId) ?? tasks[0];
  const review = workspace.aiReviews.find(r => r.interviewId === interview?.id);
  const candidates = review?.candidates ?? [];
  const candidate = candidates.find(c => c.id === positions[interview?.id ?? ""]) ?? candidates.find(c => c.questionDecision === "pending") ?? candidates[0];
  const progress = reviewProgress(candidates);
  const remember = (id: string, candidateId?: string) => {
    onSelect(id);
    if (candidateId) setPositions(p => ({ ...p, [id]: candidateId }));
    setLast({ key: `organize:${id}`, at: new Date().toISOString() });
    setDirectoryOpen(false);
  };
  const next = () => {
    if (!interview || !candidate) return;
    const index = candidates.findIndex(c => c.id === candidate.id);
    const following = [...candidates.slice(index + 1), ...candidates.slice(0, index)].find(c => c.questionDecision === "pending");
    if (following) remember(interview.id, following.id);
  };
  const source = <OriginalSource raw={interview?.rawText ?? ""} excerpt={candidate?.sourceExcerpt ?? ""}/>;
  const closeSource = () => { setSourceOpen(false); requestAnimationFrame(() => sourceButton.current?.focus()); };
  return <div className="page organize-page">
    <header className="workbench-heading"><div><h1>面经整理</h1><p className="muted">读原文，核对问答，再决定如何关联。</p></div>
      <div className="workspace-actions"><button className="button secondary" onClick={onRecord}>录制面试</button>
        <button className="button primary" onClick={() => setImporting(true)}><Plus size={16}/>导入面经</button></div></header>
    <div className="compact-workspace-tools"><button className="button secondary" onClick={() => setDirectoryOpen(o => !o)}>任务与问题目录</button>
      <button ref={sourceButton} className="button secondary" onClick={() => setSourceOpen(true)}>查看依据</button></div>
    <div className="organize-grid">
      <aside className={`workspace-directory ${directoryOpen ? "mobile-expanded" : ""}`}>
        <header><h2>整理队列</h2><span>{tasks.length} 份</span></header>
        <label className="search-field"><input aria-label="搜索整理任务" placeholder="搜索公司或岗位" value={query} onChange={e => setQuery(e.target.value)}/></label>
        <label className="workspace-check"><input type="checkbox" checked={onlyPending} onChange={e => setOnlyPending(e.target.checked)}/>仅看待处理</label>
        <div className="task-directory">{tasks.filter(i => `${i.company} ${i.role}`.includes(query)).filter(i => !onlyPending || i.status !== "reviewed").map(i => {
          const r = workspace.aiReviews.find(r => r.interviewId === i.id);
          const p = reviewProgress(r?.candidates ?? []);
          return <button className={`directory-row ${interview?.id === i.id ? "active" : ""}`} key={i.id} onClick={() => remember(i.id)}>
            <strong>{i.company || "未命名面经"}</strong><small>{[i.role, i.round].filter(Boolean).join(" · ")}</small>
            <span>{i.extractionTask && i.extractionTask.status !== "completed" ? extractionLabel(i.extractionTask) : p.total ? `${p.processed} / ${p.total} 已处理` : "原文已保存"}</span>
          </button>;
        })}</div>
        <header><h2>问题目录</h2><span>{progress.processed} / {progress.total}</span></header>
        <div className="candidate-directory">{candidates.map((c, index) => <button className={`directory-row ${candidate?.id === c.id ? "active" : ""}`} key={c.id} onClick={() => interview && remember(interview.id, c.id)}>
          <strong><span className="question-number">{String(index+1).padStart(2,"0")}</span>{c.title}</strong>
          <small>{c.questionDecision === "pending" ? "待核对" : c.questionDecision === "ignored" ? "已忽略" : c.syncDecision === "pending" ? "已采纳 · 待确认关联" : "已采纳"}</small>
        </button>)}</div>
        {progress.pendingLinks ? <p className="pending-link-note">{progress.pendingLinks} 条已入库问答仍待确认关联，可从目录返回处理。</p> : null}
      </aside>
      <section className="original-panel"><header><h2>原始面经</h2><span>{interview?.source || "原文"}</span></header>{source}</section>
      <section className="candidate-panel">
        {interview ? <>
          <header><div><p className="eyebrow">当前面经</p><h2>{interview.company} · {interview.role}</h2></div>
            <button className="text-button" onClick={() => onOpenInterview(interview.id)}>资料详情</button></header>
          <div className="organize-status"><span>{progress.total ? `已处理 ${progress.processed} / ${progress.total} 条` : "等待整理"}</span>
            <button className="text-button" onClick={() => setManual(true)}><Plus size={14}/>手动添加问答</button></div>
          {interview.extractionTask && ["queued","running"].includes(interview.extractionTask.status) ? <div className="workspace-notice" role="status"><p>{extractionLabel(interview.extractionTask)}，离开页面后仍可回来续办。</p>
            <button className="button secondary" onClick={() => onCancel(interview.id)}>取消提取</button></div> : null}
          {candidate ? <CandidateEditor key={`${interview.id}:${candidate.id}`} candidate={candidate} workspace={workspace}
            onSave={(input, decision) => onCommit(interview.id, candidate.id, input, decision).then(() => {
              setLast({ key: `organize:${interview.id}`, at: new Date().toISOString() });
            })} onNext={next}/> : <EmptyState title={interview.extractionTask?.error ? "提取未完成，原文已保留" : "从这份原文开始"}
              description={interview.extractionTask?.error || "让 AI 提取候选问答，或先手动整理。"} action={<button className="button primary"
                disabled={!!interview.extractionTask && ["queued","running"].includes(interview.extractionTask.status)}
                onClick={() => configured ? onExtract(interview) : onSettings()}><RotateCcw size={15}/>{configured ? "开始 / 重试 AI 提取" : "配置 AI 服务"}</button>}/>}
          {candidate && interview.extractionTask && ["failed","interrupted","cancelled"].includes(interview.extractionTask.status) ? <button className="button secondary" onClick={() => configured ? onExtract(interview) : onSettings()}>重试提取</button> : null}
        </> : <EmptyState title="导入第一份面经" description="原文先保存在本地，再核对每一条问答。" action={<button className="button primary" onClick={() => setImporting(true)}>导入面经</button>}/>}
      </section>
    </div>
    {sourceOpen ? <Modal title="原文依据" onClose={closeSource}>{source}</Modal> : null}
    {importing ? <ImportDraft onCreate={async input => { const i = await onCreate(input); remember(i.id); setImporting(false); onImported(); }}
      onClose={() => { setImporting(false); onImported(); }}/>: null}
    {manual && interview ? <ManualQuestion onClose={() => setManual(false)} onSave={input => onManual(interview.id, input).then(() => setManual(false))}/> : null}
  </div>;
}

function OriginalSource({ raw, excerpt }: { raw: string; excerpt: string }) {
  const match = sourceMatch(raw, excerpt);
  const mark = useRef<HTMLElement>(null);
  useEffect(() => { mark.current?.scrollIntoView({ block: "center", behavior: "smooth" }); }, [excerpt]);
  return <><p className="source-location" role="status">{match ? "已定位原文片段" : excerpt ? "无法可靠定位，请核对全文" : "按原有段落展示"}</p>
    <div className="original-text">{match ? <>{raw.slice(0,match.start)}<mark ref={mark}>{raw.slice(match.start,match.end)}</mark>{raw.slice(match.end)}</> : raw || "还没有原文。"}</div></>;
}

function CandidateEditor({ candidate, workspace, onSave, onNext }: { candidate: AIReviewCandidate; workspace: Workspace;
  onSave: (input: UpdateAIReviewCandidateInput | null, decision?: { kind: "question" | "sync"; value: "accepted" | "ignored" }) => Promise<void>;
  onNext: () => void }) {
  const [draft, setDraft] = useWorkbenchState(`candidate-draft:${candidate.id}`, { title: candidate.title, answer: candidate.answer, tags: candidate.tags.join("，") });
  const [busy,setBusy] = useState(false); const lock = useRef(false);
  const [error,setError] = useState("");
  const target = workspace.syncBlocks.find(b => b.id === candidate.suggestedSyncBlockId);
  const pending = candidate.questionDecision === "pending";
  const commit = async (kind: "question" | "sync", value: "accepted" | "ignored", advance = false) => {
    if (lock.current || (kind === "question" && value === "accepted" && !draft.title.trim())) return;
    lock.current = true; setBusy(true); setError("");
    try { await onSave(kind === "question" ? { title: draft.title, answer: draft.answer, tags: draft.tags.split(/[,，]/).filter(Boolean) } : null, { kind, value });
      if (advance) onNext();
    } catch(e) { setError(e instanceof Error ? e.message : "保存失败，请重试。"); }
    finally { lock.current = false; setBusy(false); }
  };
  return <div className="candidate-editor">
    <p className="eyebrow">{pending ? "待核对 · 问答是否入库" : candidate.questionDecision === "accepted" ? "已采纳 · 问答已入库" : "已忽略"}</p>
    <label><span>问题</span><textarea aria-label="候选问题" value={draft.title} disabled={!pending || busy} rows={2} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}/></label>
    <div className="form-field"><span>当次回答</span>{pending ? <AnswerEditor value={draft.answer} onChange={answer => setDraft(d => ({ ...d, answer }))} minRows={6}/> : <p className="preserved-answer">{candidate.answer}</p>}</div>
    <label><span>标签</span><input aria-label="候选标签" value={draft.tags} disabled={!pending || busy} onChange={e => setDraft(d => ({ ...d, tags:e.target.value }))}/></label>
    {error ? <p className="form-error" role="alert">{error} 待提交内容已保留。</p> : null}
    {pending ? <footer className="workspace-actions"><button className="button quiet" disabled={busy} onClick={() => commit("question","ignored",true)}>忽略问答</button>
      <button className="button secondary" disabled={busy || !draft.title.trim()} onClick={() => commit("question","accepted")}>采纳问答</button>
      <button className="button primary" disabled={busy || !draft.title.trim()} onClick={() => commit("question","accepted",true)}><Check size={15}/>{busy ? "保存中…" : "采纳并继续"}</button></footer> : null}
    {candidate.suggestedSyncBlockId && candidate.questionDecision !== "ignored" ? <section className="suggested-relation">
      <p className="eyebrow">独立决定 · 是否关联聚合块</p><h3>{target?.title || "建议目标已不存在"}</h3>
      <p>{candidate.matchReason || "请对照内容后决定。"}</p><details><summary>查看正文预览</summary><p className="preserved-answer">{target?.body}</p></details>
      <p className="muted">{candidate.syncDecision === "pending" ? pending ? "先采纳问答，再确认关联。也可以稍后处理。" : "问答已入库，关联仍待确认。" : candidate.syncDecision === "accepted" ? "已确认关联" : "已忽略关联，问答仍保留。"}</p>
      {candidate.syncDecision === "pending" ? <div className="workspace-actions"><button className="button secondary" disabled={busy} onClick={() => commit("sync","ignored")}>忽略关联</button>
        <button className="button primary" disabled={busy || pending || !target} onClick={() => commit("sync","accepted")}>确认关联</button></div> : null}
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
        <button className="button primary" disabled={busy}>{busy ? "保存中…" : "保存并进入整理"}</button></footer>
    </form>
  </Modal>;
}
function ManualQuestion({ onClose,onSave }: { onClose:()=>void; onSave:(input:CreateQuestionInput)=>Promise<void> }) {
  const [busy,setBusy]=useState(false); const [error,setError]=useState("");
  return <Modal title="手动添加问答" onClose={onClose}>{error ? <p role="alert" className="form-error">{error}</p>:null}<fieldset disabled={busy}>
    <QuestionForm onCancel={onClose} onSubmit={async input => { if(busy)return;setBusy(true);try{await onSave(input);}catch(e){setError(String(e));}finally{setBusy(false);}}}/></fieldset></Modal>;
}
