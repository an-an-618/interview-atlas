import { useEffect, useState } from "react";
import {
  indexedDbRepository,
  type WorkspaceRepository,
} from "../data/repository";
import {
  defaultAIProviderConfig,
  matchAIProviderPreset,
  type AIProviderCredentialId,
  type AIProviderConfig,
} from "../ai/types";
import { resolveChatCompletionsUrl } from "../ai/openAICompatibleClient";

const CONFIG_PREFERENCE_KEY = "ai.provider.config";
const LEGACY_SESSION_KEY = "interview-atlas.ai.api-key";
const CREDENTIALS_SESSION_KEY = "interview-atlas.ai.provider-keys";

type SessionCredentials = Partial<Record<AIProviderCredentialId, string>>;

function readLegacySessionKey(): string {
  try {
    return sessionStorage.getItem(LEGACY_SESSION_KEY) ?? "";
  } catch {
    return "";
  }
}

function readSessionCredentials(): SessionCredentials {
  try {
    const stored = sessionStorage.getItem(CREDENTIALS_SESSION_KEY);
    if (!stored) return {};
    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== "object" || parsed === null) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([, value]) => typeof value === "string" && value,
      ),
    ) as SessionCredentials;
  } catch {
    return {};
  }
}

function credentialIdForConfig(
  config: AIProviderConfig,
): AIProviderCredentialId {
  return matchAIProviderPreset(config)?.id ?? "custom";
}

function isProviderConfig(value: unknown): value is AIProviderConfig {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<AIProviderConfig>;
  return (
    candidate.protocol === "openai-compatible" &&
    typeof candidate.endpoint === "string" &&
    typeof candidate.model === "string"
  );
}

export function useAISettings(
  repository: WorkspaceRepository = indexedDbRepository,
) {
  const [config, setConfig] = useState(defaultAIProviderConfig);
  const [credentials, setCredentials] = useState(readSessionCredentials);
  const [legacyApiKey, setLegacyApiKey] = useState(readLegacySessionKey);
  const [loading, setLoading] = useState(true);
  const [hasSavedConfig, setHasSavedConfig] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    repository
      .getPreference<AIProviderConfig>(CONFIG_PREFERENCE_KEY)
      .then((stored) => {
        if (active && isProviderConfig(stored)) {
          setConfig(stored);
          setHasSavedConfig(true);
        }
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(
          reason instanceof Error ? reason.message : "无法读取 AI 配置。",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [repository]);

  useEffect(() => {
    if (loading || !legacyApiKey) return;
    const credentialId = credentialIdForConfig(config);
    setCredentials((current) => {
      const next = current[credentialId]
        ? current
        : { ...current, [credentialId]: legacyApiKey };
      try {
        sessionStorage.setItem(CREDENTIALS_SESSION_KEY, JSON.stringify(next));
        sessionStorage.removeItem(LEGACY_SESSION_KEY);
      } catch {
        setError("浏览器拒绝迁移会话密钥，请检查隐私设置。");
      }
      return next;
    });
    setLegacyApiKey("");
  }, [config, legacyApiKey, loading]);

  const getApiKey = (credentialId: AIProviderCredentialId) =>
    credentials[credentialId] ?? "";

  const setApiKey = (credentialId: AIProviderCredentialId, value: string) => {
    setCredentials((current) => {
      const next = { ...current };
      if (value) next[credentialId] = value;
      else delete next[credentialId];
      try {
        if (Object.keys(next).length) {
          sessionStorage.setItem(CREDENTIALS_SESSION_KEY, JSON.stringify(next));
        } else {
          sessionStorage.removeItem(CREDENTIALS_SESSION_KEY);
        }
        sessionStorage.removeItem(LEGACY_SESSION_KEY);
      } catch {
        setError("浏览器拒绝保存会话密钥，请检查隐私设置。");
      }
      return next;
    });
  };

  const saveConfig = async (next: AIProviderConfig) => {
    resolveChatCompletionsUrl(next.endpoint);
    if (!next.model.trim()) throw new Error("请填写模型名称。");
    const normalized = {
      ...next,
      endpoint: next.endpoint.trim().replace(/\/+$/, ""),
      model: next.model.trim(),
    };
    await repository.setPreference(CONFIG_PREFERENCE_KEY, normalized);
    setConfig(normalized);
    setHasSavedConfig(true);
    setError(null);
  };

  return {
    config,
    apiKey: getApiKey(credentialIdForConfig(config)),
    loading,
    error,
    configured: hasSavedConfig,
    saveConfig,
    getApiKey,
    setApiKey,
    clearApiKey: (credentialId: AIProviderCredentialId) =>
      setApiKey(credentialId, ""),
    dismissError: () => setError(null),
  };
}
