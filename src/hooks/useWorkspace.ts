import { useEffect, useRef, useState } from "react";
import { createDemoWorkspace } from "../data/demo";
import {
  indexedDbRepository,
  type WorkspaceRepository,
} from "../data/repository";
import type {
  CreateInterviewInput,
  CreateMockInterviewInput,
  CreateQuestionInput,
  CreateResumeExperienceInput,
  CreateSyncBlockInput,
  MockInterviewFeedback,
  MockInterviewMessageRole,
  MockInterviewQuestionInput,
  SaveAIReviewCandidateInput,
  UpdateAIReviewCandidateInput,
  Workspace,
} from "../domain/types";
import {
  addInterview,
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
  linkQuestionToSyncBlock,
  resolveAIReviewCandidate,
  resolveAllAIReviewCandidates,
  saveInterviewAIReview,
  updateAIReviewCandidate,
  updateResumeExperience,
  updateInterview,
  updateQuestion,
} from "../domain/workspace";

export function useWorkspace(
  repository: WorkspaceRepository = indexedDbRepository,
) {
  const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const workspaceRef = useRef(workspace);
  const saveQueue = useRef(Promise.resolve());

  const replaceWorkspace = (next: Workspace): void => {
    workspaceRef.current = next;
    setWorkspace(next);
    const operation = saveQueue.current.then(() => repository.save(next));
    saveQueue.current = operation.catch((reason: unknown) => {
      setError(
        reason instanceof Error ? reason.message : "本地保存失败，请重试。",
      );
    });
  };

  const persistBeforeCommit = async (
    next: Workspace,
    fallbackMessage = "本地保存失败，请重试。",
  ): Promise<void> => {
    await saveQueue.current;
    const operation = repository.save(next);
    saveQueue.current = operation.catch((reason: unknown) => {
      setError(
        reason instanceof Error ? reason.message : fallbackMessage,
      );
    });
    await operation;
    workspaceRef.current = next;
    setWorkspace(next);
  };

  useEffect(() => {
    let active = true;
    repository
      .load()
      .then((saved) => {
        if (!active) return;
        workspaceRef.current = saved;
        setWorkspace(saved);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(
          reason instanceof Error ? reason.message : "无法打开本地知识库。",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [repository]);

  return {
    workspace,
    loading,
    error,
    dismissError: () => setError(null),
    createInterview: (input: CreateInterviewInput) => {
      const result = addInterview(workspaceRef.current, input);
      replaceWorkspace(result.workspace);
      return result.interview;
    },
    createMockInterview: async (input: CreateMockInterviewInput) => {
      const result = addMockInterview(workspaceRef.current, input);
      await persistBeforeCommit(result.workspace);
      return result.session;
    },
    appendMockInterviewMessage: async (
      sessionId: string,
      role: MockInterviewMessageRole,
      content: string,
    ) => {
      const result = appendMockInterviewMessage(
        workspaceRef.current,
        sessionId,
        role,
        content,
      );
      await persistBeforeCommit(result.workspace);
      return result.session;
    },
    endMockInterview: async (
      sessionId: string,
      endedBy: "ai" | "user",
      endReason: string,
    ) => {
      const result = endMockInterview(
        workspaceRef.current,
        sessionId,
        endedBy,
        endReason,
      );
      await persistBeforeCommit(result.workspace);
      return result;
    },
    applyMockInterviewAnalysis: async (
      sessionId: string,
      feedback: MockInterviewFeedback,
      questions: MockInterviewQuestionInput[],
    ) => {
      const result = applyMockInterviewAnalysis(
        workspaceRef.current,
        sessionId,
        feedback,
        questions,
      );
      await persistBeforeCommit(result.workspace);
      return result.session;
    },
    updateInterview: (interviewId: string, input: CreateInterviewInput) => {
      const result = updateInterview(
        workspaceRef.current,
        interviewId,
        input,
      );
      replaceWorkspace(result.workspace);
      return result.interview;
    },
    createQuestion: (interviewId: string, input: CreateQuestionInput) => {
      const result = addQuestion(workspaceRef.current, interviewId, input);
      replaceWorkspace(result.workspace);
      return result.question;
    },
    saveAIReview: (
      interviewId: string,
      candidates: SaveAIReviewCandidateInput[],
    ) => {
      const next = saveInterviewAIReview(
        workspaceRef.current,
        interviewId,
        candidates,
      );
      replaceWorkspace(next);
    },
    completeAIReview: (
      interviewId: string,
      candidates: SaveAIReviewCandidateInput[],
    ) => {
      const next = completeInterviewAIReview(
        workspaceRef.current,
        interviewId,
        candidates,
      );
      replaceWorkspace(next);
    },
    updateAIReviewCandidate: (
      interviewId: string,
      candidateId: string,
      input: UpdateAIReviewCandidateInput,
    ) => {
      const next = updateAIReviewCandidate(
        workspaceRef.current,
        interviewId,
        candidateId,
        input,
      );
      replaceWorkspace(next);
    },
    resolveAIReviewCandidate: (
      interviewId: string,
      candidateId: string,
      decision: "accepted" | "ignored",
      connectToSuggested = false,
    ) => {
      const next = resolveAIReviewCandidate(
        workspaceRef.current,
        interviewId,
        candidateId,
        decision,
        connectToSuggested,
      );
      replaceWorkspace(next);
    },
    acceptAllAIReviewCandidates: (interviewId: string) => {
      const next = resolveAllAIReviewCandidates(
        workspaceRef.current,
        interviewId,
      );
      replaceWorkspace(next);
    },
    linkQuestionToSyncBlock: (questionId: string, syncBlockId: string) => {
      const next = linkQuestionToSyncBlock(
        workspaceRef.current,
        questionId,
        syncBlockId,
      );
      replaceWorkspace(next);
    },
    createStandaloneQuestion: (input: CreateQuestionInput) => {
      const result = addStandaloneQuestion(workspaceRef.current, input);
      replaceWorkspace(result.workspace);
      return result.question;
    },
    updateQuestion: (questionId: string, input: CreateQuestionInput) => {
      const result = updateQuestion(
        workspaceRef.current,
        questionId,
        input,
      );
      replaceWorkspace(result.workspace);
      return result.question;
    },
    createResumeExperience: (input: CreateResumeExperienceInput) => {
      const result = addResumeExperience(workspaceRef.current, input);
      replaceWorkspace(result.workspace);
      return result.experience;
    },
    updateResumeExperience: (
      experienceId: string,
      input: CreateResumeExperienceInput,
    ) => {
      const result = updateResumeExperience(
        workspaceRef.current,
        experienceId,
        input,
      );
      replaceWorkspace(result.workspace);
      return result.experience;
    },
    deleteResumeExperience: (experienceId: string) => {
      const next = deleteResumeExperience(
        workspaceRef.current,
        experienceId,
      );
      replaceWorkspace(next);
    },
    createSyncBlock: (input: CreateSyncBlockInput) => {
      const result = addSyncBlock(workspaceRef.current, input);
      replaceWorkspace(result.workspace);
      return result.syncBlock;
    },
    loadDemo: () => replaceWorkspace(createDemoWorkspace()),
    clear: () => replaceWorkspace(emptyWorkspace()),
    restoreWorkspace: (next: Workspace) =>
      persistBeforeCommit(next, "本地恢复失败，请重试。"),
    exportWorkspace: () => repository.export(workspaceRef.current),
  };
}
