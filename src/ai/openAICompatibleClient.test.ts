import { describe, expect, it, vi } from "vitest";
import type { Interview } from "../domain/types";
import {
  createOpenAICompatibleClient,
  INTERVIEW_EXTRACTION_SYSTEM_PROMPT,
  parseExtractionResponse,
  resolveChatCompletionsUrl,
} from "./openAICompatibleClient";
import type { AIProviderConfig } from "./types";

const config: AIProviderConfig = {
  protocol: "openai-compatible",
  endpoint: "https://example.com/v1/",
  model: "test-model",
};

const interview: Interview = {
  id: "interview-1",
  company: "示例公司",
  role: "前端工程师",
  round: "一面",
  date: "2026-09-30",
  source: "测试",
  rawText: "面试官问：如何减少首屏时间？我回答先测量关键指标。",
  status: "draft",
  questionIds: [],
  createdAt: "2026-09-30T00:00:00.000Z",
  updatedAt: "2026-09-30T00:00:00.000Z",
};

describe("OpenAI-compatible client", () => {
  it("defines strict extraction, normalization, tagging, and sync matching rules", () => {
    expect(INTERVIEW_EXTRACTION_SYSTEM_PROMPT).toContain(
      "准确性和可追溯性优先于数量",
    );
    expect(INTERVIEW_EXTRACTION_SYSTEM_PROMPT).toContain(
      "删除不承载语义的口语填充",
    );
    expect(INTERVIEW_EXTRACTION_SYSTEM_PROMPT).toContain(
      "每题提取 1 到 4 个标签",
    );
    expect(INTERVIEW_EXTRACTION_SYSTEM_PROMPT).toContain(
      "核心主题、提问意图、回答范围和关键约束上均高度一致",
    );
    expect(INTERVIEW_EXTRACTION_SYSTEM_PROMPT).toContain(
      "多个同步块都可能匹配",
    );
  });

  it("normalizes base URLs and accepts a complete chat completions URL", () => {
    expect(resolveChatCompletionsUrl("https://example.com/v1/")).toBe(
      "https://example.com/v1/chat/completions",
    );
    expect(
      resolveChatCompletionsUrl(
        "http://localhost:11434/v1/chat/completions",
      ),
    ).toBe("http://localhost:11434/v1/chat/completions");
    expect(() => resolveChatCompletionsUrl("http://example.com/v1")).toThrow(
      "必须使用 HTTPS",
    );
    expect(() =>
      resolveChatCompletionsUrl("https://platform.kimi.com"),
    ).toThrow("Kimi 控制台地址");
    expect(resolveChatCompletionsUrl("https://api.moonshot.cn/v1")).toBe(
      "https://api.moonshot.cn/v1/chat/completions",
    );
  });

  it("parses fenced JSON and drops unknown sync block IDs", () => {
    const result = parseExtractionResponse(
      '```json\n{"questions":[{"title":"  首屏优化？ ","answer":"","tags":["性能","性能"],"sourceExcerpt":"原文","suggestedSyncBlockId":"unknown","matchReason":"相似"}]}\n```',
      new Set(["sync-1"]),
    );

    expect(result).toEqual([
      {
        title: "首屏优化？",
        answer: "",
        tags: ["性能"],
        sourceExcerpt: "原文",
        suggestedSyncBlockId: null,
        matchReason: "",
      },
    ]);
  });

  it("deduplicates and limits tags while keeping reasons only for valid matches", () => {
    const result = parseExtractionResponse(
      JSON.stringify({
        questions: [
          {
            title: "React Fiber 如何调度更新？",
            answer: "",
            tags: ["React", "Fiber", "调度", "前端框架", "性能", "React"],
            sourceExcerpt: "问 React Fiber 如何调度更新",
            suggestedSyncBlockId: "sync-1",
            matchReason: "都要求解释 Fiber 更新调度机制",
          },
        ],
      }),
      new Set(["sync-1"]),
    );

    expect(result[0]).toMatchObject({
      tags: ["React", "Fiber", "调度", "前端框架"],
      suggestedSyncBlockId: "sync-1",
      matchReason: "都要求解释 Fiber 更新调度机制",
    });
  });

  it("rejects malformed structured output", () => {
    expect(() => parseExtractionResponse("not json", new Set())).toThrow(
      "结构化数据",
    );
    expect(() =>
      parseExtractionResponse('{"answer":"missing questions"}', new Set()),
    ).toThrow("缺少问题列表");
  });

  it("extracts validated candidates without sending the whole workspace", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        messages: Array<{ content: string }>;
      };
      expect(body.messages[1]?.content).toContain(interview.rawText);
      expect(body.messages[1]?.content).not.toContain("reviewEvents");
      expect((init?.headers as Record<string, string>).Authorization).toBe(
        "Bearer secret",
      );

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  questions: [
                    {
                      title: "如何减少首屏时间？",
                      answer: "先测量关键指标。",
                      tags: ["性能"],
                      sourceExcerpt: "如何减少首屏时间",
                      suggestedSyncBlockId: "sync-1",
                      matchReason: "主题相同",
                    },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const client = createOpenAICompatibleClient(
      fetchMock as unknown as typeof fetch,
    );

    const result = await client.extractInterview(config, "secret", {
      interview,
      syncBlocks: [
        {
          id: "sync-1",
          title: "首屏性能",
          body: "先测量再优化。",
          reviewNotes: "",
          linkedQuestionIds: [],
          pinned: false,
          hidden: false,
          createdAt: interview.createdAt,
          updatedAt: interview.updatedAt,
        },
      ],
    });

    expect(result[0]?.suggestedSyncBlockId).toBe("sync-1");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/v1/chat/completions",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("maps authorization failures to a safe message", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 401 }));
    const client = createOpenAICompatibleClient(
      fetchMock as unknown as typeof fetch,
    );

    await expect(client.testConnection(config, "bad-key")).rejects.toThrow(
      "鉴权失败",
    );
  });

  it("uses Kimi K3 compatible parameters without overriding temperature", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        expect(body).not.toHaveProperty("temperature");
        expect(body).not.toHaveProperty("max_tokens");
        expect(body).toMatchObject({
          model: "kimi-k3",
          reasoning_effort: "low",
          max_completion_tokens: 256,
        });
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "OK" } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    );
    const client = createOpenAICompatibleClient(
      fetchMock as unknown as typeof fetch,
    );

    await client.testConnection(
      {
        protocol: "openai-compatible",
        endpoint: "https://api.moonshot.cn/v1",
        model: "kimi-k3",
      },
      "key",
    );
  });

  it("shows a safe provider message for invalid request parameters", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              message: "temperature is not allowed for this model",
              type: "invalid_request_error",
            },
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        ),
    );
    const client = createOpenAICompatibleClient(
      fetchMock as unknown as typeof fetch,
    );

    await expect(client.testConnection(config, "key")).rejects.toThrow(
      "temperature is not allowed",
    );
  });

  it("explains provider balance or activation failures", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 402 }));
    const client = createOpenAICompatibleClient(
      fetchMock as unknown as typeof fetch,
    );

    await expect(client.testConnection(config, "key")).rejects.toThrow(
      "余额不足",
    );
  });

  it("cancels without persisting a partial result", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.signal?.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }
        return new Response("", { status: 500 });
      },
    );
    const client = createOpenAICompatibleClient(
      fetchMock as unknown as typeof fetch,
    );
    const controller = new AbortController();
    controller.abort();

    await expect(
      client.extractInterview(
        config,
        "",
        { interview, syncBlocks: [] },
        controller.signal,
      ),
    ).rejects.toThrow("已取消");
  });
});
