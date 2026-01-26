// Graceful shutdown handling for signal trapping

#![allow(dead_code)] // Shutdown handling infrastructure

use anyhow::Result;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

/// Shared shutdown state across the application
#[derive(Clone)]
pub struct ShutdownState {
    /// Flag indicating shutdown has been requested
    shutdown_requested: Arc<AtomicBool>,
    /// Flag indicating cleanup has completed
    cleanup_complete: Arc<AtomicBool>,
}

impl ShutdownState {
    /// Create a new shutdown state
    pub fn new() -> Self {
        Self {
            shutdown_requested: Arc::new(AtomicBool::new(false)),
            cleanup_complete: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Request a shutdown
    pub fn request_shutdown(&self) {
        self.shutdown_requested.store(true, Ordering::SeqCst);
        log::info!("Shutdown requested");
    }

    /// Check if shutdown has been requested
    pub fn is_shutdown_requested(&self) -> bool {
        self.shutdown_requested.load(Ordering::SeqCst)
    }

    /// Mark cleanup as complete
    pub fn mark_cleanup_complete(&self) {
        self.cleanup_complete.store(true, Ordering::SeqCst);
        log::info!("Cleanup complete");
    }

    /// Check if cleanup is complete
    pub fn is_cleanup_complete(&self) -> bool {
        self.cleanup_complete.load(Ordering::SeqCst)
    }

    /// Reset shutdown state (for testing)
    pub fn reset(&self) {
        self.shutdown_requested.store(false, Ordering::SeqCst);
        self.cleanup_complete.store(false, Ordering::SeqCst);
    }
}

impl Default for ShutdownState {
    fn default() -> Self {
        Self::new()
    }
}

/// Result of graceful shutdown cleanup
#[derive(Debug, Clone)]
pub struct ShutdownResult {
    /// Number of agents that were stopped
    pub agents_stopped: usize,
    /// Number of worktrees that were cleaned up
    pub worktrees_cleaned: usize,
    /// Branches that were preserved (committed but not yet merged)
    pub preserved_branches: Vec<String>,
    /// Any errors encountered during cleanup
    pub errors: Vec<String>,
}

impl ShutdownResult {
    pub fn new() -> Self {
        Self {
            agents_stopped: 0,
            worktrees_cleaned: 0,
            preserved_branches: Vec::new(),
            errors: Vec::new(),
        }
    }

    /// Check if shutdown was clean (no errors)
    pub fn is_clean(&self) -> bool {
        self.errors.is_empty()
    }
}

impl Default for ShutdownResult {
    fn default() -> Self {
        Self::new()
    }
}

/// Graceful shutdown handler
pub struct ShutdownHandler {
    state: ShutdownState,
}

impl ShutdownHandler {
    /// Create a new shutdown handler
    pub fn new() -> Self {
        Self {
            state: ShutdownState::new(),
        }
    }

    /// Create with existing state
    pub fn with_state(state: ShutdownState) -> Self {
        Self { state }
    }

    /// Get the shutdown state
    pub fn state(&self) -> &ShutdownState {
        &self.state
    }

    /// Perform graceful shutdown
    /// This should be called when a shutdown signal is received
    pub fn handle_shutdown<F>(&self, cleanup_fn: F) -> Result<ShutdownResult>
    where
        F: FnOnce() -> Result<ShutdownResult>,
    {
        // Mark shutdown as requested
        self.state.request_shutdown();

        log::info!("Starting graceful shutdown...");

        // Run the cleanup function
        let result = cleanup_fn()?;

        // Log results
        log::info!(
            "Shutdown complete: {} agents stopped, {} worktrees cleaned, {} branches preserved",
            result.agents_stopped,
            result.worktrees_cleaned,
            result.preserved_branches.len()
        );

        for branch in &result.preserved_branches {
            log::info!("Preserved branch: {}", branch);
        }

        for error in &result.errors {
            log::warn!("Cleanup error: {}", error);
        }

        // Mark cleanup as complete
        self.state.mark_cleanup_complete();

        Ok(result)
    }
}

impl Default for ShutdownHandler {
    fn default() -> Self {
        Self::new()
    }
}

/// Register signal handlers for graceful shutdown
/// This sets up handlers for SIGINT (Ctrl+C), SIGTERM, and SIGHUP
#[cfg(unix)]
pub fn register_signal_handlers(state: ShutdownState) -> Result<()> {
    use signal_hook::consts::{SIGHUP, SIGINT, SIGTERM};
    use signal_hook::iterator::Signals;
    use std::thread;

    let mut signals = Signals::new(&[SIGINT, SIGTERM, SIGHUP])
        .map_err(|e| anyhow::anyhow!("Failed to register signal handlers: {}", e))?;

    thread::spawn(move || {
        for signal in signals.forever() {
            match signal {
                SIGINT => {
                    log::info!("Received SIGINT (Ctrl+C)");
                    state.request_shutdown();
                }
                SIGTERM => {
                    log::info!("Received SIGTERM");
                    state.request_shutdown();
                }
                SIGHUP => {
                    log::info!("Received SIGHUP");
                    state.request_shutdown();
                }
                _ => {}
            }
        }
    });

    log::info!("Signal handlers registered (SIGINT, SIGTERM, SIGHUP)");
    Ok(())
}

/// Register signal handlers for Windows
#[cfg(windows)]
pub fn register_signal_handlers(state: ShutdownState) -> Result<()> {
    use ctrlc;

    ctrlc::set_handler(move || {
        log::info!("Received Ctrl+C");
        state.request_shutdown();
    })
    .map_err(|e| anyhow::anyhow!("Failed to register Ctrl+C handler: {}", e))?;

    log::info!("Signal handler registered (Ctrl+C)");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_shutdown_state_new() {
        let state = ShutdownState::new();
        assert!(!state.is_shutdown_requested());
        assert!(!state.is_cleanup_complete());
    }

    #[test]
    fn test_request_shutdown() {
        let state = ShutdownState::new();
        assert!(!state.is_shutdown_requested());

        state.request_shutdown();
        assert!(state.is_shutdown_requested());
    }

    #[test]
    fn test_mark_cleanup_complete() {
        let state = ShutdownState::new();
        assert!(!state.is_cleanup_complete());

        state.mark_cleanup_complete();
        assert!(state.is_cleanup_complete());
    }

    #[test]
    fn test_shutdown_state_clone() {
        let state1 = ShutdownState::new();
        let state2 = state1.clone();

        state1.request_shutdown();
        // Both should reflect the change since they share Arc
        assert!(state2.is_shutdown_requested());
    }

    #[test]
    fn test_shutdown_state_reset() {
        let state = ShutdownState::new();
        state.request_shutdown();
        state.mark_cleanup_complete();

        assert!(state.is_shutdown_requested());
        assert!(state.is_cleanup_complete());

        state.reset();
        assert!(!state.is_shutdown_requested());
        assert!(!state.is_cleanup_complete());
    }

    #[test]
    fn test_shutdown_result_new() {
        let result = ShutdownResult::new();
        assert_eq!(result.agents_stopped, 0);
        assert_eq!(result.worktrees_cleaned, 0);
        assert!(result.preserved_branches.is_empty());
        assert!(result.errors.is_empty());
        assert!(result.is_clean());
    }

    #[test]
    fn test_shutdown_result_is_clean() {
        let mut result = ShutdownResult::new();
        assert!(result.is_clean());

        result.errors.push("Some error".to_string());
        assert!(!result.is_clean());
    }

    #[test]
    fn test_shutdown_handler_new() {
        let handler = ShutdownHandler::new();
        assert!(!handler.state().is_shutdown_requested());
    }

    #[test]
    fn test_shutdown_handler_with_state() {
        let state = ShutdownState::new();
        state.request_shutdown();

        let handler = ShutdownHandler::with_state(state);
        assert!(handler.state().is_shutdown_requested());
    }

    #[test]
    fn test_handle_shutdown_success() {
        let handler = ShutdownHandler::new();

        let result = handler.handle_shutdown(|| {
            Ok(ShutdownResult {
                agents_stopped: 3,
                worktrees_cleaned: 2,
                preserved_branches: vec!["feature/task-1".to_string()],
                errors: vec![],
            })
        });

        assert!(result.is_ok());
        let result = result.unwrap();
        assert_eq!(result.agents_stopped, 3);
        assert_eq!(result.worktrees_cleaned, 2);
        assert!(result.is_clean());
        assert!(handler.state().is_shutdown_requested());
        assert!(handler.state().is_cleanup_complete());
    }

    #[test]
    fn test_handle_shutdown_with_errors() {
        let handler = ShutdownHandler::new();

        let result = handler.handle_shutdown(|| {
            Ok(ShutdownResult {
                agents_stopped: 1,
                worktrees_cleaned: 0,
                preserved_branches: vec![],
                errors: vec!["Failed to clean worktree".to_string()],
            })
        });

        assert!(result.is_ok());
        let result = result.unwrap();
        assert!(!result.is_clean());
    }
}
