import { useEffect, useState } from "react";
import {
  indexedDbRepository,
  type WorkspaceRepository,
} from "../data/repository";
import {
  clearTranscriptionSessionConfig,
  defaultTranscriptionServiceConfig,
  isTranscriptionServiceConfig,
  isTranscriptionServiceConfigured,
  normalizeTranscriptionServiceConfig,
  readTranscriptionSessionConfig,
  toXfyunCredentials,
  type TranscriptionServiceConfig,
  writeTranscriptionSessionConfig,
} from "../recording/settings";

const CONFIG_PREFERENCE_KEY = "transcription.provider.config";

export function useTranscriptionSettings(
  repository: WorkspaceRepository = indexedDbRepository,
) {
  const [config, setConfig] = useState(
    () =>
      readTranscriptionSessionConfig(sessionStorage) ??
      defaultTranscriptionServiceConfig,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const sessionConfig = readTranscriptionSessionConfig(sessionStorage);
        const persisted =
          await repository.getPreference<TranscriptionServiceConfig>(
            CONFIG_PREFERENCE_KEY,
          );
        if (isTranscriptionServiceConfig(persisted)) {
          if (!sessionConfig) {
            writeTranscriptionSessionConfig(sessionStorage, persisted);
            if (active) {
              setConfig(normalizeTranscriptionServiceConfig(persisted));
            }
          }
          await repository.setPreference(
            CONFIG_PREFERENCE_KEY,
            defaultTranscriptionServiceConfig,
          );
        }
      } catch (reason) {
        if (!active) return;
        setError(
          reason instanceof Error
            ? reason.message
            : "无法读取或清理语音转写配置。",
        );
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [repository]);

  const saveConfig = async (next: TranscriptionServiceConfig) => {
    const normalized = normalizeTranscriptionServiceConfig(next);
    if (!isTranscriptionServiceConfigured(normalized)) {
      throw new Error("请完整填写讯飞 AppID、APIKey 和 APISecret。");
    }
    writeTranscriptionSessionConfig(sessionStorage, normalized);
    setConfig(normalized);
    setError(null);
  };

  const clearConfig = async () => {
    clearTranscriptionSessionConfig(sessionStorage);
    setConfig(defaultTranscriptionServiceConfig);
    setError(null);
  };

  return {
    config,
    credentials: toXfyunCredentials(config),
    configured: isTranscriptionServiceConfigured(config),
    loading,
    error,
    saveConfig,
    clearConfig,
    dismissError: () => setError(null),
  };
}
