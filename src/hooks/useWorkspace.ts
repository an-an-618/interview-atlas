import { useEffect, useRef, useState } from "react";
import { createDemoWorkspace } from "../data/demo";
import { applyExtractionTask, recoverExtractionTasks } from "../domain/extractionTasks";
import { recoverMockInterviewRuns } from "../domain/mockInterviewHarness";
import { updateMockInterviewHarness } from "../domain/workspace";
import type { KnowledgeDraft, KnowledgeTarget } from "../domain/workbench";
import type { MockInterviewHarness, MockInterviewMessage } from "../domain/types";
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
  addResumeExperiences,
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
  setQuestionFavorite,
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
  const mutationQueue = useRef(Promise.resolve());

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
      if (workspaceRef.current === next) {
        setWorkspace(next);
        setError(null);
      }
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
        const recovered = recoverMockInterviewRuns(recoverExtractionTasks(saved));
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

  const transact = (mutate: (current: Workspace) => Workspace) => {
    const operation = mutationQueue.current.then(async () => {
      await saveQueue.current;
      await persistBeforeCommit(mutate(workspaceRef.current));
    });
    mutationQueue.current = operation.catch(() => undefined);
    return operation;
  };

  return {
    workspace,
    loading,
    error,
    dismissError: () => setError(null),
    createOrganizeDraft: async (input: CreateInterviewInput) => {
      let interview!: ReturnType<typeof addInterview>["interview"];
      await transact(current => { const result = addInterview(current, input); interview = result.interview; return result.workspace; });
      return interview;
    },
    createManualQuestion: async (interviewId: string, input: CreateQuestionInput) => {
      await transact(current => addQuestion(current, interviewId, input).workspace);
    },
    createKnowledgeQuestion: async (input: CreateQuestionInput) => {
      let question!: ReturnType<typeof addStandaloneQuestion>["question"];
      await transact(current => { const result = addStandaloneQuestion(current, input); question = result.question; return result.workspace; });
      return question;
    },
    createKnowledgeBlock: async (input: CreateSyncBlockInput) => {
      let syncBlock!: ReturnType<typeof addSyncBlock>["syncBlock"];
      await transact(current => { const result = addSyncBlock(current, input); syncBlock = result.syncBlock; return result.workspace; });
      return syncBlock;
    },
    commitReview: (interviewId: string, candidateId: string,
      input: UpdateAIReviewCandidateInput | null,
      decision?: { kind: "question" | "sync"; value: "accepted" | "ignored" }) =>
      transact(current => {
        let next = input ? updateAIReviewCandidate(current, interviewId, candidateId, input) : current;
        if (decision) next = decision.kind === "question"
          ? resolveAIReviewQuestion(next, interviewId, candidateId, decision.value)
          : resolveAIReviewSync(next, interviewId, candidateId, decision.value);
        return next;
      }),
    saveKnowledge: (target: KnowledgeTarget, draft: KnowledgeDraft) => transact(current => {
      if (target.kind === "sync") return updateSyncBlock(current, target.id, { title: draft.title, body: draft.body, reviewNotes: draft.notes }).workspace;
      if (target.kind === "question") return updateQuestion(current, target.id, { title: draft.title, answer: draft.body, notes: draft.notes, tags: draft.tags.split(/[,，]/).map(t => t.trim()).filter(Boolean) }).workspace;
      if (target.kind === "interview") return updateInterview(current, target.id, { company: draft.company, role: draft.role, round: draft.round, date: draft.date, source: draft.source, rawText: draft.body }).workspace;
      const r = current.resumeExperiences.find(r => r.id === target.id);
      if (!r) throw new Error("这段经历已不存在");
      return updateResumeExperience(current, target.id, { ...r, title: draft.title, organization: draft.organization, period: draft.period, type: draft.type, bullets: draft.body.split("\n").filter(Boolean) }).workspace;
    }),
    saveRelation: (questionId: string, syncBlockId: string | null) => transact(current => {
      if (syncBlockId) return linkQuestionToSyncBlock(current, questionId, syncBlockId);
      return { ...current, questions: current.questions.map(q => q.id === questionId ? { ...q, linkedSyncBlockId: null } : q),
        syncBlocks: current.syncBlocks.map(b => ({ ...b, linkedQuestionIds: b.linkedQuestionIds.filter(id => id !== questionId) })) };
    }),
    saveResumeRelations: (experienceId: string, linkedQuestionIds: string[], linkedSyncBlockIds: string[]) => transact(current => {
      const r = current.resumeExperiences.find(r => r.id === experienceId);
      if (!r) throw new Error("经历已不存在");
      return updateResumeExperience(current, experienceId, { ...r, linkedQuestionIds, linkedSyncBlockIds }).workspace;
    }),
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
      metadata?: Pick<MockInterviewMessage, "kind" | "competencyId">,
    ) => {
      const result = appendMockInterviewMessage(
        workspaceRef.current,
        sessionId,
        role,
        content,
        metadata,
      );
      await persistBeforeCommit(result.workspace);
      return result.session;
    },
    updateMockInterviewHarness: async (sessionId: string, harness: MockInterviewHarness) => {
      const result = updateMockInterviewHarness(workspaceRef.current, sessionId, harness);
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
    setQuestionFavorite: (questionId: string, favorite: boolean) => {
      void replaceWorkspace(setQuestionFavorite(workspaceRef.current, questionId, favorite));
    },
    importResumeExperiences: async (inputs: CreateResumeExperienceInput[]) => {
      const result = addResumeExperiences(workspaceRef.current, inputs);
      await persistBeforeCommit(result.workspace, "简历经历保存失败，请重试。");
      return result.experiences;
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
