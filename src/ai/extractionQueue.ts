import type { ExtractionTask, Interview, SaveAIReviewCandidateInput } from "../domain/types";
import type { AIExtractionProgress } from "./types";

export const extractionActive = (task?: ExtractionTask) =>
  task?.status === "queued" || task?.status === "running";

export function extractionLabel(task?: ExtractionTask) {
  switch (task?.status) {
    case "queued": return "排队中";
    case "running": return "AI 处理中";
    case "failed": return "拆解失败";
    case "interrupted": return "处理已中断";
    case "cancelled": return "已取消拆解";
    default: return "待审核";
  }
}

export function sortInterviews(left: Interview, right: Interview) {
  const activeDifference = Number(extractionActive(right.extractionTask)) - Number(extractionActive(left.extractionTask));
  return activeDifference || right.createdAt.localeCompare(left.createdAt) || right.date.localeCompare(left.date);
}

type Run = (signal: AbortSignal, progress: (value: AIExtractionProgress) => void) => Promise<SaveAIReviewCandidateInput[]>;
export type SaveTask = (
  interviewId: string, source: string, task: ExtractionTask,
  candidates?: SaveAIReviewCandidateInput[],
) => Promise<boolean>;
interface Job {
  interviewId: string;
  source: string;
  task: ExtractionTask;
  controller: AbortController;
  run: Run;
}

/** Owned by the app, independently of dialogs and routes. Credentials live only in run closures. */
export class ExtractionQueue {
  private jobs: Job[] = [];
  private active?: Job;
  constructor(private save: SaveTask) {}

  enqueue(interview: Interview, run: Run) {
    const existing = [this.active, ...this.jobs].find((job) =>
      job?.interviewId === interview.id && !job.controller.signal.aborted);
    if (existing) return existing.task.id;
    const job: Job = {
      interviewId: interview.id, source: interview.rawText, run,
      controller: new AbortController(),
      task: { id: crypto.randomUUID(), status: "queued", updatedAt: new Date().toISOString() },
    };
    this.jobs.push(job);
    // Reserve the job immediately; persistence remains serialized by the repository owner.
    void this.save(job.interviewId, job.source, job.task).catch(() => false);
    void this.pump();
    return job.task.id;
  }

  cancel(interviewId: string) {
    for (const job of [this.active, ...this.jobs]) {
      if (!job || job.interviewId !== interviewId || job.controller.signal.aborted) continue;
      job.controller.abort();
      void this.write(job, { status: "cancelled", unread: false }).catch(() => false);
    }
    this.jobs = this.jobs.filter((job) => job.interviewId !== interviewId);
  }

  dispose() {
    // No persistence on disposal: workspace replacement must not receive old writes.
    this.active?.controller.abort();
    for (const job of this.jobs) job.controller.abort();
    this.jobs = [];
  }

  reset() {
    for (const job of [this.active, ...this.jobs]) {
      if (job) this.cancel(job.interviewId);
    }
    this.dispose();
  }

  private write(job: Job, patch: Partial<ExtractionTask>, candidates?: SaveAIReviewCandidateInput[]) {
    job.task = { ...job.task, ...patch, updatedAt: new Date().toISOString() };
    return this.save(job.interviewId, job.source, job.task, candidates);
  }

  private async pump() {
    if (this.active) return;
    const job = this.jobs.shift();
    if (!job) return;
    this.active = job;
    try {
      if (!await this.write(job, { status: "running" })) return;
      if (job.controller.signal.aborted) return;
      const candidates = await job.run(job.controller.signal, (progress) => {
        if (!job.controller.signal.aborted)
          void this.write(job, { progress }).catch(() => false);
      });
      if (job.controller.signal.aborted) return;
      const saved = await this.write(job, { status: "completed", unread: false }, candidates);
      if (saved && !job.controller.signal.aborted)
        await this.write(job, { unread: true });
    } catch (reason) {
      if (!job.controller.signal.aborted) {
        await this.write(job, {
          status: "failed", unread: true,
          error: reason instanceof Error ? reason.message : "AI 拆解失败，请重试。",
        }).catch(() => false);
      }
    } finally {
      this.active = undefined;
      void this.pump();
    }
  }
}
