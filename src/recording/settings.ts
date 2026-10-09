import type { XfyunCredentials } from "./types";

export type TranscriptionProviderId = "xfyun";
export const TRANSCRIPTION_SESSION_KEY =
  "interview-atlas.xfyun.credentials";

export interface TranscriptionServiceConfig extends XfyunCredentials {
  provider: TranscriptionProviderId;
}

export const defaultTranscriptionServiceConfig: TranscriptionServiceConfig = {
  provider: "xfyun",
  appId: "",
  apiKey: "",
  apiSecret: "",
};

export function isTranscriptionServiceConfig(
  value: unknown,
): value is TranscriptionServiceConfig {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<TranscriptionServiceConfig>;
  return (
    candidate.provider === "xfyun" &&
    typeof candidate.appId === "string" &&
    typeof candidate.apiKey === "string" &&
    typeof candidate.apiSecret === "string"
  );
}

export function normalizeTranscriptionServiceConfig(
  config: TranscriptionServiceConfig,
): TranscriptionServiceConfig {
  return {
    provider: "xfyun",
    appId: config.appId.trim(),
    apiKey: config.apiKey.trim(),
    apiSecret: config.apiSecret.trim(),
  };
}

export function isTranscriptionServiceConfigured(
  config: TranscriptionServiceConfig,
): boolean {
  const normalized = normalizeTranscriptionServiceConfig(config);
  return Boolean(
    normalized.appId && normalized.apiKey && normalized.apiSecret,
  );
}

export function toXfyunCredentials(
  config: TranscriptionServiceConfig,
): XfyunCredentials {
  const normalized = normalizeTranscriptionServiceConfig(config);
  return {
    appId: normalized.appId,
    apiKey: normalized.apiKey,
    apiSecret: normalized.apiSecret,
  };
}

export function readTranscriptionSessionConfig(
  storage: Pick<Storage, "getItem">,
): TranscriptionServiceConfig | null {
  try {
    const stored = storage.getItem(TRANSCRIPTION_SESSION_KEY);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    return isTranscriptionServiceConfig(parsed)
      ? normalizeTranscriptionServiceConfig(parsed)
      : null;
  } catch {
    return null;
  }
}

export function writeTranscriptionSessionConfig(
  storage: Pick<Storage, "setItem">,
  config: TranscriptionServiceConfig,
): void {
  storage.setItem(
    TRANSCRIPTION_SESSION_KEY,
    JSON.stringify(normalizeTranscriptionServiceConfig(config)),
  );
}

export function clearTranscriptionSessionConfig(
  storage: Pick<Storage, "removeItem">,
): void {
  storage.removeItem(TRANSCRIPTION_SESSION_KEY);
}
