import {
  ArrowLeft,
  AudioLines,
  CheckCircle2,
  FolderOpen,
  LoaderCircle,
  Mic,
  MonitorUp,
  Radio,
  Settings2,
  Square,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  getRecordingCapabilities,
  isDesktopApp,
  loadLatestRecording,
  revealLatestRecording,
  startDualAudioRecording,
  stopDualAudioRecording,
  transcribeLatestRecording,
} from "../recording/desktop";
import type {
  RecordingCapabilities,
  RecordingSummary,
  XfyunCredentials,
} from "../recording/types";

type RecorderPhase =
  | "checking"
  | "ready"
  | "loading"
  | "requesting"
  | "recording"
  | "stopping"
  | "recorded"
  | "transcribing"
  | "completed";

function formatDuration(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return [hours, minutes, remainder]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

export function InterviewRecorder({
  credentials,
  transcriptionConfigured,
  transcriptionLoading,
  onBack,
  onOpenSettings,
  onUseTranscript,
}: {
  credentials: XfyunCredentials;
  transcriptionConfigured: boolean;
  transcriptionLoading: boolean;
  onBack: () => void;
  onOpenSettings: () => void;
  onUseTranscript: (transcript: string) => void;
}) {
  const [phase, setPhase] = useState<RecorderPhase>("checking");
  const [capabilities, setCapabilities] =
    useState<RecordingCapabilities | null>(null);
  const [consented, setConsented] = useState(false);
  const [recording, setRecording] = useState<RecordingSummary | null>(null);
  const [transcript, setTranscript] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const startedAt = useRef(0);

  useEffect(() => {
    if (!isDesktopApp()) {
      setCapabilities({
        supported: false,
        platform: "web",
        minimumVersion: "macOS 15",
        microphoneNames: [],
      });
      setPhase("ready");
      return;
    }
    getRecordingCapabilities()
      .then((result) => {
        setCapabilities(result);
        setPhase("ready");
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : String(reason));
        setPhase("ready");
      });
  }, []);

  useEffect(() => {
    if (phase !== "recording") return;
    const update = () => setElapsed(Date.now() - startedAt.current);
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [phase]);

  const start = async () => {
    if (!consented) {
      setError("开始前需要确认所有参与者已知情并同意录音。");
      return;
    }
    setError("");
    setWarnings([]);
    setPhase("requesting");
    try {
      const pending = await startDualAudioRecording();
      setRecording(pending);
      startedAt.current = Date.now();
      setElapsed(0);
      setPhase("recording");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setPhase("ready");
    }
  };

  const loadLatest = async () => {
    setError("");
    setWarnings([]);
    setPhase("loading");
    try {
      const result = await loadLatestRecording();
      setRecording(result);
      setElapsed(result.durationMs);
      setPhase("recorded");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setPhase("ready");
    }
  };

  const stop = async () => {
    setError("");
    setWarnings([]);
    setPhase("stopping");
    try {
      const result = await stopDualAudioRecording();
      setRecording(result);
      setElapsed(result.durationMs);
      setPhase("recorded");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setPhase("ready");
    }
  };

  const transcribe = async () => {
    if (!transcriptionConfigured) {
      setError("请先前往设置完成讯飞语音转写配置。");
      return;
    }
    setError("");
    setWarnings([]);
    setPhase("transcribing");
    try {
      const result = await transcribeLatestRecording(credentials);
      setRecording(result.recording);
      setTranscript(result.transcript);
      setWarnings(result.warnings);
      setPhase("completed");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setPhase("recorded");
    }
  };

  const busy = [
    "loading",
    "requesting",
    "recording",
    "stopping",
    "transcribing",
  ].includes(phase);
  const safeClose = () => {
    if (!busy) onBack();
  };
  const credentialsComplete =
    transcriptionConfigured &&
    Object.values(credentials).every((value) => value.trim());
  const sourceStatus =
    phase === "recording" || phase === "stopping"
      ? "录制中"
      : recording
        ? "已保存"
        : "待授权";

  return (
    <div className="page create-detail-page recorder-page">
      <header className="create-detail-header">
        <button className="back-button create-detail-back" type="button" onClick={safeClose} disabled={busy}>
          <ArrowLeft size={16} aria-hidden="true" />
          返回新建
        </button>
        <p className="eyebrow">双端录音 · macOS</p>
        <h1>录制真实面试</h1>
        <p>系统音频记录面试官，麦克风记录候选人；屏幕画面不会写入文件。</p>
      </header>
      <div className="recorder-page-body">
        <div className="interview-recorder">
        <section className="recorder-sources" aria-label="录音来源">
          <div>
            <MonitorUp size={20} aria-hidden="true" />
            <span>
              <strong>面试官</strong>
              <small>屏幕与系统音频录制权限</small>
            </span>
            <em>{sourceStatus}</em>
          </div>
          <div>
            <Mic size={20} aria-hidden="true" />
            <span>
              <strong>候选人</strong>
              <small>
                {capabilities?.microphoneNames[0] ?? "默认麦克风"}
              </small>
            </span>
            <em>{sourceStatus}</em>
          </div>
        </section>

        {capabilities && !capabilities.supported ? (
          <p className="inline-error" role="alert">
            {capabilities.platform === "web"
              ? "双端录音需要使用 macOS 桌面版。浏览器版无法稳定取得其他应用的系统音频。"
              : `当前系统不支持双端录音，需要 ${capabilities.minimumVersion} 或更高版本。`}
          </p>
        ) : null}

        {phase === "ready" || phase === "loading" || phase === "requesting" ? (
          <section className="recorder-permission">
            <Radio size={22} aria-hidden="true" />
            <div>
              <strong>首次录音会连续申请两项系统权限</strong>
              <p>允许“麦克风”和“屏幕与系统音频录制”。屏幕权限生效后，macOS 可能要求重启应用。</p>
            </div>
          </section>
        ) : null}

        {phase === "recording" || phase === "stopping" ? (
          <section className="recorder-running" aria-live="polite">
            <span className="recording-pulse" aria-hidden="true" />
            <div>
              <strong>{phase === "stopping" ? "正在保存录音" : "正在录音"}</strong>
              <time>{formatDuration(elapsed)}</time>
            </div>
            <div className="recorder-levels" aria-hidden="true">
              {Array.from({ length: 12 }, (_, index) => (
                <i key={index} />
              ))}
            </div>
          </section>
        ) : null}

        {recording && ["recorded", "transcribing", "completed"].includes(phase) ? (
          <section className="recorder-result">
            <CheckCircle2 size={22} aria-hidden="true" />
            <div>
              <strong>两路录音已保存到本地</strong>
              <p>{formatDuration(recording.durationMs)} · 16 kHz 单声道 WAV</p>
            </div>
            <button
              className="icon-button"
              type="button"
              title="在访达中打开"
              aria-label="在访达中打开录音目录"
              onClick={() => void revealLatestRecording()}
            >
              <FolderOpen size={18} aria-hidden="true" />
            </button>
          </section>
        ) : null}

        {recording && phase !== "recording" && phase !== "stopping" ? (
          <section className="xfyun-recorder-settings">
            <header>
              <span
                className="provider-mark"
                data-provider="xfyun"
                aria-hidden="true"
              >
                讯
              </span>
              <div>
                <strong>讯飞录音文件转写大模型</strong>
                <small>
                  {transcriptionLoading
                    ? "正在读取本地配置"
                    : transcriptionConfigured
                      ? "已从设置读取密钥"
                      : "尚未完成配置"}
                </small>
              </div>
              <span
                className={`recorder-provider-state${
                  transcriptionConfigured ? " configured" : ""
                }`}
              >
                {transcriptionLoading ? (
                  <LoaderCircle className="spin" size={14} aria-hidden="true" />
                ) : transcriptionConfigured ? (
                  <CheckCircle2 size={14} aria-hidden="true" />
                ) : (
                  <TriangleAlert size={14} aria-hidden="true" />
                )}
                {transcriptionLoading
                  ? "读取中"
                  : transcriptionConfigured
                    ? "已配置"
                    : "待配置"}
              </span>
              <button
                className="button quiet recorder-settings-link"
                type="button"
                disabled={busy}
                onClick={onOpenSettings}
              >
                <Settings2 size={14} aria-hidden="true" />
                前往设置
              </button>
            </header>
            <p>
              {transcriptionConfigured
                ? "开始转写后，两路音频会直接发送给讯飞并按时间戳合并。"
                : "配置一次后会保存在当前设备，后续转写无需重复填写。"}
            </p>
          </section>
        ) : null}

        {phase === "transcribing" ? (
          <div className="recorder-transcribing" aria-live="polite">
            <LoaderCircle className="spin" size={20} aria-hidden="true" />
            <span>正在压缩、上传并转写两路音轨，请保持应用打开…</span>
          </div>
        ) : null}

        {phase === "completed" ? (
          <label className="recorder-transcript">
            <span>转写结果</span>
            <textarea
              value={transcript}
              onChange={(event) => setTranscript(event.target.value)}
              rows={10}
            />
          </label>
        ) : null}

        {warnings.map((warning) => (
          <p className="recorder-warning" role="status" key={warning}>
            <TriangleAlert size={17} aria-hidden="true" />
            {warning}
          </p>
        ))}

        {error ? <p className="inline-error" role="alert">{error}</p> : null}

        <label className="recorder-consent">
          <input
            type="checkbox"
            checked={consented}
            disabled={busy}
            onChange={(event) => setConsented(event.target.checked)}
          />
          <span>我已获得所有参与者的明确同意，并了解所在组织的录音规定。</span>
        </label>

        <footer className="form-actions recorder-actions">
          <button className="button quiet" type="button" onClick={safeClose} disabled={busy}>
            返回新建
          </button>
          {phase === "ready" || phase === "loading" ? (
            <button
              className="button quiet"
              type="button"
              disabled={phase === "loading" || !capabilities?.supported}
              onClick={() => void loadLatest()}
            >
              {phase === "loading" ? (
                <LoaderCircle className="spin" size={16} aria-hidden="true" />
              ) : (
                <FolderOpen size={16} aria-hidden="true" />
              )}
              {phase === "loading" ? "正在载入" : "使用最近录音"}
            </button>
          ) : null}
          {phase === "ready" || phase === "requesting" ? (
            <button
              className="button primary"
              type="button"
              disabled={
                phase === "requesting" ||
                !consented ||
                !capabilities?.supported
              }
              onClick={() => void start()}
            >
              {phase === "requesting" ? (
                <LoaderCircle className="spin" size={16} aria-hidden="true" />
              ) : (
                <Radio size={16} aria-hidden="true" />
              )}
              {phase === "requesting" ? "正在申请权限" : "开始录音"}
            </button>
          ) : null}
          {phase === "recording" || phase === "stopping" ? (
            <button
              className="button danger"
              type="button"
              disabled={phase === "stopping"}
              onClick={() => void stop()}
            >
              {phase === "stopping" ? (
                <LoaderCircle className="spin" size={16} aria-hidden="true" />
              ) : (
                <Square size={15} fill="currentColor" aria-hidden="true" />
              )}
              {phase === "stopping" ? "正在保存" : "结束录音"}
            </button>
          ) : null}
          {phase === "recorded" || phase === "transcribing" ? (
            <button
              className="button primary"
              type="button"
              disabled={
                phase === "transcribing" ||
                transcriptionLoading ||
                !credentialsComplete ||
                !consented
              }
              onClick={() => void transcribe()}
            >
              {phase === "transcribing" ? (
                <LoaderCircle className="spin" size={16} aria-hidden="true" />
              ) : (
                <AudioLines size={16} aria-hidden="true" />
              )}
              {phase === "transcribing" ? "讯飞转写中" : "开始转写"}
            </button>
          ) : null}
          {phase === "completed" ? (
            <button
              className="button primary"
              type="button"
              disabled={!transcript.trim()}
              onClick={() => onUseTranscript(transcript)}
            >
              使用这份逐字稿
            </button>
          ) : null}
        </footer>
        </div>
      </div>
    </div>
  );
}
