use std::collections::BTreeMap;
use std::error::Error as StdError;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::Engine;
use chrono::Local;
use hmac::{Hmac, Mac};
use reqwest::{Body, Client};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha1::Sha1;
use tokio_util::io::ReaderStream;

use crate::recording::RecordingSummary;

const API_ORIGIN: &str = "https://office-api-ist-dx.iflyaisol.com";
const API_REQUEST_TIMEOUT: Duration = Duration::from_secs(45);
const UPLOAD_TIMEOUT: Duration = Duration::from_secs(15 * 60);
const POLL_INTERVAL: Duration = Duration::from_secs(2);
const POLL_LIMIT: usize = 300;
const SILENCE_SAMPLE_THRESHOLD: u16 = 16;
const MIN_ACTIVE_SAMPLES: usize = 160;

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct XfyunCredentials {
    pub app_id: String,
    pub api_key: String,
    pub api_secret: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptSegment {
    pub role: String,
    pub text: String,
    pub start_ms: u64,
    pub end_ms: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DualTranscript {
    pub transcript: String,
    pub segments: Vec<TranscriptSegment>,
    pub recording: RecordingSummary,
    pub warnings: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UploadContent {
    order_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UploadResponse {
    code: Value,
    desc_info: String,
    content: Option<UploadContent>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResultContent {
    order_info: OrderInfo,
    #[serde(default)]
    order_result: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OrderInfo {
    status: i32,
    #[serde(default)]
    fail_type: i32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResultResponse {
    code: Value,
    desc_info: String,
    content: Option<ResultContent>,
}

struct PreparedUpload {
    path: PathBuf,
    remove_after: bool,
}

impl Drop for PreparedUpload {
    fn drop(&mut self) {
        if self.remove_after {
            let _ = std::fs::remove_file(&self.path);
        }
    }
}

fn wav_has_signal(path: &Path) -> Result<bool, String> {
    let mut reader = hound::WavReader::open(path)
        .map_err(|error| format!("无法分析录音文件 {}：{error}", path.display()))?;
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

    let mut active_samples = 0;
    for sample in reader.samples::<i16>() {
        let amplitude = sample
            .map_err(|error| format!("无法读取录音文件 {}：{error}", path.display()))?
            .unsigned_abs();
        if amplitude > SILENCE_SAMPLE_THRESHOLD {
            active_samples += 1;
            if active_samples >= MIN_ACTIVE_SAMPLES {
                return Ok(true);
            }
        }
    }
    Ok(false)
}

fn prepare_upload(path: &Path) -> Result<PreparedUpload, String> {
    #[cfg(target_os = "macos")]
    {
        let stem = path
            .file_stem()
            .and_then(|value| value.to_str())
            .ok_or_else(|| "录音文件名无效。".to_string())?;
        let compressed = path.with_file_name(format!("{stem}-xfyun-upload.m4a"));
        let _ = std::fs::remove_file(&compressed);
        let output = std::process::Command::new("/usr/bin/afconvert")
            .arg(path)
            .arg(&compressed)
            .args(["-f", "m4af", "-d", "aac@16000", "-c", "1", "-b", "32000"])
            .output()
            .map_err(|error| format!("无法压缩待上传录音：{error}"))?;
        if !output.status.success() {
            let _ = std::fs::remove_file(&compressed);
            let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(if detail.is_empty() {
                "压缩待上传录音失败。".to_string()
            } else {
                format!("压缩待上传录音失败：{detail}")
            });
        }
        return Ok(PreparedUpload {
            path: compressed,
            remove_after: true,
        });
    }
    #[cfg(not(target_os = "macos"))]
    Ok(PreparedUpload {
        path: path.to_path_buf(),
        remove_after: false,
    })
}

fn validate_credentials(credentials: &XfyunCredentials) -> Result<(), String> {
    if credentials.app_id.trim().is_empty()
        || credentials.api_key.trim().is_empty()
        || credentials.api_secret.trim().is_empty()
    {
        return Err("请填写讯飞 AppID、APIKey 和 APISecret。".into());
    }
    Ok(())
}

fn is_success_code(code: &Value) -> bool {
    match code {
        Value::String(value) => value == "000000" || value == "0",
        Value::Number(value) => value.as_i64() == Some(0),
        _ => false,
    }
}

fn encode(value: &str) -> String {
    url::form_urlencoded::byte_serialize(value.as_bytes()).collect()
}

fn signed_url(
    path: &str,
    parameters: &BTreeMap<&str, String>,
    secret: &str,
) -> Result<(String, String), String> {
    let query = parameters
        .iter()
        .filter(|(_, value)| !value.is_empty())
        .map(|(key, value)| format!("{}={}", encode(key), encode(value)))
        .collect::<Vec<_>>()
        .join("&");
    let mut mac = Hmac::<Sha1>::new_from_slice(secret.as_bytes())
        .map_err(|_| "讯飞 APISecret 格式无效。".to_string())?;
    mac.update(query.as_bytes());
    let signature = base64::engine::general_purpose::STANDARD.encode(mac.finalize().into_bytes());
    Ok((format!("{API_ORIGIN}{path}?{query}"), signature))
}

fn request_identity() -> (String, String) {
    let now = Local::now().format("%Y-%m-%dT%H:%M:%S%z").to_string();
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let random = format!("{nanos:032x}");
    (now, random[random.len() - 16..].to_string())
}

fn request_error(context: &str, error: &reqwest::Error) -> String {
    let mut causes = Vec::new();
    let mut source = error.source();
    while let Some(cause) = source {
        let message = cause.to_string();
        if !message.is_empty() && !causes.contains(&message) {
            causes.push(message);
        }
        source = cause.source();
    }
    let detail = causes
        .last()
        .map(|cause| format!("（{cause}）"))
        .unwrap_or_default();
    if error.is_timeout() {
        format!("{context}超时，请检查网络后重试。{detail}")
    } else if error.is_connect() {
        format!("{context}无法建立 HTTPS 连接。{detail}")
    } else {
        format!("{context}失败。{detail}")
    }
}

async fn submit(
    client: &Client,
    credentials: &XfyunCredentials,
    path: &Path,
) -> Result<(String, String), String> {
    let metadata = tokio::fs::metadata(path)
        .await
        .map_err(|error| format!("无法读取录音文件：{error}"))?;
    if metadata.len() == 0 {
        return Err("录音文件为空，无法提交转写。".into());
    }

    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "录音文件名无效。".to_string())?;
    let (date_time, signature_random) = request_identity();
    let parameters = BTreeMap::from([
        ("accessKeyId", credentials.api_key.trim().to_string()),
        ("appId", credentials.app_id.trim().to_string()),
        ("dateTime", date_time),
        ("durationCheckDisable", "true".to_string()),
        ("fileName", file_name.to_string()),
        ("fileSize", metadata.len().to_string()),
        ("language", "autodialect".to_string()),
        ("signatureRandom", signature_random.clone()),
    ]);
    let (url, signature) = signed_url("/v2/upload", &parameters, credentials.api_secret.trim())?;
    let file = tokio::fs::File::open(path)
        .await
        .map_err(|error| format!("无法打开录音文件：{error}"))?;
    let response = client
        .post(url)
        .header("Content-Type", "application/octet-stream")
        .header("Content-Length", metadata.len())
        .header("signature", signature)
        .body(Body::wrap_stream(ReaderStream::new(file)))
        .timeout(UPLOAD_TIMEOUT)
        .send()
        .await
        .map_err(|error| request_error("上传录音到讯飞", &error))?;
    let status = response.status();
    let payload: UploadResponse = response
        .json()
        .await
        .map_err(|error| format!("讯飞返回了无法解析的数据：{error}"))?;
    if !status.is_success() || !is_success_code(&payload.code) {
        return Err(format!("讯飞拒绝了录音：{}", payload.desc_info));
    }
    let order_id = payload
        .content
        .map(|content| content.order_id)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "讯飞没有返回转写任务 ID。".to_string())?;
    Ok((order_id, signature_random))
}

async fn poll(
    client: &Client,
    credentials: &XfyunCredentials,
    order_id: &str,
    signature_random: &str,
) -> Result<String, String> {
    for _ in 0..POLL_LIMIT {
        let (date_time, _) = request_identity();
        let parameters = BTreeMap::from([
            ("accessKeyId", credentials.api_key.trim().to_string()),
            ("dateTime", date_time),
            ("orderId", order_id.to_string()),
            ("resultType", "transfer".to_string()),
            ("signatureRandom", signature_random.to_string()),
        ]);
        let (url, signature) =
            signed_url("/v2/getResult", &parameters, credentials.api_secret.trim())?;
        let response = client
            .post(url)
            .header("Content-Type", "application/json")
            .header("signature", signature)
            .body("{}")
            .timeout(API_REQUEST_TIMEOUT)
            .send()
            .await
            .map_err(|error| request_error("查询讯飞任务", &error))?;
        let status = response.status();
        let payload: ResultResponse = response
            .json()
            .await
            .map_err(|error| format!("讯飞返回了无法解析的任务状态：{error}"))?;
        if !status.is_success() || !is_success_code(&payload.code) {
            return Err(format!("讯飞转写失败：{}", payload.desc_info));
        }
        let content = payload
            .content
            .ok_or_else(|| "讯飞没有返回任务状态。".to_string())?;
        match content.order_info.status {
            4 => return Ok(content.order_result),
            -1 => {
                return Err(format!(
                    "讯飞转写失败，错误类型 {}。",
                    content.order_info.fail_type
                ));
            }
            _ => tokio::time::sleep(POLL_INTERVAL).await,
        }
    }
    Err("讯飞转写等待超时，请稍后重试。".into())
}

fn value_as_u64(value: Option<&Value>) -> u64 {
    value
        .and_then(|item| {
            item.as_u64()
                .or_else(|| item.as_str().and_then(|text| text.parse().ok()))
        })
        .unwrap_or_default()
}

fn parse_segments(
    order_result: &str,
    role: &str,
    offset_ms: u64,
) -> Result<Vec<TranscriptSegment>, String> {
    let root: Value = serde_json::from_str(order_result)
        .map_err(|error| format!("讯飞转写结果格式无效：{error}"))?;
    let lattice = root
        .get("lattice")
        .and_then(Value::as_array)
        .or_else(|| root.get("lattice2").and_then(Value::as_array))
        .ok_or_else(|| "讯飞转写结果中没有文本片段。".to_string())?;

    let mut segments = Vec::new();
    for item in lattice {
        let Some(inner_text) = item.get("json_1best").and_then(Value::as_str) else {
            continue;
        };
        let Ok(inner) = serde_json::from_str::<Value>(inner_text) else {
            continue;
        };
        let Some(state) = inner.get("st") else {
            continue;
        };
        let text = state
            .get("rt")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .flat_map(|round| {
                round
                    .get("ws")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
            })
            .filter_map(|word| {
                word.get("cw")
                    .and_then(Value::as_array)
                    .and_then(|candidates| candidates.first())
                    .and_then(|candidate| candidate.get("w"))
                    .and_then(Value::as_str)
            })
            .collect::<String>()
            .trim()
            .to_string();
        if text.is_empty() {
            continue;
        }
        segments.push(TranscriptSegment {
            role: role.to_string(),
            text,
            start_ms: offset_ms + value_as_u64(state.get("bg")),
            end_ms: offset_ms + value_as_u64(state.get("ed")),
        });
    }
    Ok(segments)
}

async fn transcribe_track(
    client: &Client,
    credentials: &XfyunCredentials,
    path: &Path,
    role: &str,
    offset_ms: u64,
) -> Result<Vec<TranscriptSegment>, String> {
    let (order_id, signature_random) = submit(client, credentials, path).await?;
    let result = poll(client, credentials, &order_id, &signature_random).await?;
    let segments = parse_segments(&result, role, offset_ms)?;
    if segments.is_empty() {
        return Err(format!("{role}音轨没有识别出可用文本。"));
    }
    Ok(segments)
}

pub async fn transcribe_dual_recording(
    credentials: XfyunCredentials,
    recording: RecordingSummary,
) -> Result<DualTranscript, String> {
    validate_credentials(&credentials)?;
    let system_has_signal = wav_has_signal(Path::new(&recording.system_audio_path))?;
    let microphone_has_signal = wav_has_signal(Path::new(&recording.microphone_audio_path))?;
    if !system_has_signal && !microphone_has_signal {
        return Err("两路录音都没有检测到有效声音，请检查系统音频与麦克风来源后重试。".into());
    }

    let system_upload = system_has_signal
        .then(|| prepare_upload(Path::new(&recording.system_audio_path)))
        .transpose()?;
    let microphone_upload = microphone_has_signal
        .then(|| prepare_upload(Path::new(&recording.microphone_audio_path)))
        .transpose()?;
    let client = Client::builder()
        .connect_timeout(Duration::from_secs(30))
        .timeout(API_REQUEST_TIMEOUT)
        .build()
        .map_err(|error| format!("无法创建讯飞客户端：{error}"))?;

    let system = async {
        match system_upload.as_ref() {
            Some(upload) => Some(
                transcribe_track(
                    &client,
                    &credentials,
                    &upload.path,
                    "面试官",
                    recording.system_offset_ms,
                )
                .await,
            ),
            None => None,
        }
    };
    let microphone = async {
        match microphone_upload.as_ref() {
            Some(upload) => Some(
                transcribe_track(
                    &client,
                    &credentials,
                    &upload.path,
                    "候选人",
                    recording.microphone_offset_ms,
                )
                .await,
            ),
            None => None,
        }
    };
    let (system_result, microphone_result) = tokio::join!(system, microphone);

    let mut segments = Vec::new();
    let mut warnings = Vec::new();
    let mut errors = Vec::new();
    match system_result {
        Some(Ok(result)) => segments.extend(result),
        Some(Err(error)) => errors.push(format!("面试官音轨：{error}")),
        None => warnings.push("面试官音轨未检测到声音，已跳过该音轨。".to_string()),
    }
    match microphone_result {
        Some(Ok(result)) => segments.extend(result),
        Some(Err(error)) => errors.push(format!("候选人音轨：{error}")),
        None => warnings.push("候选人音轨未检测到声音，已跳过该音轨。".to_string()),
    }
    if segments.is_empty() {
        return Err(if errors.is_empty() {
            "讯飞没有识别出可用文本，请确认至少一路录音有清晰人声。".into()
        } else {
            errors.join("；")
        });
    }
    warnings.extend(
        errors
            .into_iter()
            .map(|error| format!("{error} 已保留另一音轨的转写结果。")),
    );
    segments.sort_by_key(|segment| segment.start_ms);
    let transcript = segments
        .iter()
        .map(|segment| format!("{}：{}", segment.role, segment.text))
        .collect::<Vec<_>>()
        .join("\n");
    if transcript.is_empty() {
        return Err("讯飞没有识别出可用文本，请确认两路录音都有声音。".into());
    }
    Ok(DualTranscript {
        transcript,
        segments,
        recording,
        warnings,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_test_wav(name: &str, samples: impl IntoIterator<Item = i16>) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "interview-atlas-{name}-{}.wav",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let spec = hound::WavSpec {
            channels: 1,
            sample_rate: 16_000,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut writer = hound::WavWriter::create(&path, spec).unwrap();
        for sample in samples {
            writer.write_sample(sample).unwrap();
        }
        writer.finalize().unwrap();
        path
    }

    #[test]
    fn parses_nested_xfyun_segments() {
        let result = r#"{"lattice":[{"json_1best":"{\"st\":{\"bg\":\"100\",\"ed\":\"900\",\"rt\":[{\"ws\":[{\"cw\":[{\"w\":\"你好\"}]},{\"cw\":[{\"w\":\"。\"}]}]}]}}"}]}"#;
        let segments = parse_segments(result, "面试官", 40).unwrap();
        assert_eq!(segments.len(), 1);
        assert_eq!(segments[0].text, "你好。");
        assert_eq!(segments[0].start_ms, 140);
        assert_eq!(segments[0].end_ms, 940);
    }

    #[test]
    fn rejects_silent_wav_track() {
        let path = write_test_wav("silent", vec![0; 320]);
        assert!(!wav_has_signal(&path).unwrap());
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn accepts_wav_track_with_sustained_signal() {
        let path = write_test_wav("audible", vec![256; MIN_ACTIVE_SAMPLES]);
        assert!(wav_has_signal(&path).unwrap());
        std::fs::remove_file(path).unwrap();
    }
}
