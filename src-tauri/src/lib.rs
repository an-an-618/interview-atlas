mod recording;
mod xfyun;

use recording::RecordingState;
use tauri::State;
use xfyun::{DualTranscript, XfyunCredentials};

#[tauri::command]
async fn transcribe_latest_recording(
    state: State<'_, RecordingState>,
    credentials: XfyunCredentials,
) -> Result<DualTranscript, String> {
    let recording = state.latest()?;
    xfyun::transcribe_dual_recording(credentials, recording).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(RecordingState::default())
        .invoke_handler(tauri::generate_handler![
            recording::recording_capabilities,
            recording::load_latest_recording,
            recording::start_dual_audio_recording,
            recording::stop_dual_audio_recording,
            recording::reveal_latest_recording,
            transcribe_latest_recording,
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
