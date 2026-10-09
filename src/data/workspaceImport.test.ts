import { describe, expect, it } from "vitest";
import { createDemoWorkspace } from "./demo";
import type { WorkspaceExport } from "../domain/types";
import {
  addMockInterview,
  addInterviewOrganization,
  appendMockInterviewMessage,
  applyMockInterviewAnalysis,
  endMockInterview,
} from "../domain/workspace";
import {
  parseWorkspaceExport,
  WorkspaceImportError,
} from "./workspaceImport";

function createBackup(): WorkspaceExport {
  return {
    formatVersion: 10,
    exportedAt: "2026-10-01T00:00:00.000Z",
    ...createDemoWorkspace(),
  };
}

function serialize(value: unknown): string {
  return JSON.stringify(value);
}

describe("workspace backup import", () => {
  it("parses a version 10 export and preserves relationships and favorites", () => {
    const backup = createBackup();
    const parsed = parseWorkspaceExport(serialize(backup));

    expect(parsed).toEqual({
      formatVersion: 10,
      exportedAt: backup.exportedAt,
      workspace: createDemoWorkspace(),
    });
    expect(parsed.workspace.interviews[0]?.questionIds).toEqual([
      "sample-event-loop",
      "sample-collaboration",
    ]);
    expect(parsed.workspace.syncBlocks[0]?.linkedQuestionIds).toEqual([
      "sample-event-loop",
    ]);
    expect(parsed.workspace.syncBlocks[0]?.favorite).toBe(true);
  });

  it("round-trips saved interview organizations", () => {
    const organized = addInterviewOrganization(createDemoWorkspace(), {
      title: "按公司整理",
      mode: "company",
      collections: [
        { label: "星河科技", interviewIds: ["sample-interview"] },
      ],
    });
    const backup: WorkspaceExport = {
      formatVersion: 10,
      exportedAt: "2026-10-02T00:00:00.000Z",
      ...organized.workspace,
    };

    const parsed = parseWorkspaceExport(serialize(backup));
    expect(parsed.workspace.interviewOrganizations).toEqual(
      organized.workspace.interviewOrganizations,
    );
  });

  it("drops unknown top-level fields such as credentials", () => {
    const parsed = parseWorkspaceExport(
      serialize({
        ...createBackup(),
        apiKey: "must-not-be-imported",
        preferences: [{ key: "ai-provider", value: "custom" }],
      }),
    ) as unknown as Record<string, unknown>;

    expect(parsed.apiKey).toBeUndefined();
    expect(parsed.preferences).toBeUndefined();
  });

  it("round-trips completed mock interview relationships", () => {
    const created = addMockInterview(createDemoWorkspace(), {
      company: "星河科技",
      role: "前端工程师",
      round: "三面",
      jobDescription: "",
      additionalInfo: "",
      interviewerPrompt: "逐层追问",
      targetQuestionCount: 6,
    });
    const withQuestion = appendMockInterviewMessage(
      created.workspace,
      created.session.id,
      "interviewer",
      "你如何治理首屏性能？",
    );
    const withAnswer = appendMockInterviewMessage(
      withQuestion.workspace,
      created.session.id,
      "candidate",
      "先测量 LCP，再定位资源和渲染瓶颈。",
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
        summary: "能够说明性能治理路径",
        overallAssessment: "回答有明确步骤。",
        strengths: [],
        improvements: [],
        nextSteps: [],
        questionReviews: [],
        generatedAt: "2026-10-01T00:00:00.000Z",
      },
      [
        {
          title: "你如何治理首屏性能？",
          answer: "先测量 LCP，再定位资源和渲染瓶颈。",
          tags: ["性能"],
          sourceExcerpt: "先测量 LCP",
        },
      ],
    );
    const backup: WorkspaceExport = {
      formatVersion: 10,
      exportedAt: "2026-10-01T00:00:00.000Z",
      ...analyzed.workspace,
    };

    const parsed = parseWorkspaceExport(serialize(backup));
    expect(parsed.workspace.mockInterviews[0]?.interviewId).toBe(
      ended.interview.id,
    );
    expect(parsed.workspace.mockInterviews[0]?.questionIds).toEqual(
      analyzed.session.questionIds,
    );
  });

  it("migrates legacy version 1 exports to the current workspace shape", () => {
    const legacy = createBackup() as unknown as Record<string, unknown>;
    legacy.formatVersion = 1;
    delete legacy.aiReviews;
    const questions = legacy.questions as Array<Record<string, unknown>>;
    const syncBlocks = legacy.syncBlocks as Array<Record<string, unknown>>;
    questions.forEach((question) => {
      delete question.notes;
      question.originalQuestion = question.title;
    });
    syncBlocks.forEach((syncBlock) => {
      delete syncBlock.favorite;
    });

    const parsed = parseWorkspaceExport(serialize(legacy));

    expect(parsed.formatVersion).toBe(1);
    expect(parsed.workspace.aiReviews).toEqual([]);
    expect(parsed.workspace.interviewOrganizations).toEqual([]);
    expect(parsed.workspace.questions[0]?.notes).toBe("");
    expect(parsed.workspace.syncBlocks[0]?.favorite).toBe(false);
    expect(parsed.workspace.questions[0]).not.toHaveProperty(
      "originalQuestion",
    );
  });

  it("reflows pre-v8 answer paragraphs without changing their text", () => {
    const legacy = createBackup() as unknown as Record<string, unknown>;
    legacy.formatVersion = 7;
    const questions = legacy.questions as Array<Record<string, unknown>>;
    const answer =
      "我先确认业务目标和用户范围，再明确成功指标。接着梳理现有链路，定位影响最大的环节。方案落地后会设计对照实验，观察转化率、留存和负向反馈。最后结合定量结果与用户访谈复盘，决定继续迭代还是回滚。";
    questions[0]!.answer = answer;

    const parsed = parseWorkspaceExport(serialize(legacy));
    const migrated = parsed.workspace.questions[0]!.answer;

    expect(migrated).toContain("\n");
    expect(migrated.replace(/\n/g, "")).toBe(answer);
  });

  it("reflows pre-v9 sync block bodies without changing their text", () => {
    const legacy = createBackup() as unknown as Record<string, unknown>;
    legacy.formatVersion = 8;
    const syncBlocks = legacy.syncBlocks as Array<Record<string, unknown>>;
    const body =
      "我先明确同步块要覆盖的稳定问题和适用边界。接着整理跨面试都成立的核心结论，并保留必要的事实与例子。正文还需要说明方案选择、关键约束和可以复用的判断依据。最后关联原子问答持续校正正文，避免单次回答覆盖稳定知识。";
    syncBlocks[0]!.body = body;

    const parsed = parseWorkspaceExport(serialize(legacy));
    const migrated = parsed.workspace.syncBlocks[0]!.body;

    expect(migrated).toContain("\n");
    expect(migrated.replace(/\n/g, "")).toBe(body);
  });

  it("migrates the coupled v9 AI decision into separate review states", () => {
    const legacy = createBackup() as unknown as Record<string, unknown>;
    legacy.formatVersion = 9;
    legacy.aiReviews = [
      {
        id: "legacy-review",
        interviewId: "sample-interview",
        candidates: [
          {
            id: "legacy-candidate",
            title: "如何解释事件循环？",
            answer: "先解释调用栈。",
            tags: ["JavaScript"],
            sourceExcerpt: "解释一下事件循环",
            suggestedSyncBlockId: "sample-sync",
            matchReason: "主题与范围一致",
            decision: "accepted",
            connectToSuggested: true,
            createdQuestionId: "sample-event-loop",
          },
        ],
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-01T00:00:00.000Z",
      },
    ];

    const candidate =
      parseWorkspaceExport(serialize(legacy)).workspace.aiReviews[0]!
        .candidates[0]!;

    expect(candidate.questionDecision).toBe("accepted");
    expect(candidate.syncDecision).toBe("accepted");
    expect(candidate).not.toHaveProperty("decision");
    expect(candidate).not.toHaveProperty("connectToSuggested");
  });

  it("rejects invalid JSON and unsupported versions", () => {
    expect(() => parseWorkspaceExport("{")).toThrow(WorkspaceImportError);
    expect(() =>
      parseWorkspaceExport(
        serialize({ ...createBackup(), formatVersion: 11 }),
      ),
    ).toThrow("当前支持版本 1 至 10");
  });

  it("rejects missing fields before data reaches the repository", () => {
    const backup = createBackup() as unknown as Record<string, unknown>;
    delete backup.questions;

    expect(() => parseWorkspaceExport(serialize(backup))).toThrow(
      "根节点.questions 应为数组",
    );
  });

  it("requires favorite state in current sync blocks", () => {
    const backup = createBackup() as unknown as Record<string, unknown>;
    const syncBlocks = backup.syncBlocks as Array<Record<string, unknown>>;
    delete syncBlocks[0]!.favorite;

    expect(() => parseWorkspaceExport(serialize(backup))).toThrow(
      "syncBlocks[0].favorite 应为布尔值",
    );
  });

  it("rejects orphaned references", () => {
    const backup = createBackup();
    backup.resumeExperiences[0]!.linkedQuestionIds.push("missing-question");

    expect(() => parseWorkspaceExport(serialize(backup))).toThrow(
      '引用了不存在的 ID "missing-question"',
    );
  });

  it("rejects relationships that disagree on their two sides", () => {
    const backup = createBackup();
    backup.syncBlocks[0]!.linkedQuestionIds = [];

    expect(() => parseWorkspaceExport(serialize(backup))).toThrow(
      "问答关系不一致",
    );
  });

  it("rejects duplicate object IDs", () => {
    const backup = createBackup();
    backup.questions.push({ ...backup.questions[0]! });

    expect(() => parseWorkspaceExport(serialize(backup))).toThrow(
      'questions 包含重复 ID "sample-event-loop"',
    );
  });
});
