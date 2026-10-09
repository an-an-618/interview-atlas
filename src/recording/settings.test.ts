import { describe, expect, it } from "vitest";
import {
  clearTranscriptionSessionConfig,
  isTranscriptionServiceConfig,
  isTranscriptionServiceConfigured,
  normalizeTranscriptionServiceConfig,
  readTranscriptionSessionConfig,
  TRANSCRIPTION_SESSION_KEY,
  toXfyunCredentials,
  writeTranscriptionSessionConfig,
} from "./settings";

describe("transcription settings", () => {
  it("normalizes session-only Xfyun credentials", () => {
    const normalized = normalizeTranscriptionServiceConfig({
      provider: "xfyun",
      appId: " app ",
      apiKey: " key ",
      apiSecret: " secret ",
    });

    expect(normalized).toEqual({
      provider: "xfyun",
      appId: "app",
      apiKey: "key",
      apiSecret: "secret",
    });
    expect(isTranscriptionServiceConfigured(normalized)).toBe(true);
    expect(toXfyunCredentials(normalized)).toEqual({
      appId: "app",
      apiKey: "key",
      apiSecret: "secret",
    });
  });

  it("requires the Xfyun provider and all three credentials", () => {
    expect(
      isTranscriptionServiceConfig({
        provider: "xfyun",
        appId: "",
        apiKey: "",
        apiSecret: "",
      }),
    ).toBe(true);
    expect(
      isTranscriptionServiceConfigured({
        provider: "xfyun",
        appId: "app",
        apiKey: "key",
        apiSecret: "",
      }),
    ).toBe(false);
    expect(
      isTranscriptionServiceConfig({
        provider: "other",
        appId: "app",
        apiKey: "key",
        apiSecret: "secret",
      }),
    ).toBe(false);
  });

  it("stores and clears credentials only through the supplied session storage", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    const config = {
      provider: "xfyun" as const,
      appId: " app ",
      apiKey: " key ",
      apiSecret: " secret ",
    };

    writeTranscriptionSessionConfig(storage, config);

    expect(values.has(TRANSCRIPTION_SESSION_KEY)).toBe(true);
    expect(readTranscriptionSessionConfig(storage)).toEqual({
      provider: "xfyun",
      appId: "app",
      apiKey: "key",
      apiSecret: "secret",
    });

    clearTranscriptionSessionConfig(storage);
    expect(readTranscriptionSessionConfig(storage)).toBeNull();
  });
});
