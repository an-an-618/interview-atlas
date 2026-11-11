import { ArrowUpRight, FileText, Plus, Sparkles } from "lucide-react";
import { actionableTasks, knowledgeEntries, kindLabels, type KnowledgeTarget } from "../domain/workbench";
import type { Workspace } from "../domain/types";
import type { ReviewDeckController } from "../hooks/useReviewDeck";
import type { ReviewSource } from "../domain/reviewDeck";
import { ReviewCards } from "./ReviewCards";
import { useWorkbenchState } from "../hooks/useWorkbenchState";

export function WorkbenchHome({ workspace, deck, enabled, onOrganize, onMock, onImport, onKnowledge, onPractice,
  onOpen, onFavorite, onCreateSync, onCreateQuestion }: {
  workspace: Workspace; deck: ReviewDeckController; enabled: boolean;
  onOrganize: (id: string) => void; onMock: (id?: string) => void; onImport: () => void;
  onKnowledge: () => void; onPractice: () => void; onOpen: (target: KnowledgeTarget) => void;
  onFavorite: (source: ReviewSource, id: string, favorite: boolean) => void;
  onCreateSync: () => void; onCreateQuestion: () => void;
}) {
  const [last] = useWorkbenchState<{ key: string; at: string } | null>("last-task", null);
  const tasks = actionableTasks(workspace);
  const continuing = tasks.find(t => t.key === last?.key) ?? tasks[0];
  const pending = tasks.filter(t => t.key !== continuing?.key);
  const openTask = (task: typeof tasks[number]) => task.type === "organize" ? onOrganize(task.id) : onMock(task.id);
  const today = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(new Date());
  return <div className="page workbench-home">
    <header className="workbench-heading"><div><p className="eyebrow">{today} · 本地工作台</p><h1>首页</h1></div>
      <div className="workspace-actions"><button className="button secondary" onClick={onImport}><Plus size={16}/>导入面经</button>
        <button className="button primary" onClick={() => onMock()}><Sparkles size={16}/>准备模拟面试</button></div></header>
    <div className="workbench-home-grid">
      <section className="home-flashcards"><header><div><p className="eyebrow">打开就能练</p><h2>把回答，再练一遍</h2></div>
        <button className="text-button" onClick={onPractice}>闪卡复习 <ArrowUpRight size={14}/></button></header>
        {enabled ? <ReviewCards deck={deck} syncBlocks={workspace.syncBlocks} questions={workspace.questions}
          onOpenSync={id => onOpen({ kind: "sync", id })} onOpenQuestion={id => onOpen({ kind: "question", id })}
          onCreateSync={onCreateSync} onCreateQuestion={onCreateQuestion} onFavorite={onFavorite}/> :
          <p className="muted">首页闪卡已在设置中关闭。<button className="text-button" onClick={onPractice}>进入闪卡复习</button></p>}
      </section>
      <aside className="home-followups">
        {continuing ? <section className="continue-panel"><p className="eyebrow">继续上次</p><h2>{continuing.title}</h2>
          <p>{continuing.state}</p><button className="button primary" onClick={() => openTask(continuing)}>{continuing.action}<ArrowUpRight size={16}/></button></section> : null}
        {pending.length ? <section><h2>等你处理 <small>{pending.length}</small></h2>
          {pending.slice(0, 5).map(task => <button className="followup-row" key={task.key} onClick={() => openTask(task)}>
            <span><strong>{task.title}</strong><small>{task.state}</small><span>{task.action}</span></span><ArrowUpRight size={15}/></button>)}</section> : null}
        <section><header><h2>最近整理</h2><button className="text-button" onClick={onKnowledge}>查看知识库</button></header>
          {knowledgeEntries(workspace).slice(0, 5).map(item => <button className="followup-row" key={`${item.kind}:${item.id}`} onClick={() => onOpen(item)}>
            <FileText size={16}/><span><strong>{item.title}</strong><small>{kindLabels[item.kind]} · {new Date(item.updatedAt).toLocaleDateString("zh-CN")}</small></span><ArrowUpRight size={14}/></button>)}
          {!knowledgeEntries(workspace).length ? <p className="muted">还没有资料。导入第一份面经，或添加一条问答。</p> : null}
        </section>
      </aside>
    </div>
  </div>;
}
