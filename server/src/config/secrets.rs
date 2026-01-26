// Secure storage for API tokens and secrets
//
// Tokens are stored in ~/.ralph-ui/secrets.toml (global only, not project-level)
// This file should be automatically gitignored

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

/// Secrets stored in ~/.ralph-ui/secrets.toml
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SecretsConfig {
    /// API tokens indexed by provider ID (e.g., "zai" -> "sk-...")
    #[serde(default)]
    pub api_tokens: HashMap<String, String>,
}

impl SecretsConfig {
    /// Get the secrets file path (~/.ralph-ui/secrets.toml)
    pub fn get_secrets_path() -> Option<PathBuf> {
        dirs::home_dir().map(|p| p.join(".ralph-ui").join("secrets.toml"))
    }

    /// Load secrets from disk
    pub fn load() -> Result<Self> {
        let path = Self::get_secrets_path()
            .ok_or_else(|| anyhow!("Could not determine home directory"))?;

        if !path.exists() {
            return Ok(Self::default());
        }

        let contents = fs::read_to_string(&path)
            .map_err(|e| anyhow!("Failed to read secrets file '{}': {}", path.display(), e))?;

        let config: SecretsConfig = toml::from_str(&contents)
            .map_err(|e| anyhow!("Failed to parse secrets file '{}': {}", path.display(), e))?;

        Ok(config)
    }

    /// Save secrets to disk
    pub fn save(&self) -> Result<()> {
        let path = Self::get_secrets_path()
            .ok_or_else(|| anyhow!("Could not determine home directory"))?;

        // Ensure parent directory exists
        if let Some(parent) = path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent).map_err(|e| {
                    anyhow!(
                        "Failed to create secrets directory '{}': {}",
                        parent.display(),
                        e
                    )
                })?;
            }
        }

        // Serialize to TOML
        let contents = toml::to_string_pretty(self)
            .map_err(|e| anyhow!("Failed to serialize secrets: {}", e))?;

        // Write to file with restrictive permissions
        fs::write(&path, contents)
            .map_err(|e| anyhow!("Failed to write secrets file '{}': {}", path.display(), e))?;

        // Set file permissions to 600 (owner read/write only) on Unix
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let permissions = fs::Permissions::from_mode(0o600);
            fs::set_permissions(&path, permissions).map_err(|e| {
                anyhow!(
                    "Failed to set permissions on secrets file '{}': {}",
                    path.display(),
                    e
                )
            })?;
        }

        log::info!("Saved secrets to: {}", path.display());
        Ok(())
    }

    /// Get a provider's API token
    pub fn get_token(&self, provider_id: &str) -> Option<&String> {
        self.api_tokens.get(provider_id)
    }

    /// Set a provider's API token
    pub fn set_token(&mut self, provider_id: &str, token: &str) {
        self.api_tokens
            .insert(provider_id.to_string(), token.to_string());
    }

    /// Delete a provider's API token
    pub fn delete_token(&mut self, provider_id: &str) -> bool {
        self.api_tokens.remove(provider_id).is_some()
    }

    /// Check if a provider has a token configured
    pub fn has_token(&self, provider_id: &str) -> bool {
        self.api_tokens.contains_key(provider_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_secrets_config_default() {
        let config = SecretsConfig::default();
        assert!(config.api_tokens.is_empty());
    }

    #[test]
    fn test_set_and_get_token() {
        let mut config = SecretsConfig::default();
        config.set_token("zai", "test-token");
        assert_eq!(config.get_token("zai"), Some(&"test-token".to_string()));
        assert!(config.has_token("zai"));
        assert!(!config.has_token("anthropic"));
    }

    #[test]
    fn test_delete_token() {
        let mut config = SecretsConfig::default();
        config.set_token("zai", "test-token");
        assert!(config.delete_token("zai"));
        assert!(!config.has_token("zai"));
        assert!(!config.delete_token("zai")); // Already deleted
    }

    #[test]
    fn test_serialization() {
        let mut config = SecretsConfig::default();
        config.set_token("zai", "sk-12345");
        config.set_token("minimax", "mm-67890");

        let toml_str = toml::to_string(&config).unwrap();
        assert!(toml_str.contains("zai"));
        assert!(toml_str.contains("sk-12345"));

        let parsed: SecretsConfig = toml::from_str(&toml_str).unwrap();
        assert_eq!(parsed.get_token("zai"), Some(&"sk-12345".to_string()));
        assert_eq!(parsed.get_token("minimax"), Some(&"mm-67890".to_string()));
    }
}
