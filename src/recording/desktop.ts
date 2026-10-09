import { invoke } from "@tauri-apps/api/core";
import type {
  DualTranscript,
  RecordingCapabilities,
  RecordingSummary,
  XfyunCredentials,
} from "./types";

export function isDesktopApp() {
  return "__TAURI_INTERNALS__" in window;
}

export function getRecordingCapabilities() {
  return invoke<RecordingCapabilities>("recording_capabilities");
}

export function loadLatestRecording() {
  return invoke<RecordingSummary>("load_latest_recording");
}

export function startDualAudioRecording() {
  return invoke<RecordingSummary>("start_dual_audio_recording");
}

export function stopDualAudioRecording() {
  return invoke<RecordingSummary>("stop_dual_audio_recording");
}

export function revealLatestRecording() {
  return invoke<void>("reveal_latest_recording");
}

export function transcribeLatestRecording(credentials: XfyunCredentials) {
  return invoke<DualTranscript>("transcribe_latest_recording", {
    credentials,
  });
}
