// Model discovery Backend commands

use crate::agents::models::get_provider_models;
use crate::agents::{ModelCache, ModelInfo};
use crate::models::AgentType;

/// State wrapper for the model cache
/// ModelCache is already thread-safe internally with RwLock, so we don't need
/// an additional lock wrapper here.
pub struct ModelCacheState {
    pub cache: ModelCache,
}

impl ModelCacheState {
    pub fn new() -> Self {
        Self {
            cache: ModelCache::new(),
        }
    }
}

impl Default for ModelCacheState {
    fn default() -> Self {
        Self::new()
    }
}

/// Get available models for an agent type
///
/// Returns models from cache if available, otherwise discovers them from CLI.
/// Falls back to default models if CLI discovery fails.
///
/// If `provider_id` is specified and it's an alternative provider with
/// predefined models (like Z.AI or MiniMax), returns those instead.
pub async fn get_available_models(
    agent_type: AgentType,
    provider_id: Option<&str>,
    model_cache: &ModelCacheState,
) -> Result<Vec<ModelInfo>, String> {
    log::info!(
        "[get_available_models] Getting models for {:?}, provider: {:?}",
        agent_type,
        provider_id
    );

    // For Claude agent with alternative provider, check for predefined models
    if agent_type == AgentType::Claude {
        if let Some(pid) = provider_id {
            // Skip anthropic as it uses normal CLI discovery
            if pid != "anthropic" {
                if let Some(models) = get_provider_models(pid) {
                    log::info!(
                        "[get_available_models] Using predefined models for provider '{}'",
                        pid
                    );
                    return Ok(models);
                }
            }
        }
    }

    // Fall back to normal CLI discovery
    Ok(model_cache.cache.get_or_fetch(agent_type))
}

/// Refresh model cache for a specific agent type or all if None
///
/// Invalidates the cache, forcing a fresh discovery on next request.
pub async fn refresh_models(
    agent_type: Option<AgentType>,
    model_cache: &ModelCacheState,
) -> Result<(), String> {
    log::info!("[refresh_models] Refreshing models for {:?}", agent_type);
    model_cache.cache.invalidate(agent_type);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_model_cache_state_new() {
        let state = ModelCacheState::new();
        // Verify we can get models
        let models = state.cache.get_or_fetch(AgentType::Claude);
        assert!(!models.is_empty());
    }

    #[test]
    fn test_model_cache_state_invalidate() {
        let state = ModelCacheState::new();
        // Populate cache
        let _ = state.cache.get_or_fetch(AgentType::Claude);
        // Invalidate
        state.cache.invalidate(Some(AgentType::Claude));
        // Should still work (will refetch)
        let models = state.cache.get_or_fetch(AgentType::Claude);
        assert!(!models.is_empty());
    }

    #[tokio::test]
    async fn test_get_available_models_with_provider() {
        let state = ModelCacheState::new();

        // Without provider - should use CLI discovery / fallback
        let models = get_available_models(AgentType::Claude, None, &state)
            .await
            .unwrap();
        assert!(!models.is_empty());

        // With anthropic provider - should still use CLI discovery
        let models = get_available_models(AgentType::Claude, Some("anthropic"), &state)
            .await
            .unwrap();
        assert!(!models.is_empty());

        // With zai provider - should use predefined models
        let models = get_available_models(AgentType::Claude, Some("zai"), &state)
            .await
            .unwrap();
        assert!(!models.is_empty());
        assert!(models.iter().any(|m| m.id == "GLM-4.7"));
        assert!(models.iter().any(|m| m.provider == "zai"));

        // With minimax provider
        let models = get_available_models(AgentType::Claude, Some("minimax"), &state)
            .await
            .unwrap();
        assert!(!models.is_empty());
        assert!(models.iter().any(|m| m.id == "MiniMax-M2.1"));
    }

    #[tokio::test]
    async fn test_get_available_models_non_claude_ignores_provider() {
        let state = ModelCacheState::new();

        // Provider should be ignored for non-Claude agents
        let models = get_available_models(AgentType::Cursor, Some("zai"), &state)
            .await
            .unwrap();
        // Should NOT return Z.AI models, should return Cursor models
        assert!(!models.iter().any(|m| m.id == "GLM-4.7"));
    }
}
