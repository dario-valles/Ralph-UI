// API provider management commands
//
// Commands for managing alternative API providers (z.ai, MiniMax)
// that provide Claude-compatible APIs

use crate::commands::config::ConfigState;
use crate::config::{
    get_all_provider_presets, get_provider_preset, ApiProviderInfo, SecretsConfig,
};
use serde::{Deserialize, Serialize};

/// Get all available API providers with their status
pub fn get_api_providers(config_state: &ConfigState) -> Result<Vec<ApiProviderInfo>, String> {
    // Load secrets to check which providers have tokens
    let secrets = SecretsConfig::load().map_err(|e| e.to_string())?;

    // Get the currently active provider from config
    let active_provider = config_state
        .get_config()
        .ok()
        .and_then(|c| c.execution.api_provider.clone())
        .unwrap_or_else(|| "anthropic".to_string());

    // Build provider info list
    let providers = get_all_provider_presets()
        .iter()
        .map(|preset| {
            let has_token = secrets.has_token(preset.id);
            let is_active = preset.id == active_provider;
            preset.to_info(has_token, is_active)
        })
        .collect();

    Ok(providers)
}

/// Get the currently active API provider
pub fn get_active_provider(config_state: &ConfigState) -> Result<String, String> {
    let provider = config_state
        .get_config()
        .ok()
        .and_then(|c| c.execution.api_provider.clone())
        .unwrap_or_else(|| "anthropic".to_string());
    Ok(provider)
}

/// Set the active API provider for Claude
pub async fn set_active_provider(
    provider_id: String,
    config_state: &ConfigState,
) -> Result<(), String> {
    // Validate provider exists
    if get_provider_preset(&provider_id).is_none() {
        return Err(format!("Unknown provider: {}", provider_id));
    }

    // Update the api_provider in the execution config
    // Following the same pattern as update_execution_config
    crate::commands::config::update_api_provider(Some(provider_id.clone()), config_state).await?;

    log::info!("[providers] Set active provider to: {}", provider_id);
    Ok(())
}

/// Set a provider's API token
pub fn set_provider_token(provider_id: &str, token: &str) -> Result<(), String> {
    // Validate provider exists
    if get_provider_preset(provider_id).is_none() {
        return Err(format!("Unknown provider: {}", provider_id));
    }

    // Load secrets, update, and save
    let mut secrets = SecretsConfig::load().map_err(|e| e.to_string())?;
    secrets.set_token(provider_id, token);
    secrets.save().map_err(|e| e.to_string())?;

    log::info!("[providers] Set token for provider: {}", provider_id);
    Ok(())
}

/// Delete a provider's API token
pub fn delete_provider_token(provider_id: &str) -> Result<(), String> {
    // Load secrets, delete, and save
    let mut secrets = SecretsConfig::load().map_err(|e| e.to_string())?;
    if secrets.delete_token(provider_id) {
        secrets.save().map_err(|e| e.to_string())?;
        log::info!("[providers] Deleted token for provider: {}", provider_id);
    }
    Ok(())
}

/// Test result for provider connection
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderTestResult {
    pub success: bool,
    pub message: String,
}

/// Test a provider's connection
/// Currently just verifies that the token is set and provider is valid
pub fn test_provider_connection(provider_id: &str) -> Result<ProviderTestResult, String> {
    // Check provider exists
    let preset = get_provider_preset(provider_id)
        .ok_or_else(|| format!("Unknown provider: {}", provider_id))?;

    // Load secrets to check for token
    let secrets = SecretsConfig::load().map_err(|e| e.to_string())?;

    // For anthropic, we don't need a token in secrets (uses default env var or config)
    if provider_id == "anthropic" {
        return Ok(ProviderTestResult {
            success: true,
            message: "Anthropic provider uses default configuration".to_string(),
        });
    }

    // For alternative providers, check if token is set
    if !secrets.has_token(provider_id) {
        return Ok(ProviderTestResult {
            success: false,
            message: format!("No API token configured for {}", preset.name),
        });
    }

    // Attempt a lightweight API call to verify the token
    match verify_token_with_api(
        provider_id,
        &preset.base_url,
        secrets.get_token(provider_id),
    ) {
        Ok(_) => Ok(ProviderTestResult {
            success: true,
            message: format!(
                "API token verified for {} ({})",
                preset.name, preset.base_url
            ),
        }),
        Err(e) => Ok(ProviderTestResult {
            success: false,
            message: format!("Token validation failed: {}", e),
        }),
    }
}

/// Helper function to verify token via HTTP request
fn verify_token_with_api(
    provider_id: &str,
    base_url: &str,
    token: Option<&String>,
) -> Result<(), String> {
    let token = token.ok_or("No token provided")?;
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| format!("Failed to build client: {}", e))?;

    // Different providers have different verification endpoints/headers
    let (url, headers) = if provider_id.contains("anthropic") || base_url.contains("anthropic") {
        let mut h = reqwest::header::HeaderMap::new();
        h.insert(
            "x-api-key",
            reqwest::header::HeaderValue::from_str(token).unwrap(),
        );
        h.insert(
            "anthropic-version",
            reqwest::header::HeaderValue::from_static("2023-06-01"),
        );
        (
            format!("{}/v1/models?limit=1", base_url.trim_end_matches('/')),
            h,
        )
    } else if provider_id.contains("openai") || base_url.contains("openai") {
        let mut h = reqwest::header::HeaderMap::new();
        h.insert(
            reqwest::header::AUTHORIZATION,
            reqwest::header::HeaderValue::from_str(&format!("Bearer {}", token)).unwrap(),
        );
        (format!("{}/v1/models", base_url.trim_end_matches('/')), h)
    } else {
        // Generic OpenAI-compatible providers
        let mut h = reqwest::header::HeaderMap::new();
        h.insert(
            reqwest::header::AUTHORIZATION,
            reqwest::header::HeaderValue::from_str(&format!("Bearer {}", token)).unwrap(),
        );
        (format!("{}/models", base_url.trim_end_matches('/')), h)
    };

    let res = client
        .get(&url)
        .headers(headers)
        .send()
        .map_err(|e| format!("Request failed: {}", e))?;

    if res.status().is_success() {
        Ok(())
    } else {
        Err(format!("API returned error: {}", res.status()))
    }
}

/// Get provider environment variables for spawning Claude CLI
/// This is used by the agent manager when spawning Claude with an alternative provider
pub fn get_provider_env_vars(
    config_state: &ConfigState,
) -> Result<std::collections::HashMap<String, String>, String> {
    // Get active provider
    let provider_id = config_state
        .get_config()
        .ok()
        .and_then(|c| c.execution.api_provider.clone())
        .unwrap_or_else(|| "anthropic".to_string());

    // Load secrets
    let secrets = SecretsConfig::load().map_err(|e| e.to_string())?;
    let token = secrets.get_token(&provider_id).cloned();

    // Build env vars
    let env_vars = crate::config::build_provider_env_vars(&provider_id, token.as_deref());

    Ok(env_vars)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_test_provider_connection_anthropic() {
        let result = test_provider_connection("anthropic").unwrap();
        assert!(result.success);
    }

    #[test]
    fn test_test_provider_connection_unknown() {
        let result = test_provider_connection("unknown");
        assert!(result.is_err());
    }
}
