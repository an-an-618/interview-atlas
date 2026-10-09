use std::sync::{Mutex, mpsc};
use std::thread::JoinHandle;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingCapabilities {
    pub supported: bool,
    pub platform: String,
    pub minimum_version: String,
    pub microphone_names: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingSummary {
    pub folder_path: String,
    pub system_audio_path: String,
    pub microphone_audio_path: String,
    pub system_offset_ms: u64,
    pub microphone_offset_ms: u64,
    pub duration_ms: u64,
}

struct ActiveRecording {
    stop: mpsc::Sender<()>,
    thread: JoinHandle<Result<RecordingSummary, String>>,
}

#[derive(Default)]
struct RecordingLifecycle {
    active: Option<ActiveRecording>,
    latest: Option<RecordingSummary>,
}

#[derive(Default)]
pub struct RecordingState {
    lifecycle: Mutex<RecordingLifecycle>,
}

impl RecordingState {
    pub fn latest(&self) -> Result<RecordingSummary, String> {
        self.lifecycle
            .lock()
            .map_err(|_| "录音状态不可用。".to_string())?
            .latest
            .clone()
            .ok_or_else(|| "还没有可转写的录音。".to_string())
    }
}

fn macos_major_version() -> Option<u32> {
    #[cfg(target_os = "macos")]
    {
        let output = std::process::Command::new("/usr/bin/sw_vers")
            .arg("-productVersion")
            .output()
            .ok()?;
        let version = String::from_utf8(output.stdout).ok()?;
        version.trim().split('.').next()?.parse().ok()
    }
    #[cfg(not(target_os = "macos"))]
    {
        None
    }
}

#[tauri::command]
pub fn recording_capabilities() -> RecordingCapabilities {
    #[cfg(target_os = "macos")]
    {
        let microphone_names = screencapturekit::audio_devices::AudioInputDevice::list()
            .into_iter()
            .map(|device| device.name)
            .collect();
        return RecordingCapabilities {
            supported: macos_major_version().is_some_and(|version| version >= 15),
            platform: "macos".into(),
            minimum_version: "macOS 15".into(),
            microphone_names,
        };
    }
    #[cfg(not(target_os = "macos"))]
    RecordingCapabilities {
        supported: false,
        platform: std::env::consts::OS.into(),
        minimum_version: "macOS 15".into(),
        microphone_names: Vec::new(),
    }
}

#[cfg(target_os = "macos")]
fn wav_duration_ms(path: &std::path::Path) -> Result<u64, String> {
    let reader = hound::WavReader::open(path)
        .map_err(|error| format!("无法读取录音文件 {}：{error}", path.display()))?;
    let spec = reader.spec();
    if spec.channels != 1
        || spec.sample_rate != 16_000
        || spec.bits_per_sample != 16
        || spec.sample_format != hound::SampleFormat::Int
    {
        return Err(format!(
            "录音文件 {} 不是 16 kHz 单声道 16-bit PCM WAV。",
            path.display()
        ));
    }
    Ok(u64::from(reader.duration()) * 1_000 / u64::from(spec.sample_rate))
}

#[tauri::command]
pub fn load_latest_recording(
    app: AppHandle,
    state: State<'_, RecordingState>,
) -> Result<RecordingSummary, String> {
    #[cfg(target_os = "macos")]
    {
        let recordings_dir = app
            .path()
            .app_data_dir()
            .map_err(|error| format!("无法确定本地录音目录：{error}"))?
            .join("recordings");
        let entries = std::fs::read_dir(&recordings_dir)
            .map_err(|error| format!("无法读取本地录音目录：{error}"))?;
        let mut folders = entries
            .filter_map(Result::ok)
            .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
            .collect::<Vec<_>>();
        folders.sort_by_key(|entry| std::cmp::Reverse(entry.file_name()));

        let mut invalid_reason = None;
        for entry in folders {
            let folder = entry.path();
            let system_path = folder.join("interviewer-system.wav");
            let microphone_path = folder.join("candidate-microphone.wav");
            if !system_path.is_file() || !microphone_path.is_file() {
                continue;
            }
            let duration_ms = match (
                wav_duration_ms(&system_path),
                wav_duration_ms(&microphone_path),
            ) {
                (Ok(system), Ok(microphone)) => system.max(microphone),
                (Err(error), _) | (_, Err(error)) => {
                    invalid_reason = Some(error);
                    continue;
                }
            };
            let recording = RecordingSummary {
                folder_path: folder.to_string_lossy().into_owned(),
                system_audio_path: system_path.to_string_lossy().into_owned(),
                microphone_audio_path: microphone_path.to_string_lossy().into_owned(),
                system_offset_ms: 0,
                microphone_offset_ms: 0,
                duration_ms,
            };
            state
                .lifecycle
                .lock()
                .map_err(|_| "录音状态不可用。".to_string())?
                .latest = Some(recording.clone());
            return Ok(recording);
        }

        return Err(invalid_reason.unwrap_or_else(|| {
            format!(
                "没有找到包含面试官与候选人两路音频的完整录音：{}",
                recordings_dir.display()
            )
        }));
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, state);
        Err("当前平台暂不支持载入本地双轨录音。".into())
    }
}

#[tauri::command]
pub fn start_dual_audio_recording(
    app: AppHandle,
    state: State<'_, RecordingState>,
) -> Result<RecordingSummary, String> {
    if macos_major_version().is_none_or(|version| version < 15) {
        return Err("双端录音目前需要 macOS 15 或更高版本。".into());
    }

    let mut lifecycle = state
        .lifecycle
        .lock()
        .map_err(|_| "录音状态不可用。".to_string())?;
    if lifecycle.active.is_some() {
        return Err("已有录音正在进行。".into());
    }

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let folder = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("无法确定本地录音目录：{error}"))?
        .join("recordings")
        .join(format!("interview-{timestamp}"));
    std::fs::create_dir_all(&folder).map_err(|error| format!("无法创建本地录音目录：{error}"))?;

    let (stop_tx, stop_rx) = mpsc::channel();
    let (ready_tx, ready_rx) = mpsc::sync_channel(1);
    let thread_folder = folder.clone();
    let handle = std::thread::spawn(move || platform::capture(thread_folder, stop_rx, ready_tx));

    match ready_rx.recv_timeout(Duration::from_secs(30)) {
        Ok(Ok(summary)) => {
            lifecycle.active = Some(ActiveRecording {
                stop: stop_tx,
                thread: handle,
            });
            Ok(summary)
        }
        Ok(Err(error)) => {
            let _ = handle.join();
            Err(error)
        }
        Err(_) => {
            let _ = stop_tx.send(());
            let _ = handle.join();
            Err("等待系统录音权限超时，请在系统设置中授权后重试。".into())
        }
    }
}

#[tauri::command]
pub fn stop_dual_audio_recording(
    state: State<'_, RecordingState>,
) -> Result<RecordingSummary, String> {
    let active = state
        .lifecycle
        .lock()
        .map_err(|_| "录音状态不可用。".to_string())?
        .active
        .take()
        .ok_or_else(|| "当前没有正在进行的录音。".to_string())?;
    let _ = active.stop.send(());
    let result = active
        .thread
        .join()
        .map_err(|_| "录音线程意外终止。".to_string())??;
    state
        .lifecycle
        .lock()
        .map_err(|_| "录音状态不可用。".to_string())?
        .latest = Some(result.clone());
    Ok(result)
}

#[tauri::command]
pub fn reveal_latest_recording(state: State<'_, RecordingState>) -> Result<(), String> {
    let recording = state.latest()?;
    #[cfg(target_os = "macos")]
    {
        let status = std::process::Command::new("/usr/bin/open")
            .arg(&recording.folder_path)
            .status()
            .map_err(|error| format!("无法打开录音目录：{error}"))?;
        if status.success() {
            return Ok(());
        }
        return Err("无法打开录音目录。".into());
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = recording;
        Err("当前平台暂不支持打开录音目录。".into())
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use super::RecordingSummary;
    use hound::{SampleFormat, WavSpec, WavWriter};
    use screencapturekit::audio_devices::AudioInputDevice;
    use screencapturekit::prelude::*;
    use std::fs::File;
    use std::io::BufWriter;
    use std::path::{Path, PathBuf};
    use std::sync::{Arc, Mutex, mpsc};
    use std::time::Duration;

    const TARGET_SAMPLE_RATE: u32 = 16_000;

    struct StreamingResampler {
        input_rate: u32,
        phase: u32,
        weighted_sum: f64,
    }

    impl StreamingResampler {
        fn new(input_rate: u32) -> Result<Self, String> {
            if input_rate == 0 {
                return Err("录音采样率无效。".to_string());
            }
            Ok(Self {
                input_rate,
                phase: 0,
                weighted_sum: 0.0,
            })
        }

        fn process(&mut self, input: &[f32]) -> Vec<f32> {
            let mut output = Vec::with_capacity(
                input.len().saturating_mul(TARGET_SAMPLE_RATE as usize) / self.input_rate as usize
                    + 1,
            );
            for &sample in input {
                let mut remaining = TARGET_SAMPLE_RATE;
                while remaining > 0 {
                    let capacity = self.input_rate - self.phase;
                    let consumed = remaining.min(capacity);
                    self.weighted_sum += f64::from(sample) * f64::from(consumed);
                    self.phase += consumed;
                    remaining -= consumed;
                    if self.phase == self.input_rate {
                        output.push((self.weighted_sum / f64::from(self.input_rate)) as f32);
                        self.phase = 0;
                        self.weighted_sum = 0.0;
                    }
                }
            }
            output
        }

        fn flush(&mut self) -> Option<f32> {
            if self.phase == 0 {
                return None;
            }
            let sample = (self.weighted_sum / f64::from(self.phase)) as f32;
            self.phase = 0;
            self.weighted_sum = 0.0;
            Some(sample)
        }
    }

    struct TrackSink {
        path: PathBuf,
        writer: Option<WavWriter<BufWriter<File>>>,
        source_rate: Option<u32>,
        resampler: Option<StreamingResampler>,
        first_pts_ms: Option<f64>,
        samples: u64,
        error: Option<String>,
    }

    impl TrackSink {
        fn new(path: PathBuf) -> Self {
            Self {
                path,
                writer: None,
                source_rate: None,
                resampler: None,
                first_pts_ms: None,
                samples: 0,
                error: None,
            }
        }

        fn write(&mut self, sample: CMSampleBuffer) {
            if self.error.is_some() {
                return;
            }
            let result = self.write_inner(sample);
            if let Err(error) = result {
                self.error = Some(error);
            }
        }

        fn write_inner(&mut self, sample: CMSampleBuffer) -> Result<(), String> {
            let description = sample
                .format_description()
                .ok_or_else(|| "录音数据缺少格式信息。".to_string())?;
            let sample_rate = description
                .audio_sample_rate()
                .ok_or_else(|| "无法读取录音采样率。".to_string())?
                .round() as u32;
            if self.source_rate.is_some_and(|rate| rate != sample_rate) {
                return Err(format!(
                    "录音期间采样率从 {}Hz 变为 {sample_rate}Hz，请重试。",
                    self.source_rate.unwrap_or_default(),
                ));
            }
            if self.source_rate.is_none() {
                self.source_rate = Some(sample_rate);
                self.resampler = Some(StreamingResampler::new(sample_rate)?);
            }
            let channels = description.audio_channel_count().unwrap_or(1).max(1) as usize;
            let bits = description.audio_bits_per_channel().unwrap_or(32);
            let is_float = description.audio_is_float();
            let list = sample
                .audio_buffer_list()
                .ok_or_else(|| "无法读取录音缓冲区。".to_string())?;

            if self.writer.is_none() {
                let spec = WavSpec {
                    channels: 1,
                    sample_rate: TARGET_SAMPLE_RATE,
                    bits_per_sample: 16,
                    sample_format: SampleFormat::Int,
                };
                self.writer = Some(
                    WavWriter::create(&self.path, spec)
                        .map_err(|error| format!("无法创建 WAV 文件：{error}"))?,
                );
            }
            if self.first_pts_ms.is_none() {
                self.first_pts_ms = sample
                    .presentation_timestamp()
                    .as_seconds()
                    .map(|seconds| seconds * 1000.0);
            }

            let buffers = list.iter().map(|buffer| buffer.data()).collect::<Vec<_>>();
            let mono = decode_mono(&buffers, channels, bits, is_float)?;
            let resampled = self
                .resampler
                .as_mut()
                .expect("resampler initialized")
                .process(&mono);
            let writer = self.writer.as_mut().expect("writer initialized");
            for value in resampled {
                writer
                    .write_sample((value.clamp(-1.0, 1.0) * i16::MAX as f32) as i16)
                    .map_err(|error| format!("写入 WAV 文件失败：{error}"))?;
                self.samples += 1;
            }
            Ok(())
        }

        fn finish(mut self) -> Result<FinishedTrack, String> {
            if let Some(error) = self.error.take() {
                return Err(error);
            }
            if let Some(sample) = self.resampler.as_mut().and_then(StreamingResampler::flush) {
                self.writer
                    .as_mut()
                    .ok_or_else(|| "录音文件尚未初始化。".to_string())?
                    .write_sample((sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16)
                    .map_err(|error| format!("写入 WAV 文件失败：{error}"))?;
                self.samples += 1;
            }
            let writer = self
                .writer
                .take()
                .ok_or_else(|| "没有收到任何音频，请确认权限和会议声音。".to_string())?;
            writer
                .finalize()
                .map_err(|error| format!("保存 WAV 文件失败：{error}"))?;
            Ok(FinishedTrack {
                path: self.path,
                first_pts_ms: self.first_pts_ms.unwrap_or_default(),
                duration_ms: self.samples.saturating_mul(1000) / u64::from(TARGET_SAMPLE_RATE),
            })
        }
    }

    struct FinishedTrack {
        path: PathBuf,
        first_pts_ms: f64,
        duration_ms: u64,
    }

    fn decode_mono(
        buffers: &[&[u8]],
        channels: usize,
        bits: u32,
        is_float: bool,
    ) -> Result<Vec<f32>, String> {
        let decoded = buffers
            .iter()
            .map(|data| {
                if is_float && bits == 32 {
                    Ok(data
                        .chunks_exact(4)
                        .map(|bytes| f32::from_le_bytes(bytes.try_into().unwrap()))
                        .collect::<Vec<_>>())
                } else if !is_float && bits == 16 {
                    Ok(data
                        .chunks_exact(2)
                        .map(|bytes| {
                            i16::from_le_bytes(bytes.try_into().unwrap()) as f32 / i16::MAX as f32
                        })
                        .collect::<Vec<_>>())
                } else {
                    Err(format!("暂不支持 {bits} 位音频格式。"))
                }
            })
            .collect::<Result<Vec<_>, _>>()?;

        if decoded.len() == 1 {
            let interleaved = &decoded[0];
            return Ok(interleaved
                .chunks_exact(channels)
                .map(|frame| frame.iter().sum::<f32>() / channels as f32)
                .collect());
        }
        let frame_count = decoded.iter().map(Vec::len).min().unwrap_or_default();
        Ok((0..frame_count)
            .map(|index| {
                decoded.iter().map(|channel| channel[index]).sum::<f32>() / decoded.len() as f32
            })
            .collect())
    }

    #[derive(Clone)]
    struct Handler {
        sink: Arc<Mutex<TrackSink>>,
    }

    impl SCStreamOutputTrait for Handler {
        fn did_output_sample_buffer(
            &self,
            sample: CMSampleBuffer,
            _output_type: SCStreamOutputType,
        ) {
            if let Ok(mut sink) = self.sink.lock() {
                sink.write(sample);
            }
        }
    }

    pub fn capture(
        folder: PathBuf,
        stop: mpsc::Receiver<()>,
        ready: mpsc::SyncSender<Result<RecordingSummary, String>>,
    ) -> Result<RecordingSummary, String> {
        let result = run_capture(&folder, stop, &ready);
        if let Err(error) = &result {
            let _ = ready.try_send(Err(error.clone()));
        }
        result
    }

    fn run_capture(
        folder: &Path,
        stop: mpsc::Receiver<()>,
        ready: &mpsc::SyncSender<Result<RecordingSummary, String>>,
    ) -> Result<RecordingSummary, String> {
        let system_path = folder.join("interviewer-system.wav");
        let microphone_path = folder.join("candidate-microphone.wav");
        let system_sink = Arc::new(Mutex::new(TrackSink::new(system_path.clone())));
        let microphone_sink = Arc::new(Mutex::new(TrackSink::new(microphone_path.clone())));

        let content = SCShareableContent::get().map_err(|error| {
            format!(
                "无法获取屏幕与系统音频权限：{error}。请在系统设置 > 隐私与安全性 > 屏幕与系统音频录制中允许见字·如面，然后重启应用。"
            )
        })?;
        let display = content
            .displays()
            .into_iter()
            .next()
            .ok_or_else(|| "没有找到可录制的显示器。".to_string())?;
        let filter = SCContentFilter::create()
            .with_display(&display)
            .with_excluding_windows(&[])
            .build();
        let mut config = SCStreamConfiguration::new()
            .with_width(2)
            .with_height(2)
            .with_captures_audio(true)
            .with_sample_rate(TARGET_SAMPLE_RATE as i32)
            .with_channel_count(1)
            .with_excludes_current_process_audio(true)
            .with_captures_microphone(true);
        if let Some(device) = AudioInputDevice::default_device() {
            if device.id.contains('\0') {
                return Err(format!("无法选择麦克风 {}：设备 ID 无效。", device.name));
            }
            config.set_microphone_capture_device_id(&device.id);
        }

        let mut stream = SCStream::new(&filter, &config);
        stream
            .add_output_handler(
                Handler {
                    sink: Arc::clone(&system_sink),
                },
                SCStreamOutputType::Audio,
            )
            .ok_or_else(|| "无法接收系统音频。".to_string())?;
        stream
            .add_output_handler(
                Handler {
                    sink: Arc::clone(&microphone_sink),
                },
                SCStreamOutputType::Microphone,
            )
            .ok_or_else(|| "无法接收麦克风音频。".to_string())?;
        stream.start_capture().map_err(|error| {
            format!("无法开始录音：{error}。请允许麦克风和屏幕与系统音频录制权限后重试。")
        })?;

        let pending = RecordingSummary {
            folder_path: folder.to_string_lossy().into_owned(),
            system_audio_path: system_path.to_string_lossy().into_owned(),
            microphone_audio_path: microphone_path.to_string_lossy().into_owned(),
            system_offset_ms: 0,
            microphone_offset_ms: 0,
            duration_ms: 0,
        };
        let _ = ready.send(Ok(pending));
        loop {
            match stop.recv_timeout(Duration::from_millis(250)) {
                Ok(()) | Err(mpsc::RecvTimeoutError::Disconnected) => break,
                Err(mpsc::RecvTimeoutError::Timeout) => {}
            }
        }
        stream
            .stop_capture()
            .map_err(|error| format!("停止录音失败：{error}"))?;
        drop(stream);

        let system = Arc::try_unwrap(system_sink)
            .map_err(|_| "系统音频仍在写入，请重试。".to_string())?
            .into_inner()
            .map_err(|_| "系统音频文件状态异常。".to_string())?
            .finish()?;
        let microphone = Arc::try_unwrap(microphone_sink)
            .map_err(|_| "麦克风音频仍在写入，请重试。".to_string())?
            .into_inner()
            .map_err(|_| "麦克风音频文件状态异常。".to_string())?
            .finish()?;
        let earliest = system.first_pts_ms.min(microphone.first_pts_ms);

        Ok(RecordingSummary {
            folder_path: folder.to_string_lossy().into_owned(),
            system_audio_path: system.path.to_string_lossy().into_owned(),
            microphone_audio_path: microphone.path.to_string_lossy().into_owned(),
            system_offset_ms: (system.first_pts_ms - earliest).max(0.0).round() as u64,
            microphone_offset_ms: (microphone.first_pts_ms - earliest).max(0.0).round() as u64,
            duration_ms: system.duration_ms.max(microphone.duration_ms),
        })
    }

    #[cfg(test)]
    mod tests {
        use super::{StreamingResampler, decode_mono};

        #[test]
        fn averages_interleaved_float_channels() {
            let bytes = [1.0_f32, -1.0, 0.5, 0.5]
                .into_iter()
                .flat_map(f32::to_le_bytes)
                .collect::<Vec<_>>();
            assert_eq!(decode_mono(&[&bytes], 2, 32, true).unwrap(), vec![0.0, 0.5]);
        }

        #[test]
        fn averages_planar_float_channels() {
            let left = [1.0_f32, 0.0]
                .into_iter()
                .flat_map(f32::to_le_bytes)
                .collect::<Vec<_>>();
            let right = [-1.0_f32, 1.0]
                .into_iter()
                .flat_map(f32::to_le_bytes)
                .collect::<Vec<_>>();
            assert_eq!(
                decode_mono(&[&left, &right], 2, 32, true).unwrap(),
                vec![0.0, 0.5]
            );
        }

        #[test]
        fn downsamples_48khz_across_buffer_boundaries() {
            let mut resampler = StreamingResampler::new(48_000).unwrap();
            assert!(resampler.process(&[1.0, 1.0]).is_empty());
            assert_eq!(resampler.process(&[1.0]), vec![1.0]);
            assert_eq!(resampler.process(&[-1.0, -1.0, -1.0]), vec![-1.0]);
            assert_eq!(resampler.flush(), None);
        }

        #[test]
        fn preserves_16khz_samples() {
            let mut resampler = StreamingResampler::new(16_000).unwrap();
            assert_eq!(resampler.process(&[0.25, -0.5]), vec![0.25, -0.5]);
        }
    }
}

#[cfg(not(target_os = "macos"))]
mod platform {
    use super::RecordingSummary;
    use std::path::PathBuf;
    use std::sync::mpsc;

    pub fn capture(
        _folder: PathBuf,
        _stop: mpsc::Receiver<()>,
        ready: mpsc::SyncSender<Result<RecordingSummary, String>>,
    ) -> Result<RecordingSummary, String> {
        let error = "双端录音当前只支持 macOS 15 或更高版本。".to_string();
        let _ = ready.send(Err(error.clone()));
        Err(error)
    }
}
