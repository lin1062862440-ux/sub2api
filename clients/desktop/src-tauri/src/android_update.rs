#[cfg(mobile)]
use base64::{engine::general_purpose::STANDARD, Engine as _};
use minisign_verify::{PublicKey, Signature};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::Read;
use std::path::Path;
#[cfg(mobile)]
use tauri::Manager;

const READ_BUFFER_BYTES: usize = 64 * 1024;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum VerifyErrorCode {
    UnsafePath,
    MissingFile,
    SizeMismatch,
    DigestMismatch,
    SignatureMismatch,
}

#[cfg(mobile)]
fn trusted_public_key_text() -> Result<String, VerifyErrorCode> {
    let config: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json"))
        .map_err(|_| VerifyErrorCode::SignatureMismatch)?;
    let encoded = config
        .pointer("/plugins/updater/pubkey")
        .and_then(serde_json::Value::as_str)
        .ok_or(VerifyErrorCode::SignatureMismatch)?;
    let decoded = STANDARD
        .decode(encoded)
        .map_err(|_| VerifyErrorCode::SignatureMismatch)?;
    String::from_utf8(decoded).map_err(|_| VerifyErrorCode::SignatureMismatch)
}

fn verify_file(
    update_root: &Path,
    requested_path: &Path,
    expected_bytes: u64,
    expected_sha256: &str,
    public_key_text: &str,
    signature_text: &str,
) -> Result<(), VerifyErrorCode> {
    let update_root = fs::canonicalize(update_root).map_err(|_| VerifyErrorCode::MissingFile)?;
    let file_path = fs::canonicalize(requested_path).map_err(|_| VerifyErrorCode::MissingFile)?;
    if !file_path.starts_with(&update_root) {
        return Err(VerifyErrorCode::UnsafePath);
    }

    if expected_sha256.len() != 64
        || !expected_sha256
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(VerifyErrorCode::DigestMismatch);
    }

    let metadata = fs::metadata(&file_path).map_err(|_| VerifyErrorCode::MissingFile)?;
    if !metadata.is_file() {
        return Err(VerifyErrorCode::MissingFile);
    }
    if metadata.len() != expected_bytes {
        return Err(VerifyErrorCode::SizeMismatch);
    }

    let public_key =
        PublicKey::decode(public_key_text).map_err(|_| VerifyErrorCode::SignatureMismatch)?;
    let signature =
        Signature::decode(signature_text).map_err(|_| VerifyErrorCode::SignatureMismatch)?;
    let mut signature_verifier = public_key
        .verify_stream(&signature)
        .map_err(|_| VerifyErrorCode::SignatureMismatch)?;
    let mut sha256 = Sha256::new();
    let mut file = File::open(&file_path).map_err(|_| VerifyErrorCode::MissingFile)?;
    let mut buffer = [0_u8; READ_BUFFER_BYTES];
    let mut total = 0_u64;

    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|_| VerifyErrorCode::MissingFile)?;
        if read == 0 {
            break;
        }
        let chunk = &buffer[..read];
        total = total
            .checked_add(read as u64)
            .ok_or(VerifyErrorCode::SizeMismatch)?;
        if total > expected_bytes {
            return Err(VerifyErrorCode::SizeMismatch);
        }
        sha256.update(chunk);
        signature_verifier.update(chunk);
    }

    if total != expected_bytes {
        return Err(VerifyErrorCode::SizeMismatch);
    }
    if format!("{:x}", sha256.finalize()) != expected_sha256 {
        return Err(VerifyErrorCode::DigestMismatch);
    }
    signature_verifier
        .finalize()
        .map_err(|_| VerifyErrorCode::SignatureMismatch)
}

#[tauri::command]
#[cfg(mobile)]
pub fn verify_android_update(
    app: tauri::AppHandle,
    path: String,
    bytes: u64,
    sha256: String,
    signature: String,
) -> Result<(), VerifyErrorCode> {
    let update_root = app
        .path()
        .app_cache_dir()
        .map_err(|_| VerifyErrorCode::MissingFile)?
        .join("linai-updates");
    let public_key = trusted_public_key_text()?;
    verify_file(
        &update_root,
        Path::new(&path),
        bytes,
        &sha256,
        &public_key,
        &signature,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    use blake2::{Blake2b512, Digest as BlakeDigest};
    use ed25519_dalek::{Signer, SigningKey};
    use sha2::Sha256;
    use std::fs;

    const TEST_KEY_ID: [u8; 8] = [3, 1, 4, 1, 5, 9, 2, 6];

    fn test_key() -> SigningKey {
        SigningKey::from_bytes(&[7; 32])
    }

    fn public_key_text() -> String {
        let mut encoded = Vec::with_capacity(42);
        encoded.extend_from_slice(b"ED");
        encoded.extend_from_slice(&TEST_KEY_ID);
        encoded.extend_from_slice(test_key().verifying_key().as_bytes());
        format!(
            "untrusted comment: test public key\n{}",
            STANDARD.encode(encoded)
        )
    }

    fn signature_text(data: &[u8]) -> String {
        let key = test_key();
        let digest = Blake2b512::digest(data);
        let signature = key.sign(&digest).to_bytes();
        let trusted_comment = "timestamp:0\tfile:test.apk\tprehashed";
        let mut global = Vec::with_capacity(signature.len() + trusted_comment.len());
        global.extend_from_slice(&signature);
        global.extend_from_slice(trusted_comment.as_bytes());
        let global_signature = key.sign(&global).to_bytes();

        let mut encoded_signature = Vec::with_capacity(74);
        encoded_signature.extend_from_slice(b"ED");
        encoded_signature.extend_from_slice(&TEST_KEY_ID);
        encoded_signature.extend_from_slice(&signature);
        format!(
            "untrusted comment: test signature\n{}\ntrusted comment: {}\n{}",
            STANDARD.encode(encoded_signature),
            trusted_comment,
            STANDARD.encode(global_signature),
        )
    }

    fn sha256(data: &[u8]) -> String {
        format!("{:x}", Sha256::digest(data))
    }

    fn fixture() -> (tempfile::TempDir, std::path::PathBuf, Vec<u8>) {
        let root = tempfile::tempdir().unwrap();
        let data = b"small APK-shaped verification fixture".to_vec();
        let path = root.path().join("linai-update-0.1.5.apk");
        fs::write(&path, &data).unwrap();
        (root, path, data)
    }

    #[test]
    fn verifies_a_valid_streaming_fixture() {
        let (root, path, data) = fixture();
        assert_eq!(
            verify_file(
                root.path(),
                &path,
                data.len() as u64,
                &sha256(&data),
                &public_key_text(),
                &signature_text(&data),
            ),
            Ok(())
        );
    }

    #[test]
    fn rejects_exact_size_and_sha256_mismatches() {
        let (root, path, data) = fixture();
        assert_eq!(
            verify_file(
                root.path(),
                &path,
                data.len() as u64 + 1,
                &sha256(&data),
                &public_key_text(),
                &signature_text(&data),
            ),
            Err(VerifyErrorCode::SizeMismatch)
        );
        assert_eq!(
            verify_file(
                root.path(),
                &path,
                data.len() as u64,
                &"0".repeat(64),
                &public_key_text(),
                &signature_text(&data),
            ),
            Err(VerifyErrorCode::DigestMismatch)
        );
    }

    #[test]
    fn rejects_modified_bytes_with_a_matching_modified_digest() {
        let (root, path, original) = fixture();
        let modified = b"modified APK-shaped verification fixture";
        fs::write(&path, modified).unwrap();
        assert_eq!(
            verify_file(
                root.path(),
                &path,
                modified.len() as u64,
                &sha256(modified),
                &public_key_text(),
                &signature_text(&original),
            ),
            Err(VerifyErrorCode::SignatureMismatch)
        );
    }

    #[test]
    fn rejects_a_canonical_path_outside_the_update_cache() {
        let root = tempfile::tempdir().unwrap();
        let outside = tempfile::NamedTempFile::new().unwrap();
        assert_eq!(
            verify_file(
                root.path(),
                outside.path(),
                0,
                &"0".repeat(64),
                &public_key_text(),
                &signature_text(b""),
            ),
            Err(VerifyErrorCode::UnsafePath)
        );
    }

    #[test]
    fn serializes_only_bounded_error_codes() {
        assert_eq!(
            serde_json::to_string(&VerifyErrorCode::UnsafePath).unwrap(),
            "\"unsafe_path\""
        );
    }
}
