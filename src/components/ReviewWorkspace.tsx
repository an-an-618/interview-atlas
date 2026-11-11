import { ArrowLeft, FileText, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { MockInterviewEvidence, MockInterviewSession, Workspace } from "../domain/types";
import type { KnowledgeTarget } from "../domain/workbench";
import { useWorkbenchState } from "../hooks/useWorkbenchState";

export function ReviewWorkspace({ session, workspace, analyzing, error, onRetry, onBack, onFocus, onOpen, onFind }: {
  session:MockInterviewSession;workspace:Workspace;analyzing:boolean;error:string|null;
  onRetry:()=>void;onBack:()=>void;onFocus:(id:string)=>void;onOpen:(t:KnowledgeTarget)=>void;onFind:(query:string)=>void;
}) {
  const [index,setIndex]=useWorkbenchState(`report-index:${session.id}`,0);
  const [highlight,setHighlight]=useWorkbenchState<MockInterviewEvidence|null>(`report-evidence:${session.id}`,null);
  const [mobile,setMobile]=useWorkbenchState<"feedback"|"transcript">(`report-panel:${session.id}`,"feedback");
  const transcript=useRef<HTMLDivElement>(null);
  const feedbackButton=useRef<HTMLButtonElement>(null);
  const feedback=session.feedback;
  const reviews=feedback?.questionReviews??[];
  const review=reviews[index]??reviews[0];
  const activeIndex=reviews[index]?index:0;
  const evidenceValid=(ref:MockInterviewEvidence)=>{
    const m=session.messages.find(m=>m.id===ref.messageId);
    return !!m && ref.start>=0 && ref.end>ref.start && m.content.slice(ref.start,ref.end)===ref.quote;
  };
  const locate=(ref:MockInterviewEvidence)=>{
    if(!evidenceValid(ref))return;
    setHighlight(ref);setMobile("transcript");
  };
  useEffect(()=>{
    const id=highlight?.messageId??review?.questionMessageId;
    if(id) requestAnimationFrame(()=>transcript.current?.querySelector(`[data-message-id="${CSS.escape(id)}"]`)?.scrollIntoView({block:"center",behavior:"smooth"}));
  },[highlight,review?.questionMessageId,mobile]);
  const references=(refs:MockInterviewEvidence[]|undefined)=>(refs??[]).map((ref,i)=>evidenceValid(ref)?<button className="evidence-quote" key={i} onClick={()=>locate(ref)}>
    <span>本场原话 · 点击定位</span><q>{ref.quote}</q></button>:<p key={i} className="muted">这条引用无法定位到本场原文。</p>);
  const relatedQuestion=workspace.questions.find(q=>session.questionIds.includes(q.id)&&
    (q.title===review?.question || q.evidenceRefs?.some(e=>review?.evidenceRefs?.some(r=>r.messageId===e.messageId))));
  return <div className={`page review-workspace mobile-${mobile}`}>
    <header className="workbench-heading"><div><button className="back-button" onClick={onBack}><ArrowLeft size={15}/>返回历史复盘</button><h1>历史复盘</h1></div>
      <select aria-label="选择复盘场次" value={session.id} onChange={e=>onFocus(e.target.value)}>
        {[...workspace.mockInterviews].filter(s=>s.status==="completed").sort((a,b)=>b.startedAt.localeCompare(a.startedAt)).map(s=><option key={s.id} value={s.id}>{s.company} · {s.role} · {new Date(s.startedAt).toLocaleDateString("zh-CN")}</option>)}</select>
      <button className="button secondary" disabled={!session.interviewId} onClick={()=>session.interviewId&&onOpen({kind:"interview",id:session.interviewId})}>面试记录</button></header>
    <div className="report-session-summary"><strong>{session.company} · {session.role} · {session.round||"模拟面试"}</strong><span>{session.messages.filter(m=>m.role==="candidate").length} 次回答 · 完整逐字稿已保存</span></div>
    <nav className="workspace-tabs report-question-tabs" aria-label="选择复盘问题">{reviews.map((r,i)=><button className={activeIndex===i?"active":""} key={`${r.questionMessageId}:${i}`} onClick={()=>{setIndex(i);setHighlight(null);setMobile("feedback");}}>Q{String(i+1).padStart(2,"0")}</button>)}</nav>
    <nav className="workspace-tabs report-mobile-tabs"><button className={mobile==="transcript"?"active":""} onClick={()=>setMobile("transcript")}>逐字稿</button><button ref={feedbackButton} className={mobile==="feedback"?"active":""} onClick={()=>setMobile("feedback")}>逐题反馈</button></nav>
    <div className="report-evidence-grid">
      <section className="report-transcript-panel"><header><h2>本场逐字稿</h2><span>原话核对</span></header>
        <button className="text-button transcript-return" onClick={()=>{setMobile("feedback");requestAnimationFrame(()=>feedbackButton.current?.focus());}}>返回同一条反馈 →</button>
        <div className="report-transcript-scroll" ref={transcript}>{session.messages.map((m,i)=>{
          const ref=highlight?.messageId===m.id&&evidenceValid(highlight)?highlight:null;
          return <article key={m.id} data-message-id={m.id} className={`transcript-message ${m.role} ${review?.questionMessageId===m.id?"selected-question":""}`}>
            <header><strong>{m.role==="interviewer"?"面试官":"我的回答"}</strong><small>{String(i+1).padStart(2,"0")}</small></header>
            <p>{ref?<>{m.content.slice(0,ref.start)}<mark>{m.content.slice(ref.start,ref.end)}</mark>{m.content.slice(ref.end)}</>:m.content}</p></article>;
        })}</div>
      </section>
      <section className="report-feedback-panel"><header><h2>逐题反馈</h2><span>{reviews.length?`${activeIndex+1} / ${reviews.length}`:"报告尚未生成"}</span></header>
        <div className="report-feedback-scroll">
          {analyzing?<div role="status" className="workspace-notice">正在核对逐字稿并生成报告，左侧原文可以继续阅读。</div>:null}
          {!feedback?<div className="workspace-notice"><h3>反馈尚未生成</h3><p>{error||"本场逐字稿已保存，可单独重试报告。"}</p><button className="button primary" disabled={analyzing} onClick={onRetry}><RotateCcw size={15}/>重试报告</button></div>:<>
            <details className="report-overall"><summary>本场总体观察</summary><h3>{feedback.summary}</h3><p>{feedback.overallAssessment}</p>
              <h4>有效表现</h4>{feedback.strengths.map((s,i)=><article key={i}><strong>{s.title}</strong><p>{s.detail}</p>{references(s.evidenceRefs)}</article>)}
              <h4>需要改进</h4>{feedback.improvements.map((s,i)=><article key={i}><strong>{s.title}</strong><p>{s.detail}</p>{references(s.evidenceRefs)}</article>)}
              <ol>{feedback.nextSteps.map((s,i)=><li key={i}>{s}</li>)}</ol></details>
            {review?<article className="question-feedback"><p className="eyebrow">Q{String(activeIndex+1).padStart(2,"0")} · {review.question}</p>
              <h3>本场观察</h3><p>{review.assessment}</p><h3>原文依据</h3>{references(review.evidenceRefs)}
              {!review.evidenceRefs?.length?<p className="muted">这条反馈没有可定位的原文引用。</p>:null}
              <h3>下一步准备</h3><p>{review.suggestion}</p></article>:<p>{feedback.summary}</p>}
            {feedback.validationWarnings?.length?<details><summary>原文核验提示</summary>{feedback.validationWarnings.map((w,i)=><p key={i}>{w}</p>)}</details>:null}
            <div className="report-knowledge-actions"><h3>回到自己的知识库</h3><p className="muted">对照本场反馈，手动完善回答或复习笔记。</p>
              {relatedQuestion?<><button className="button secondary" onClick={()=>onOpen({kind:"question",id:relatedQuestion.id})}>打开本场问答</button>
                {relatedQuestion.linkedSyncBlockId?<button className="button primary" onClick={()=>onOpen({kind:"sync",id:relatedQuestion.linkedSyncBlockId!})}>打开关联聚合块</button>:null}</>:null}
              <button className="text-button" onClick={()=>onFind(review?.question??session.role)}>在知识库中查找 →</button></div>
          </>}
          <details className="report-run-log"><summary>运行记录与参考资料</summary><p>模型：{session.harness?.model||"未记录"} · 服务：{session.harness?.endpoint||"未记录"}</p>
            {session.harness?.traces.map(t=><p key={t.id}>{t.operation==="turn"?"提问":"报告"} · {t.outcome||"完成"} · {t.durationMs}ms · {t.materialIds.length} 份参考资料</p>)}</details>
        </div>
      </section>
    </div>
  </div>;
}
