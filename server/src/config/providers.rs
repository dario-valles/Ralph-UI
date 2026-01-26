// Builtin API provider presets for Claude-compatible APIs
//
// z.ai and MiniMax provide Claude-compatible APIs that can be used
// with Claude Code CLI by setting environment variables.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// A builtin API provider preset
/// Note: This is hardcoded data, not deserialized from files
#[derive(Debug, Clone)]
pub struct ApiProviderPreset {
    /// Provider ID (e.g., "zai", "minimax", "anthropic")
    pub id: &'static str,
    /// Display name
    pub name: &'static str,
    /// Base URL for the API
    pub base_url: &'static str,
    /// Available models for this provider (None = use CLI discovery)
    pub models: Option<&'static [(&'static str, bool)]>, // (model_name, is_default)
    /// Model mappings for ANTHROPIC_DEFAULT_*_MODEL env vars
    pub model_mappings: Option<ModelMappings>,
}

/// Model mappings for alternative providers
/// Maps Claude model tiers (opus, sonnet, haiku) to provider-specific models
#[derive(Debug, Clone)]
pub struct ModelMappings {
    pub opus: Option<&'static str>,
    pub sonnet: Option<&'static str>,
    pub haiku: Option<&'static str>,
}

/// Builtin API provider presets
pub static PROVIDERS: &[ApiProviderPreset] = &[
    ApiProviderPreset {
        id: "anthropic",
        name: "Anthropic (Direct)",
        base_url: "https://api.anthropic.com",
        models: None, // Uses standard Claude models from CLI discovery
        model_mappings: None,
    },
    ApiProviderPreset {
        id: "zai",
        name: "Z.AI",
        base_url: "https://api.z.ai/api/anthropic",
        models: Some(&[
            ("GLM-4.7", true), // default
            ("GLM-4.5-Air", false),
        ]),
        model_mappings: Some(ModelMappings {
            opus: Some("GLM-4.7"),
            sonnet: Some("GLM-4.7"),
            haiku: Some("GLM-4.5-Air"),
        }),
    },
    ApiProviderPreset {
        id: "minimax",
        name: "MiniMax",
        base_url: "https://api.minimax.io/anthropic",
        models: Some(&[("MiniMax-M2.1", true)]),
        model_mappings: Some(ModelMappings {
            opus: Some("MiniMax-M2.1"),
            sonnet: Some("MiniMax-M2.1"),
            haiku: Some("MiniMax-M2.1"),
        }),
    },
    ApiProviderPreset {
        id: "minimax-cn",
        name: "MiniMax (China)",
        base_url: "https://api.minimaxi.com/anthropic",
        models: Some(&[("MiniMax-M2.1", true)]),
        model_mappings: Some(ModelMappings {
            opus: Some("MiniMax-M2.1"),
            sonnet: Some("MiniMax-M2.1"),
            haiku: Some("MiniMax-M2.1"),
        }),
    },
];

/// Get a provider preset by ID
pub fn get_provider_preset(id: &str) -> Option<&'static ApiProviderPreset> {
    PROVIDERS.iter().find(|p| p.id == id)
}

/// Get all provider presets
pub fn get_all_provider_presets() -> &'static [ApiProviderPreset] {
    PROVIDERS
}

/// API provider info returned to frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiProviderInfo {
    /// Provider ID
    pub id: String,
    /// Display name
    pub name: String,
    /// Base URL
    pub base_url: String,
    /// Whether this provider has a token configured
    pub has_token: bool,
    /// Whether this provider is currently active
    pub is_active: bool,
    /// Available models for this provider
    pub models: Vec<ProviderModelInfo>,
}

/// Model info for a provider
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderModelInfo {
    pub name: String,
    pub is_default: bool,
}

impl ApiProviderPreset {
    /// Convert to ApiProviderInfo with runtime state
    pub fn to_info(&self, has_token: bool, is_active: bool) -> ApiProviderInfo {
        let models = self
            .models
            .map(|m| {
                m.iter()
                    .map(|(name, is_default)| ProviderModelInfo {
                        name: (*name).to_string(),
                        is_default: *is_default,
                    })
                    .collect()
            })
            .unwrap_or_default();

        ApiProviderInfo {
            id: self.id.to_string(),
            name: self.name.to_string(),
            base_url: self.base_url.to_string(),
            has_token,
            is_active,
            models,
        }
    }
}

/// Build environment variables for a provider
/// These are injected when spawning Claude CLI with an alternative provider
pub fn build_provider_env_vars(provider_id: &str, token: Option<&str>) -> HashMap<String, String> {
    let mut env = HashMap::new();

    let preset = match get_provider_preset(provider_id) {
        Some(p) => p,
        None => return env,
    };

    // For non-Anthropic providers, set the base URL
    if provider_id != "anthropic" {
        env.insert(
            "ANTHROPIC_BASE_URL".to_string(),
            preset.base_url.to_string(),
        );
    }

    // Set the auth token if provided
    if let Some(token) = token {
        env.insert("ANTHROPIC_AUTH_TOKEN".to_string(), token.to_string());
    }

    // Set model defaults if provider has mappings
    if let Some(ref mappings) = preset.model_mappings {
        if let Some(opus) = mappings.opus {
            env.insert("ANTHROPIC_DEFAULT_OPUS_MODEL".to_string(), opus.to_string());
        }
        if let Some(sonnet) = mappings.sonnet {
            env.insert(
                "ANTHROPIC_DEFAULT_SONNET_MODEL".to_string(),
                sonnet.to_string(),
            );
        }
        if let Some(haiku) = mappings.haiku {
            env.insert(
                "ANTHROPIC_DEFAULT_HAIKU_MODEL".to_string(),
                haiku.to_string(),
            );
        }
    }

    // Recommended timeout for alternative providers (5 minutes)
    env.insert("API_TIMEOUT_MS".to_string(), "300000".to_string());

    env
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_provider_preset() {
        let anthropic = get_provider_preset("anthropic");
        assert!(anthropic.is_some());
        assert_eq!(anthropic.unwrap().name, "Anthropic (Direct)");

        let zai = get_provider_preset("zai");
        assert!(zai.is_some());
        assert_eq!(zai.unwrap().name, "Z.AI");

        let unknown = get_provider_preset("unknown");
        assert!(unknown.is_none());
    }

    #[test]
    fn test_build_provider_env_vars_anthropic() {
        let env = build_provider_env_vars("anthropic", Some("sk-12345"));

        // Anthropic doesn't need base URL override
        assert!(!env.contains_key("ANTHROPIC_BASE_URL"));

        // But should have the token
        assert_eq!(
            env.get("ANTHROPIC_AUTH_TOKEN"),
            Some(&"sk-12345".to_string())
        );
    }

    #[test]
    fn test_build_provider_env_vars_zai() {
        let env = build_provider_env_vars("zai", Some("zai-token"));

        assert_eq!(
            env.get("ANTHROPIC_BASE_URL"),
            Some(&"https://api.z.ai/api/anthropic".to_string())
        );
        assert_eq!(
            env.get("ANTHROPIC_AUTH_TOKEN"),
            Some(&"zai-token".to_string())
        );
        assert_eq!(
            env.get("ANTHROPIC_DEFAULT_OPUS_MODEL"),
            Some(&"GLM-4.7".to_string())
        );
        assert_eq!(
            env.get("ANTHROPIC_DEFAULT_SONNET_MODEL"),
            Some(&"GLM-4.7".to_string())
        );
        assert_eq!(
            env.get("ANTHROPIC_DEFAULT_HAIKU_MODEL"),
            Some(&"GLM-4.5-Air".to_string())
        );
    }

    #[test]
    fn test_build_provider_env_vars_minimax() {
        let env = build_provider_env_vars("minimax", Some("mm-token"));

        assert_eq!(
            env.get("ANTHROPIC_BASE_URL"),
            Some(&"https://api.minimax.io/anthropic".to_string())
        );
        assert_eq!(
            env.get("ANTHROPIC_DEFAULT_OPUS_MODEL"),
            Some(&"MiniMax-M2.1".to_string())
        );
    }

    #[test]
    fn test_build_provider_env_vars_unknown_provider() {
        let env = build_provider_env_vars("unknown", Some("token"));
        assert!(env.is_empty());
    }

    #[test]
    fn test_preset_to_info() {
        let preset = get_provider_preset("zai").unwrap();
        let info = preset.to_info(true, false);

        assert_eq!(info.id, "zai");
        assert_eq!(info.name, "Z.AI");
        assert!(info.has_token);
        assert!(!info.is_active);
        assert_eq!(info.models.len(), 2);
        assert!(info
            .models
            .iter()
            .any(|m| m.name == "GLM-4.7" && m.is_default));
    }
}
