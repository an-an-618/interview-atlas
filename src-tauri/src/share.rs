use std::{fs::OpenOptions, io::Write, path::Path};
use tauri::Manager;

fn validate_image(name: &str, bytes: &[u8]) -> Result<(), String> {
    if name.is_empty()
        || name.len() > 240
        || !name.ends_with(".png")
        || name
            .chars()
            .any(|c| c.is_control() || "<>:\"/\\|?*".contains(c))
    {
        return Err("图片文件名无效。".into());
    }
    if bytes.len() < 24
        || bytes.len() > 20 * 1024 * 1024
        || !bytes.starts_with(b"\x89PNG\r\n\x1a\n")
        || &bytes[12..16] != b"IHDR"
        || u32::from_be_bytes(bytes[16..20].try_into().unwrap()) != 1080
        || u32::from_be_bytes(bytes[20..24].try_into().unwrap()) != 1440
    {
        return Err("图片格式或尺寸无效，请重新导出。".into());
    }
    Ok(())
}

fn save_to_directory(directory: &Path, name: &str, bytes: &[u8]) -> Result<(), String> {
    validate_image(name, bytes)?;
    let stem = name.trim_end_matches(".png");
    // create_new makes collisions safe, including simultaneous exports.
    for suffix in 0..10_000 {
        let filename = if suffix == 0 {
            name.to_owned()
        } else {
            format!("{stem} ({suffix}).png")
        };
        let path = directory.join(filename);
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(mut file) => {
                if let Err(error) = file.write_all(bytes) {
                    drop(file);
                    let _ = std::fs::remove_file(&path);
                    return Err(format!("保存图片失败：{error}"));
                }
                return Ok(());
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("无法保存到下载文件夹：{error}")),
        }
    }
    Err("同名图片过多，请清理下载文件夹后重试。".into())
}

/// Only generated PNGs can be written, only to the OS Downloads directory.
#[tauri::command]
pub async fn save_share_image(
    app: tauri::AppHandle,
    name: String,
    bytes: Vec<u8>,
) -> Result<(), String> {
    let directory = app
        .path()
        .download_dir()
        .map_err(|_| "无法找到系统下载文件夹。".to_string())?;
    save_to_directory(&directory, &name, &bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn image_header() -> Vec<u8> {
        let mut bytes = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR".to_vec();
        bytes.extend_from_slice(&1080_u32.to_be_bytes());
        bytes.extend_from_slice(&1440_u32.to_be_bytes());
        bytes
    }

    #[test]
    fn rejects_paths_invalid_content_and_wrong_dimensions() {
        let bytes = image_header();
        for name in ["../a.png", "a\\b.png", "/a.png", "a.txt", "a:\0.png"] {
            assert!(validate_image(name, &bytes).is_err());
        }
        assert!(validate_image("分享.png", b"not a png").is_err());
        let mut wrong = bytes.clone();
        wrong[16..20].copy_from_slice(&720_u32.to_be_bytes());
        assert!(validate_image("分享.png", &wrong).is_err());
        assert!(validate_image("分享.png", &bytes).is_ok());
    }

    #[test]
    fn repeated_exports_keep_existing_files() {
        let directory = std::env::temp_dir().join(format!(
            "atlas-share-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir(&directory).unwrap();
        let bytes = image_header();
        save_to_directory(&directory, "分享.png", &bytes).unwrap();
        save_to_directory(&directory, "分享.png", &bytes).unwrap();
        assert_eq!(std::fs::read(directory.join("分享.png")).unwrap(), bytes);
        assert_eq!(
            std::fs::read(directory.join("分享 (1).png")).unwrap(),
            bytes
        );
        std::fs::remove_dir_all(directory).unwrap();
    }
}
