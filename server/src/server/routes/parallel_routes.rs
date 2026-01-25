//! Parallel execution command routing
//!
//! This module is reserved for future parallel execution commands.
//! Currently, parallel execution is handled through the Ralph Loop routes.

use serde_json::Value;

use super::ServerAppState;

/// Route parallel execution commands
pub async fn route_parallel_command(
    cmd: &str,
    _args: Value,
    _state: &ServerAppState,
) -> Result<Value, String> {
    // Future parallel execution commands will be added here
    Err(format!("Unknown parallel command: {}", cmd))
}

/// Check if a command is a parallel execution command
pub fn is_parallel_command(_cmd: &str) -> bool {
    // Future parallel commands can be added here
    // Currently all parallel functionality is in ralph_loop_routes
    false
}
