import {
  AudioLines,
  Check,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import type { TranscriptionServiceConfig } from "../recording/settings";
import { handleExternalLinkClick } from "../platform/openExternalLink";

const XFYUN_CONSOLE_URL = "https://console.xfyun.cn/services/new_lfasr";
const XFYUN_PRODUCT_URL = "https://www.xfyun.cn/services/lfasr";

export function TranscriptionSettingsPanel({
  config,
  configured,
  loading,
  error,
  onSave,
  onClear,
}: {
  config: TranscriptionServiceConfig;
  configured: boolean;
  loading: boolean;
  error: string | null;
  onSave: (config: TranscriptionServiceConfig) => Promise<void>;
  onClear: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(config);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">(
    "idle",
  );
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(config);
  }, [config]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaveState("saving");
    setLocalError(null);
    try {
      await onSave(draft);
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 1800);
    } catch (reason) {
      setSaveState("idle");
      setLocalError(
        reason instanceof Error ? reason.message : "语音转写配置保存失败。",
      );
    }
  };

  const clear = async () => {
    if (!window.confirm("确定清除当前会话中的讯飞转写密钥吗？")) return;
    setLocalError(null);
    try {
      await onClear();
      setSaveState("idle");
    } catch (reason) {
      setLocalError(
        reason instanceof Error ? reason.message : "讯飞转写密钥清除失败。",
      );
    }
  };

  const update = (
    key: "appId" | "apiKey" | "apiSecret",
    value: string,
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setSaveState("idle");
    setLocalError(null);
  };

  return (
    <section className="service-config-section transcription-settings">
      <header className="service-config-header">
        <div>
          <AudioLines size={20} aria-hidden="true" />
          <div>
            <strong>AI 转写服务</strong>
            <small>录音完成后，将双路音频转换为带时间戳的逐字稿。</small>
          </div>
        </div>
        <span
          className={`connection-state${
            configured ? " state-success" : ""
          }`}
        >
          {configured ? (
            <CheckCircle2 size={15} aria-hidden="true" />
          ) : (
            <KeyRound size={15} aria-hidden="true" />
          )}
          {configured ? "已配置" : "待配置"}
        </span>
      </header>

      <form className="service-config-form" onSubmit={save}>
        <div className="service-field-grid transcription-service-fields">
          <label>
            <span>服务商</span>
            <select value="xfyun" disabled aria-label="转写服务商">
              <option value="xfyun">讯飞</option>
            </select>
          </label>
          <label>
            <span>AppID</span>
            <input
              value={draft.appId}
              onChange={(event) => update("appId", event.target.value)}
              autoComplete="off"
              placeholder="输入讯飞 AppID"
              required
            />
          </label>
          <label>
            <span>APIKey</span>
            <div className="secret-input">
              <KeyRound size={16} aria-hidden="true" />
              <input
                type="password"
                value={draft.apiKey}
                onChange={(event) => update("apiKey", event.target.value)}
                autoComplete="off"
                placeholder="输入讯飞 APIKey"
                required
              />
            </div>
          </label>
          <label>
            <span>APISecret</span>
            <div className="secret-input">
              <KeyRound size={16} aria-hidden="true" />
              <input
                type="password"
                value={draft.apiSecret}
                onChange={(event) => update("apiSecret", event.target.value)}
                autoComplete="off"
                placeholder="输入讯飞 APISecret"
                required
              />
            </div>
          </label>
        </div>

        <div className="service-provider-meta">
          <p>
            首次开通讯飞转写的用户可领取 5 小时免费时长；额度用完后可前往讯飞购买。具体额度与有效期以讯飞控制台为准。
          </p>
          <nav aria-label="讯飞转写接入帮助">
            <a
              href={XFYUN_CONSOLE_URL}
              target="_blank"
              rel="noreferrer"
              onClick={handleExternalLinkClick}
            >
              获取密钥
              <ExternalLink size={12} aria-hidden="true" />
            </a>
            <a
              href={XFYUN_PRODUCT_URL}
              target="_blank"
              rel="noreferrer"
              onClick={handleExternalLinkClick}
            >
              购买时长
              <ExternalLink size={12} aria-hidden="true" />
            </a>
          </nav>
        </div>

        {localError || error ? (
          <p className="inline-error" role="alert">
            {localError || error}
          </p>
        ) : null}

        <footer className="service-config-footer">
          <span>
            <ShieldCheck size={15} aria-hidden="true" />
            密钥仅保留在当前会话，不进入 IndexedDB 或工作区备份
          </span>
          <div>
            {configured ? (
              <button
                className="button quiet"
                type="button"
                disabled={loading || saveState === "saving"}
                onClick={() => void clear()}
              >
                <Trash2 size={15} aria-hidden="true" />
                清除密钥
              </button>
            ) : null}
            <button
              className="button primary"
              type="submit"
              disabled={loading || saveState === "saving"}
            >
              {saveState === "saved" ? (
                <Check size={15} aria-hidden="true" />
              ) : (
                <Save size={15} aria-hidden="true" />
              )}
              {saveState === "saving"
                ? "保存中"
                : saveState === "saved"
                  ? "已保存"
                  : "保存配置"}
            </button>
          </div>
        </footer>
      </form>
    </section>
  );
}
