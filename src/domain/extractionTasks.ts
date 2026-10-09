import type { ExtractionTask, SaveAIReviewCandidateInput, Workspace } from "./types";
import { saveInterviewAIReview } from "./workspace";

export function recoverExtractionTasks(workspace: Workspace): Workspace {
  return {
    ...workspace,
    interviews: workspace.interviews.map((interview) =>
      ["queued", "running"].includes(interview.extractionTask?.status ?? "")
        ? { ...interview, extractionTask: {
            ...interview.extractionTask!,
            status: "interrupted" as const,
            error: "上次处理因应用关闭或刷新而中断，可以重新拆解。",
            unread: false,
          } }
        : interview),
  };
}

export function applyExtractionTask(
  current: Workspace, interviewId: string, source: string,
  task: ExtractionTask, candidates?: SaveAIReviewCandidateInput[],
): Workspace | null {
  const interview = current.interviews.find((item) => item.id === interviewId);
  if (!interview || interview.rawText !== source) return null;
  if (task.status !== "queued" && interview.extractionTask?.id !== task.id) return null;
  const next = candidates ? saveInterviewAIReview(current, interviewId, candidates) : current;
  return {
    ...next,
    interviews: next.interviews.map((item) =>
      item.id === interviewId ? { ...item, extractionTask: task } : item),
  };
}
