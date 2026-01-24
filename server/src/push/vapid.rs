//! VAPID (Voluntary Application Server Identification) key management
//!
//! VAPID keys are used to authenticate the server when sending push notifications.
//! Keys are generated once and stored in ~/.ralph-ui/vapid_keys.json

use crate::file_storage::{
    get_global_ralph_ui_dir, init_global_ralph_ui_dir, read_json, write_json,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// VAPID key pair for push notification authentication
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VapidKeys {
    /// The public key (shared with clients) - base64url encoded
    pub public_key: String,
    /// The private key (kept secret on server) - base64url encoded
    pub private_key: String,
    /// When the keys were generated
    pub created_at: String,
}

/// Get the path to the VAPID keys file
fn get_vapid_keys_path() -> PathBuf {
    get_global_ralph_ui_dir().join("vapid_keys.json")
}

/// Generate a new VAPID key pair using P-256 curve
fn generate_vapid_keys() -> Result<VapidKeys, String> {
    use p256::ecdsa::SigningKey;
    use rand::rngs::OsRng;

    // Generate a new P-256 signing key
    let signing_key = SigningKey::random(&mut OsRng);

    // Get the private key bytes (32 bytes for P-256)
    let private_key_bytes = signing_key.to_bytes();
    let private_key = URL_SAFE_NO_PAD.encode(private_key_bytes);

    // Get the public key (uncompressed point, 65 bytes)
    let verifying_key = signing_key.verifying_key();
    let public_key_bytes = verifying_key.to_encoded_point(false);
    let public_key = URL_SAFE_NO_PAD.encode(public_key_bytes.as_bytes());

    Ok(VapidKeys {
        public_key,
        private_key,
        created_at: chrono::Utc::now().to_rfc3339(),
    })
}

/// Load VAPID keys from storage
fn load_vapid_keys() -> Result<Option<VapidKeys>, String> {
    let path = get_vapid_keys_path();
    if !path.exists() {
        return Ok(None);
    }
    read_json(&path).map(Some)
}

/// Save VAPID keys to storage
fn save_vapid_keys(keys: &VapidKeys) -> Result<(), String> {
    init_global_ralph_ui_dir()?;
    let path = get_vapid_keys_path();
    write_json(&path, keys)
}

/// Get existing VAPID keys or create new ones
pub fn get_or_create_vapid_keys() -> Result<VapidKeys, String> {
    // Try to load existing keys
    if let Some(keys) = load_vapid_keys()? {
        log::debug!("Loaded existing VAPID keys");
        return Ok(keys);
    }

    // Generate new keys
    log::info!("Generating new VAPID keys");
    let keys = generate_vapid_keys()?;
    save_vapid_keys(&keys)?;

    Ok(keys)
}

/// Get just the public key (for client use)
pub fn get_vapid_public_key() -> Result<String, String> {
    let keys = get_or_create_vapid_keys()?;
    Ok(keys.public_key)
}

/// Get the private key bytes for signing
pub fn get_vapid_private_key_bytes() -> Result<Vec<u8>, String> {
    let keys = get_or_create_vapid_keys()?;
    URL_SAFE_NO_PAD
        .decode(&keys.private_key)
        .map_err(|e| format!("Failed to decode private key: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_vapid_keys() {
        let keys = generate_vapid_keys().unwrap();
        assert!(!keys.public_key.is_empty());
        assert!(!keys.private_key.is_empty());
        assert!(!keys.created_at.is_empty());
    }

    #[test]
    fn test_keys_are_valid_base64() {
        let keys = generate_vapid_keys().unwrap();

        // Public key should be 65 bytes (uncompressed EC point)
        let public_bytes = URL_SAFE_NO_PAD.decode(&keys.public_key).unwrap();
        assert_eq!(public_bytes.len(), 65);

        // Private key should be 32 bytes
        let private_bytes = URL_SAFE_NO_PAD.decode(&keys.private_key).unwrap();
        assert_eq!(private_bytes.len(), 32);
    }
}
