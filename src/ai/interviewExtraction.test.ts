import { describe, expect, it, vi } from "vitest";
import type { AIExtractionInput, AIExtractionProgress } from "./types";
import {
  extractionSource, retrieveSyncBlocks, runInterviewExtraction, StructuredOutputError,
} from "./interviewExtraction";

function input(rawText: string): AIExtractionInput {
  return {
    interview: {
      id: "synthetic", company: "示例", role: "产品", round: "二面", date: "2026-10-01",
      source: "测试", rawText, status: "draft", questionIds: [], createdAt: "", updatedAt: "",
    },
    syncBlocks: [],
  };
}

interface Target { id: string; title: string; quote: string; }
interface Data {
  stage: string;
  source?: Array<{ id: number; text: string }>;
  pageSize: number;
  knownQuestions: Array<{ title: string }>;
  targets: Target[];
  questions: Array<{ id: string; options: Array<{ id: string }> }>;
}
const empty = () => ({ questions: [], hasMore: false });

function anchor(raw: string, quote: string, title = quote) {
  const unit = extractionSource(raw).find((part) => part.text.includes(quote));
  if (!unit) throw new Error("Invalid synthetic fixture");
  return { sourceId: unit.id, quote, title, occurrence: 1 };
}

function completeWith(handler: (data: Data) => Record<string, unknown> | Promise<Record<string, unknown>>) {
  return vi.fn(async (_system: string, data: Record<string, unknown>) => handler(data as unknown as Data));
}

describe("full-transcript extraction harness", () => {
  it("preserves every character including newlines and surrogate pairs in source addressing", () => {
    const raw = "字".repeat(1199) + "😀\r\n" + "长回答。\n".repeat(800);
    const source = extractionSource(raw);
    expect(source.map((unit) => unit.text).join("")).toBe(raw);
    expect(source.every((unit) => !/[\uD800-\uDBFF]$/.test(unit.text))).toBe(true);
  });

  it("paginates beyond 40 questions, adds coverage omissions, and retains long cross-source answers", async () => {
    const quotes = Array.from({ length: 53 }, (_, index) => `第${index + 1}题为什么这样选？`);
    const longAnswer = "候选人阐述决策依据和约束条件。".repeat(1000);
    const raw = quotes.map((quote, index) => `${quote}\n${index === 0 ? longAnswer : "候选人：比较过其他方案。"}\n`).join("");
    const fixture = input(raw);
    const progress: AIExtractionProgress[] = [];
    const complete = completeWith((data) => {
      expect(data.source?.map((unit) => unit.text).join("")).toBe(raw);
      expect(data).not.toHaveProperty("existingSyncBlocks");
      if (data.stage === "inventory") {
        const start = data.knownQuestions.length;
        return {
          questions: quotes.slice(start, Math.min(52, start + data.pageSize)).map((quote) => anchor(raw, quote)),
          hasMore: start + data.pageSize < 52,
        };
      }
      if (data.stage === "coverage") return { questions: [anchor(raw, quotes[52]!)], hasMore: false };
      return {
        questions: [...data.targets].reverse().map(({ id }) => ({
          id, answer: id === "q1" ? longAnswer : "比较过其他方案。", tags: ["方案选择"],
        })),
      };
    });
    const result = await runInterviewExtraction(fixture, complete, undefined, (value) => progress.push(value));
    expect(result).toHaveLength(53);
    expect(result.map((item) => item.title)).toEqual(quotes);
    expect(result[0]!.answer).toBe(longAnswer);
    expect(result[52]!.sourceExcerpt).toBe(quotes[52]);
    expect(result.every((item) => item.suggestedSyncBlockId === null)).toBe(true);
    expect(fixture.interview.rawText).toBe(raw);
    expect(progress.at(-1)?.completed).toBe(progress.at(-1)?.total);
  });

  it("deduplicates the same source occurrence but keeps distinct occurrences of an identical question", async () => {
    const raw = "为什么？因为成本。\n为什么？因为效果。";
    const first = anchor(raw, "为什么？");
    const second = { ...first, occurrence: 2 };
    const complete = completeWith((data) => {
      if (data.stage === "inventory") return { questions: [first, second], hasMore: false };
      if (data.stage === "coverage") return { questions: [first], hasMore: false };
      return { questions: data.targets.map(({ id }) => ({ id, answer: id === "q1" ? "因为成本。" : "因为效果。", tags: [] })) };
    });
    const result = await runInterviewExtraction(input(raw), complete);
    expect(result.map((item) => item.answer)).toEqual(["因为成本。", "因为效果。"]);
  });

  it("allows an explicitly identified question with no answer", async () => {
    const raw = "请介绍你们的实验。";
    const complete = completeWith((data) => {
      if (data.stage === "inventory") return { questions: [anchor(raw, raw)], hasMore: false };
      if (data.stage === "coverage") return empty();
      return { questions: [{ id: "q1", answer: "", tags: ["实验"] }] };
    });
    expect(await runInterviewExtraction(input(raw), complete)).toEqual([{
      title: raw, sourceExcerpt: raw, answer: "", tags: ["实验"], suggestedSyncBlockId: null, matchReason: "",
    }]);
  });

  it("shrinks answer batches on truncation without shrinking the evidence or redoing completed batches", async () => {
    const quotes = ["问题一？", "问题二？", "问题三？", "问题四？", "问题五？"];
    const raw = quotes.join("\n");
    const calls: string[][] = [];
    const complete = completeWith((data) => {
      expect(data.source?.map((part) => part.text).join("")).toBe(raw);
      if (data.stage === "inventory") return { questions: quotes.map((quote) => anchor(raw, quote)), hasMore: false };
      if (data.stage === "coverage") return empty();
      calls.push(data.targets.map((item) => item.id));
      if (data.targets.length > 2) throw new StructuredOutputError("输出截断", "length");
      return { questions: data.targets.map(({ id }) => ({ id, answer: "", tags: [] })) };
    });
    expect(await runInterviewExtraction(input(raw), complete)).toHaveLength(5);
    expect(calls).toEqual([
      ["q1", "q2", "q3", "q4"], ["q1", "q2", "q3", "q4"], ["q1", "q2"], ["q3", "q4"], ["q5"],
    ]);
  });

  it.each([
    [],
    [{ id: "unknown", answer: "", tags: [] }],
    [{ id: "q1", answer: "", tags: [] }, { id: "q1", answer: "", tags: [] }],
    [{ id: "q1", tags: [] }],
  ].map((questions) => ({ questions })))("never returns partial success for missing/unknown/duplicate answer IDs or missing answers: %j", async ({ questions }) => {
    const raw = "介绍项目。";
    const complete = completeWith((data) => {
      if (data.stage === "inventory") return { questions: [anchor(raw, raw)], hasMore: false };
      if (data.stage === "coverage") return empty();
      return { questions };
    });
    await expect(runInterviewExtraction(input(raw), complete)).rejects.toThrow("回答整理未完成");
    expect(complete).toHaveBeenCalledTimes(4);
  });

  it("rejects invented question evidence rather than persisting it", async () => {
    const complete = completeWith(() => ({
      questions: [{ title: "虚构问题", sourceId: 1, quote: "并不存在的提问" }], hasMore: false,
    }));
    await expect(runInterviewExtraction(input("真实原文。"), complete)).rejects.toThrow("无法在原文定位");
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it("fails a non-advancing page instead of accepting an incomplete inventory", async () => {
    const raw = "问题一？";
    const complete = completeWith(() => ({ questions: [anchor(raw, raw)], hasMore: true }));
    await expect(runInterviewExtraction(input(raw), complete)).rejects.toThrow("分页未继续");
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it("reduces inventory page size on output limits and still sends the full source", async () => {
    const raw = "为什么？" + "解释。".repeat(2000);
    const sizes: number[] = [];
    const complete = completeWith((data) => {
      expect(data.source?.map((part) => part.text).join("")).toBe(raw);
      if (data.stage === "inventory") {
        sizes.push(data.pageSize);
        if (data.pageSize > 6) throw new StructuredOutputError("length", "length");
      }
      return empty();
    });
    expect(await runInterviewExtraction(input(raw), complete)).toEqual([]);
    expect(sizes).toEqual([24, 24, 12, 12, 6]);
  });

  it("retrieves beyond the first 50 blocks and only supplies relevant options to matching", async () => {
    const raw = "实验分组怎么做？";
    const fixture = input(raw);
    fixture.syncBlocks = Array.from({ length: 65 }, (_, index) => ({
      id: `s${index}`, title: index === 64 ? "实验分组" : "烹饪食谱",
      body: index === 64 ? "按用户随机分组。" : "煮饭方法。",
      linkedQuestionIds: [], pinned: false, hidden: false, reviewNotes: "", createdAt: "", updatedAt: "",
    }));
    const complete = completeWith((data) => {
      if (data.stage === "inventory") return { questions: [anchor(raw, raw)], hasMore: false };
      if (data.stage === "coverage") return empty();
      if (data.stage === "answers") return { questions: [{ id: "q1", answer: "", tags: ["实验分组"] }] };
      expect(data).not.toHaveProperty("source");
      expect(data.questions[0]?.options.map((option) => option.id)).toEqual(["s64"]);
      return { matches: [{ id: "q1", suggestedSyncBlockId: "s64", matchReason: "都讨论实验分组方法" }] };
    });
    const result = await runInterviewExtraction(fixture, complete);
    expect(result[0]).toMatchObject({ title: raw, answer: "", suggestedSyncBlockId: "s64" });
    fixture.syncBlocks[64]!.hidden = true;
    expect(retrieveSyncBlocks(result[0]!, fixture)).toEqual([]);
  });

  it.each(["inventory", "coverage", "answers", "matching"])("cancels at the %s stage without another request", async (cancelStage) => {
    const raw = "介绍项目。";
    const controller = new AbortController();
    const complete = completeWith((data) => {
      if (data.stage === "inventory") return { questions: [anchor(raw, raw)], hasMore: false };
      if (data.stage === "coverage") return empty();
      return { questions: [{ id: "q1", answer: "", tags: [] }] };
    });
    await expect(runInterviewExtraction(input(raw), complete, controller.signal, (value) => {
      if (value.stage === cancelStage) controller.abort();
    })).rejects.toThrow("已取消");
    expect(complete).toHaveBeenCalledTimes(["inventory", "coverage", "answers", "matching"].indexOf(cancelStage));
  });

  it("rejects empty or oversized input without a provider request", async () => {
    const complete = completeWith(empty);
    await expect(runInterviewExtraction(input("  "), complete)).rejects.toThrow("填写");
    await expect(runInterviewExtraction(input("字".repeat(100_001)), complete)).rejects.toThrow("10 万字");
    expect(complete).not.toHaveBeenCalled();
  });

  it("enforces the operation deadline and does not return a late response", async () => {
    vi.useFakeTimers();
    try {
      const complete = completeWith(() => {
        vi.setSystemTime(Date.now() + 46 * 60_000);
        return empty();
      });
      await expect(runInterviewExtraction(input("问题？"), complete)).rejects.toThrow("处理时限");
      expect(complete).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
});
