import { ArrowLeft, BookOpen, FileText, Link2, Plus, Search, Star, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Workspace } from "../domain/types";
import { draftFor, knowledgeEntries, kindLabels, relatedTargets, type KnowledgeDraft, type KnowledgeKind, type KnowledgeTarget } from "../domain/workbench";
import type { ShareTarget } from "../domain/share";
import { useWorkbenchState } from "../hooks/useWorkbenchState";
import { AnswerEditor } from "./AnswerEditor";
import { Modal } from "./Modal";
import { EmptyState } from "./PageLayout";

export function requestWorkbenchNavigation(action: () => void) {
  const event = new CustomEvent("atlas:before-navigate", { cancelable: true, detail: action });
  if (window.dispatchEvent(event)) action();
}
const same = (a: KnowledgeTarget | null, b: KnowledgeTarget | null) => a?.kind === b?.kind && a?.id === b?.id;
export function KnowledgeWorkspace({ workspace, selected, onSelect, onSave, onRelation, onResumeRelations, onShare,
  onFavorite, onCreate, onOrganize, onManage, onBack }: {
  workspace: Workspace; selected: KnowledgeTarget | null; onSelect: (target: KnowledgeTarget | null) => void;
  onSave: (target: KnowledgeTarget, draft: KnowledgeDraft) => Promise<void>;
  onRelation: (questionId: string, blockId: string | null) => Promise<void>;
  onResumeRelations: (id:string, questionIds:string[], blockIds:string[]) => Promise<void>;
  onShare: (target: ShareTarget) => void; onFavorite: (target: KnowledgeTarget, favorite: boolean) => void;
  onCreate: (kind: KnowledgeKind) => void; onOrganize: (id: string) => void; onManage: (kind: KnowledgeKind) => void; onBack?: () => void;
}) {
  const [kind,setKind] = useWorkbenchState<KnowledgeKind | "all">("knowledge-kind","all");
  const [query,setQuery] = useWorkbenchState("knowledge-query","");
  const [favorites,setFavorites] = useWorkbenchState("knowledge-favorites",false);
  const [source,setSource] = useWorkbenchState("knowledge-source","");
  const [since,setSince] = useWorkbenchState("knowledge-since","");
  const [group,setGroup] = useWorkbenchState("knowledge-group","");
  const [sort,setSort] = useWorkbenchState("knowledge-sort","updated");
  const [compare,setCompare] = useWorkbenchState("knowledge-compare",false);
  const [mobileDetail,setMobileDetail] = useWorkbenchState("knowledge-detail",false);
  const list = useRef<HTMLDivElement>(null);
  const entries = knowledgeEntries(workspace);
  const searchText = (entry: typeof entries[number]) => {
    const q = entry.kind === "question" ? workspace.questions.find(q => q.id === entry.id) : null;
    const block = entry.kind === "sync" ? workspace.syncBlocks.find(b => b.id === entry.id) : null;
    const resume = entry.kind === "resume" ? workspace.resumeExperiences.find(r => r.id === entry.id) : null;
    const interview = entry.kind === "interview" ? workspace.interviews.find(i => i.id === entry.id) : null;
    return [entry.title, entry.body, q?.notes, q?.tags.join(" "), block?.reviewNotes,
      resume?.organization, resume?.type, resume?.period, interview?.source, interview?.date].filter(Boolean).join(" ").toLocaleLowerCase();
  };
  const visible = entries.filter(e => (kind === "all" || e.kind === kind) &&
    query.toLocaleLowerCase().split(/\s+/).every(q => searchText(e).includes(q)) &&
    (!since || e.updatedAt.slice(0,10) >= since) &&
    (!source || e.kind === "interview" && e.id === source || e.kind === "question" && workspace.questions.find(q => q.id === e.id)?.sourceInterviewIds.includes(source)) &&
    (!group || e.kind === "interview" && workspace.interviewOrganizations.find(o => o.id === group)?.collections.some(c => c.interviewIds.includes(e.id))) &&
    (!favorites || e.kind === "sync" && workspace.syncBlocks.find(b => b.id === e.id)?.favorite || e.kind === "question" && workspace.questions.find(q => q.id === e.id)?.favorite));
  if(sort === "links") visible.sort((a,b) => relatedTargets(workspace,b).length - relatedTargets(workspace,a).length);
  const target = entries.some(e => same(e,selected)) ? selected : visible[0] ?? null;
  const select = (t:KnowledgeTarget) => requestWorkbenchNavigation(() => { onSelect(t); setMobileDetail(true); });
  useLayoutEffect(() => { if(list.current) list.current.scrollTop = Number(sessionStorage.getItem("atlas-2.1:knowledge-scroll") ?? 0); }, []);
  return <div className={`page knowledge-workspace ${mobileDetail && target ? "mobile-detail-open" : ""}`}>
    <header className="workbench-heading"><div className="knowledge-header-title">{onBack ? <button className="icon-button" aria-label="返回上次位置" onClick={() => requestWorkbenchNavigation(onBack)}><ArrowLeft size={18}/></button> : null}<h1>知识库</h1></div>
      <nav className="workspace-tabs" aria-label="知识库分类">{(["all","interview","question","sync","resume"] as const).map(k => <button className={kind === k ? "active" : ""} key={k}
        onClick={() => requestWorkbenchNavigation(() => {setKind(k);setSource("");setGroup("");onSelect(null);setMobileDetail(false);})}>{k === "all" ? "全部" : kindLabels[k]}</button>)}</nav>
      <button className="button primary" onClick={() => requestWorkbenchNavigation(() => onCreate(kind === "all" ? "question" : kind))}><Plus size={15}/>新建{kind === "all" ? "" : kindLabels[kind]}</button></header>
    <div className={`knowledge-grid ${compare ? "with-compare" : ""}`}>
      <aside className="knowledge-list-panel">
        <label className="search-field"><Search size={16}/><input aria-label="搜索知识库条目" placeholder="搜索标题或正文" value={query} onChange={e => setQuery(e.target.value)}/></label>
        <div className="knowledge-filter-row"><select aria-label="知识库排序" value={sort} onChange={e => setSort(e.target.value)}><option value="updated">最近更新</option><option value="links">按关联数量</option></select>
          <label className="workspace-check"><input type="checkbox" checked={favorites} onChange={e=>setFavorites(e.target.checked)}/>收藏</label></div>
        <details className="knowledge-filters"><summary>来源、时间与整理筛选</summary>
          <label><span>来源面试</span><select aria-label="筛选来源面试" value={source} onChange={e=>setSource(e.target.value)}><option value="">全部来源</option>
            {workspace.interviews.map(i=><option key={i.id} value={i.id}>{i.company} · {i.round}</option>)}</select></label>
          <label><span>更新起始日期</span><input aria-label="更新起始日期" type="date" value={since} onChange={e=>setSince(e.target.value)}/></label>
          <label><span>面试整理分组</span><select aria-label="面试整理分组" value={group} onChange={e=>setGroup(e.target.value)}><option value="">全部分组</option>{workspace.interviewOrganizations.map(o=><option key={o.id} value={o.id}>{o.title}</option>)}</select></label>
        </details>
        <div className="knowledge-object-list" ref={list} onScroll={e=>sessionStorage.setItem("atlas-2.1:knowledge-scroll",String(e.currentTarget.scrollTop))} aria-label="知识库条目">
          {visible.map(e=><button key={`${e.kind}:${e.id}`} className={`directory-row ${same(e,target) ? "active" : ""}`} onClick={()=>select(e)}>
            <strong><FileText size={15}/>{e.title}</strong><small>{kindLabels[e.kind]} · {relatedTargets(workspace,e).length} 份关联资料</small></button>)}
          {!visible.length ? <p className="muted">没有匹配的资料。可调整筛选或新建。</p> : null}
        </div>
        <footer><span>{visible.length} 条资料</span><button className="text-button" onClick={() => requestWorkbenchNavigation(() => onManage(kind === "all" ? "interview" : kind))}>{kind === "resume" ? "解析简历 / 管理经历" : "管理列表与整理"}</button></footer>
      </aside>
      {target ? <KnowledgeEditor key={`${target.kind}:${target.id}`} workspace={workspace} target={target} compare={compare} onCompare={setCompare}
        onSave={draft=>onSave(target,draft)} onRelation={onRelation} onResumeRelations={onResumeRelations} onShare={onShare} onFavorite={onFavorite}
        onSelect={select} onOrganize={onOrganize} onMobileBack={()=>setMobileDetail(false)}/> :
        <EmptyState title="你的知识库，从一条回答开始" description="已有的面经、问答、聚合块和经历都会显示在这里。" action={<button className="button primary" onClick={()=>onCreate("question")}>添加原子问答</button>}/>}
    </div>
  </div>;
}
function KnowledgeEditor({ workspace,target,compare,onCompare,onSave,onRelation,onResumeRelations,onShare,onFavorite,onSelect,onOrganize,onMobileBack }: {
  workspace:Workspace;target:KnowledgeTarget;compare:boolean;onCompare:(open:boolean)=>void;onSave:(draft:KnowledgeDraft)=>Promise<void>;
  onRelation:(id:string,block:string|null)=>Promise<void>;onResumeRelations:(id:string,questions:string[],blocks:string[])=>Promise<void>;
  onShare:(target:ShareTarget)=>void;onFavorite:(target:KnowledgeTarget,favorite:boolean)=>void;
  onSelect:(target:KnowledgeTarget)=>void;onOrganize:(id:string)=>void;onMobileBack:()=>void;
}) {
  const initial = draftFor(workspace,target);
  const key = `editor:${target.kind}:${target.id}`;
  const [cached,setCached] = useWorkbenchState<{ draft:KnowledgeDraft; dirty:boolean }>(key,{draft:initial,dirty:false});
  const [draft,setDraft] = useState(cached.dirty ? cached.draft : initial);
  const [baseline,setBaseline] = useState(cached.dirty ? initial : draft);
  const [tab,setTab] = useWorkbenchState<"body"|"notes">(`${key}:tab`,"body");
  const [busy,setBusy] = useState(false); const lock = useRef(false); const [error,setError] = useState("");
  const [pending,setPending] = useState<(()=>void)|null>(null);
  const [managing,setManaging] = useState(false);
  const compareButton = useRef<HTMLButtonElement>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  useEffect(()=>setCached({draft,dirty}),[draft,dirty]);
  useEffect(()=>{
    const guard=(event:Event)=>{if(!dirty)return;event.preventDefault();setPending(()=> (event as CustomEvent<()=>void>).detail);};
    const unload=(event:BeforeUnloadEvent)=>{if(dirty){event.preventDefault();event.returnValue="";}};
    window.addEventListener("atlas:before-navigate",guard);window.addEventListener("beforeunload",unload);
    return()=>{window.removeEventListener("atlas:before-navigate",guard);window.removeEventListener("beforeunload",unload);};
  },[dirty]);
  const save=async()=>{
    if(lock.current)return false;lock.current=true;setBusy(true);setError("");
    try{if(!draft.title.trim())throw new Error("标题不能为空");await onSave(draft);setBaseline(draft);setCached({draft,dirty:false});return true;}
    catch(e){setError(e instanceof Error?e.message:"保存失败，请重试。");return false;}finally{lock.current=false;setBusy(false);}
  };
  const change=(field:keyof KnowledgeDraft,value:string)=>setDraft(d=>({...d,[field]:value}));
  const relations=relatedTargets(workspace,target);
  const favorite=target.kind==="sync"?workspace.syncBlocks.find(b=>b.id===target.id)?.favorite:target.kind==="question"?workspace.questions.find(q=>q.id===target.id)?.favorite:undefined;
  const closeCompare=()=>{onCompare(false);requestAnimationFrame(()=>compareButton.current?.focus());};
  return <>
    <article className="knowledge-editor">
      <button className="back-button knowledge-mobile-back" onClick={()=>requestWorkbenchNavigation(onMobileBack)}><ArrowLeft size={15}/>返回列表</button>
      <header><div><p className="eyebrow">{kindLabels[target.kind]} · {target.kind==="sync"?"可复用的回答":"自己的资料"}</p>
        <input className="knowledge-title" aria-label="资料标题" value={draft.title} onChange={e=>change("title",e.target.value)} disabled={target.kind==="interview"}/></div>
        <div className="workspace-actions">{favorite!==undefined?<button className="icon-button" aria-label={favorite?"取消收藏":"收藏"} aria-pressed={favorite} onClick={()=>onFavorite(target,!favorite)}><Star size={20} fill={favorite?"currentColor":"none"}/></button>:null}
          <button className="button secondary" onClick={()=>onShare({kind:target.kind==="sync"?"aggregate":target.kind,id:target.id})}>分享</button></div></header>
      <div className="knowledge-relation-bar"><button ref={compareButton} className="text-button" aria-expanded={compare} onClick={()=>onCompare(!compare)}><BookOpen size={16}/>对照资料 · {relations.length}</button>
        <button className="text-button" onClick={()=>setManaging(true)}><Link2 size={14}/>管理关联</button>
        {target.kind==="interview"?<button className="text-button" onClick={()=>requestWorkbenchNavigation(()=>onOrganize(target.id))}>继续审核</button>:null}</div>
      <nav className="workspace-tabs editor-tabs" aria-label="编辑内容"><button className={tab==="body"?"active":""} onClick={()=>setTab("body")}>{target.kind==="interview"?"原文":target.kind==="resume"?"经历要点":"回答"}</button>
        {target.kind==="question"||target.kind==="sync"?<button className={tab==="notes"?"active":""} onClick={()=>setTab("notes")}>复习笔记</button>:null}<span>{dirty?"编辑中 · 尚未保存":"已保存"}</span></nav>
      <div className="knowledge-edit-body">
        {target.kind==="interview"?<div className="interview-metadata-fields">{(["company","role","round","date","source"] as const).map((f,i)=><label key={f}><span>{["公司","岗位","轮次","日期","来源"][i]}</span>
          <input type={f==="date"?"date":"text"} aria-label={["公司","岗位","轮次","日期","来源"][i]} value={draft[f]} onChange={e=>change(f,e.target.value)}/></label>)}</div>:null}
        {target.kind==="resume"?<div className="interview-metadata-fields">{(["type","organization","period"] as const).map((f,i)=><label key={f}><span>{["经历类型","组织","时间"][i]}</span><input value={draft[f]} onChange={e=>change(f,e.target.value)}/></label>)}</div>:null}
        {tab==="notes"?<textarea aria-label="复习笔记正文" className="knowledge-textarea" rows={16} value={draft.notes} onChange={e=>change("notes",e.target.value)}/>:
          target.kind==="sync"||target.kind==="question"?<AnswerEditor value={draft.body} onChange={body=>change("body",body)} minRows={14} placeholder="整理这份回答…"/>:
            <textarea aria-label={target.kind==="interview"?"面试原文正文":"经历要点正文"} rows={18} className="knowledge-textarea" value={draft.body} onChange={e=>change("body",e.target.value)}/>}
        {target.kind==="question"?<label><span>标签</span><input aria-label="问答标签" value={draft.tags} onChange={e=>change("tags",e.target.value)}/></label>:null}
      </div>
      {error?<p className="form-error" role="alert">{error} 草稿仍在，可继续修改或重试。</p>:null}
      <footer className="knowledge-save-footer"><span>{target.kind==="sync"?"正文修改只更新此聚合块":"正文与关联各自保存"}</span>
        <div className="workspace-actions"><button className="button secondary" disabled={busy||!dirty} onClick={()=>{setDraft(baseline);setCached({draft:baseline,dirty:false});}}>放弃修改</button>
          <button className="button primary" disabled={busy||!dirty} onClick={()=>void save()}>{busy?"保存中…":"保存修改"}</button></div></footer>
    </article>
    {compare?<ComparePanel workspace={workspace} target={target} onClose={closeCompare} onSelect={onSelect} onRelation={onRelation}/>:null}
    {pending?<Modal title="正文尚未保存" description="选择如何处理当前草稿，再离开这个对象。" onClose={()=>setPending(null)}>
      {error?<p role="alert" className="form-error">{error}</p>:null}<div className="workspace-actions">
        <button className="button secondary" disabled={busy} onClick={()=>setPending(null)}>继续编辑</button>
        <button className="button quiet" disabled={busy} onClick={()=>{const action=pending;setCached({draft:baseline,dirty:false});setDraft(baseline);setPending(null);action();}}>放弃并离开</button>
        <button className="button primary" disabled={busy} onClick={async()=>{if(await save()){const action=pending;setPending(null);action();}}}>保存并离开</button></div></Modal>:null}
    {managing?<RelationManager workspace={workspace} target={target} onRelation={onRelation} onResumeRelations={onResumeRelations} onClose={()=>setManaging(false)}/>:null}
  </>;
}
function ComparePanel({workspace,target,onClose,onSelect,onRelation}:{workspace:Workspace;target:KnowledgeTarget;onClose:()=>void;onSelect:(t:KnowledgeTarget)=>void;onRelation:(id:string,block:string|null)=>Promise<void>}) {
  const [trail,setTrail]=useState<KnowledgeTarget[]>([]);
  const [error,setError]=useState("");const [busy,setBusy]=useState(false);
  const current=trail.at(-1)??target;
  const entries=knowledgeEntries(workspace);
  const related=relatedTargets(workspace,current);
  const show=(t:KnowledgeTarget)=>{
    const entry=entries.find(e=>same(e,t));if(!entry)return null;
    const question=t.kind==="question"?workspace.questions.find(q=>q.id===t.id):null;
    return <details className="compare-card" key={`${t.kind}:${t.id}`} open={t.kind==="question"||t.kind==="resume"}>
      <summary><span className="eyebrow">{kindLabels[t.kind]}{t.kind==="interview"&&workspace.interviews.find(i=>i.id===t.id)?.sample?" · 示例资料":""}</span><strong>{entry.title}</strong></summary>
      {question?<><small>候选人当次回答</small><blockquote>{question.answer||"尚未填写回答"}</blockquote>
        {question.sourceExcerpt?<p className="source-excerpt">{question.sourceExcerpt}</p>:null}
        {question.sourceInterviewIds.map(id=><button className="text-button" key={id} onClick={()=>setTrail(s=>[...s,{kind:"interview",id}])}>查看原始面经 →</button>)}</>:<p className="compare-content">{entry.body||"尚未填写内容"}</p>}
      <div className="workspace-actions"><button className="text-button" onClick={()=>onSelect(t)}>打开资料编辑 →</button>
        {target.kind==="sync"&&question?.linkedSyncBlockId===target.id?<button disabled={busy} className="text-button" onClick={async()=>{setBusy(true);try{await onRelation(question.id,null);}catch(e){setError(String(e));}finally{setBusy(false);}}}>取消关联</button>:null}</div>
    </details>;
  };
  return <aside className="compare-panel" role="region" aria-label="对照资料">
    <header><h2>对照资料</h2><button className="icon-button" aria-label="关闭对照资料" onClick={onClose}><X size={18}/></button></header>
    <div className="compare-breadcrumb">{trail.length?<button className="text-button" onClick={()=>setTrail(t=>t.slice(0,-1))}><ArrowLeft size={14}/>返回上一个对象</button>:<span>{kindLabels[target.kind]} → 来源与经历</span>}</div>
    {error?<p role="alert" className="form-error">{error}</p>:null}
    <div className="compare-scroll">{trail.length?show(current):related.map(show)}
      {!trail.length&&!related.length?<p className="muted">还没有关联资料。通过“管理关联”连接已有问答或经历。</p>:null}
      {trail.length?<><h3>沿关系继续查看</h3>{related.map(t=><button className="directory-row" key={`${t.kind}:${t.id}`} onClick={()=>setTrail(s=>[...s,t])}>{kindLabels[t.kind]} · {entries.find(e=>same(e,t))?.title}</button>)}</>:null}</div>
  </aside>;
}
function RelationManager({workspace,target,onRelation,onResumeRelations,onClose}:{workspace:Workspace;target:KnowledgeTarget;onRelation:(id:string,block:string|null)=>Promise<void>;onResumeRelations:(id:string,qs:string[],bs:string[])=>Promise<void>;onClose:()=>void}) {
  const [error,setError]=useState("");const [busy,setBusy]=useState(false);
  const lock=useRef(false);
  const run=async(action:()=>Promise<void>)=>{if(lock.current)return;lock.current=true;setBusy(true);setError("");try{await action();}catch(e){setError(String(e));}finally{lock.current=false;setBusy(false);}};
  const questions=target.kind==="question"?workspace.questions.filter(q=>q.id===target.id):workspace.questions;
  const blocks=target.kind==="sync"?workspace.syncBlocks.filter(b=>b.id===target.id):workspace.syncBlocks.filter(b=>!b.hidden);
  return <Modal title="管理关联" description="关系单独保存；当前正文草稿保持不变。" onClose={onClose}>
    {error?<p className="form-error" role="alert">{error}</p>:null}
    {target.kind==="interview"?<p className="muted">面试来源由问答入库时保留。可在问答资料中维护聚合块关联，在经历中维护知识关联。</p>:null}
    {target.kind==="sync"||target.kind==="question"?<div className="relation-manager-list">{questions.map(q=><label key={q.id}><span>{q.title}</span>
      <select disabled={busy} aria-label={`关联 ${q.title}`} value={q.linkedSyncBlockId??""} onChange={e=>void run(()=>onRelation(q.id,e.target.value||null))}><option value="">不关联聚合块</option>
        {blocks.map(b=><option value={b.id} key={b.id}>{b.title}</option>)}
        {q.linkedSyncBlockId&&!blocks.some(b=>b.id===q.linkedSyncBlockId)?<option value={q.linkedSyncBlockId}>其他聚合块（保留当前关联）</option>:null}
      </select></label>)}</div>:null}
    <h3>简历经历关联</h3><div className="relation-manager-list">{workspace.resumeExperiences.filter(r=>target.kind!=="resume"||r.id===target.id).map(r=><details key={r.id} open={target.kind==="resume"}><summary>{r.title}</summary>
      {(target.kind==="sync"?blocks:target.kind==="question"?questions:[...questions,...blocks]).map(item=>{
        const block=workspace.syncBlocks.some(b=>b.id===item.id);const ids=block?r.linkedSyncBlockIds:r.linkedQuestionIds;
        return <label className="workspace-check" key={item.id}><input type="checkbox" disabled={busy} checked={ids.includes(item.id)} onChange={e=>void run(()=>onResumeRelations(r.id,block?r.linkedQuestionIds:e.target.checked?[...ids,item.id]:ids.filter(id=>id!==item.id),block?e.target.checked?[...ids,item.id]:ids.filter(id=>id!==item.id):r.linkedSyncBlockIds))}/>{item.title}</label>;
      })}</details>)}</div>
  </Modal>;
}
