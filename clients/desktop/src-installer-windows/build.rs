use sha2::{Digest, Sha256};
use std::{env, fs, path::PathBuf};

fn main() {
    println!("cargo:rerun-if-env-changed=LINAI_NSIS_PAYLOAD");
    println!("cargo:rerun-if-env-changed=LINAI_NSIS_PAYLOAD_SHA256");
    println!("cargo:rerun-if-changed=windows-app-manifest.xml");

    let output =
        PathBuf::from(env::var_os("OUT_DIR").expect("OUT_DIR is set")).join("linai-payload.exe");
    let payload = match env::var_os("LINAI_NSIS_PAYLOAD") {
        Some(value) => {
            let path = PathBuf::from(value);
            assert!(path.is_file(), "LINAI_NSIS_PAYLOAD must point to a file");
            fs::read(path).expect("failed to read LINAI_NSIS_PAYLOAD")
        }
        None => Vec::new(),
    };

    fs::write(&output, &payload).expect("failed to stage installer payload");
    let digest = hex::encode(Sha256::digest(&payload));
    println!("cargo:rustc-env=LINAI_PAYLOAD_SHA256={digest}");
    println!("cargo:rustc-env=LINAI_PAYLOAD_SIZE={}", payload.len());

    let mut windows = tauri_build::WindowsAttributes::new();
    if env::var("PROFILE").as_deref() == Ok("release") {
        windows = windows.app_manifest(include_str!("windows-app-manifest.xml"));
    }
    let attributes = tauri_build::Attributes::new().windows_attributes(windows);
    tauri_build::try_build(attributes).expect("failed to build LinAI installer resources");
}
