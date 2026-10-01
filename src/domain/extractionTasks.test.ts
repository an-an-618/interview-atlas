import { describe, expect, it } from "vitest";
import { applyExtractionTask, recoverExtractionTasks } from "./extractionTasks";
import { addInterview, addStandaloneQuestion, emptyWorkspace } from "./workspace";
import type { ExtractionTask } from "./types";

const task: ExtractionTask = { id: "task", status: "queued", updatedAt: "2026-10-01" };
function setup() {
  const { workspace, interview } = addInterview(emptyWorkspace(), {
    company: "测试", role: "", round: "", date: "2026-10-01", source: "测试", rawText: "原文",
  });
  return { interview, workspace: applyExtractionTask(workspace, interview.id, "原文", { ...task })! };
}
const candidates = [{ title: "问题", answer: "回答", tags: [], sourceExcerpt: "原文", suggestedSyncBlockId: null, matchReason: "" }];

describe("persisted extraction lifecycle", () => {
  it("recovers queued and running jobs as interrupted while keeping completed unread results", () => {
    const { workspace } = setup();
    for (const status of ["queued", "running"] as const) {
      workspace.interviews[0].extractionTask!.status = status;
      const recovered = recoverExtractionTasks(workspace);
      expect(recovered.interviews[0].extractionTask?.status).toBe("interrupted");
      expect(recovered.interviews[0].rawText).toBe("原文");
    }
    workspace.interviews[0].extractionTask = { ...task, status: "completed", unread: true };
    expect(recoverExtractionTasks(workspace).interviews[0].extractionTask?.unread).toBe(true);
  });

  it("rejects completions for removed interviews, changed source and replaced task IDs", () => {
    const { workspace, interview } = setup();
    const done = { ...task, status: "completed" as const };
    expect(applyExtractionTask(emptyWorkspace(), interview.id, "原文", done, candidates)).toBeNull();
    expect(applyExtractionTask(workspace, interview.id, "旧原文", done, candidates)).toBeNull();
    expect(applyExtractionTask(workspace, interview.id, "原文", { ...done, id: "stale" }, candidates)).toBeNull();
    expect(workspace.aiReviews).toHaveLength(0);
  });

  it("preserves concurrent manual edits and creates review candidates without accepting them", () => {
    const { workspace, interview } = setup();
    const edited = addStandaloneQuestion(workspace, { title: "手动问答", answer: "保留", tags: [] }).workspace;
    const next = applyExtractionTask(edited, interview.id, "原文", { ...task, status: "completed" }, candidates)!;
    expect(next.questions).toEqual(edited.questions);
    expect(next.interviews[0].rawText).toBe("原文");
    expect(next.aiReviews[0].candidates[0].decision).toBe("pending");
    expect(next.interviews[0].questionIds).toHaveLength(0);
  });
});
