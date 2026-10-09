import type {
  AIReviewCandidate,
  AtomicQuestion,
  Interview,
  InterviewAIReview,
  InterviewOrganization,
  MockInterviewFeedback,
  MockInterviewSession,
  ResumeExperience,
  ReviewEvent,
  SyncBlock,
  Workspace,
} from "../domain/types";
import { formatAnswer, migrateLegacyAnswer } from "../domain/answerFormat";

export const MAX_WORKSPACE_IMPORT_BYTES = 25 * 1024 * 1024;
const supportedFormatVersions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

type JsonRecord = Record<string, unknown>;
type SupportedFormatVersion = (typeof supportedFormatVersions)[number];

export interface ParsedWorkspaceExport {
  formatVersion: SupportedFormatVersion;
  exportedAt: string;
  workspace: Workspace;
}

export class WorkspaceImportError extends Error {
  constructor(message: string) {
    super(`备份文件校验失败：${message}`);
    this.name = "WorkspaceImportError";
  }
}

function fail(path: string, message: string): never {
  throw new WorkspaceImportError(`${path} ${message}`);
}

function readRecord(value: unknown, path: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(path, "应为对象。");
  }
  return value as JsonRecord;
}

function readString(
  record: JsonRecord,
  key: string,
  path: string,
): string {
  const value = record[key];
  if (typeof value !== "string") fail(`${path}.${key}`, "应为文本。");
  return value;
}

function readOptionalString(
  record: JsonRecord,
  key: string,
  path: string,
): string | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") fail(`${path}.${key}`, "应为文本。");
  return value;
}

function readNonEmptyString(
  record: JsonRecord,
  key: string,
  path: string,
): string {
  const value = readString(record, key, path);
  if (!value.trim()) fail(`${path}.${key}`, "不能为空。");
  return value;
}

function readBoolean(
  record: JsonRecord,
  key: string,
  path: string,
): boolean {
  const value = record[key];
  if (typeof value !== "boolean") fail(`${path}.${key}`, "应为布尔值。");
  return value;
}

function readNumber(record: JsonRecord, key: string, path: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${path}.${key}`, "应为数字。");
  }
  return value;
}

function readOptionalBoolean(
  record: JsonRecord,
  key: string,
  path: string,
): boolean | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") fail(`${path}.${key}`, "应为布尔值。");
  return value;
}

function readNullableString(
  record: JsonRecord,
  key: string,
  path: string,
): string | null {
  const value = record[key];
  if (value === null) return null;
  if (typeof value !== "string") {
    fail(`${path}.${key}`, "应为文本或 null。");
  }
  return value;
}

function readStringArray(
  record: JsonRecord,
  key: string,
  path: string,
): string[] {
  const value = record[key];
  if (!Array.isArray(value)) fail(`${path}.${key}`, "应为数组。");
  return value.map((item, index) => {
    if (typeof item !== "string") {
      fail(`${path}.${key}[${index}]`, "应为文本。");
    }
    return item;
  });
}

function readEnum<const T extends readonly string[]>(
  record: JsonRecord,
  key: string,
  values: T,
  path: string,
): T[number] {
  const value = record[key];
  if (typeof value !== "string" || !values.includes(value)) {
    fail(`${path}.${key}`, `应为 ${values.join("、")} 之一。`);
  }
  return value as T[number];
}

function readObjectArray<T>(
  record: JsonRecord,
  key: string,
  path: string,
  parse: (value: JsonRecord, itemPath: string) => T,
): T[] {
  const value = record[key];
  if (!Array.isArray(value)) fail(`${path}.${key}`, "应为数组。");
  return value.map((item, index) =>
    parse(readRecord(item, `${path}.${key}[${index}]`), `${path}.${key}[${index}]`),
  );
}

function readLegacyObjectArray<T>(
  record: JsonRecord,
  key: string,
  path: string,
  parse: (value: JsonRecord, itemPath: string) => T,
): T[] {
  if (record[key] === undefined) return [];
  return readObjectArray(record, key, path, parse);
}

function parseInterview(record: JsonRecord, path: string): Interview {
  const sample = readOptionalBoolean(record, "sample", path);
  const simulated = readOptionalBoolean(record, "simulated", path);
  const mockInterviewId = readOptionalString(record, "mockInterviewId", path);
  return {
    id: readNonEmptyString(record, "id", path),
    company: readString(record, "company", path),
    role: readString(record, "role", path),
    round: readString(record, "round", path),
    date: readString(record, "date", path),
    source: readString(record, "source", path),
    rawText: readString(record, "rawText", path),
    status: readEnum(
      record,
      "status",
      ["draft", "pending", "reviewed", "archived"] as const,
      path,
    ),
    questionIds: readStringArray(record, "questionIds", path),
    createdAt: readString(record, "createdAt", path),
    updatedAt: readString(record, "updatedAt", path),
    ...(sample === undefined ? {} : { sample }),
    ...(simulated === undefined ? {} : { simulated }),
    ...(mockInterviewId === undefined ? {} : { mockInterviewId }),
  };
}

function parseInterviewOrganization(
  record: JsonRecord,
  path: string,
): InterviewOrganization {
  return {
    id: readNonEmptyString(record, "id", path),
    title: readNonEmptyString(record, "title", path),
    mode: readEnum(
      record,
      "mode",
      ["company", "role", "round", "date", "tag", "custom"] as const,
      path,
    ),
    collections: readObjectArray(
      record,
      "collections",
      path,
      (collection, collectionPath) => ({
        id: readNonEmptyString(collection, "id", collectionPath),
        label: readNonEmptyString(collection, "label", collectionPath),
        interviewIds: readStringArray(
          collection,
          "interviewIds",
          collectionPath,
        ),
      }),
    ),
    createdAt: readString(record, "createdAt", path),
    updatedAt: readString(record, "updatedAt", path),
  };
}

function parseQuestion(
  record: JsonRecord,
  path: string,
  formatVersion: SupportedFormatVersion,
): AtomicQuestion {
  const sample = readOptionalBoolean(record, "sample", path);
  const notes =
    formatVersion < 4
      ? (readOptionalString(record, "notes", path) ?? "")
      : readString(record, "notes", path);
  return {
    id: readNonEmptyString(record, "id", path),
    title: readString(record, "title", path),
    answer:
      formatVersion < 8
        ? migrateLegacyAnswer(readString(record, "answer", path))
        : formatAnswer(readString(record, "answer", path)),
    notes,
    tags: readStringArray(record, "tags", path),
    sourceInterviewIds: readStringArray(
      record,
      "sourceInterviewIds",
      path,
    ),
    linkedSyncBlockId: readNullableString(
      record,
      "linkedSyncBlockId",
      path,
    ),
    createdAt: readString(record, "createdAt", path),
    updatedAt: readString(record, "updatedAt", path),
    ...(sample === undefined ? {} : { sample }),
  };
}

function parseSyncBlock(
  record: JsonRecord,
  path: string,
  formatVersion: SupportedFormatVersion,
): SyncBlock {
  const sample = readOptionalBoolean(record, "sample", path);
  return {
    id: readNonEmptyString(record, "id", path),
    title: readString(record, "title", path),
    body:
      formatVersion < 9
        ? migrateLegacyAnswer(readString(record, "body", path))
        : formatAnswer(readString(record, "body", path)),
    reviewNotes: readString(record, "reviewNotes", path),
    linkedQuestionIds: readStringArray(record, "linkedQuestionIds", path),
    favorite:
      formatVersion >= 6
        ? readBoolean(record, "favorite", path)
        : readOptionalBoolean(record, "favorite", path) ?? false,
    pinned: readBoolean(record, "pinned", path),
    hidden: readBoolean(record, "hidden", path),
    createdAt: readString(record, "createdAt", path),
    updatedAt: readString(record, "updatedAt", path),
    ...(sample === undefined ? {} : { sample }),
  };
}

function parseResumeExperience(
  record: JsonRecord,
  path: string,
): ResumeExperience {
  return {
    id: readNonEmptyString(record, "id", path),
    type: readString(record, "type", path),
    title: readString(record, "title", path),
    organization: readString(record, "organization", path),
    period: readString(record, "period", path),
    bullets: readStringArray(record, "bullets", path),
    linkedQuestionIds: readStringArray(record, "linkedQuestionIds", path),
    linkedSyncBlockIds: readStringArray(record, "linkedSyncBlockIds", path),
    createdAt: readString(record, "createdAt", path),
    updatedAt: readString(record, "updatedAt", path),
  };
}

function parseCandidate(
  record: JsonRecord,
  path: string,
  formatVersion: SupportedFormatVersion,
): AIReviewCandidate {
  const suggestedSyncBlockId = readNullableString(
    record,
    "suggestedSyncBlockId",
    path,
  );
  const legacyDecision =
    formatVersion < 10
      ? readEnum(
          record,
          "decision",
          ["pending", "accepted", "ignored"] as const,
          path,
        )
      : null;
  return {
    id: readNonEmptyString(record, "id", path),
    title: readString(record, "title", path),
    answer:
      formatVersion < 8
        ? migrateLegacyAnswer(readString(record, "answer", path))
        : formatAnswer(readString(record, "answer", path)),
    tags: readStringArray(record, "tags", path),
    sourceExcerpt: readString(record, "sourceExcerpt", path),
    suggestedSyncBlockId,
    matchReason: readString(record, "matchReason", path),
    questionDecision:
      formatVersion >= 10
        ? readEnum(
            record,
            "questionDecision",
            ["pending", "accepted", "ignored"] as const,
            path,
          )
        : legacyDecision!,
    syncDecision:
      formatVersion >= 10
        ? readEnum(
            record,
            "syncDecision",
            ["not_suggested", "pending", "accepted", "ignored"] as const,
            path,
          )
        : !suggestedSyncBlockId
          ? "not_suggested"
          : legacyDecision === "pending"
            ? "pending"
            : legacyDecision === "accepted" &&
                readBoolean(record, "connectToSuggested", path)
              ? "accepted"
              : "ignored",
    createdQuestionId: readNullableString(
      record,
      "createdQuestionId",
      path,
    ),
  };
}

function parseAIReview(
  record: JsonRecord,
  path: string,
  formatVersion: SupportedFormatVersion,
): InterviewAIReview {
  return {
    id: readNonEmptyString(record, "id", path),
    interviewId: readNonEmptyString(record, "interviewId", path),
    candidates: readObjectArray(
      record,
      "candidates",
      path,
      (candidate, candidatePath) =>
        parseCandidate(candidate, candidatePath, formatVersion),
    ),
    createdAt: readString(record, "createdAt", path),
    updatedAt: readString(record, "updatedAt", path),
  };
}

function parseReviewEvent(record: JsonRecord, path: string): ReviewEvent {
  return {
    id: readNonEmptyString(record, "id", path),
    syncBlockId: readNonEmptyString(record, "syncBlockId", path),
    result: readEnum(
      record,
      "result",
      ["remembered", "fuzzy", "forgotten", "skipped"] as const,
      path,
    ),
    reviewedAt: readString(record, "reviewedAt", path),
    nextReviewAt: readNullableString(record, "nextReviewAt", path),
  };
}

function parseFeedbackItem(record: JsonRecord, path: string) {
  return {
    title: readString(record, "title", path),
    detail: readString(record, "detail", path),
  };
}

function parseQuestionReview(record: JsonRecord, path: string) {
  return {
    question: readString(record, "question", path),
    assessment: readString(record, "assessment", path),
    evidence: readString(record, "evidence", path),
    suggestion: readString(record, "suggestion", path),
  };
}

function parseMockInterviewFeedback(
  record: JsonRecord,
  path: string,
): MockInterviewFeedback {
  return {
    summary: readString(record, "summary", path),
    overallAssessment: readString(record, "overallAssessment", path),
    strengths: readObjectArray(
      record,
      "strengths",
      path,
      parseFeedbackItem,
    ),
    improvements: readObjectArray(
      record,
      "improvements",
      path,
      parseFeedbackItem,
    ),
    nextSteps: readStringArray(record, "nextSteps", path),
    questionReviews: readObjectArray(
      record,
      "questionReviews",
      path,
      parseQuestionReview,
    ),
    generatedAt: readString(record, "generatedAt", path),
  };
}

function parseMockInterview(
  record: JsonRecord,
  path: string,
): MockInterviewSession {
  const feedbackValue = record.feedback;
  const feedback =
    feedbackValue === null
      ? null
      : parseMockInterviewFeedback(
          readRecord(feedbackValue, `${path}.feedback`),
          `${path}.feedback`,
        );
  const endedByValue = record.endedBy;
  const endedBy =
    endedByValue === null
      ? null
      : readEnum(record, "endedBy", ["ai", "user"] as const, path);

  return {
    id: readNonEmptyString(record, "id", path),
    company: readString(record, "company", path),
    role: readString(record, "role", path),
    round: readString(record, "round", path),
    jobDescription: readString(record, "jobDescription", path),
    additionalInfo: readString(record, "additionalInfo", path),
    interviewerPrompt: readString(record, "interviewerPrompt", path),
    targetQuestionCount: readNumber(record, "targetQuestionCount", path),
    status: readEnum(record, "status", ["active", "completed"] as const, path),
    messages: readObjectArray(record, "messages", path, (message, itemPath) => ({
      id: readNonEmptyString(message, "id", itemPath),
      role: readEnum(
        message,
        "role",
        ["interviewer", "candidate"] as const,
        itemPath,
      ),
      content: readString(message, "content", itemPath),
      createdAt: readString(message, "createdAt", itemPath),
    })),
    startedAt: readString(record, "startedAt", path),
    updatedAt: readString(record, "updatedAt", path),
    endedAt: readNullableString(record, "endedAt", path),
    endedBy,
    endReason: readString(record, "endReason", path),
    interviewId: readNullableString(record, "interviewId", path),
    questionIds: readStringArray(record, "questionIds", path),
    feedback,
  };
}

function assertUnique(values: string[], path: string): void {
  const seen = new Set<string>();
  values.forEach((value) => {
    if (seen.has(value)) fail(path, `包含重复 ID "${value}"。`);
    seen.add(value);
  });
}

function assertReferences(
  values: string[],
  knownIds: Set<string>,
  path: string,
): void {
  assertUnique(values, path);
  values.forEach((value) => {
    if (!knownIds.has(value)) fail(path, `引用了不存在的 ID "${value}"。`);
  });
}

function validateRelationships(workspace: Workspace): void {
  assertUnique(workspace.interviews.map((item) => item.id), "interviews");
  assertUnique(
    workspace.interviewOrganizations.map((item) => item.id),
    "interviewOrganizations",
  );
  assertUnique(workspace.questions.map((item) => item.id), "questions");
  assertUnique(workspace.syncBlocks.map((item) => item.id), "syncBlocks");
  assertUnique(
    workspace.resumeExperiences.map((item) => item.id),
    "resumeExperiences",
  );
  assertUnique(workspace.aiReviews.map((item) => item.id), "aiReviews");
  assertUnique(workspace.reviewEvents.map((item) => item.id), "reviewEvents");
  assertUnique(
    workspace.mockInterviews.map((item) => item.id),
    "mockInterviews",
  );
  assertUnique(
    workspace.aiReviews.map((item) => item.interviewId),
    "aiReviews.interviewId",
  );

  const interviewsById = new Map(
    workspace.interviews.map((item) => [item.id, item]),
  );
  const questionsById = new Map(
    workspace.questions.map((item) => [item.id, item]),
  );
  const syncBlocksById = new Map(
    workspace.syncBlocks.map((item) => [item.id, item]),
  );
  const interviewIds = new Set(interviewsById.keys());
  const questionIds = new Set(questionsById.keys());
  const syncBlockIds = new Set(syncBlocksById.keys());

  workspace.interviews.forEach((interview, index) => {
    const path = `interviews[${index}].questionIds`;
    assertReferences(interview.questionIds, questionIds, path);
    interview.questionIds.forEach((questionId) => {
      const question = questionsById.get(questionId);
      if (!question?.sourceInterviewIds.includes(interview.id)) {
        fail(path, `与原子问答 "${questionId}" 的来源关系不一致。`);
      }
    });
  });

  workspace.interviewOrganizations.forEach((organization, index) => {
    assertUnique(
      organization.collections.map((collection) => collection.id),
      `interviewOrganizations[${index}].collections`,
    );
    organization.collections.forEach((collection, collectionIndex) => {
      assertReferences(
        collection.interviewIds,
        interviewIds,
        `interviewOrganizations[${index}].collections[${collectionIndex}].interviewIds`,
      );
    });
  });

  workspace.questions.forEach((question, index) => {
    const sourcePath = `questions[${index}].sourceInterviewIds`;
    assertReferences(question.sourceInterviewIds, interviewIds, sourcePath);
    question.sourceInterviewIds.forEach((interviewId) => {
      const interview = interviewsById.get(interviewId);
      if (!interview?.questionIds.includes(question.id)) {
        fail(sourcePath, `与面试记录 "${interviewId}" 的问答关系不一致。`);
      }
    });
    if (question.linkedSyncBlockId) {
      const syncBlock = syncBlocksById.get(question.linkedSyncBlockId);
      if (!syncBlock) {
        fail(
          `questions[${index}].linkedSyncBlockId`,
          `引用了不存在的 ID "${question.linkedSyncBlockId}"。`,
        );
      }
      if (!syncBlock.linkedQuestionIds.includes(question.id)) {
        fail(
          `questions[${index}].linkedSyncBlockId`,
          `与同步块 "${syncBlock.id}" 的问答关系不一致。`,
        );
      }
    }
  });

  workspace.syncBlocks.forEach((syncBlock, index) => {
    const path = `syncBlocks[${index}].linkedQuestionIds`;
    assertReferences(syncBlock.linkedQuestionIds, questionIds, path);
    syncBlock.linkedQuestionIds.forEach((questionId) => {
      const question = questionsById.get(questionId);
      if (question?.linkedSyncBlockId !== syncBlock.id) {
        fail(path, `与原子问答 "${questionId}" 的同步块关系不一致。`);
      }
    });
  });

  workspace.resumeExperiences.forEach((experience, index) => {
    assertReferences(
      experience.linkedQuestionIds,
      questionIds,
      `resumeExperiences[${index}].linkedQuestionIds`,
    );
    assertReferences(
      experience.linkedSyncBlockIds,
      syncBlockIds,
      `resumeExperiences[${index}].linkedSyncBlockIds`,
    );
  });

  workspace.aiReviews.forEach((review, reviewIndex) => {
    if (!interviewIds.has(review.interviewId)) {
      fail(
        `aiReviews[${reviewIndex}].interviewId`,
        `引用了不存在的 ID "${review.interviewId}"。`,
      );
    }
    assertUnique(
      review.candidates.map((candidate) => candidate.id),
      `aiReviews[${reviewIndex}].candidates`,
    );
    review.candidates.forEach((candidate, candidateIndex) => {
      const path = `aiReviews[${reviewIndex}].candidates[${candidateIndex}]`;
      if (
        candidate.suggestedSyncBlockId &&
        !syncBlockIds.has(candidate.suggestedSyncBlockId)
      ) {
        fail(
          `${path}.suggestedSyncBlockId`,
          `引用了不存在的 ID "${candidate.suggestedSyncBlockId}"。`,
        );
      }
      if (
        candidate.createdQuestionId &&
        !questionIds.has(candidate.createdQuestionId)
      ) {
        fail(
          `${path}.createdQuestionId`,
          `引用了不存在的 ID "${candidate.createdQuestionId}"。`,
        );
      }
      if (
        (candidate.suggestedSyncBlockId === null) !==
        (candidate.syncDecision === "not_suggested")
      ) {
        fail(`${path}.syncDecision`, "与同步块建议状态不一致。");
      }
      if (
        candidate.syncDecision === "accepted" &&
        candidate.questionDecision !== "accepted"
      ) {
        fail(`${path}.syncDecision`, "采纳关联前必须先采纳原子问答。");
      }
      if (
        candidate.questionDecision === "ignored" &&
        candidate.syncDecision !== "ignored" &&
        candidate.syncDecision !== "not_suggested"
      ) {
        fail(`${path}.syncDecision`, "忽略问答后不能保留待处理关联。");
      }
      if (
        (candidate.questionDecision === "accepted") !==
        Boolean(candidate.createdQuestionId)
      ) {
        fail(`${path}.createdQuestionId`, "与原子问答采纳状态不一致。");
      }
    });
  });

  workspace.reviewEvents.forEach((event, index) => {
    if (!syncBlockIds.has(event.syncBlockId)) {
      fail(
        `reviewEvents[${index}].syncBlockId`,
        `引用了不存在的 ID "${event.syncBlockId}"。`,
      );
    }
  });

  workspace.mockInterviews.forEach((session, index) => {
    assertUnique(
      session.messages.map((message) => message.id),
      `mockInterviews[${index}].messages`,
    );
    assertReferences(
      session.questionIds,
      questionIds,
      `mockInterviews[${index}].questionIds`,
    );
    if (session.interviewId && !interviewIds.has(session.interviewId)) {
      fail(
        `mockInterviews[${index}].interviewId`,
        `引用了不存在的 ID "${session.interviewId}"。`,
      );
    }
    if (session.interviewId) {
      const interview = interviewsById.get(session.interviewId);
      if (interview?.mockInterviewId !== session.id) {
        fail(
          `mockInterviews[${index}].interviewId`,
          `与面试记录 "${session.interviewId}" 的模拟面试关系不一致。`,
        );
      }
      if (
        session.questionIds.some(
          (questionId) => !interview.questionIds.includes(questionId),
        )
      ) {
        fail(
          `mockInterviews[${index}].questionIds`,
          `与面试记录 "${session.interviewId}" 的问答关系不一致。`,
        );
      }
    }
  });

  workspace.interviews.forEach((interview, index) => {
    if (
      interview.mockInterviewId &&
      !workspace.mockInterviews.some(
        (session) => session.id === interview.mockInterviewId,
      )
    ) {
      fail(
        `interviews[${index}].mockInterviewId`,
        `引用了不存在的 ID "${interview.mockInterviewId}"。`,
      );
    }
  });
}

export function parseWorkspaceExport(text: string): ParsedWorkspaceExport {
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    throw new WorkspaceImportError("文件不是有效的 JSON。");
  }

  const record = readRecord(value, "根节点");
  if (
    typeof record.formatVersion !== "number" ||
    !supportedFormatVersions.includes(
      record.formatVersion as SupportedFormatVersion,
    )
  ) {
    const version =
      typeof record.formatVersion === "number"
        ? String(record.formatVersion)
        : "缺失";
    throw new WorkspaceImportError(
      `不支持格式版本 ${version}，当前支持版本 1 至 10。`,
    );
  }
  const formatVersion = record.formatVersion as SupportedFormatVersion;

  const exportedAt = readString(record, "exportedAt", "根节点");
  if (Number.isNaN(Date.parse(exportedAt))) {
    fail("根节点.exportedAt", "不是有效时间。");
  }

  const workspace: Workspace = {
    interviews: readObjectArray(
      record,
      "interviews",
      "根节点",
      parseInterview,
    ),
    interviewOrganizations:
      formatVersion >= 7
        ? readObjectArray(
            record,
            "interviewOrganizations",
            "根节点",
            parseInterviewOrganization,
          )
        : [],
    questions: readObjectArray(
      record,
      "questions",
      "根节点",
      (item, path) => parseQuestion(item, path, formatVersion),
    ),
    syncBlocks: readObjectArray(
      record,
      "syncBlocks",
      "根节点",
      (item, path) => parseSyncBlock(item, path, formatVersion),
    ),
    resumeExperiences:
      formatVersion >= 4
        ? readObjectArray(
            record,
            "resumeExperiences",
            "根节点",
            parseResumeExperience,
          )
        : readLegacyObjectArray(
            record,
            "resumeExperiences",
            "根节点",
            parseResumeExperience,
          ),
    aiReviews:
      formatVersion >= 4
        ? readObjectArray(
            record,
            "aiReviews",
            "根节点",
            (item, path) => parseAIReview(item, path, formatVersion),
          )
        : readLegacyObjectArray(
            record,
            "aiReviews",
            "根节点",
            (item, path) => parseAIReview(item, path, formatVersion),
          ),
    reviewEvents: readObjectArray(
      record,
      "reviewEvents",
      "根节点",
      parseReviewEvent,
    ),
    mockInterviews:
      formatVersion >= 5
        ? readObjectArray(
            record,
            "mockInterviews",
            "根节点",
            parseMockInterview,
          )
        : [],
  };

  validateRelationships(workspace);
  return { formatVersion, exportedAt, workspace };
}
