import { describe, expect, it } from "vitest";
import { createDemoWorkspace } from "../data/demo";
import { actionableTasks, draftFor, knowledgeEntries, relatedTargets, reviewProgress, sourceMatch } from "./workbench";
import { resolveAIReviewQuestion, resolveAIReviewSync } from "./workspace";
import type { AIReviewCandidate } from "./types";

const candidate = (): AIReviewCandidate => ({
  id:"c",title:"如何验证性能？",answer:"保留对照组。",tags:["性能"],sourceExcerpt:"保留对照组。",
  suggestedSyncBlockId:"sample-sync",matchReason:"匹配性能主题",questionDecision:"pending",syncDecision:"pending",createdQuestionId:null,
});
function reviewingWorkspace() {
  const w=createDemoWorkspace();
  w.interviews[0].status="pending";
  w.aiReviews=[{id:"r",interviewId:"sample-interview",candidates:[candidate()],createdAt:"2026-11-11T01:00:00Z",updatedAt:"2026-11-11T01:00:00Z"}];
  return w;
}
describe("continuous local workspace",()=>{
  it("keeps accepted QAs actionable until the independent relation is resolved",()=>{
    const w=resolveAIReviewQuestion(reviewingWorkspace(),"sample-interview","c","accepted");
    expect(reviewProgress(w.aiReviews[0].candidates)).toEqual({processed:1,total:1,pendingLinks:1,pending:1});
    expect(actionableTasks(w)[0].state).toContain("待确认关联");
    const completed=resolveAIReviewSync(w,"sample-interview","c","ignored");
    expect(actionableTasks(completed)).toEqual([]);
    expect(completed.questions).toHaveLength(3);
  });
  it("preserves exact source and never creates a duplicate on a repeated decision",()=>{
    const w=resolveAIReviewQuestion(reviewingWorkspace(),"sample-interview","c","accepted");
    const q=w.questions.find(q=>q.id===w.aiReviews[0].candidates[0].createdQuestionId)!;
    expect(q.sourceInterviewIds).toEqual(["sample-interview"]);
    expect(q.sourceExcerpt).toBe("保留对照组。");
    expect(resolveAIReviewQuestion(w,"sample-interview","c","accepted").questions).toHaveLength(3);
  });
  it("closes pending relations when the QA is ignored",()=>{
    const w=resolveAIReviewQuestion(reviewingWorkspace(),"sample-interview","c","ignored");
    expect(reviewProgress(w.aiReviews[0].candidates).pending).toBe(0);
    expect(w.questions).toHaveLength(2);
  });
  it("locates only unique exact original text, including offsets after line breaks",()=>{
    expect(sourceMatch("问题\n原文答案\n后文","原文答案")).toEqual({start:3,end:7});
    expect(sourceMatch("原文答案\n原文答案","原文答案")).toBeNull();
    expect(sourceMatch("原文内容","模型改写")).toBeNull();
    expect(sourceMatch("原文内容","")).toBeNull();
  });
  it("lists every supported old object and follows real source/experience relations",()=>{
    const w=createDemoWorkspace();
    expect(new Set(knowledgeEntries(w).map(e=>e.kind))).toEqual(new Set(["interview","question","sync","resume"]));
    const related=relatedTargets(w,{kind:"sync",id:"sample-sync"});
    expect(related).toContainEqual({kind:"interview",id:"sample-interview"});
    expect(related).toContainEqual({kind:"question",id:"sample-event-loop"});
    expect(related).toContainEqual({kind:"resume",id:"sample-resume-internship"});
    expect(draftFor(w,{kind:"sync",id:"sample-sync"}).notes).toBe(w.syncBlocks[0].reviewNotes);
  });
  it("retains raw-only drafts and extraction errors in the actionable queue",()=>{
    const w=createDemoWorkspace();
    w.interviews[0].status="pending";
    expect(actionableTasks(w)[0].state).toBe("原文已保存 · 开始整理");
    w.interviews[0].extractionTask={id:"t",status:"failed",updatedAt:"2026-11-11T01:00:00Z",error:"模型失败"};
    expect(actionableTasks(w)[0].state).toContain("可重试");
  });
});
