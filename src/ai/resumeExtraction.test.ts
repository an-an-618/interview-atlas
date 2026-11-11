import { describe, expect, it, vi } from "vitest";
import { createOpenAICompatibleClient } from "./openAICompatibleClient";
import { parseResumeExtraction, RESUME_EXTRACTION_SYSTEM_PROMPT } from "./resumeExtraction";
import type { AIProviderConfig, AIResumeInput } from "./types";

const config: AIProviderConfig = { protocol: "openai-compatible", endpoint: "https://example.com/v1", model: "resume-model" };
const input: AIResumeInput = { kind: "text", text: "示例公司 产品实习 2025.01-2025.06\n完成 12 次访谈。\n示例大学 历史学 2024-2028" };
const candidate = { type: "实习", title: "产品实习", organization: "示例公司", period: "2025.01-2025.06", bullets: ["完成 12 次访谈。"], sourceExcerpt: "示例公司 产品实习" };
const payload = { experiences: [candidate] };
const completion = (content: unknown, finishReason = "stop") => new Response(JSON.stringify({
  choices: [{ finish_reason: finishReason, message: { content: typeof content === "string" ? content : JSON.stringify(content) } }],
}));

describe("resume AI extraction", () => {
  it("uses only the configured API/model and resume evidence, with credentials only in headers", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(completion(payload));
    const result = await createOpenAICompatibleClient(fetchMock).extractResume(config, "private-api-key", input);
    expect(result).toEqual([candidate]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://example.com/v1/chat/completions");
    expect(request?.headers).toMatchObject({ Authorization: "Bearer private-api-key" });
    const body = JSON.parse(request?.body as string);
    expect(body.model).toBe(config.model);
    expect(body.messages[0]).toEqual({ role: "system", content: RESUME_EXTRACTION_SYSTEM_PROMPT });
    expect(JSON.parse(body.messages[1].content)).toEqual({ task: "提取简历中的全部经历", resumeText: input.text });
    expect(request?.body).not.toContain("private-api-key");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.max_tokens).toBe(16_000);
  });

  it("sends selected image content in the compatible multimodal message schema", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(completion(payload));
    const image: AIResumeInput = { kind: "images", imageDataUrls: ["data:image/png;base64,iVBORw0KGgo="] };
    expect(await createOpenAICompatibleClient(fetchMock).extractResume(config, "", image)).toEqual([candidate]);
    const body = JSON.parse(fetchMock.mock.calls[0]![1]?.body as string);
    expect(body.messages[1].content[1]).toEqual({ type: "image_url", image_url: { url: image.imageDataUrls[0], detail: "high" } });
  });

  it("never makes an API request for invalid or oversized input", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const client = createOpenAICompatibleClient(fetchMock);
    await expect(client.extractResume(config, "", { kind: "text", text: "" })).rejects.toThrow("没有");
    await expect(client.extractResume(config, "", { kind: "text", text: "x".repeat(100_001) })).rejects.toThrow("未被截短");
    await expect(client.extractResume(config, "", { kind: "images", imageDataUrls: ["https://untrusted.example/resume.png"] })).rejects.toThrow("格式无效");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("validates every experience and does not accept a partial or ungrounded result", () => {
    expect(parseResumeExtraction({ experiences: [] }, input)).toEqual([]);
    expect(parseResumeExtraction({ experiences: [{ ...candidate, sourceExcerpt: "示例公司\n 产品实习" }] }, input)).toHaveLength(1);
    for (const invalid of [
      { ...candidate, title: "" }, { ...candidate, type: "技能" },
      { ...candidate, bullets: [""] }, { ...candidate, period: 2025 },
      { ...candidate, sourceExcerpt: "不存在的职位" }, null,
    ]) {
      expect(() => parseResumeExtraction({ experiences: [candidate, invalid] }, input)).toThrow();
    }
    expect(() => parseResumeExtraction({ experiences: Array(41).fill(candidate) }, input)).toThrow("40");
    expect(() => parseResumeExtraction({}, input)).toThrow("缺少");
  });

  it("rejects truncated responses and cancellation without creating any result", async () => {
    const truncated = vi.fn<typeof fetch>().mockResolvedValue(completion(payload, "length"));
    await expect(createOpenAICompatibleClient(truncated).extractResume(config, "", input)).rejects.toThrow("不完整");
    const controller = new AbortController();
    const pending = vi.fn<typeof fetch>().mockImplementation(async () => {
      controller.abort();
      return completion(payload);
    });
    await expect(createOpenAICompatibleClient(pending).extractResume(config, "", input, controller.signal)).rejects.toThrow("取消");
  });

  it("falls back once when the service explicitly does not support JSON mode", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "response_format json_object not supported" } }), { status: 400 }))
      .mockResolvedValueOnce(completion(payload));
    expect(await createOpenAICompatibleClient(fetchMock).extractResume(config, "", input)).toEqual([candidate]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1]![1]?.body as string)).not.toHaveProperty("response_format");
  });
});
