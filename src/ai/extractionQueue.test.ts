import { describe, expect, it, vi } from "vitest";
import { ExtractionQueue, sortInterviews, type SaveTask } from "./extractionQueue";
import type { Interview, SaveAIReviewCandidateInput } from "../domain/types";

const interview = (id: string): Interview => ({
  id, company: id, role: "", round: "", date: "2026-01-01", source: "test",
  rawText: `原文 ${id}`, status: "draft", questionIds: [],
  createdAt: id, updatedAt: id,
});
const candidates: SaveAIReviewCandidateInput[] = [{
  title: "问题", answer: "回答", tags: [], sourceExcerpt: "原文",
  suggestedSyncBlockId: null, matchReason: "",
}];
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };

describe("application extraction queue", () => {
  it("runs FIFO once per interview and survives the caller returning", async () => {
    const save = vi.fn<SaveTask>().mockResolvedValue(true);
    const queue = new ExtractionQueue(save);
    const first = deferred<SaveAIReviewCandidateInput[]>();
    const runA = vi.fn(() => first.promise);
    const runB = vi.fn(async () => candidates);
    const id = queue.enqueue(interview("a"), runA);
    expect(queue.enqueue(interview("a"), runA)).toBe(id);
    queue.enqueue(interview("b"), runB);
    await flush();
    expect(runA).toHaveBeenCalledTimes(1);
    expect(runB).not.toHaveBeenCalled();
    first.resolve(candidates);
    await flush();
    expect(runB).toHaveBeenCalledTimes(1);
    expect(save.mock.calls.filter((call) => call[2].unread)).toHaveLength(2);
    expect(save.mock.calls.filter((call) => call[3])).toHaveLength(2);
  });

  it("waits for durable review persistence before emitting completion", async () => {
    const stored = deferred<boolean>();
    const save = vi.fn<SaveTask>().mockImplementation(async (_id, _source, _task, values) =>
      values ? stored.promise : true);
    const queue = new ExtractionQueue(save);
    queue.enqueue(interview("a"), async () => candidates);
    await flush();
    expect(save.mock.calls.some((call) => call[2].unread)).toBe(false);
    stored.resolve(true);
    await flush();
    expect(save.mock.calls.at(-1)?.[2]).toMatchObject({ status: "completed", unread: true });
  });

  it("does not announce stale results rejected by the workspace guard", async () => {
    const save = vi.fn<SaveTask>().mockImplementation(async (_id, _source, _task, values) => !values);
    const queue = new ExtractionQueue(save);
    queue.enqueue(interview("a"), async () => candidates);
    await flush();
    expect(save.mock.calls.some((call) => call[2].unread)).toBe(false);
  });

  it("cancels queued work and ignores late results from an aborted request", async () => {
    const save = vi.fn<SaveTask>().mockResolvedValue(true);
    const queue = new ExtractionQueue(save);
    const first = deferred<SaveAIReviewCandidateInput[]>();
    const runA = vi.fn(() => first.promise);
    const runB = vi.fn(async () => candidates);
    queue.enqueue(interview("a"), runA);
    queue.enqueue(interview("b"), runB);
    await flush();
    queue.cancel("b");
    queue.cancel("a");
    expect(runA.mock.calls[0]).toBeDefined();
    first.resolve(candidates);
    await flush();
    expect(runB).not.toHaveBeenCalled();
    expect(save.mock.calls.some((call) => call[3])).toBe(false);
    expect(save.mock.calls.filter((call) => call[2].status === "cancelled")).toHaveLength(2);
  });

  it("continues after provider or persistence failure", async () => {
    const save = vi.fn<SaveTask>().mockImplementation(async (id, _source, _task, values) => {
      if (id === "b" && values) throw new Error("本地保存失败");
      return true;
    });
    const queue = new ExtractionQueue(save);
    queue.enqueue(interview("a"), async () => { throw new Error("服务暂不可用"); });
    queue.enqueue(interview("b"), async () => candidates);
    queue.enqueue(interview("c"), async () => candidates);
    await flush();
    const notifications = save.mock.calls.filter((call) => call[2].unread);
    expect(notifications.map((call) => call[2].status)).toEqual(["failed", "failed", "completed"]);
  });

  it("prevents writes after workspace replacement even if provider ignores abort", async () => {
    const save = vi.fn<SaveTask>().mockResolvedValue(true);
    const queue = new ExtractionQueue(save);
    const first = deferred<SaveAIReviewCandidateInput[]>();
    queue.enqueue(interview("a"), () => first.promise);
    const next = vi.fn(async () => candidates);
    queue.enqueue(interview("b"), next);
    await flush();
    queue.dispose();
    const count = save.mock.calls.length;
    first.resolve(candidates);
    await flush();
    expect(save).toHaveBeenCalledTimes(count);
    expect(next).not.toHaveBeenCalled();
    queue.enqueue(interview("c"), next);
    await flush();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("supports explicit retry with a fresh task ID", async () => {
    const save = vi.fn<SaveTask>().mockResolvedValue(true);
    const queue = new ExtractionQueue(save);
    const first = queue.enqueue(interview("a"), async () => { throw new Error("失败"); });
    await flush();
    const second = queue.enqueue(interview("a"), async () => candidates);
    await flush();
    expect(second).not.toBe(first);
    expect(save.mock.calls.at(-1)?.[2]).toMatchObject({ id: second, status: "completed" });
  });

  it("shows active imports first, ordered by creation instead of transcript date", () => {
    const active = { ...interview("a"), extractionTask: {
      id: "task", status: "running" as const, updatedAt: "",
    } };
    expect([interview("c"), active, interview("b")].sort(sortInterviews).map((item) => item.id))
      .toEqual(["a", "c", "b"]);
  });
});
