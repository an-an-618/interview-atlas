fn main() {
    #[cfg(target_os = "macos")]
    if let Ok(output) = std::process::Command::new("xcrun")
        .args(["--find", "swiftc"])
        .output()
    {
        if output.status.success() {
            let swiftc = String::from_utf8_lossy(&output.stdout);
            if let Some(usr) = std::path::Path::new(swiftc.trim())
                .parent()
                .and_then(std::path::Path::parent)
            {
                let libraries = usr.join("lib/swift/macosx");
                if libraries.is_dir() {
                    println!("cargo:rustc-link-search=native={}", libraries.display());
                }
            }
        }
    }
    tauri_build::build()
}
