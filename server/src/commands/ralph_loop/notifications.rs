//! Desktop notification helpers

use std::sync::Arc;

// ============================================================================
// Helper Functions
// ============================================================================

/// Format duration in a human-readable way
fn format_duration(secs: f64) -> String {
    let total_secs = secs as u64;
    let hours = total_secs / 3600;
    let minutes = (total_secs % 3600) / 60;
    let seconds = total_secs % 60;

    if hours > 0 {
        format!("{}h {}m", hours, minutes)
    } else if minutes > 0 {
        format!("{}m {}s", minutes, seconds)
    } else {
        format!("{}s", seconds)
    }
}

// ============================================================================
// Notification Operations
// ============================================================================

/// Log when a Ralph loop completes successfully
/// Note: Desktop notifications are handled by the frontend via Web Notifications API
pub(crate) fn send_loop_completion_notification(
    _app_handle: &Arc<crate::server::EventBroadcaster>,
    prd_name: &str,
    total_iterations: u32,
    completed_stories: u32,
    duration_secs: f64,
) {
    // Format the notification body
    let duration_str = format_duration(duration_secs);
    log::info!(
        "[RalphLoop] Loop completed: {} - {} stories completed in {} iterations, Duration: {}",
        prd_name,
        completed_stories,
        total_iterations,
        duration_str
    );
}

/// Send a desktop notification when a Ralph loop encounters an error
pub(crate) fn send_error_notification(
    app_handle: &Arc<crate::server::EventBroadcaster>,
    execution_id: &str,
    prd_name: &str,
    error_type: crate::events::RalphLoopErrorType,
    message: &str,
    iteration: u32,
    stories_remaining: Option<u32>,
    total_stories: Option<u32>,
) {
    // Truncate message to 200 chars for notification display
    let truncated_message = if message.len() > 200 {
        format!("{}...", &message[..197])
    } else {
        message.to_string()
    };

    // Get error type label for title
    let error_label = match error_type {
        crate::events::RalphLoopErrorType::AgentCrash => "Agent Crash",
        crate::events::RalphLoopErrorType::ParseError => "Parse Error",
        crate::events::RalphLoopErrorType::GitConflict => "Git Conflict",
        crate::events::RalphLoopErrorType::RateLimit => "Rate Limit",
        crate::events::RalphLoopErrorType::MaxIterations => "Max Iterations",
        crate::events::RalphLoopErrorType::MaxCost => "Max Cost",
        crate::events::RalphLoopErrorType::Timeout => "Timeout",
        crate::events::RalphLoopErrorType::Unknown => "Error",
    };

    // Format notification body - include stories remaining for max iterations
    let body = if error_type == crate::events::RalphLoopErrorType::MaxIterations {
        if let (Some(remaining), Some(total)) = (stories_remaining, total_stories) {
            format!(
                "{}: {} stories remaining of {}\nIteration: {}",
                prd_name, remaining, total, iteration
            )
        } else {
            format!(
                "{}: {}\nIteration: {}",
                prd_name, truncated_message, iteration
            )
        }
    } else {
        format!(
            "{}: {}\nIteration: {}",
            prd_name, truncated_message, iteration
        )
    };

    // Emit event for frontend
    let payload = crate::events::RalphLoopErrorPayload {
        execution_id: execution_id.to_string(),
        prd_name: prd_name.to_string(),
        error_type: error_type.clone(),
        message: truncated_message.clone(),
        iteration,
        timestamp: chrono::Utc::now().to_rfc3339(),
        stories_remaining,
        total_stories,
    };

    app_handle.broadcast(
        "ralph:loop_error",
        serde_json::to_value(&payload).unwrap_or_default(),
    );

    // Log the error (desktop notification is handled by frontend via Web Notifications API)
    log::warn!(
        "[RalphLoop] Loop error: {} - {} - {}",
        error_label,
        prd_name,
        body
    );
}

/// Send a test notification to verify notification settings (US-005)
/// In server mode, this broadcasts an event for the frontend to show a Web Notification
pub fn send_test_notification(
    app_handle: Arc<crate::server::EventBroadcaster>,
) -> Result<(), String> {
    // Broadcast notification event for frontend to display via Web Notifications API
    app_handle.broadcast(
        "notification:test",
        serde_json::json!({
            "title": "Ralph UI Test Notification",
            "body": "If you can see this, notifications are working! Ralph says hi.",
        }),
    );
    log::info!("[Notification] Test notification event broadcast");
    Ok(())
}
