import { describe, expect, it } from "vitest";
import {
  addInterview, addInterviewOrganization, addQuestion, addStandaloneQuestion, addSyncBlock,
  addResumeExperience, addMockInterview, endMockInterview,
  saveInterviewAIReview, resolveAIReviewQuestion, deleteInterview,
  emptyWorkspace, updateInterview, updateQuestion,
} from "./workspace";
import { applyExtractionTask } from "./extractionTasks";

function fixture() {
  const source = addInterview(emptyWorkspace(), {
    company: "示例公司", role: "产品经理", round: "一面",
    date: "2026-10-01", source: "测试", rawText: "原始证据",
  });
  const other = addInterview(source.workspace, { ...source.interview, company: "其他公司" });
  const organized = addInterviewOrganization(other.workspace, {
    title: "按公司整理",
    mode: "company",
    collections: [
      { label: "示例公司", interviewIds: [source.interview.id] },
      { label: "其他公司", interviewIds: [other.interview.id] },
    ],
  });
  const reviewed = saveInterviewAIReview(organized.workspace, source.interview.id, [{
    title: "原问题", answer: "原回答", tags: ["产品"], sourceExcerpt: "原始证据",
    suggestedSyncBlockId: null, matchReason: "",
  }]);
  const review = reviewed.aiReviews[0]!;
  const accepted = resolveAIReviewQuestion(reviewed, source.interview.id, review.candidates[0]!.id, "accepted");
  const question = accepted.questions[0]!;
  const independent = addStandaloneQuestion(accepted, { title: "独立问题", answer: "保留", tags: [] });
  const sync = addSyncBlock(independent.workspace, {
    title: "同步块", body: "稳定回答", reviewNotes: "复习笔记",
    questionIds: [question.id, independent.question.id], resumeExperienceIds: [],
  });
  const resume = addResumeExperience(sync.workspace, {
    type: "项目", title: "示例项目", organization: "示例组织", period: "2026",
    bullets: ["应保留正文"], linkedQuestionIds: [question.id, independent.question.id],
    linkedSyncBlockIds: [sync.syncBlock.id],
  });
  return { workspace: resume.workspace, interview: source.interview, other: other.interview, question, independent: independent.question };
}

describe("interview lifecycle", () => {
  it("updates shared question data while preserving evidence and related content", () => {
    const f = fixture();
    const renamed = updateInterview(f.workspace, f.interview.id, { ...f.interview, company: "新公司", role: "新岗位" });
    const edited = updateQuestion(renamed.workspace, f.question.id, {
      title: "修改后的问题", answer: "修改后的答案", notes: "新笔记", tags: ["新标签"],
    }).workspace;
    const interview = edited.interviews.find((item) => item.id === f.interview.id)!;
    expect(interview.company).toBe("新公司");
    expect(interview.rawText).toBe("原始证据");
    expect(edited.questions.find((item) => interview.questionIds.includes(item.id))).toMatchObject({
      id: f.question.id, title: "修改后的问题", answer: "修改后的答案", notes: "新笔记", tags: ["新标签"],
    });
    expect(edited.syncBlocks).toEqual(f.workspace.syncBlocks);
    expect(edited.resumeExperiences).toEqual(f.workspace.resumeExperiences);
    expect(edited.questions).toHaveLength(2);
  });

  it("permanently removes owned entities and cleans references, preserving unrelated content", () => {
    const f = fixture();
    // Legacy data can refer to a question from both sides, or from just one side.
    const oneSided = addQuestion(f.workspace, f.interview.id, { title: "旧数据", answer: "", tags: [] });
    oneSided.workspace.interviews.find((item) => item.id === f.interview.id)!.questionIds = [f.question.id];
    oneSided.workspace.interviews.find((item) => item.id === f.other.id)!.questionIds = [f.question.id];
    const result = deleteInterview(oneSided.workspace, f.interview.id);
    expect(result.interviews.map((item) => item.id)).toEqual([f.other.id]);
    expect(result.interviewOrganizations[0]!.collections).toMatchObject([
      { label: "其他公司", interviewIds: [f.other.id] },
    ]);
    expect(result.interviews[0]!.questionIds).toEqual([]);
    expect(result.questions).toEqual(f.workspace.questions.filter((item) => item.id === f.independent.id));
    expect(result.aiReviews).toEqual([]);
    expect(result.syncBlocks[0]).toMatchObject({
      body: "稳定回答", reviewNotes: "复习笔记", linkedQuestionIds: [f.independent.id],
    });
    expect(result.resumeExperiences[0]).toMatchObject({
      bullets: ["应保留正文"], linkedQuestionIds: [f.independent.id],
      linkedSyncBlockIds: f.workspace.resumeExperiences[0]!.linkedSyncBlockIds,
    });
    expect(result.reviewEvents).toBe(f.workspace.reviewEvents);
    expect(oneSided.workspace.questions).toHaveLength(3);
    expect(applyExtractionTask(result, f.interview.id, f.interview.rawText, {
      id: "late-task", status: "completed", updatedAt: new Date().toISOString(),
    }, [])).toBeNull();
  });

  it("keeps empty sync blocks and resume experiences after deleting their only linked question", () => {
    const f = fixture();
    f.workspace.syncBlocks[0]!.linkedQuestionIds = [f.question.id];
    f.workspace.resumeExperiences[0]!.linkedQuestionIds = [f.question.id];
    const result = deleteInterview(f.workspace, f.interview.id);
    expect(result.syncBlocks).toHaveLength(1);
    expect(result.syncBlocks[0]!.linkedQuestionIds).toEqual([]);
    expect(result.resumeExperiences).toHaveLength(1);
    expect(result.resumeExperiences[0]!.linkedQuestionIds).toEqual([]);
  });

  it("clears mock interview references without deleting its conversation", () => {
    const created = addMockInterview(emptyWorkspace(), {
      company: "示例公司", role: "产品", round: "一面", jobDescription: "",
      additionalInfo: "", interviewerPrompt: "", targetQuestionCount: 3,
    });
    const ended = endMockInterview(created.workspace, created.session.id, "user", "结束");
    const added = addQuestion(ended.workspace, ended.interview.id, { title: "模拟问题", answer: "", tags: [] });
    added.workspace.mockInterviews[0]!.questionIds = [added.question.id];
    const result = deleteInterview(added.workspace, ended.interview.id);
    expect(result.mockInterviews[0]).toMatchObject({ id: created.session.id, interviewId: null, questionIds: [] });
    expect(result.mockInterviews[0]!.messages).toEqual(ended.session.messages);
  });

  it("rejects missing records and supports deleting an empty draft", () => {
    expect(() => deleteInterview(emptyWorkspace(), "missing")).toThrow("面试记录不存在");
    const f = fixture();
    const result = deleteInterview(f.workspace, f.other.id);
    expect(result.questions).toEqual(f.workspace.questions);
    expect(result.syncBlocks).toEqual(f.workspace.syncBlocks);
    expect(result.aiReviews).toEqual(f.workspace.aiReviews);
  });
});
