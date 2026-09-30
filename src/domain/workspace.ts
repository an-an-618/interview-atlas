import type {
  AIReviewCandidate,
  AtomicQuestion,
  CreateInterviewInput,
  CreateQuestionInput,
  CreateResumeExperienceInput,
  CreateSyncBlockInput,
  Interview,
  ResumeExperience,
  SaveAIReviewCandidateInput,
  SyncBlock,
  UpdateAIReviewCandidateInput,
  Workspace,
} from "./types";

export const emptyWorkspace = (): Workspace => ({
  interviews: [],
  questions: [],
  syncBlocks: [],
  resumeExperiences: [],
  aiReviews: [],
  reviewEvents: [],
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
    answer: input.answer.trim(),
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
  const candidates: AIReviewCandidate[] = inputs.map((input) => ({
    id: identifier(),
    title: input.title.trim(),
    answer: input.answer.trim(),
    tags: input.tags.map((tag) => tag.trim()).filter(Boolean),
    sourceExcerpt: input.sourceExcerpt.trim(),
    suggestedSyncBlockId:
      input.suggestedSyncBlockId &&
      syncBlockIds.has(input.suggestedSyncBlockId)
        ? input.suggestedSyncBlockId
        : null,
    matchReason: input.matchReason.trim(),
    decision: "pending",
    connectToSuggested: Boolean(input.connectToSuggested),
    createdQuestionId: null,
  }));
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
  if (candidate.decision !== "pending") return workspace;

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
                      : { answer: input.answer.trim() }),
                    ...(input.tags === undefined
                      ? {}
                      : {
                          tags: input.tags
                            .map((tag) => tag.trim())
                            .filter(Boolean),
                        }),
                    ...(input.connectToSuggested === undefined
                      ? {}
                      : {
                          connectToSuggested:
                            input.connectToSuggested &&
                            Boolean(entry.suggestedSyncBlockId),
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

export function resolveAIReviewCandidate(
  workspace: Workspace,
  interviewId: string,
  candidateId: string,
  decision: "accepted" | "ignored",
  connectToSuggested = false,
): Workspace {
  const review = workspace.aiReviews.find(
    (item) => item.interviewId === interviewId,
  );
  const candidate = review?.candidates.find((item) => item.id === candidateId);
  if (!review || !candidate) throw new Error("AI review candidate not found");
  if (candidate.decision !== "pending") return workspace;

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
    if (
      connectToSuggested &&
      candidate.suggestedSyncBlockId &&
      next.syncBlocks.some(
        (item) => item.id === candidate.suggestedSyncBlockId,
      )
    ) {
      next = linkQuestionToSyncBlock(
        next,
        createdQuestionId,
        candidate.suggestedSyncBlockId,
      );
    }
  }

  const now = timestamp();
  const candidates = review.candidates.map((item) =>
    item.id === candidateId
      ? {
          ...item,
          decision,
          connectToSuggested:
            decision === "accepted" &&
            connectToSuggested &&
            Boolean(item.suggestedSyncBlockId),
          createdQuestionId,
        }
      : item,
  );
  const completed = candidates.every((item) => item.decision !== "pending");

  return {
    ...next,
    interviews: next.interviews.map((item) =>
      item.id === interviewId
        ? {
            ...item,
            status: completed ? "reviewed" : "pending",
            updatedAt: now,
          }
        : item,
    ),
    aiReviews: next.aiReviews.map((item) =>
      item.id === review.id
        ? { ...item, candidates, updatedAt: now }
        : item,
    ),
  };
}

export function resolveAllAIReviewCandidates(
  workspace: Workspace,
  interviewId: string,
  connectSuggested = false,
): Workspace {
  const review = workspace.aiReviews.find(
    (item) => item.interviewId === interviewId,
  );
  if (!review) throw new Error("AI review not found");

  return review.candidates.reduce(
    (current, candidate) =>
      candidate.decision === "pending"
        ? resolveAIReviewCandidate(
            current,
            interviewId,
            candidate.id,
            "accepted",
            connectSuggested && candidate.connectToSuggested,
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

  return review.candidates.reduce(
    (current, candidate, index) =>
      resolveAIReviewCandidate(
        current,
        interviewId,
        candidate.id,
        inputs[index]?.selected === false ? "ignored" : "accepted",
        Boolean(inputs[index]?.connectToSuggested),
      ),
    saved,
  );
}

export function addStandaloneQuestion(
  workspace: Workspace,
  input: CreateQuestionInput,
): { workspace: Workspace; question: AtomicQuestion } {
  const now = timestamp();
  const question: AtomicQuestion = {
    id: identifier(),
    title: input.title.trim(),
    answer: input.answer.trim(),
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
    answer: input.answer.trim(),
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
  const selectedIds = new Set(input.questionIds);
  const now = timestamp();
  const syncBlock: SyncBlock = {
    id: identifier(),
    title: input.title.trim(),
    body: input.body.trim(),
    reviewNotes: input.reviewNotes.trim(),
    linkedQuestionIds: [...selectedIds],
    pinned: false,
    hidden: false,
    createdAt: now,
    updatedAt: now,
  };

  const syncBlocks = workspace.syncBlocks
    .map((item) => ({
      ...item,
      linkedQuestionIds: item.linkedQuestionIds.filter(
        (questionId) => !selectedIds.has(questionId),
      ),
    }));

  return {
    workspace: {
      ...workspace,
      questions: workspace.questions.map((question) =>
        selectedIds.has(question.id)
          ? {
              ...question,
              linkedSyncBlockId: syncBlock.id,
              updatedAt: now,
            }
          : question,
      ),
      syncBlocks: [syncBlock, ...syncBlocks],
    },
    syncBlock,
  };
}

export function getRecommendedSyncBlocks(
  workspace: Workspace,
  limit = 3,
): SyncBlock[] {
  const reviewedToday = new Set(
    workspace.reviewEvents
      .filter(
        (event) =>
          new Date(event.reviewedAt).toDateString() === new Date().toDateString(),
      )
      .map((event) => event.syncBlockId),
  );

  return workspace.syncBlocks
    .filter((item) => !item.hidden && !reviewedToday.has(item.id))
    .sort((left, right) => {
      if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
      if (left.linkedQuestionIds.length !== right.linkedQuestionIds.length) {
        return right.linkedQuestionIds.length - left.linkedQuestionIds.length;
      }
      return right.updatedAt.localeCompare(left.updatedAt);
    })
    .slice(0, limit);
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
