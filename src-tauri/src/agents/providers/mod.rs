// Model provider implementations for different agents

mod claude_provider;
mod codex_provider;
mod cursor_provider;
mod droid_provider;
mod opencode_provider;
mod qwen_provider;

use crate::agents::plugin::AgentPlugin;
use crate::models::AgentType;

pub use claude_provider::ClaudeProvider;
pub use codex_provider::CodexProvider;
pub use cursor_provider::CursorProvider;
pub use droid_provider::DroidProvider;
pub use opencode_provider::OpencodeProvider;
pub use qwen_provider::QwenProvider;

/// Get the appropriate provider for an agent type
pub fn get_provider(agent_type: &AgentType) -> Box<dyn AgentPlugin> {
    match agent_type {
        AgentType::Claude => Box::new(ClaudeProvider::new()),
        AgentType::Opencode => Box::new(OpencodeProvider::new()),
        AgentType::Codex => Box::new(CodexProvider::new()),
        AgentType::Cursor => Box::new(CursorProvider::new()),
        AgentType::Qwen => Box::new(QwenProvider::new()),
        AgentType::Droid => Box::new(DroidProvider::new()),
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

    #[test]
    fn test_get_provider_qwen() {
        let provider = get_provider(&AgentType::Qwen);
        assert_eq!(provider.agent_type(), AgentType::Qwen);
    }

    #[test]
    fn test_get_provider_droid() {
        let provider = get_provider(&AgentType::Droid);
        assert_eq!(provider.agent_type(), AgentType::Droid);
    }
}
