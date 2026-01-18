// Model discovery cache with TTL

use std::collections::HashMap;
use std::sync::RwLock;
use std::time::{Duration, Instant};

use crate::models::AgentType;
use super::models::{ModelInfo, get_fallback_models};
use super::providers::get_provider;

/// Default cache TTL (5 minutes)
const DEFAULT_TTL_SECS: u64 = 300;

/// Cached model list with timestamp
#[derive(Debug, Clone)]
struct CachedModels {
    models: Vec<ModelInfo>,
    fetched_at: Instant,
}

/// Model discovery cache
///
/// Caches discovered models per agent type with a configurable TTL.
/// Falls back to default models if CLI discovery fails.
pub struct ModelCache {
    cache: RwLock<HashMap<AgentType, CachedModels>>,
    ttl: Duration,
}

impl ModelCache {
    /// Create a new model cache with default TTL
    pub fn new() -> Self {
        Self {
            cache: RwLock::new(HashMap::new()),
            ttl: Duration::from_secs(DEFAULT_TTL_SECS),
        }
    }

    /// Create a new model cache with custom TTL
    #[allow(dead_code)]
    pub fn with_ttl(ttl_secs: u64) -> Self {
        Self {
            cache: RwLock::new(HashMap::new()),
            ttl: Duration::from_secs(ttl_secs),
        }
    }

    /// Get models for an agent type, fetching from CLI if not cached or expired
    pub fn get_or_fetch(&self, agent_type: AgentType) -> Vec<ModelInfo> {
        // Check cache first
        if let Some(models) = self.get_cached(&agent_type) {
            log::debug!("[ModelCache] Cache hit for {:?}", agent_type);
            return models;
        }

        // Fetch fresh models
        log::info!("[ModelCache] Cache miss for {:?}, fetching...", agent_type);
        let models = self.fetch_models(&agent_type);

        // Store in cache
        self.store_cached(agent_type, models.clone());

        models
    }

    /// Get models from cache if valid
    fn get_cached(&self, agent_type: &AgentType) -> Option<Vec<ModelInfo>> {
        let cache = self.cache.read().ok()?;
        let cached = cache.get(agent_type)?;

        if cached.fetched_at.elapsed() < self.ttl {
            Some(cached.models.clone())
        } else {
            None
        }
    }

    /// Store models in cache
    fn store_cached(&self, agent_type: AgentType, models: Vec<ModelInfo>) {
        if let Ok(mut cache) = self.cache.write() {
            cache.insert(agent_type, CachedModels {
                models,
                fetched_at: Instant::now(),
            });
        }
    }

    /// Fetch models from CLI or fallback to defaults
    fn fetch_models(&self, agent_type: &AgentType) -> Vec<ModelInfo> {
        let provider = get_provider(agent_type);

        match provider.discover_models() {
            Ok(models) if !models.is_empty() => {
                log::info!(
                    "[ModelCache] Discovered {} models for {:?}",
                    models.len(),
                    agent_type
                );
                models
            }
            Ok(_) => {
                log::warn!(
                    "[ModelCache] No models discovered for {:?}, using fallback",
                    agent_type
                );
                get_fallback_models(agent_type)
            }
            Err(e) => {
                log::warn!(
                    "[ModelCache] Failed to discover models for {:?}: {}, using fallback",
                    agent_type,
                    e
                );
                get_fallback_models(agent_type)
            }
        }
    }

    /// Invalidate cache for a specific agent type or all if None
    pub fn invalidate(&self, agent_type: Option<AgentType>) {
        if let Ok(mut cache) = self.cache.write() {
            match agent_type {
                Some(at) => {
                    log::info!("[ModelCache] Invalidating cache for {:?}", at);
                    cache.remove(&at);
                }
                None => {
                    log::info!("[ModelCache] Invalidating entire cache");
                    cache.clear();
                }
            }
        }
    }
}

impl Default for ModelCache {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_model_cache_new() {
        let cache = ModelCache::new();
        assert_eq!(cache.ttl.as_secs(), DEFAULT_TTL_SECS);
    }

    #[test]
    fn test_model_cache_with_ttl() {
        let cache = ModelCache::with_ttl(60);
        assert_eq!(cache.ttl.as_secs(), 60);
    }

    #[test]
    fn test_model_cache_get_or_fetch_returns_models() {
        let cache = ModelCache::new();
        let models = cache.get_or_fetch(AgentType::Claude);
        assert!(!models.is_empty());
    }

    #[test]
    fn test_model_cache_caches_results() {
        let cache = ModelCache::new();

        // First fetch
        let models1 = cache.get_or_fetch(AgentType::Claude);

        // Second fetch should be from cache
        let models2 = cache.get_or_fetch(AgentType::Claude);

        assert_eq!(models1.len(), models2.len());
    }

    #[test]
    fn test_model_cache_invalidate_specific() {
        let cache = ModelCache::new();

        // Populate cache
        let _ = cache.get_or_fetch(AgentType::Claude);
        let _ = cache.get_or_fetch(AgentType::Opencode);

        // Invalidate only Claude
        cache.invalidate(Some(AgentType::Claude));

        // Claude should be gone, Opencode should remain
        assert!(cache.get_cached(&AgentType::Claude).is_none());
        assert!(cache.get_cached(&AgentType::Opencode).is_some());
    }

    #[test]
    fn test_model_cache_invalidate_all() {
        let cache = ModelCache::new();

        // Populate cache
        let _ = cache.get_or_fetch(AgentType::Claude);
        let _ = cache.get_or_fetch(AgentType::Opencode);

        // Invalidate all
        cache.invalidate(None);

        // Both should be gone
        assert!(cache.get_cached(&AgentType::Claude).is_none());
        assert!(cache.get_cached(&AgentType::Opencode).is_none());
    }
}
