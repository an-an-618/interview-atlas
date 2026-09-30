import { describe, expect, it } from "vitest";
import { createDemoWorkspace } from "./demo";
import type { WorkspaceExport } from "../domain/types";
import {
  addMockInterview,
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
    formatVersion: 5,
    exportedAt: "2026-10-01T00:00:00.000Z",
    ...createDemoWorkspace(),
  };
}

function serialize(value: unknown): string {
  return JSON.stringify(value);
}

describe("workspace backup import", () => {
  it("parses a version 5 export and preserves all relationship-bearing data", () => {
    const backup = createBackup();
    const parsed = parseWorkspaceExport(serialize(backup));

    expect(parsed).toEqual({
      formatVersion: 5,
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
      formatVersion: 5,
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
    questions.forEach((question) => {
      delete question.notes;
      question.originalQuestion = question.title;
    });

    const parsed = parseWorkspaceExport(serialize(legacy));

    expect(parsed.formatVersion).toBe(1);
    expect(parsed.workspace.aiReviews).toEqual([]);
    expect(parsed.workspace.questions[0]?.notes).toBe("");
    expect(parsed.workspace.questions[0]).not.toHaveProperty(
      "originalQuestion",
    );
  });

  it("rejects invalid JSON and unsupported versions", () => {
    expect(() => parseWorkspaceExport("{")).toThrow(WorkspaceImportError);
    expect(() =>
      parseWorkspaceExport(
        serialize({ ...createBackup(), formatVersion: 6 }),
      ),
    ).toThrow("当前支持版本 1 至 5");
  });

  it("rejects missing fields before data reaches the repository", () => {
    const backup = createBackup() as unknown as Record<string, unknown>;
    delete backup.questions;

    expect(() => parseWorkspaceExport(serialize(backup))).toThrow(
      "根节点.questions 应为数组",
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
