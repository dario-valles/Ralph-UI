// Task status state machine with validation

use super::TaskStatus;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum StateTransitionError {
    #[error("Invalid state transition from {from:?} to {to:?}")]
    InvalidTransition { from: TaskStatus, to: TaskStatus },

    #[error("Task has unmet dependencies: {0:?}")]
    UnmetDependencies(Vec<String>),

    #[error("Task already in terminal state: {0:?}")]
    AlreadyTerminal(TaskStatus),
}

/// Validates if a task can transition from one status to another
pub fn can_transition(from: TaskStatus, to: TaskStatus) -> bool {
    match (from, to) {
        // From Pending
        (TaskStatus::Pending, TaskStatus::InProgress) => true,
        (TaskStatus::Pending, TaskStatus::Failed) => true, // Can fail during validation

        // From InProgress
        (TaskStatus::InProgress, TaskStatus::Completed) => true,
        (TaskStatus::InProgress, TaskStatus::Failed) => true,
        (TaskStatus::InProgress, TaskStatus::Pending) => true, // Can be reset

        // From Completed - terminal state (can be reset though)
        (TaskStatus::Completed, TaskStatus::Pending) => true, // Manual reset
        (TaskStatus::Completed, TaskStatus::InProgress) => true, // Reopen

        // From Failed - can be retried
        (TaskStatus::Failed, TaskStatus::Pending) => true,
        (TaskStatus::Failed, TaskStatus::InProgress) => true, // Direct retry

        // Same state is always allowed (no-op)
        (a, b) if a == b => true,

        // All other transitions are invalid
        _ => false,
    }
}

/// Validates and performs a state transition
pub fn transition_state(
    current: TaskStatus,
    target: TaskStatus,
) -> Result<TaskStatus, StateTransitionError> {
    if !can_transition(current, target) {
        return Err(StateTransitionError::InvalidTransition {
            from: current,
            to: target,
        });
    }

    Ok(target)
}

/// Check if a status is a terminal state
pub fn is_terminal_state(status: TaskStatus) -> bool {
    matches!(status, TaskStatus::Completed | TaskStatus::Failed)
}

/// Check if a status indicates active work
pub fn is_active_state(status: TaskStatus) -> bool {
    matches!(status, TaskStatus::InProgress)
}

/// Check if a status indicates waiting
pub fn is_waiting_state(status: TaskStatus) -> bool {
    matches!(status, TaskStatus::Pending)
}

/// Get the next logical state for a task
pub fn next_state(current: TaskStatus) -> Option<TaskStatus> {
    match current {
        TaskStatus::Pending => Some(TaskStatus::InProgress),
        TaskStatus::InProgress => Some(TaskStatus::Completed),
        TaskStatus::Completed => None,                   // Terminal
        TaskStatus::Failed => Some(TaskStatus::Pending), // Retry
    }
}

/// Get all valid next states from current state
pub fn valid_next_states(current: TaskStatus) -> Vec<TaskStatus> {
    let all_states = vec![
        TaskStatus::Pending,
        TaskStatus::InProgress,
        TaskStatus::Completed,
        TaskStatus::Failed,
    ];

    all_states
        .into_iter()
        .filter(|&state| can_transition(current, state))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pending_to_in_progress() {
        assert!(can_transition(TaskStatus::Pending, TaskStatus::InProgress));
        let result = transition_state(TaskStatus::Pending, TaskStatus::InProgress);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), TaskStatus::InProgress);
    }

    #[test]
    fn test_in_progress_to_completed() {
        assert!(can_transition(
            TaskStatus::InProgress,
            TaskStatus::Completed
        ));
        let result = transition_state(TaskStatus::InProgress, TaskStatus::Completed);
        assert!(result.is_ok());
    }

    #[test]
    fn test_in_progress_to_failed() {
        assert!(can_transition(TaskStatus::InProgress, TaskStatus::Failed));
        let result = transition_state(TaskStatus::InProgress, TaskStatus::Failed);
        assert!(result.is_ok());
    }

    #[test]
    fn test_invalid_pending_to_completed() {
        assert!(!can_transition(TaskStatus::Pending, TaskStatus::Completed));
        let result = transition_state(TaskStatus::Pending, TaskStatus::Completed);
        assert!(result.is_err());
    }

    #[test]
    fn test_failed_can_retry() {
        assert!(can_transition(TaskStatus::Failed, TaskStatus::Pending));
        assert!(can_transition(TaskStatus::Failed, TaskStatus::InProgress));
    }

    #[test]
    fn test_completed_can_reopen() {
        assert!(can_transition(TaskStatus::Completed, TaskStatus::Pending));
        assert!(can_transition(
            TaskStatus::Completed,
            TaskStatus::InProgress
        ));
    }

    #[test]
    fn test_same_state_allowed() {
        assert!(can_transition(TaskStatus::Pending, TaskStatus::Pending));
        assert!(can_transition(
            TaskStatus::InProgress,
            TaskStatus::InProgress
        ));
        assert!(can_transition(TaskStatus::Completed, TaskStatus::Completed));
        assert!(can_transition(TaskStatus::Failed, TaskStatus::Failed));
    }

    #[test]
    fn test_is_terminal_state() {
        assert!(is_terminal_state(TaskStatus::Completed));
        assert!(is_terminal_state(TaskStatus::Failed));
        assert!(!is_terminal_state(TaskStatus::Pending));
        assert!(!is_terminal_state(TaskStatus::InProgress));
    }

    #[test]
    fn test_is_active_state() {
        assert!(is_active_state(TaskStatus::InProgress));
        assert!(!is_active_state(TaskStatus::Pending));
        assert!(!is_active_state(TaskStatus::Completed));
    }

    #[test]
    fn test_is_waiting_state() {
        assert!(is_waiting_state(TaskStatus::Pending));
        assert!(!is_waiting_state(TaskStatus::InProgress));
    }

    #[test]
    fn test_next_state() {
        assert_eq!(
            next_state(TaskStatus::Pending),
            Some(TaskStatus::InProgress)
        );
        assert_eq!(
            next_state(TaskStatus::InProgress),
            Some(TaskStatus::Completed)
        );
        assert_eq!(next_state(TaskStatus::Completed), None);
        assert_eq!(next_state(TaskStatus::Failed), Some(TaskStatus::Pending));
    }

    #[test]
    fn test_valid_next_states() {
        let states = valid_next_states(TaskStatus::Pending);
        assert!(states.contains(&TaskStatus::Pending));
        assert!(states.contains(&TaskStatus::InProgress));
        assert!(states.contains(&TaskStatus::Failed));
        assert!(!states.contains(&TaskStatus::Completed));

        let states = valid_next_states(TaskStatus::InProgress);
        assert!(states.contains(&TaskStatus::Pending));
        assert!(states.contains(&TaskStatus::InProgress));
        assert!(states.contains(&TaskStatus::Completed));
        assert!(states.contains(&TaskStatus::Failed));
    }
}
