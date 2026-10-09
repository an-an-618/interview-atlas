import { describe, expect, it, vi } from "vitest";
import type { AIExtractionInput, AIExtractionProgress } from "./types";
import {
  extractionSource, normalizeAnswerVoice, retrieveSyncBlocks, runInterviewExtraction,
  StructuredOutputError,
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

interface Target { id: string; title: string; quote: string; sourceContext?: string; }
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
  it("removes third-person speaker framing without rewriting answer content", () => {
    expect(normalizeAnswerVoice("候选人表示：过程性评测仍然需要人来参与。"))
      .toBe("过程性评测仍然需要人来参与。");
    expect(normalizeAnswerVoice("根据面试者的回答， 我会先检查线上指标。"))
      .toBe("我会先检查线上指标。");
    expect(normalizeAnswerVoice("我会先检查线上指标。"))
      .toBe("我会先检查线上指标。");
  });

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
      expect(data).not.toHaveProperty("existingSyncBlocks");
      if (data.stage === "inventory") {
        expect(data.source?.map((unit) => unit.text).join("")).toBe(raw);
        const start = data.knownQuestions.length;
        return {
          questions: quotes.slice(start, Math.min(52, start + data.pageSize)).map((quote) => anchor(raw, quote)),
          hasMore: start + data.pageSize < 52,
        };
      }
      if (data.stage === "coverage") {
        expect(data.source?.map((unit) => unit.text).join("")).toBe(raw);
        return { questions: [anchor(raw, quotes[52]!)], hasMore: false };
      }
      expect(data.targets.every((target) => raw.includes(target.sourceContext ?? ""))).toBe(true);
      return {
        questions: [...data.targets].reverse().map(({ id }) => ({
          id, answerPoints: [id === "q1" ? longAnswer : "比较过其他方案。"], tags: ["方案选择"],
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
      return { questions: data.targets.map(({ id }) => ({ id, answerPoints: [id === "q1" ? "因为成本。" : "因为效果。"], tags: [] })) };
    });
    const result = await runInterviewExtraction(input(raw), complete);
    expect(result.map((item) => item.answer)).toEqual(["因为成本。", "因为效果。"]);
  });

  it("grounds quotes across source boundaries and conservative text normalization", async () => {
    const raw = `${"前".repeat(1198)}你为 什么？\n候选人：因为效果。`;
    const complete = completeWith((data) => {
      if (data.stage === "inventory") {
        return {
          questions: [{
            title: "你为什么这样做？",
            sourceId: 1,
            quote: "你为什么?",
            occurrence: 1,
          }],
          hasMore: false,
        };
      }
      if (data.stage === "coverage") return empty();
      return { questions: [{ id: "q1", answerPoints: ["因为效果。"], tags: [] }] };
    });
    const result = await runInterviewExtraction(input(raw), complete);
    expect(result[0]).toMatchObject({
      title: "你为什么这样做？",
      sourceExcerpt: "你为 什么？",
    });
  });

  it("falls back to a bounded exact source window when the cited unit supports a paraphrased quote", async () => {
    const raw = "面试官：个性化评测更多依赖机评还是人评？\n候选人：过程性评测仍然需要人来参与。";
    const complete = completeWith((data) => {
      if (data.stage === "inventory") {
        return {
          questions: [{
            title: "个性化评测更依赖机器评估还是人工评估？",
            sourceId: 1,
            quote: "个性化评测主要依赖机器还是人工？",
            occurrence: 1,
          }],
          hasMore: false,
        };
      }
      if (data.stage === "coverage") return empty();
      return { questions: [{ id: "q1", answerPoints: ["候选人表示：过程性评测仍然需要人来参与。"], tags: [] }] };
    });
    const result = await runInterviewExtraction(input(raw), complete);
    expect(result[0]?.sourceExcerpt).toContain("个性化评测更多依赖机评还是人评");
    expect(result[0]?.answer).toBe("过程性评测仍然需要人来参与。");
  });

  it("accepts common inventory aliases and grounds a missing quote from the cited source", async () => {
    const raw = "面试官：请介绍一下你的项目。\n候选人：我负责需求分析和评测。";
    const complete = completeWith((data) => {
      if (data.stage === "inventory") {
        return {
          questions: [{
            question: "请介绍一下你的项目。",
            source_id: 1,
          }],
          hasMore: false,
        };
      }
      if (data.stage === "coverage") return empty();
      return {
        questions: [{
          id: "q1",
          answerPoints: ["我负责需求分析和评测。"],
          tags: ["项目经历"],
        }],
      };
    });
    const result = await runInterviewExtraction(input(raw), complete);
    expect(result[0]).toMatchObject({
      title: "请介绍一下你的项目。",
      answer: "我负责需求分析和评测。",
    });
    expect(raw).toContain(result[0]!.sourceExcerpt);
  });

  it("accepts a long exact quote but stores only a bounded original excerpt", async () => {
    const question = "为什么选择这个方案？";
    const raw = `${"项目背景。".repeat(60)}${question}\n候选人：因为成本更低。`;
    const complete = completeWith((data) => {
      if (data.stage === "inventory") {
        return {
          questions: [{
            title: question,
            sourceId: 1,
            quote: raw,
            occurrence: 1,
          }],
          hasMore: false,
        };
      }
      if (data.stage === "coverage") return empty();
      return {
        questions: [{
          id: "q1",
          answerPoints: ["因为成本更低。"],
          tags: ["方案选择"],
        }],
      };
    });
    const result = await runInterviewExtraction(input(raw), complete);
    expect(result[0]!.sourceExcerpt.length).toBeLessThanOrEqual(200);
    expect(result[0]!.sourceExcerpt).toContain(question);
    expect(raw).toContain(result[0]!.sourceExcerpt);
  });

  it("allows an explicitly identified question with no answer", async () => {
    const raw = "请介绍你们的实验。";
    const complete = completeWith((data) => {
      if (data.stage === "inventory") return { questions: [anchor(raw, raw)], hasMore: false };
      if (data.stage === "coverage") return empty();
      return { questions: [{ id: "q1", answerPoints: [], tags: ["实验"] }] };
    });
    expect(await runInterviewExtraction(input(raw), complete)).toEqual([{
      title: raw, sourceExcerpt: raw, answer: "", tags: ["实验"], suggestedSyncBlockId: null, matchReason: "",
    }]);
  });

  it("shrinks answer batches on truncation without redoing completed batches", async () => {
    const quotes = ["问题一？", "问题二？", "问题三？", "问题四？", "问题五？"];
    const raw = quotes.join("\n");
    const calls: string[][] = [];
    const complete = completeWith((data) => {
      if (data.stage === "inventory") {
        expect(data.source?.map((part) => part.text).join("")).toBe(raw);
        return { questions: quotes.map((quote) => anchor(raw, quote)), hasMore: false };
      }
      if (data.stage === "coverage") {
        expect(data.source?.map((part) => part.text).join("")).toBe(raw);
        return empty();
      }
      expect(data.targets.every((target) => raw.includes(target.sourceContext ?? ""))).toBe(true);
      calls.push(data.targets.map((item) => item.id));
      if (data.targets.length > 2) throw new StructuredOutputError("输出截断", "length");
      return { questions: data.targets.map(({ id }) => ({ id, answerPoints: [], tags: [] })) };
    });
    expect(await runInterviewExtraction(input(raw), complete)).toHaveLength(5);
    expect(calls[0]).toEqual(["q1", "q2", "q3", "q4"]);
    expect(calls).toEqual(expect.arrayContaining([
      ["q1", "q2"], ["q3", "q4"], ["q5"],
    ]));
  });

  it("runs two scoped answer batches concurrently", async () => {
    const quotes = Array.from({ length: 9 }, (_, index) => `问题${index + 1}怎么做？`);
    const answer = `我会先分析，再执行。${"补充依据。".repeat(100)}`;
    const raw = quotes.map((quote) => `${quote}\n${answer}\n`).join("");
    let active = 0;
    let maximum = 0;
    const contexts: string[] = [];
    const complete = completeWith(async (data) => {
      if (data.stage === "inventory") {
        return { questions: quotes.map((quote) => anchor(raw, quote)), hasMore: false };
      }
      if (data.stage === "coverage") return empty();
      active += 1;
      maximum = Math.max(maximum, active);
      contexts.push(...data.targets.map((target) => target.sourceContext ?? ""));
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return {
        questions: data.targets.map(({ id }) => ({
          id,
          answerPoints: [answer],
          tags: [],
        })),
      };
    });
    await expect(runInterviewExtraction(input(raw), complete)).resolves.toHaveLength(9);
    expect(maximum).toBe(2);
    expect(contexts.every((context) => context.length < raw.length)).toBe(true);
  });

  it.each([
    [],
    [{ id: "unknown", answerPoints: [], tags: [] }],
    [{ id: "q1", answerPoints: [], tags: [] }, { id: "q1", answerPoints: [], tags: [] }],
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
    expect(sizes).toEqual([24, 12, 6]);
  });

  it("retrieves beyond the first 50 blocks and only supplies relevant options to matching", async () => {
    const raw = "实验分组怎么做？";
    const fixture = input(raw);
    fixture.syncBlocks = Array.from({ length: 65 }, (_, index) => ({
      id: `s${index}`, title: index === 64 ? "实验分组" : "烹饪食谱",
      body: index === 64 ? "按用户随机分组。" : "煮饭方法。",
      linkedQuestionIds: [], favorite: false, pinned: false, hidden: false, reviewNotes: "", createdAt: "", updatedAt: "",
    }));
    const complete = completeWith((data) => {
      if (data.stage === "inventory") return { questions: [anchor(raw, raw)], hasMore: false };
      if (data.stage === "coverage") return empty();
      if (data.stage === "answers") return { questions: [{ id: "q1", answerPoints: [], tags: ["实验分组"] }] };
      expect(data).not.toHaveProperty("source");
      expect(data.questions[0]?.options.map((option) => option.id)).toEqual(["s64"]);
      return { matches: [{ id: "q1", suggestedSyncBlockId: "s64", matchReason: "都讨论实验分组方法" }] };
    });
    const result = await runInterviewExtraction(fixture, complete);
    expect(result[0]).toMatchObject({ title: raw, answer: "", suggestedSyncBlockId: "s64" });
    fixture.syncBlocks[64]!.hidden = true;
    expect(retrieveSyncBlocks(result[0]!, fixture)).toEqual([]);
  });

  it("retries a synchronization reason that is not written in Chinese", async () => {
    const raw = "实验分组怎么做？";
    const fixture = input(raw);
    fixture.syncBlocks = [{
      id: "s1", title: "实验分组", body: "按用户随机分组。",
      linkedQuestionIds: [], favorite: false, pinned: false, hidden: false,
      reviewNotes: "", createdAt: "", updatedAt: "",
    }];
    let matchingCalls = 0;
    const complete = completeWith((data) => {
      if (data.stage === "inventory") {
        return { questions: [anchor(raw, raw)], hasMore: false };
      }
      if (data.stage === "coverage") return empty();
      if (data.stage === "answers") {
        return {
          questions: [{
            id: "q1",
            answerPoints: ["我会按用户随机分组。"],
            tags: ["实验分组"],
          }],
        };
      }
      matchingCalls += 1;
      return {
        matches: [{
          id: "q1",
          suggestedSyncBlockId: "s1",
          matchReason: matchingCalls === 1
            ? "Both discuss user-level random assignment."
            : "都讨论按用户进行随机实验分组。",
        }],
      };
    });

    await expect(runInterviewExtraction(fixture, complete)).resolves.toMatchObject([{
      suggestedSyncBlockId: "s1",
      matchReason: "都讨论按用户进行随机实验分组。",
    }]);
    expect(matchingCalls).toBe(2);
  });

  it("keeps completed questions when optional synchronization matching fails", async () => {
    const raw = "实验分组怎么做？";
    const fixture = input(raw);
    fixture.syncBlocks = [{
      id: "s1", title: "实验分组", body: "按用户随机分组。",
      linkedQuestionIds: [], favorite: false, pinned: false, hidden: false,
      reviewNotes: "", createdAt: "", updatedAt: "",
    }];
    const complete = completeWith((data) => {
      if (data.stage === "inventory") return { questions: [anchor(raw, raw)], hasMore: false };
      if (data.stage === "coverage") return empty();
      if (data.stage === "answers") {
        return { questions: [{ id: "q1", answerPoints: ["候选人表示：按用户随机分组。"], tags: ["实验分组"] }] };
      }
      throw new Error("matching unavailable");
    });
    await expect(runInterviewExtraction(fixture, complete)).resolves.toMatchObject([{
      title: raw,
      answer: "按用户随机分组。",
      suggestedSyncBlockId: null,
    }]);
  });

  it.each(["inventory", "coverage", "answers", "matching"])("cancels at the %s stage without another request", async (cancelStage) => {
    const raw = "介绍项目。";
    const controller = new AbortController();
    const complete = completeWith((data) => {
      if (data.stage === "inventory") return { questions: [anchor(raw, raw)], hasMore: false };
      if (data.stage === "coverage") return empty();
      return { questions: [{ id: "q1", answerPoints: [], tags: [] }] };
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
