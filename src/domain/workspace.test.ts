import { describe, expect, it } from "vitest";
import type { SyncBlock, Workspace } from "./types";
import {
  addMockInterview,
  addQuestion,
  addResumeExperience,
  addStandaloneQuestion,
  addSyncBlock,
  appendMockInterviewMessage,
  applyMockInterviewAnalysis,
  completeInterviewAIReview,
  deleteResumeExperience,
  emptyWorkspace,
  endMockInterview,
  getRandomQuestion,
  getRecommendedSyncBlocks,
  linkQuestionToSyncBlock,
  resolveAIReviewCandidate,
  saveInterviewAIReview,
  sortSyncBlocksByLinkedQuestionCount,
  updateResumeExperience,
  updateInterview,
  updateQuestion,
} from "./workspace";

const baseWorkspace = (): Workspace => ({
  ...emptyWorkspace(),
  interviews: [
    {
      id: "interview-1",
      company: "示例公司",
      role: "产品经理",
      round: "一面",
      date: "2026-09-30",
      source: "测试",
      rawText: "测试原文",
      status: "draft",
      questionIds: [],
      createdAt: "2026-09-30T00:00:00.000Z",
      updatedAt: "2026-09-30T00:00:00.000Z",
    },
  ],
});

describe("workspace domain", () => {
  it("adds a question to its source interview and marks the interview pending", () => {
    const result = addQuestion(baseWorkspace(), "interview-1", {
      title: "如何定义成功？",
      answer: "",
      tags: ["产品"],
    });

    expect(result.workspace.questions).toHaveLength(1);
    expect(result.workspace.interviews[0]?.questionIds).toEqual([
      result.question.id,
    ]);
    expect(result.workspace.interviews[0]?.status).toBe("pending");
    expect(result.question).not.toHaveProperty("originalQuestion");
  });

  it("updates a locally saved interview draft without losing its relationships", () => {
    const workspace = addQuestion(baseWorkspace(), "interview-1", {
      title: "原问题",
      answer: "",
      tags: [],
    }).workspace;
    const result = updateInterview(workspace, "interview-1", {
      company: "更新后的公司",
      role: "前端工程师",
      round: "二面",
      date: "2026-10-01",
      source: "粘贴导入",
      rawText: "更新后的原文",
    });

    expect(result.interview.company).toBe("更新后的公司");
    expect(result.interview.questionIds).toEqual([
      workspace.questions[0]?.id,
    ]);
  });

  it("creates a standalone atomic question without inventing a source interview", () => {
    const result = addStandaloneQuestion(emptyWorkspace(), {
      title: "如何进行项目复盘？",
      answer: "从目标、过程、结果和改进四部分展开。",
      tags: ["复盘"],
    });

    expect(result.workspace.questions).toHaveLength(1);
    expect(result.question.sourceInterviewIds).toEqual([]);
    expect(result.question.title).toBe("如何进行项目复盘？");
    expect(result.question).not.toHaveProperty("originalQuestion");
  });

  it("updates an atomic question without changing its relationships", () => {
    const created = addQuestion(baseWorkspace(), "interview-1", {
      title: "原问题",
      answer: "原答案",
      notes: "",
      tags: ["产品"],
    });
    const result = updateQuestion(created.workspace, created.question.id, {
      title: "更新后的问题",
      answer: "更新后的答案",
      notes: "下次补充案例。",
      tags: created.question.tags,
    });

    expect(result.question.title).toBe("更新后的问题");
    expect(result.question.notes).toBe("下次补充案例。");
    expect(result.question.sourceInterviewIds).toEqual(["interview-1"]);
    expect(result.workspace.interviews[0]?.questionIds).toEqual([
      created.question.id,
    ]);
  });

  it("creates, updates, and deletes a resume experience with valid links", () => {
    const withQuestion = addQuestion(baseWorkspace(), "interview-1", {
      title: "如何定义成功？",
      answer: "",
      tags: [],
    }).workspace;
    const withSync = addSyncBlock(withQuestion, {
      title: "成功标准",
      body: "目标、指标和约束。",
      reviewNotes: "",
      questionIds: [],
      resumeExperienceIds: [],
    }).workspace;
    const created = addResumeExperience(withSync, {
      type: "项目",
      title: "增长平台",
      organization: "示例公司",
      period: "2025 → 2026",
      bullets: ["负责性能治理"],
      linkedQuestionIds: [withSync.questions[0]!.id, "missing-question"],
      linkedSyncBlockIds: [withSync.syncBlocks[0]!.id, "missing-sync"],
    });

    expect(created.experience.linkedQuestionIds).toEqual([
      withSync.questions[0]!.id,
    ]);
    expect(created.experience.linkedSyncBlockIds).toEqual([
      withSync.syncBlocks[0]!.id,
    ]);

    const updated = updateResumeExperience(
      created.workspace,
      created.experience.id,
      {
        ...created.experience,
        bullets: ["负责性能治理", "核心指标提升 30%"],
      },
    );
    expect(updated.experience.bullets).toHaveLength(2);
    expect(
      deleteResumeExperience(updated.workspace, created.experience.id)
        .resumeExperiences,
    ).toHaveLength(0);
  });

  it("selects an atomic question using the supplied random value", () => {
    const first = addStandaloneQuestion(emptyWorkspace(), {
      title: "第一个问题",
      answer: "",
      tags: [],
    }).workspace;
    const second = addStandaloneQuestion(first, {
      title: "第二个问题",
      answer: "",
      tags: [],
    }).workspace;

    expect(getRandomQuestion(second.questions, () => 0)?.title).toBe(
      "第二个问题",
    );
    expect(getRandomQuestion(second.questions, () => 0.999)?.title).toBe(
      "第一个问题",
    );
    expect(getRandomQuestion([], () => 0)).toBeNull();
  });

  it("moves selected questions to a new sync block without deleting the old block", () => {
    const withQuestion = addQuestion(baseWorkspace(), "interview-1", {
      title: "如何定义成功？",
      answer: "先定义目标。",
      tags: [],
    }).workspace;
    const first = addSyncBlock(withQuestion, {
      title: "成功标准",
      body: "目标、指标、约束。",
      reviewNotes: "",
      questionIds: [withQuestion.questions[0]!.id],
      resumeExperienceIds: [],
    }).workspace;
    const second = addSyncBlock(first, {
      title: "成功标准新版",
      body: "目标、指标、约束和复盘。",
      reviewNotes: "",
      questionIds: [withQuestion.questions[0]!.id],
      resumeExperienceIds: [],
    }).workspace;

    expect(second.syncBlocks).toHaveLength(2);
    expect(second.syncBlocks[1]?.linkedQuestionIds).toEqual([]);
    expect(second.questions[0]?.linkedSyncBlockId).toBe(
      second.syncBlocks[0]?.id,
    );
  });

  it("links selected resume experiences when creating a sync block", () => {
    const first = addResumeExperience(baseWorkspace(), {
      type: "实习",
      title: "增长平台",
      organization: "示例公司",
      period: "2026",
      bullets: ["负责策略设计"],
      linkedQuestionIds: [],
      linkedSyncBlockIds: [],
    });
    const second = addResumeExperience(first.workspace, {
      type: "项目",
      title: "个人项目",
      organization: "",
      period: "2026",
      bullets: ["完成产品验证"],
      linkedQuestionIds: [],
      linkedSyncBlockIds: [],
    });
    const result = addSyncBlock(second.workspace, {
      title: "策略设计",
      body: "围绕目标、方案和结果展开。",
      reviewNotes: "",
      questionIds: [],
      resumeExperienceIds: [first.experience.id],
    });

    expect(
      result.workspace.resumeExperiences.find(
        (experience) => experience.id === first.experience.id,
      )?.linkedSyncBlockIds,
    ).toEqual([result.syncBlock.id]);
    expect(
      result.workspace.resumeExperiences.find(
        (experience) => experience.id === second.experience.id,
      )?.linkedSyncBlockIds,
    ).toEqual([]);
  });

  it("links an imported question only after an explicit sync selection", () => {
    const withQuestion = addQuestion(baseWorkspace(), "interview-1", {
      title: "如何定义成功？",
      answer: "",
      tags: [],
    }).workspace;
    const withSync = addSyncBlock(withQuestion, {
      title: "成功标准",
      body: "目标、指标和约束。",
      reviewNotes: "",
      questionIds: [],
      resumeExperienceIds: [],
    }).workspace;
    const questionId = withSync.questions[0]!.id;
    const syncBlockId = withSync.syncBlocks[0]!.id;
    const linked = linkQuestionToSyncBlock(
      withSync,
      questionId,
      syncBlockId,
    );

    expect(linked.questions[0]?.linkedSyncBlockId).toBe(syncBlockId);
    expect(linked.syncBlocks[0]?.linkedQuestionIds).toEqual([questionId]);
  });

  it("persists AI candidates without adding them to the question library", () => {
    const workspace = saveInterviewAIReview(baseWorkspace(), "interview-1", [
      {
        title: "如何定义成功？",
        answer: "先对齐目标。",
        tags: ["产品"],
        sourceExcerpt: "面试官问如何定义成功",
        suggestedSyncBlockId: null,
        matchReason: "",
      },
    ]);

    expect(workspace.questions).toHaveLength(0);
    expect(workspace.aiReviews[0]?.candidates).toHaveLength(1);
    expect(workspace.aiReviews[0]?.candidates[0]?.decision).toBe("pending");
    expect(workspace.interviews[0]?.status).toBe("pending");
  });

  it("marks an interview reviewed only after every AI candidate is handled", () => {
    const pending = saveInterviewAIReview(baseWorkspace(), "interview-1", [
      {
        title: "第一个问题",
        answer: "回答一",
        tags: [],
        sourceExcerpt: "原文一",
        suggestedSyncBlockId: null,
        matchReason: "",
      },
      {
        title: "第二个问题",
        answer: "",
        tags: [],
        sourceExcerpt: "原文二",
        suggestedSyncBlockId: null,
        matchReason: "",
      },
    ]);
    const review = pending.aiReviews[0]!;
    const accepted = resolveAIReviewCandidate(
      pending,
      "interview-1",
      review.candidates[0]!.id,
      "accepted",
    );

    expect(accepted.questions).toHaveLength(1);
    expect(accepted.interviews[0]?.status).toBe("pending");

    const completed = resolveAIReviewCandidate(
      accepted,
      "interview-1",
      review.candidates[1]!.id,
      "ignored",
    );
    expect(completed.questions).toHaveLength(1);
    expect(completed.interviews[0]?.status).toBe("reviewed");
  });

  it("completes immediate AI review with explicit sync links only", () => {
    const withSync = addSyncBlock(baseWorkspace(), {
      title: "成功标准",
      body: "目标、指标和约束。",
      reviewNotes: "",
      questionIds: [],
      resumeExperienceIds: [],
    }).workspace;
    const syncBlockId = withSync.syncBlocks[0]!.id;
    const completed = completeInterviewAIReview(
      withSync,
      "interview-1",
      [
        {
          title: "如何定义成功？",
          answer: "先定义目标。",
          tags: [],
          sourceExcerpt: "原文",
          suggestedSyncBlockId: syncBlockId,
          matchReason: "主题一致",
          selected: true,
          connectToSuggested: true,
        },
        {
          title: "不应保存的问题",
          answer: "",
          tags: [],
          sourceExcerpt: "原文",
          suggestedSyncBlockId: null,
          matchReason: "",
          selected: false,
        },
      ],
    );

    expect(completed.interviews[0]?.status).toBe("reviewed");
    expect(completed.questions).toHaveLength(1);
    expect(completed.questions[0]?.linkedSyncBlockId).toBe(syncBlockId);
    expect(completed.aiReviews[0]?.candidates[1]?.decision).toBe("ignored");
  });

  it("saves a completed mock interview before AI analysis", () => {
    const created = addMockInterview(baseWorkspace(), {
      company: "示例公司",
      role: "产品经理",
      round: "二面",
      jobDescription: "负责 AI 产品策略",
      additionalInfo: "",
      interviewerPrompt: "严格追问事实",
      targetQuestionCount: 8,
    });
    const withQuestion = appendMockInterviewMessage(
      created.workspace,
      created.session.id,
      "interviewer",
      "请介绍一次你负责的 AI 产品决策。",
    );
    const withAnswer = appendMockInterviewMessage(
      withQuestion.workspace,
      created.session.id,
      "candidate",
      "我负责过评测闭环，并用线上指标验证策略。",
    );
    const ended = endMockInterview(
      withAnswer.workspace,
      created.session.id,
      "user",
      "用户主动结束",
    );

    expect(ended.session.status).toBe("completed");
    expect(ended.session.feedback).toBeNull();
    expect(ended.interview).toMatchObject({
      simulated: true,
      source: "AI 模拟面试",
      status: "pending",
      questionIds: [],
    });
    expect(ended.interview.rawText).toContain("候选人：我负责过评测闭环");
  });

  it("adds analyzed mock questions without a simulation marker on questions", () => {
    const created = addMockInterview(emptyWorkspace(), {
      company: "示例公司",
      role: "产品经理",
      round: "",
      jobDescription: "",
      additionalInfo: "",
      interviewerPrompt: "逐层追问",
      targetQuestionCount: 6,
    });
    const withQuestion = appendMockInterviewMessage(
      created.workspace,
      created.session.id,
      "interviewer",
      "你如何设计评测指标？",
    );
    const withAnswer = appendMockInterviewMessage(
      withQuestion.workspace,
      created.session.id,
      "candidate",
      "我会先定义业务目标，再拆成过程和结果指标。",
    );
    const ended = endMockInterview(
      withAnswer.workspace,
      created.session.id,
      "ai",
      "信息已足够",
    );
    const analyzed = applyMockInterviewAnalysis(
      ended.workspace,
      created.session.id,
      {
        summary: "回答结构清晰",
        overallAssessment: "能够连接业务目标与评测指标。",
        strengths: [],
        improvements: [],
        nextSteps: ["补充具体指标数值"],
        questionReviews: [],
        generatedAt: "2026-10-01T00:00:00.000Z",
      },
      [
        {
          title: "你如何设计评测指标？",
          answer: "我会先定义业务目标，再拆成过程和结果指标。",
          tags: ["产品评测"],
          sourceExcerpt: "我会先定义业务目标",
        },
      ],
    );

    expect(analyzed.workspace.interviews[0]?.status).toBe("reviewed");
    expect(analyzed.workspace.interviews[0]?.questionIds).toHaveLength(1);
    expect(analyzed.workspace.questions[0]).toMatchObject({
      title: "你如何设计评测指标？",
      notes: "",
      sourceInterviewIds: [ended.interview.id],
    });
    expect(analyzed.workspace.questions[0]).not.toHaveProperty("simulated");
  });

  it("sorts sync blocks by linked question count without changing the source order", () => {
    const makeSyncBlock = (id: string, questionCount: number): SyncBlock => ({
      id,
      title: id,
      body: id,
      reviewNotes: "",
      linkedQuestionIds: Array.from(
        { length: questionCount },
        (_, index) => `${id}-question-${index}`,
      ),
      pinned: false,
      hidden: false,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    });
    const syncBlocks = [
      makeSyncBlock("first", 1),
      makeSyncBlock("most-linked", 3),
      makeSyncBlock("same-count", 1),
      makeSyncBlock("unlinked", 0),
    ];

    expect(
      sortSyncBlocksByLinkedQuestionCount(syncBlocks).map((item) => item.id),
    ).toEqual(["most-linked", "first", "same-count", "unlinked"]);
    expect(syncBlocks.map((item) => item.id)).toEqual([
      "first",
      "most-linked",
      "same-count",
      "unlinked",
    ]);
  });

  it("prioritizes pinned blocks and excludes hidden or reviewed-today blocks", () => {
    const now = new Date().toISOString();
    const workspace: Workspace = {
      ...emptyWorkspace(),
      syncBlocks: [
        {
          id: "normal",
          title: "普通",
          body: "普通",
          reviewNotes: "",
          linkedQuestionIds: ["q1", "q2"],
          pinned: false,
          hidden: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "pinned",
          title: "置顶",
          body: "置顶",
          reviewNotes: "",
          linkedQuestionIds: [],
          pinned: true,
          hidden: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "hidden",
          title: "隐藏",
          body: "隐藏",
          reviewNotes: "",
          linkedQuestionIds: ["q1", "q2", "q3"],
          pinned: true,
          hidden: true,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "reviewed",
          title: "今天已复习",
          body: "今天已复习",
          reviewNotes: "",
          linkedQuestionIds: ["q1"],
          pinned: false,
          hidden: false,
          createdAt: now,
          updatedAt: now,
        },
      ],
      reviewEvents: [
        {
          id: "event-1",
          syncBlockId: "reviewed",
          result: "remembered",
          reviewedAt: now,
          nextReviewAt: null,
        },
      ],
    };

    expect(getRecommendedSyncBlocks(workspace).map((item) => item.id)).toEqual([
      "pinned",
      "normal",
    ]);
  });
});
