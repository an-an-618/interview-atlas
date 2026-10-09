import { useEffect, useRef, useState } from "react";
import { createDemoWorkspace } from "../data/demo";
import { applyExtractionTask, recoverExtractionTasks } from "../domain/extractionTasks";
import {
  indexedDbRepository,
  type WorkspaceRepository,
} from "../data/repository";
import type {
  CreateInterviewInput,
  CreateInterviewOrganizationInput,
  CreateMockInterviewInput,
  CreateQuestionInput,
  CreateResumeExperienceInput,
  CreateSyncBlockInput,
  ExtractionTask,
  MockInterviewFeedback,
  MockInterviewMessageRole,
  MockInterviewQuestionInput,
  SaveAIReviewCandidateInput,
  UpdateAIReviewCandidateInput,
  UpdateSyncBlockInput,
  Workspace,
} from "../domain/types";
import {
  addInterview,
  addInterviewOrganization,
  addMockInterview,
  addQuestion,
  addResumeExperience,
  addStandaloneQuestion,
  addSyncBlock,
  appendMockInterviewMessage,
  applyMockInterviewAnalysis,
  completeInterviewAIReview,
  deleteInterview,
  deleteInterviewOrganization,
  deleteResumeExperience,
  emptyWorkspace,
  endMockInterview,
  linkQuestionToSyncBlock,
  resolveAIReviewQuestion,
  resolveAIReviewSync,
  resolveAllAIReviewCandidates,
  saveInterviewAIReview,
  updateAIReviewCandidate,
  updateResumeExperience,
  updateInterview,
  updateQuestion,
  updateSyncBlock,
} from "../domain/workspace";

export function useWorkspace(
  repository: WorkspaceRepository = indexedDbRepository,
) {
  const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const workspaceRef = useRef(workspace);
  const saveQueue = useRef(Promise.resolve());

  const replaceWorkspace = (next: Workspace): Promise<void> => {
    workspaceRef.current = next;
    setWorkspace(next);
    const operation = saveQueue.current.then(() => repository.save(next));
    saveQueue.current = operation.catch((reason: unknown) => {
      setError(
        reason instanceof Error ? reason.message : "本地保存失败，请重试。",
      );
    });
    return operation;
  };

  const persistBeforeCommit = async (
    next: Workspace,
    fallbackMessage = "本地保存失败，请重试。",
  ): Promise<void> => {
    // Reserve the state before waiting, so background completion reads the latest edits.
    const previous = workspaceRef.current;
    workspaceRef.current = next;
    const operation = saveQueue.current.then(() => repository.save(next));
    saveQueue.current = operation.catch((reason: unknown) => {
      setError(
        reason instanceof Error ? reason.message : fallbackMessage,
      );
    });
    try {
      await operation;
      if (workspaceRef.current === next) setWorkspace(next);
    } catch (reason) {
      if (workspaceRef.current === next) workspaceRef.current = previous;
      throw reason;
    }
  };

  useEffect(() => {
    let active = true;
    repository
      .load()
      .then((saved) => {
        if (!active) return;
        const recovered = recoverExtractionTasks(saved);
        workspaceRef.current = recovered;
        setWorkspace(recovered);
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
    saveExtractionTask: async (
      interviewId: string,
      source: string,
      task: ExtractionTask,
      candidates?: SaveAIReviewCandidateInput[],
    ) => {
      const next = applyExtractionTask(workspaceRef.current, interviewId, source, task, candidates);
      if (!next) return false;
      await replaceWorkspace(next);
      return true;
    },
    markExtractionRead: (interviewId: string) => {
      const current = workspaceRef.current;
      void replaceWorkspace({
        ...current,
        interviews: current.interviews.map((item) =>
          item.id === interviewId && item.extractionTask
            ? { ...item, extractionTask: { ...item.extractionTask, unread: false } }
            : item),
      }).catch(() => undefined);
    },
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
    createInterviewOrganization: (
      input: CreateInterviewOrganizationInput,
    ) => {
      const result = addInterviewOrganization(workspaceRef.current, input);
      replaceWorkspace(result.workspace);
      return result.organization;
    },
    deleteInterviewOrganization: (organizationId: string) => {
      replaceWorkspace(
        deleteInterviewOrganization(workspaceRef.current, organizationId),
      );
    },
    deleteInterview: async (interviewId: string) => {
      await persistBeforeCommit(
        deleteInterview(workspaceRef.current, interviewId),
        "面试记录删除失败，请重试。",
      );
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
    resolveAIReviewQuestion: (
      interviewId: string,
      candidateId: string,
      decision: "accepted" | "ignored",
    ) => {
      const next = resolveAIReviewQuestion(
        workspaceRef.current,
        interviewId,
        candidateId,
        decision,
      );
      replaceWorkspace(next);
    },
    resolveAIReviewSync: (
      interviewId: string,
      candidateId: string,
      decision: "accepted" | "ignored",
    ) => {
      const next = resolveAIReviewSync(
        workspaceRef.current,
        interviewId,
        candidateId,
        decision,
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
    updateSyncBlock: (syncBlockId: string, input: UpdateSyncBlockInput) => {
      const result = updateSyncBlock(workspaceRef.current, syncBlockId, input);
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
