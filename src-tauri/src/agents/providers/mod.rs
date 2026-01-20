// Model provider implementations for different agents

mod claude_provider;
mod opencode_provider;
mod codex_provider;
mod cursor_provider;

use crate::models::AgentType;
use super::models::ModelInfo;

pub use claude_provider::ClaudeProvider;
pub use opencode_provider::OpencodeProvider;
pub use codex_provider::CodexProvider;
pub use cursor_provider::CursorProvider;

/// Trait for model discovery providers
pub trait ModelProvider: Send + Sync {
    /// Discover available models from the CLI
    fn discover_models(&self) -> Result<Vec<ModelInfo>, String>;

    /// Get the agent type this provider handles
    #[allow(dead_code)]
    fn agent_type(&self) -> AgentType;
}

/// Get the appropriate provider for an agent type
pub fn get_provider(agent_type: &AgentType) -> Box<dyn ModelProvider> {
    match agent_type {
        AgentType::Claude => Box::new(ClaudeProvider::new()),
        AgentType::Opencode => Box::new(OpencodeProvider::new()),
        AgentType::Codex => Box::new(CodexProvider::new()),
        AgentType::Cursor => Box::new(CursorProvider::new()),
        // Qwen and Droid use Claude provider as fallback for model discovery
        AgentType::Qwen => Box::new(ClaudeProvider::new()),
        AgentType::Droid => Box::new(ClaudeProvider::new()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_provider_claude() {
        let provider = get_provider(&AgentType::Claude);
        assert_eq!(provider.agent_type(), AgentType::Claude);
    }

    #[test]
    fn test_get_provider_opencode() {
        let provider = get_provider(&AgentType::Opencode);
        assert_eq!(provider.agent_type(), AgentType::Opencode);
    }

    #[test]
    fn test_get_provider_codex() {
        let provider = get_provider(&AgentType::Codex);
        assert_eq!(provider.agent_type(), AgentType::Codex);
    }

    #[test]
    fn test_get_provider_cursor() {
        let provider = get_provider(&AgentType::Cursor);
        assert_eq!(provider.agent_type(), AgentType::Cursor);
    }
}
