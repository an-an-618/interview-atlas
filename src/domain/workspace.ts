import type {
  AIReviewCandidate,
  AtomicQuestion,
  CreateInterviewInput,
  CreateInterviewOrganizationInput,
  CreateQuestionInput,
  CreateResumeExperienceInput,
  CreateSyncBlockInput,
  Interview,
  InterviewOrganization,
  MockInterviewFeedback,
  MockInterviewMessage,
  MockInterviewMessageRole,
  MockInterviewQuestionInput,
  MockInterviewSession,
  CreateMockInterviewInput,
  ResumeExperience,
  SaveAIReviewCandidateInput,
  SyncBlock,
  UpdateAIReviewCandidateInput,
  UpdateSyncBlockInput,
  Workspace,
} from "./types";
import { formatAnswer } from "./answerFormat";

export const emptyWorkspace = (): Workspace => ({
  interviews: [],
  interviewOrganizations: [],
  questions: [],
  syncBlocks: [],
  resumeExperiences: [],
  aiReviews: [],
  reviewEvents: [],
  mockInterviews: [],
});

const timestamp = () => new Date().toISOString();
const identifier = () => crypto.randomUUID();

export function addInterview(
  workspace: Workspace,
  input: CreateInterviewInput,
): { workspace: Workspace; interview: Interview } {
  const now = timestamp();
  const interview: Interview = {
    id: identifier(),
    company: input.company.trim(),
    role: input.role.trim(),
    round: input.round.trim(),
    date: input.date,
    source: input.source.trim(),
    rawText: input.rawText.trim(),
    status: "pending",
    questionIds: [],
    createdAt: now,
    updatedAt: now,
  };

  return {
    workspace: {
      ...workspace,
      interviews: [interview, ...workspace.interviews],
    },
    interview,
  };
}

export function updateInterview(
  workspace: Workspace,
  interviewId: string,
  input: CreateInterviewInput,
): { workspace: Workspace; interview: Interview } {
  const existing = workspace.interviews.find((item) => item.id === interviewId);
  if (!existing) {
    throw new Error("Interview not found");
  }

  const interview: Interview = {
    ...existing,
    company: input.company.trim(),
    role: input.role.trim(),
    round: input.round.trim(),
    date: input.date,
    source: input.source.trim(),
    rawText: input.rawText.trim(),
    updatedAt: timestamp(),
  };

  return {
    workspace: {
      ...workspace,
      interviews: workspace.interviews.map((item) =>
        item.id === interviewId ? interview : item,
      ),
    },
    interview,
  };
}

export function addInterviewOrganization(
  workspace: Workspace,
  input: CreateInterviewOrganizationInput,
): { workspace: Workspace; organization: InterviewOrganization } {
  const title = input.title.trim();
  const interviewIds = new Set(workspace.interviews.map((item) => item.id));
  const collections = input.collections
    .map((collection) => ({
      id: identifier(),
      label: collection.label.trim(),
      interviewIds: [
        ...new Set(collection.interviewIds.filter((id) => interviewIds.has(id))),
      ],
    }))
    .filter((collection) => collection.label && collection.interviewIds.length);

  if (!title) throw new Error("整理名称不能为空");
  if (!collections.length) throw new Error("至少需要一个包含面试记录的集合");

  const now = timestamp();
  const organization: InterviewOrganization = {
    id: identifier(),
    title,
    mode: input.mode,
    collections,
    createdAt: now,
    updatedAt: now,
  };

  return {
    workspace: {
      ...workspace,
      interviewOrganizations: [
        organization,
        ...workspace.interviewOrganizations,
      ],
    },
    organization,
  };
}

export function deleteInterviewOrganization(
  workspace: Workspace,
  organizationId: string,
): Workspace {
  return {
    ...workspace,
    interviewOrganizations: workspace.interviewOrganizations.filter(
      (item) => item.id !== organizationId,
    ),
  };
}

export function addQuestion(
  workspace: Workspace,
  interviewId: string,
  input: CreateQuestionInput,
): { workspace: Workspace; question: AtomicQuestion } {
  const interview = workspace.interviews.find((item) => item.id === interviewId);
  if (!interview) {
    throw new Error("Interview not found");
  }

  const now = timestamp();
  const question: AtomicQuestion = {
    id: identifier(),
    title: input.title.trim(),
    answer: formatAnswer(input.answer),
    notes: input.notes?.trim() ?? "",
    tags: input.tags.map((tag) => tag.trim()).filter(Boolean),
    sourceInterviewIds: [interviewId],
    linkedSyncBlockId: null,
    createdAt: now,
    updatedAt: now,
  };

  return {
    workspace: {
      ...workspace,
      interviews: workspace.interviews.map((item) =>
        item.id === interviewId
          ? {
              ...item,
              questionIds: [...item.questionIds, question.id],
              status: "pending",
              updatedAt: now,
            }
          : item,
      ),
      questions: [...workspace.questions, question],
    },
    question,
  };
}

export function getInterviewQuestionIds(
  workspace: Pick<Workspace, "interviews" | "questions">,
  interviewId: string,
): string[] {
  const interview = workspace.interviews.find((item) => item.id === interviewId);
  return [...new Set([
    ...(interview?.questionIds ?? []),
    ...workspace.questions
      .filter((question) => question.sourceInterviewIds.includes(interviewId))
      .map((question) => question.id),
  ])];
}

export function deleteInterview(workspace: Workspace, interviewId: string): Workspace {
  if (!workspace.interviews.some((item) => item.id === interviewId)) {
    throw new Error("面试记录不存在");
  }
  const deletedIds = new Set(getInterviewQuestionIds(workspace, interviewId));
  const now = timestamp();
  const cleanLinks = <T extends { linkedQuestionIds: string[]; updatedAt: string }>(item: T): T =>
    item.linkedQuestionIds.some((id) => deletedIds.has(id))
      ? { ...item, linkedQuestionIds: item.linkedQuestionIds.filter((id) => !deletedIds.has(id)), updatedAt: now }
      : item;
  return {
    ...workspace,
    interviews: workspace.interviews
      .filter((item) => item.id !== interviewId)
      .map((item) => item.questionIds.some((id) => deletedIds.has(id))
        ? { ...item, questionIds: item.questionIds.filter((id) => !deletedIds.has(id)), updatedAt: now }
        : item),
    interviewOrganizations: workspace.interviewOrganizations.map((organization) => ({
      ...organization,
      collections: organization.collections
        .map((collection) => ({
          ...collection,
          interviewIds: collection.interviewIds.filter((id) => id !== interviewId),
        }))
        .filter((collection) => collection.interviewIds.length),
      updatedAt: organization.collections.some((collection) =>
        collection.interviewIds.includes(interviewId))
        ? now
        : organization.updatedAt,
    })),
    questions: workspace.questions.filter((item) => !deletedIds.has(item.id)),
    syncBlocks: workspace.syncBlocks.map(cleanLinks),
    resumeExperiences: workspace.resumeExperiences.map(cleanLinks),
    aiReviews: workspace.aiReviews
      .filter((item) => item.interviewId !== interviewId)
      .map((item) => item.candidates.some((candidate) => candidate.createdQuestionId && deletedIds.has(candidate.createdQuestionId))
        ? {
            ...item,
            updatedAt: now,
            candidates: item.candidates.map((candidate) =>
              candidate.createdQuestionId && deletedIds.has(candidate.createdQuestionId)
                ? { ...candidate, createdQuestionId: null }
                : candidate),
          }
        : item),
    mockInterviews: workspace.mockInterviews.map((item) =>
      item.interviewId === interviewId || item.questionIds.some((id) => deletedIds.has(id))
        ? {
            ...item,
            interviewId: item.interviewId === interviewId ? null : item.interviewId,
            questionIds: item.questionIds.filter((id) => !deletedIds.has(id)),
            updatedAt: now,
          }
        : item),
  };
}

export function linkQuestionToSyncBlock(
  workspace: Workspace,
  questionId: string,
  syncBlockId: string,
): Workspace {
  const question = workspace.questions.find((item) => item.id === questionId);
  const syncBlock = workspace.syncBlocks.find((item) => item.id === syncBlockId);
  if (!question || !syncBlock) {
    throw new Error("Question or sync block not found");
  }

  const now = timestamp();
  return {
    ...workspace,
    questions: workspace.questions.map((item) =>
      item.id === questionId
        ? { ...item, linkedSyncBlockId: syncBlockId, updatedAt: now }
        : item,
    ),
    syncBlocks: workspace.syncBlocks.map((item) => ({
      ...item,
      linkedQuestionIds:
        item.id === syncBlockId
          ? [...new Set([...item.linkedQuestionIds, questionId])]
          : item.linkedQuestionIds.filter((id) => id !== questionId),
      updatedAt:
        item.id === syncBlockId || item.linkedQuestionIds.includes(questionId)
          ? now
          : item.updatedAt,
    })),
  };
}

export function saveInterviewAIReview(
  workspace: Workspace,
  interviewId: string,
  inputs: SaveAIReviewCandidateInput[],
): Workspace {
  const interview = workspace.interviews.find((item) => item.id === interviewId);
  if (!interview) throw new Error("Interview not found");

  const now = timestamp();
  const existing = workspace.aiReviews.find(
    (review) => review.interviewId === interviewId,
  );
  const syncBlockIds = new Set(workspace.syncBlocks.map((item) => item.id));
  const candidates: AIReviewCandidate[] = inputs.map((input) => {
    const suggestedSyncBlockId =
      input.suggestedSyncBlockId &&
      syncBlockIds.has(input.suggestedSyncBlockId)
        ? input.suggestedSyncBlockId
        : null;
    return {
      id: identifier(),
      title: input.title.trim(),
      answer: formatAnswer(input.answer),
      tags: input.tags.map((tag) => tag.trim()).filter(Boolean),
      sourceExcerpt: input.sourceExcerpt.trim(),
      suggestedSyncBlockId,
      matchReason: input.matchReason.trim(),
      questionDecision: "pending",
      syncDecision: suggestedSyncBlockId ? "pending" : "not_suggested",
      createdQuestionId: null,
    };
  });
  const review = {
    id: existing?.id ?? identifier(),
    interviewId,
    candidates,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  return {
    ...workspace,
    interviews: workspace.interviews.map((item) =>
      item.id === interviewId
        ? { ...item, status: "pending", updatedAt: now }
        : item,
    ),
    aiReviews: existing
      ? workspace.aiReviews.map((item) =>
          item.interviewId === interviewId ? review : item,
        )
      : [review, ...workspace.aiReviews],
  };
}

export function updateAIReviewCandidate(
  workspace: Workspace,
  interviewId: string,
  candidateId: string,
  input: UpdateAIReviewCandidateInput,
): Workspace {
  const review = workspace.aiReviews.find(
    (item) => item.interviewId === interviewId,
  );
  const candidate = review?.candidates.find((item) => item.id === candidateId);
  if (!review || !candidate) throw new Error("AI review candidate not found");
  if (candidate.questionDecision !== "pending") return workspace;

  const now = timestamp();
  return {
    ...workspace,
    aiReviews: workspace.aiReviews.map((item) =>
      item.id === review.id
        ? {
            ...item,
            candidates: item.candidates.map((entry) =>
              entry.id === candidateId
                ? {
                    ...entry,
                    ...(input.title === undefined
                      ? {}
                      : { title: input.title.trim() }),
                    ...(input.answer === undefined
                      ? {}
                      : { answer: formatAnswer(input.answer) }),
                    ...(input.tags === undefined
                      ? {}
                      : {
                          tags: input.tags
                            .map((tag) => tag.trim())
                            .filter(Boolean),
                        }),
                  }
                : entry,
            ),
            updatedAt: now,
          }
        : item,
    ),
  };
}

export function isAIReviewCandidatePending(
  candidate: AIReviewCandidate,
): boolean {
  return (
    candidate.questionDecision === "pending" ||
    candidate.syncDecision === "pending"
  );
}

function applyAIReviewResolution(
  workspace: Workspace,
  interviewId: string,
  reviewId: string,
  candidates: AIReviewCandidate[],
  now: string,
): Workspace {
  const completed = candidates.every(
    (candidate) => !isAIReviewCandidatePending(candidate),
  );
  return {
    ...workspace,
    interviews: workspace.interviews.map((item) =>
      item.id === interviewId
        ? {
            ...item,
            status: completed ? "reviewed" : "pending",
            updatedAt: now,
          }
        : item,
    ),
    aiReviews: workspace.aiReviews.map((item) =>
      item.id === reviewId
        ? { ...item, candidates, updatedAt: now }
        : item,
    ),
  };
}

export function resolveAIReviewQuestion(
  workspace: Workspace,
  interviewId: string,
  candidateId: string,
  decision: "accepted" | "ignored",
): Workspace {
  const review = workspace.aiReviews.find(
    (item) => item.interviewId === interviewId,
  );
  const candidate = review?.candidates.find((item) => item.id === candidateId);
  if (!review || !candidate) throw new Error("AI review candidate not found");
  if (candidate.questionDecision !== "pending") return workspace;

  let next = workspace;
  let createdQuestionId: string | null = null;
  if (decision === "accepted") {
    const result = addQuestion(next, interviewId, {
      title: candidate.title,
      answer: candidate.answer,
      tags: candidate.tags,
    });
    next = result.workspace;
    createdQuestionId = result.question.id;
  }

  const now = timestamp();
  const candidates = review.candidates.map((item) =>
    item.id === candidateId
      ? {
          ...item,
          questionDecision: decision,
          syncDecision:
            decision === "ignored" && item.syncDecision === "pending"
              ? "ignored"
              : item.syncDecision,
          createdQuestionId,
        }
      : item,
  );
  return applyAIReviewResolution(
    next,
    interviewId,
    review.id,
    candidates,
    now,
  );
}

export function resolveAIReviewSync(
  workspace: Workspace,
  interviewId: string,
  candidateId: string,
  decision: "accepted" | "ignored",
): Workspace {
  const review = workspace.aiReviews.find(
    (item) => item.interviewId === interviewId,
  );
  const candidate = review?.candidates.find((item) => item.id === candidateId);
  if (!review || !candidate) throw new Error("AI review candidate not found");
  if (candidate.syncDecision !== "pending") return workspace;
  if (!candidate.suggestedSyncBlockId) {
    throw new Error("该候选没有同步块关联建议");
  }

  let next = workspace;
  if (decision === "accepted") {
    if (
      candidate.questionDecision !== "accepted" ||
      !candidate.createdQuestionId
    ) {
      throw new Error("请先采纳原子问答，再采纳同步块关联建议");
    }
    if (
      !workspace.syncBlocks.some(
        (item) => item.id === candidate.suggestedSyncBlockId,
      )
    ) {
      throw new Error("建议关联的同步块不存在");
    }
    next = linkQuestionToSyncBlock(
      workspace,
      candidate.createdQuestionId,
      candidate.suggestedSyncBlockId,
    );
  }

  const now = timestamp();
  const candidates = review.candidates.map((item) =>
    item.id === candidateId
      ? { ...item, syncDecision: decision }
      : item,
  );
  return applyAIReviewResolution(
    next,
    interviewId,
    review.id,
    candidates,
    now,
  );
}

export function resolveAllAIReviewCandidates(
  workspace: Workspace,
  interviewId: string,
): Workspace {
  const review = workspace.aiReviews.find(
    (item) => item.interviewId === interviewId,
  );
  if (!review) throw new Error("AI review not found");

  return review.candidates.reduce(
    (current, candidate) =>
      candidate.questionDecision === "pending"
        ? resolveAIReviewQuestion(
            current,
            interviewId,
            candidate.id,
            "accepted",
          )
        : current,
    workspace,
  );
}

export function completeInterviewAIReview(
  workspace: Workspace,
  interviewId: string,
  inputs: SaveAIReviewCandidateInput[],
): Workspace {
  const saved = saveInterviewAIReview(workspace, interviewId, inputs);
  const review = saved.aiReviews.find(
    (item) => item.interviewId === interviewId,
  );
  if (!review) return saved;

  return review.candidates.reduce((current, candidate, index) => {
    const input = inputs[index];
    if (input?.selected === false) {
      return resolveAIReviewQuestion(
        current,
        interviewId,
        candidate.id,
        "ignored",
      );
    }
    let next = resolveAIReviewQuestion(
      current,
      interviewId,
      candidate.id,
      "accepted",
    );
    if (candidate.suggestedSyncBlockId) {
      next = resolveAIReviewSync(
        next,
        interviewId,
        candidate.id,
        input?.connectToSuggested ? "accepted" : "ignored",
      );
    }
    return next;
  }, saved);
}

export function addMockInterview(
  workspace: Workspace,
  input: CreateMockInterviewInput,
): { workspace: Workspace; session: MockInterviewSession } {
  const company = input.company.trim().slice(0, 120);
  const role = input.role.trim().slice(0, 120);
  if (!company || !role) {
    throw new Error("Company and role are required");
  }
  const now = timestamp();
  const session: MockInterviewSession = {
    id: identifier(),
    company,
    role,
    round: input.round.trim().slice(0, 80),
    jobDescription: input.jobDescription.trim().slice(0, 20_000),
    additionalInfo: input.additionalInfo.trim().slice(0, 8_000),
    interviewerPrompt: input.interviewerPrompt.trim().slice(0, 30_000),
    targetQuestionCount: Number.isFinite(input.targetQuestionCount)
      ? Math.min(20, Math.max(3, Math.round(input.targetQuestionCount)))
      : 8,
    status: "active",
    messages: [],
    startedAt: now,
    updatedAt: now,
    endedAt: null,
    endedBy: null,
    endReason: "",
    interviewId: null,
    questionIds: [],
    feedback: null,
  };

  return {
    workspace: {
      ...workspace,
      mockInterviews: [session, ...workspace.mockInterviews],
    },
    session,
  };
}

export function appendMockInterviewMessage(
  workspace: Workspace,
  sessionId: string,
  role: MockInterviewMessageRole,
  content: string,
): { workspace: Workspace; session: MockInterviewSession } {
  const session = workspace.mockInterviews.find((item) => item.id === sessionId);
  if (!session) throw new Error("Mock interview not found");
  if (session.status !== "active") {
    throw new Error("Mock interview has already ended");
  }

  const now = timestamp();
  const message: MockInterviewMessage = {
    id: identifier(),
    role,
    content: content.trim().slice(0, 20_000),
    createdAt: now,
  };
  const nextSession: MockInterviewSession = {
    ...session,
    messages: [...session.messages, message],
    updatedAt: now,
  };
  return {
    workspace: {
      ...workspace,
      mockInterviews: workspace.mockInterviews.map((item) =>
        item.id === sessionId ? nextSession : item,
      ),
    },
    session: nextSession,
  };
}

function formatMockInterviewTranscript(session: MockInterviewSession): string {
  const metadata = [
    `${session.company} · ${session.role}`,
    session.round,
  ]
    .filter(Boolean)
    .join(" · ");
  const transcript = session.messages
    .map(
      (message) =>
        `${message.role === "interviewer" ? "面试官" : "候选人"}：${message.content}`,
    )
    .join("\n\n");
  return [metadata, transcript].filter(Boolean).join("\n\n");
}

export function endMockInterview(
  workspace: Workspace,
  sessionId: string,
  endedBy: "ai" | "user",
  endReason: string,
): {
  workspace: Workspace;
  session: MockInterviewSession;
  interview: Interview;
} {
  const session = workspace.mockInterviews.find((item) => item.id === sessionId);
  if (!session) throw new Error("Mock interview not found");

  const existingInterview = session.interviewId
    ? workspace.interviews.find((item) => item.id === session.interviewId)
    : undefined;
  if (session.status === "completed" && existingInterview) {
    return { workspace, session, interview: existingInterview };
  }

  const now = timestamp();
  const interview: Interview = {
    id: identifier(),
    company: session.company,
    role: session.role,
    round: session.round || "模拟面试",
    date: now.slice(0, 10),
    source: "AI 模拟面试",
    rawText: formatMockInterviewTranscript(session),
    status: "pending",
    questionIds: [],
    createdAt: now,
    updatedAt: now,
    simulated: true,
    mockInterviewId: session.id,
  };
  const nextSession: MockInterviewSession = {
    ...session,
    status: "completed",
    endedAt: now,
    endedBy,
    endReason: endReason.trim(),
    interviewId: interview.id,
    updatedAt: now,
  };

  return {
    workspace: {
      ...workspace,
      interviews: [interview, ...workspace.interviews],
      mockInterviews: workspace.mockInterviews.map((item) =>
        item.id === sessionId ? nextSession : item,
      ),
    },
    session: nextSession,
    interview,
  };
}

export function applyMockInterviewAnalysis(
  workspace: Workspace,
  sessionId: string,
  feedback: MockInterviewFeedback,
  inputs: MockInterviewQuestionInput[],
): { workspace: Workspace; session: MockInterviewSession } {
  const session = workspace.mockInterviews.find((item) => item.id === sessionId);
  if (!session || !session.interviewId) {
    throw new Error("Completed mock interview not found");
  }
  if (session.questionIds.length) {
    const existing: MockInterviewSession = { ...session, feedback };
    return {
      workspace: {
        ...workspace,
        mockInterviews: workspace.mockInterviews.map((item) =>
          item.id === sessionId ? existing : item,
        ),
      },
      session: existing,
    };
  }

  const now = timestamp();
  const questions: AtomicQuestion[] = inputs
    .filter((input) => input.title.trim())
    .slice(0, 40)
    .map((input) => ({
      id: identifier(),
      title: input.title.trim(),
      answer: formatAnswer(input.answer),
      notes: "",
      tags: [
        ...new Set(input.tags.map((tag) => tag.trim()).filter(Boolean)),
      ].slice(0, 4),
      sourceInterviewIds: [session.interviewId!],
      linkedSyncBlockId: null,
      createdAt: now,
      updatedAt: now,
    }));
  const questionIds = questions.map((question) => question.id);
  const nextSession: MockInterviewSession = {
    ...session,
    questionIds,
    feedback,
    updatedAt: now,
  };

  return {
    workspace: {
      ...workspace,
      interviews: workspace.interviews.map((interview) =>
        interview.id === session.interviewId
          ? {
              ...interview,
              questionIds,
              status: "reviewed",
              updatedAt: now,
            }
          : interview,
      ),
      questions: [...questions, ...workspace.questions],
      mockInterviews: workspace.mockInterviews.map((item) =>
        item.id === sessionId ? nextSession : item,
      ),
    },
    session: nextSession,
  };
}

export function addStandaloneQuestion(
  workspace: Workspace,
  input: CreateQuestionInput,
): { workspace: Workspace; question: AtomicQuestion } {
  const now = timestamp();
  const question: AtomicQuestion = {
    id: identifier(),
    title: input.title.trim(),
    answer: formatAnswer(input.answer),
    notes: input.notes?.trim() ?? "",
    tags: input.tags.map((tag) => tag.trim()).filter(Boolean),
    sourceInterviewIds: [],
    linkedSyncBlockId: null,
    createdAt: now,
    updatedAt: now,
  };

  return {
    workspace: {
      ...workspace,
      questions: [question, ...workspace.questions],
    },
    question,
  };
}

export function updateQuestion(
  workspace: Workspace,
  questionId: string,
  input: CreateQuestionInput,
): { workspace: Workspace; question: AtomicQuestion } {
  const existing = workspace.questions.find((item) => item.id === questionId);
  if (!existing) {
    throw new Error("Question not found");
  }

  const question: AtomicQuestion = {
    ...existing,
    title: input.title.trim(),
    answer: formatAnswer(input.answer),
    notes: input.notes?.trim() ?? "",
    tags: input.tags.map((tag) => tag.trim()).filter(Boolean),
    updatedAt: timestamp(),
  };

  return {
    workspace: {
      ...workspace,
      questions: workspace.questions.map((item) =>
        item.id === questionId ? question : item,
      ),
    },
    question,
  };
}

function normalizeResumeInput(
  workspace: Workspace,
  input: CreateResumeExperienceInput,
) {
  const questionIds = new Set(workspace.questions.map((item) => item.id));
  const syncBlockIds = new Set(workspace.syncBlocks.map((item) => item.id));
  return {
    type: input.type.trim() || "其他",
    title: input.title.trim(),
    organization: input.organization.trim(),
    period: input.period.trim(),
    bullets: input.bullets.map((item) => item.trim()).filter(Boolean),
    linkedQuestionIds: [
      ...new Set(input.linkedQuestionIds.filter((id) => questionIds.has(id))),
    ],
    linkedSyncBlockIds: [
      ...new Set(input.linkedSyncBlockIds.filter((id) => syncBlockIds.has(id))),
    ],
  };
}

export function addResumeExperience(
  workspace: Workspace,
  input: CreateResumeExperienceInput,
): { workspace: Workspace; experience: ResumeExperience } {
  const now = timestamp();
  const experience: ResumeExperience = {
    id: identifier(),
    ...normalizeResumeInput(workspace, input),
    createdAt: now,
    updatedAt: now,
  };

  return {
    workspace: {
      ...workspace,
      resumeExperiences: [experience, ...workspace.resumeExperiences],
    },
    experience,
  };
}

export function updateResumeExperience(
  workspace: Workspace,
  experienceId: string,
  input: CreateResumeExperienceInput,
): { workspace: Workspace; experience: ResumeExperience } {
  const existing = workspace.resumeExperiences.find(
    (item) => item.id === experienceId,
  );
  if (!existing) {
    throw new Error("Resume experience not found");
  }

  const experience: ResumeExperience = {
    ...existing,
    ...normalizeResumeInput(workspace, input),
    updatedAt: timestamp(),
  };

  return {
    workspace: {
      ...workspace,
      resumeExperiences: workspace.resumeExperiences.map((item) =>
        item.id === experienceId ? experience : item,
      ),
    },
    experience,
  };
}

export function deleteResumeExperience(
  workspace: Workspace,
  experienceId: string,
): Workspace {
  return {
    ...workspace,
    resumeExperiences: workspace.resumeExperiences.filter(
      (item) => item.id !== experienceId,
    ),
  };
}

export function addSyncBlock(
  workspace: Workspace,
  input: CreateSyncBlockInput,
): { workspace: Workspace; syncBlock: SyncBlock } {
  const selectedQuestionIds = new Set(input.questionIds);
  const selectedResumeExperienceIds = new Set(input.resumeExperienceIds);
  const now = timestamp();
  const syncBlock: SyncBlock = {
    id: identifier(),
    title: input.title.trim(),
    body: formatAnswer(input.body),
    reviewNotes: input.reviewNotes.trim(),
    linkedQuestionIds: [...selectedQuestionIds],
    favorite: false,
    pinned: false,
    hidden: false,
    createdAt: now,
    updatedAt: now,
  };

  const syncBlocks = workspace.syncBlocks
    .map((item) => ({
      ...item,
      linkedQuestionIds: item.linkedQuestionIds.filter(
        (questionId) => !selectedQuestionIds.has(questionId),
      ),
    }));

  return {
    workspace: {
      ...workspace,
      questions: workspace.questions.map((question) =>
        selectedQuestionIds.has(question.id)
          ? {
              ...question,
              linkedSyncBlockId: syncBlock.id,
              updatedAt: now,
            }
          : question,
      ),
      syncBlocks: [syncBlock, ...syncBlocks],
      resumeExperiences: workspace.resumeExperiences.map((experience) =>
        selectedResumeExperienceIds.has(experience.id)
          ? {
              ...experience,
              linkedSyncBlockIds: [
                ...new Set([...experience.linkedSyncBlockIds, syncBlock.id]),
              ],
              updatedAt: now,
            }
          : experience,
      ),
    },
    syncBlock,
  };
}

export function updateSyncBlock(
  workspace: Workspace,
  syncBlockId: string,
  input: UpdateSyncBlockInput,
): { workspace: Workspace; syncBlock: SyncBlock } {
  const existing = workspace.syncBlocks.find((item) => item.id === syncBlockId);
  if (!existing) throw new Error("同步块不存在。");
  const title = input.title === undefined ? existing.title : input.title.trim();
  if (!title) throw new Error("同步块标题不能为空。");
  const syncBlock: SyncBlock = {
    ...existing,
    title,
    body:
      input.body === undefined ? existing.body : formatAnswer(input.body),
    reviewNotes:
      input.reviewNotes === undefined ? existing.reviewNotes : input.reviewNotes.trim(),
    favorite:
      input.favorite === undefined ? existing.favorite : input.favorite,
    updatedAt: timestamp(),
  };
  return {
    workspace: {
      ...workspace,
      syncBlocks: workspace.syncBlocks.map((item) =>
        item.id === syncBlockId ? syncBlock : item,
      ),
    },
    syncBlock,
  };
}

export function sortSyncBlocksByLinkedQuestionCount(
  syncBlocks: SyncBlock[],
): SyncBlock[] {
  return [...syncBlocks].sort(
    (left, right) =>
      right.linkedQuestionIds.length - left.linkedQuestionIds.length,
  );
}

export function searchSyncBlocks(
  syncBlocks: SyncBlock[],
  query: string,
): SyncBlock[] {
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  if (!normalizedQuery) return syncBlocks;

  return syncBlocks.filter((syncBlock) =>
    [syncBlock.title, syncBlock.body, syncBlock.reviewNotes]
      .join(" ")
      .toLocaleLowerCase("zh-CN")
      .includes(normalizedQuery),
  );
}

export function getFavoriteSyncBlocks(
  workspace: Pick<Workspace, "syncBlocks">,
): SyncBlock[] {
  return sortSyncBlocksByLinkedQuestionCount(
    workspace.syncBlocks.filter((item) => item.favorite && !item.hidden),
  );
}

export function getRandomQuestion(
  questions: AtomicQuestion[],
  random: () => number = Math.random,
): AtomicQuestion | null {
  if (!questions.length) return null;

  const index = Math.min(
    Math.floor(random() * questions.length),
    questions.length - 1,
  );
  return questions[index];
}
