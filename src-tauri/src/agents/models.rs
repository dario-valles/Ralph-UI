// Model discovery types and fallback models

use serde::{Deserialize, Serialize};
use crate::models::AgentType;

/// Information about an available model
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    /// Unique model identifier (e.g., "anthropic/claude-sonnet-4-5")
    pub id: String,
    /// Human-readable display name (e.g., "Claude Sonnet 4.5")
    pub name: String,
    /// Provider name (e.g., "anthropic", "openai")
    pub provider: String,
    /// Whether this is the default model for the agent
    #[serde(default)]
    pub is_default: bool,
}

impl ModelInfo {
    pub fn new(id: &str, name: &str, provider: &str, is_default: bool) -> Self {
        Self {
            id: id.to_string(),
            name: name.to_string(),
            provider: provider.to_string(),
            is_default,
        }
    }
}

/// Format a model ID into a human-readable name
pub fn format_model_name(model_id: &str) -> String {
    // Common model name mappings
    match model_id {
        "claude-sonnet-4-5" => "Claude Sonnet 4.5".to_string(),
        "claude-opus-4-5" => "Claude Opus 4.5".to_string(),
        "gpt-4o" => "GPT-4o".to_string(),
        "o1" => "OpenAI o1".to_string(),
        "o1-mini" => "OpenAI o1-mini".to_string(),
        "gpt-4-turbo" => "GPT-4 Turbo".to_string(),
        "gpt-3.5-turbo" => "GPT-3.5 Turbo".to_string(),
        _ => {
            // Convert kebab-case to Title Case
            model_id
                .split('-')
                .map(|word| {
                    let mut chars = word.chars();
                    match chars.next() {
                        None => String::new(),
                        Some(first) => first.to_uppercase().chain(chars).collect(),
                    }
                })
                .collect::<Vec<_>>()
                .join(" ")
        }
    }
}

/// Infer provider from model name
pub fn infer_provider(model_id: &str) -> String {
    if model_id.starts_with("claude") {
        "anthropic".to_string()
    } else if model_id.starts_with("gpt") || model_id.starts_with("o1") || model_id.starts_with("text-") {
        "openai".to_string()
    } else if model_id.starts_with("gemini") {
        "google".to_string()
    } else {
        "unknown".to_string()
    }
}

/// Get fallback models if CLI discovery fails
pub fn get_fallback_models(agent_type: &AgentType) -> Vec<ModelInfo> {
    match agent_type {
        AgentType::Opencode => vec![
            ModelInfo::new("anthropic/claude-sonnet-4-5", "Claude Sonnet 4.5", "anthropic", true),
            ModelInfo::new("anthropic/claude-opus-4-5", "Claude Opus 4.5", "anthropic", false),
            ModelInfo::new("openai/gpt-4o", "GPT-4o", "openai", false),
            ModelInfo::new("openai/o1", "OpenAI o1", "openai", false),
        ],
        AgentType::Claude => vec![
            ModelInfo::new("claude-sonnet-4-5", "Claude Sonnet 4.5", "anthropic", true),
            ModelInfo::new("claude-opus-4-5", "Claude Opus 4.5", "anthropic", false),
        ],
        AgentType::Cursor => vec![
            ModelInfo::new("claude-sonnet-4-5", "Claude Sonnet 4.5", "anthropic", true),
            ModelInfo::new("gpt-4o", "GPT-4o", "openai", false),
        ],
        AgentType::Codex => vec![
            ModelInfo::new("gpt-4o", "GPT-4o", "openai", true),
            ModelInfo::new("o1", "OpenAI o1", "openai", false),
        ],
        AgentType::Qwen => vec![
            ModelInfo::new("qwen-2.5-coder", "Qwen 2.5 Coder", "qwen", true),
            ModelInfo::new("qwen-2.5", "Qwen 2.5", "qwen", false),
        ],
        AgentType::Droid => vec![
            ModelInfo::new("claude-sonnet-4-5", "Claude Sonnet 4.5", "anthropic", true),
            ModelInfo::new("gpt-4o", "GPT-4o", "openai", false),
        ],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_fallback_models_claude() {
        let models = get_fallback_models(&AgentType::Claude);
        assert!(!models.is_empty());
        assert!(models.iter().any(|m| m.is_default));
        assert!(models.iter().any(|m| m.id == "claude-sonnet-4-5"));
    }

    #[test]
    fn test_get_fallback_models_opencode() {
        let models = get_fallback_models(&AgentType::Opencode);
        assert!(!models.is_empty());
        assert!(models.iter().any(|m| m.is_default));
        assert!(models.iter().any(|m| m.id == "anthropic/claude-sonnet-4-5"));
    }

    #[test]
    fn test_get_fallback_models_cursor() {
        let models = get_fallback_models(&AgentType::Cursor);
        assert!(!models.is_empty());
        assert!(models.iter().any(|m| m.is_default));
    }

    #[test]
    fn test_get_fallback_models_codex() {
        let models = get_fallback_models(&AgentType::Codex);
        assert!(!models.is_empty());
        assert!(models.iter().any(|m| m.is_default));
        assert!(models.iter().any(|m| m.id == "gpt-4o"));
    }

    #[test]
    fn test_model_info_serialization() {
        let model = ModelInfo::new("test-model", "Test Model", "test-provider", true);
        let json = serde_json::to_string(&model).unwrap();
        assert!(json.contains("\"id\":\"test-model\""));
        assert!(json.contains("\"isDefault\":true"));
    }

    #[test]
    fn test_format_model_name_known_models() {
        assert_eq!(format_model_name("claude-sonnet-4-5"), "Claude Sonnet 4.5");
        assert_eq!(format_model_name("claude-opus-4-5"), "Claude Opus 4.5");
        assert_eq!(format_model_name("gpt-4o"), "GPT-4o");
        assert_eq!(format_model_name("o1"), "OpenAI o1");
        assert_eq!(format_model_name("o1-mini"), "OpenAI o1-mini");
        assert_eq!(format_model_name("gpt-4-turbo"), "GPT-4 Turbo");
    }

    #[test]
    fn test_format_model_name_unknown_models() {
        assert_eq!(format_model_name("custom-model-name"), "Custom Model Name");
        assert_eq!(format_model_name("new-model"), "New Model");
    }

    #[test]
    fn test_infer_provider_anthropic() {
        assert_eq!(infer_provider("claude-sonnet-4-5"), "anthropic");
        assert_eq!(infer_provider("claude-opus-4-5"), "anthropic");
        assert_eq!(infer_provider("claude-instant"), "anthropic");
    }

    #[test]
    fn test_infer_provider_openai() {
        assert_eq!(infer_provider("gpt-4o"), "openai");
        assert_eq!(infer_provider("gpt-4-turbo"), "openai");
        assert_eq!(infer_provider("o1"), "openai");
        assert_eq!(infer_provider("o1-mini"), "openai");
        assert_eq!(infer_provider("text-davinci"), "openai");
    }

    #[test]
    fn test_infer_provider_google() {
        assert_eq!(infer_provider("gemini-pro"), "google");
        assert_eq!(infer_provider("gemini-ultra"), "google");
    }

    #[test]
    fn test_infer_provider_unknown() {
        assert_eq!(infer_provider("unknown-model"), "unknown");
        assert_eq!(infer_provider("llama-2"), "unknown");
    }
}
