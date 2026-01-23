// Model discovery Tauri commands


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

pub async fn get_available_models(
    agent_type: AgentType,
    model_cache: &ModelCacheState,
) -> Result<Vec<ModelInfo>, String> {
    log::info!("[get_available_models] Getting models for {:?}", agent_type);
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
}
