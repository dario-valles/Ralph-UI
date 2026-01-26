// Utility functions

use chrono::Utc;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, PoisonError};

// =============================================================================
// Path Helpers - Reduce boilerplate for project_path: String conversions
// =============================================================================

/// Convert a project path string to a Path reference.
///
/// This is a simple helper that reduces the `Path::new(&project_path)` boilerplate
/// found throughout the command handlers.
///
/// # Example
/// ```ignore
/// use crate::utils::as_path;
///
/// // Instead of: let path = Path::new(&project_path);
/// let path = as_path(&project_path);
/// ```
#[inline]
pub fn as_path(project_path: &str) -> &Path {
    Path::new(project_path)
}

/// Get the .ralph-ui directory path for a project.
///
/// # Example
/// ```ignore
/// use crate::utils::ralph_ui_dir;
///
/// // Instead of: Path::new(&project_path).join(".ralph-ui")
/// let dir = ralph_ui_dir(&project_path);
/// ```
#[inline]
pub fn ralph_ui_dir(project_path: &str) -> PathBuf {
    Path::new(project_path).join(".ralph-ui")
}

/// Get the .ralph-ui/prds directory path for a project.
///
/// # Example
/// ```ignore
/// use crate::utils::prds_dir;
///
/// // Instead of: Path::new(&project_path).join(".ralph-ui").join("prds")
/// let dir = prds_dir(&project_path);
/// ```
#[inline]
pub fn prds_dir(project_path: &str) -> PathBuf {
    Path::new(project_path).join(".ralph-ui").join("prds")
}

/// Get the .ralph-ui/sessions directory path for a project.
#[inline]
#[allow(dead_code)]
pub fn sessions_dir(project_path: &str) -> PathBuf {
    Path::new(project_path).join(".ralph-ui").join("sessions")
}

/// Get the .ralph-ui/planning directory path for a project.
#[inline]
#[allow(dead_code)]
pub fn planning_dir(project_path: &str) -> PathBuf {
    Path::new(project_path).join(".ralph-ui").join("planning")
}

/// Get the .ralph-ui/templates directory path for a project.
#[inline]
#[allow(dead_code)]
pub fn templates_dir(project_path: &str) -> PathBuf {
    Path::new(project_path).join(".ralph-ui").join("templates")
}

/// Get the .ralph-ui/config.yaml path for a project.
#[inline]
pub fn config_path(project_path: &str) -> PathBuf {
    Path::new(project_path)
        .join(".ralph-ui")
        .join("config.yaml")
}

/// Convert a project path string to a PathBuf (owned).
///
/// Use this when you need an owned PathBuf, e.g., when passing to functions
/// that take `&PathBuf` or when storing the path.
///
/// # Example
/// ```ignore
/// use crate::utils::to_path_buf;
///
/// // Instead of: PathBuf::from(&project_path)
/// let path_buf = to_path_buf(&project_path);
/// ```
#[inline]
pub fn to_path_buf(project_path: &str) -> PathBuf {
    PathBuf::from(project_path)
}

/// Extension trait for Result that provides convenient error context methods.
/// Converts any error to a String with a descriptive message prefix.
///
/// # Example
/// ```ignore
/// use crate::utils::ResultExt;
///
/// let file = std::fs::read_to_string("config.json")
///     .with_context("Failed to read config file")?;
/// ```
pub trait ResultExt<T> {
    /// Converts the error to a String with context message.
    fn with_context(self, msg: &str) -> Result<T, String>;
}

impl<T, E: std::fmt::Display> ResultExt<T> for Result<T, E> {
    fn with_context(self, msg: &str) -> Result<T, String> {
        self.map_err(|e| format!("{}: {}", msg, e))
    }
}

/// Macro for common error mapping pattern.
/// Converts `result.map_err(|e| format!("Message: {}", e))` to `map_err_str!(result, "Message")`.
#[macro_export]
macro_rules! map_err_str {
    ($expr:expr, $msg:literal) => {
        $expr.map_err(|e| format!("{}: {}", $msg, e))
    };
}

/// Error type for mutex lock failures
///
/// Provides a structured error type for mutex lock operations that can be
/// converted to/from PoisonError and displayed in error messages.
#[allow(dead_code)]
#[derive(Debug)]
pub struct LockError(String);

impl std::fmt::Display for LockError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Mutex lock error: {}", self.0)
    }
}

impl std::error::Error for LockError {}

impl<T> From<PoisonError<T>> for LockError {
    fn from(err: PoisonError<T>) -> Self {
        LockError(format!("Mutex poisoned: {}", err))
    }
}

/// Safely acquire a mutex lock, returning a Result instead of panicking.
/// Use this instead of `.lock().unwrap()` or `.lock().expect(...)`.
///
/// Note: Currently not used in the codebase but provided as a reusable utility.
#[allow(dead_code)]
pub fn lock_mutex<T>(mutex: &Mutex<T>) -> Result<MutexGuard<'_, T>, LockError> {
    mutex
        .lock()
        .map_err(|e| LockError(format!("Failed to acquire lock: {}", e)))
}

/// Safely acquire a mutex lock, recovering from poisoning by returning the guard.
/// This is useful when you want to continue even if a previous thread panicked.
/// The mutex state may be inconsistent, so use with caution.
pub fn lock_mutex_recover<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    match mutex.lock() {
        Ok(guard) => guard,
        Err(poisoned) => {
            log::warn!("Mutex was poisoned, recovering: {}", poisoned);
            poisoned.into_inner()
        }
    }
}

/// Generate a unique ID using timestamp and random string.
///
/// Note: Currently not used in the codebase but provided as a reusable utility.
#[allow(dead_code)]
pub fn generate_id() -> String {
    // Generate a unique ID (using timestamp + random string for now)
    let now = Utc::now().timestamp_millis();
    format!("{}-{}", now, rand_string(8))
}

/// Generate a random alphanumeric string of specified length.
#[allow(dead_code)]
fn rand_string(len: usize) -> String {
    use rand::Rng;
    use std::iter;
    const CHARSET: &[u8] = b"abcdefghijklmnopqrstuvwxyz0123456789";
    let mut rng = rand::thread_rng();

    iter::repeat_with(|| CHARSET[rng.gen_range(0..CHARSET.len())] as char)
        .take(len)
        .collect()
}

/// Calculate cost based on token count and cost per million tokens.
///
/// Note: Currently not used in the codebase but provided as a reusable utility.
#[allow(dead_code)]
pub fn format_cost(tokens: i32, cost_per_million: f64) -> f64 {
    (tokens as f64 / 1_000_000.0) * cost_per_million
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_id() {
        let id1 = generate_id();
        let id2 = generate_id();
        assert_ne!(id1, id2);
        assert!(id1.len() > 8);
    }

    #[test]
    fn test_format_cost() {
        let cost = format_cost(1_000_000, 3.0);
        assert_eq!(cost, 3.0);
    }

    #[test]
    fn test_as_path() {
        let project_path = "/home/user/project";
        let path = as_path(project_path);
        assert_eq!(path, Path::new("/home/user/project"));
    }

    #[test]
    fn test_ralph_ui_dir() {
        let project_path = "/home/user/project";
        let dir = ralph_ui_dir(project_path);
        assert_eq!(dir, PathBuf::from("/home/user/project/.ralph-ui"));
    }

    #[test]
    fn test_prds_dir() {
        let project_path = "/home/user/project";
        let dir = prds_dir(project_path);
        assert_eq!(dir, PathBuf::from("/home/user/project/.ralph-ui/prds"));
    }

    #[test]
    fn test_sessions_dir() {
        let project_path = "/home/user/project";
        let dir = sessions_dir(project_path);
        assert_eq!(dir, PathBuf::from("/home/user/project/.ralph-ui/sessions"));
    }

    #[test]
    fn test_planning_dir() {
        let project_path = "/home/user/project";
        let dir = planning_dir(project_path);
        assert_eq!(dir, PathBuf::from("/home/user/project/.ralph-ui/planning"));
    }

    #[test]
    fn test_templates_dir() {
        let project_path = "/home/user/project";
        let dir = templates_dir(project_path);
        assert_eq!(dir, PathBuf::from("/home/user/project/.ralph-ui/templates"));
    }

    #[test]
    fn test_config_path() {
        let project_path = "/home/user/project";
        let path = config_path(project_path);
        assert_eq!(
            path,
            PathBuf::from("/home/user/project/.ralph-ui/config.yaml")
        );
    }

    #[test]
    fn test_to_path_buf() {
        let project_path = "/home/user/project";
        let path_buf = to_path_buf(project_path);
        assert_eq!(path_buf, PathBuf::from("/home/user/project"));
    }
}
