export interface RecordingCapabilities {
  supported: boolean;
  platform: string;
  minimumVersion: string;
  microphoneNames: string[];
}

export interface RecordingSummary {
  folderPath: string;
  systemAudioPath: string;
  microphoneAudioPath: string;
  systemOffsetMs: number;
  microphoneOffsetMs: number;
  durationMs: number;
}

export interface XfyunCredentials {
  appId: string;
  apiKey: string;
  apiSecret: string;
}

export interface TranscriptSegment {
  role: "面试官" | "候选人";
  text: string;
  startMs: number;
  endMs: number;
}

export interface DualTranscript {
  transcript: string;
  segments: TranscriptSegment[];
  recording: RecordingSummary;
  warnings: string[];
}
