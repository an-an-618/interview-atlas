import { describe, expect, it } from "vitest";
import {
  aiProviderPresets,
  matchAIProviderPreset,
  type AIProviderConfig,
} from "./types";

describe("AI provider presets", () => {
  it("defines the supported official providers with complete connection data", () => {
    expect(aiProviderPresets.map((preset) => preset.id)).toEqual([
      "easycompute",
      "kimi",
      "openai",
      "anthropic",
      "glm",
      "deepseek",
      "qwen",
    ]);

    for (const preset of aiProviderPresets) {
      expect(preset.endpoint).toMatch(/^https:\/\//);
      expect(preset.model).toBeTruthy();
      expect(preset.models).toContain(preset.model);
      expect(preset.docsUrl).toMatch(/^https:\/\//);
      expect(preset.consoleUrl).toMatch(/^https:\/\//);
    }
  });

  it("matches saved provider configs by normalized endpoint", () => {
    const config: AIProviderConfig = {
      protocol: "openai-compatible",
      endpoint: "https://api.moonshot.cn/v1/",
      model: "kimi-k3",
    };

    expect(matchAIProviderPreset(config)?.id).toBe("kimi");
    expect(
      matchAIProviderPreset({
        ...config,
        endpoint: "https://llmapi.paratera.com/v1/",
      })?.id,
    ).toBe("easycompute");
    expect(
      matchAIProviderPreset({
        ...config,
        endpoint: "http://localhost:11434/v1",
      }),
    ).toBeUndefined();
  });
});
