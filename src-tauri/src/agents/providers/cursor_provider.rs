// Cursor Agent model provider

use crate::agents::models::{ModelInfo, get_fallback_models};
use crate::models::AgentType;
use super::ModelProvider;

/// Provider for Cursor Agent
///
/// Cursor Agent doesn't have a CLI command to list models,
/// so this provider always returns an empty list to trigger fallback.
pub struct CursorProvider;

impl CursorProvider {
    pub fn new() -> Self {
        Self
    }
}

impl Default for CursorProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl ModelProvider for CursorProvider {
    fn discover_models(&self) -> Result<Vec<ModelInfo>, String> {
        // Cursor Agent doesn't have model listing capability
        // Return empty to use fallback models
        log::info!("[CursorProvider] No CLI model discovery available, using fallback");
        Ok(get_fallback_models(&AgentType::Cursor))
    }

    fn agent_type(&self) -> AgentType {
        AgentType::Cursor
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cursor_provider_new() {
        let provider = CursorProvider::new();
        assert_eq!(provider.agent_type(), AgentType::Cursor);
    }

    #[test]
    fn test_cursor_provider_returns_fallback() {
        let provider = CursorProvider::new();
        let models = provider.discover_models().unwrap();

        // Should return fallback models
        assert!(!models.is_empty());
        assert!(models.iter().any(|m| m.id == "claude-sonnet-4-5"));
    }
}
