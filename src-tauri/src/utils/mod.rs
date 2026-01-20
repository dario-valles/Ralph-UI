// Utility functions
#![allow(dead_code)]

use chrono::Utc;
use std::sync::{Mutex, MutexGuard, PoisonError};

/// Error type for mutex lock failures
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
pub fn lock_mutex<T>(mutex: &Mutex<T>) -> Result<MutexGuard<'_, T>, LockError> {
    mutex.lock().map_err(|e| LockError(format!("Failed to acquire lock: {}", e)))
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

/// Lock database mutex for Tauri commands, returning a String error for IPC compatibility.
/// Use this in command handlers: `let db = lock_db(&db)?;`
pub fn lock_db<T>(mutex: &Mutex<T>) -> Result<MutexGuard<'_, T>, String> {
    mutex.lock().map_err(|e| format!("Database lock error: {}", e))
}

pub fn generate_id() -> String {
    // Generate a unique ID (using timestamp + random string for now)
    let now = Utc::now().timestamp_millis();
    format!("{}-{}", now, rand_string(8))
}

fn rand_string(len: usize) -> String {
    use std::iter;
    use rand::Rng;
    const CHARSET: &[u8] = b"abcdefghijklmnopqrstuvwxyz0123456789";
    let mut rng = rand::thread_rng();

    iter::repeat_with(|| CHARSET[rng.gen_range(0..CHARSET.len())] as char)
        .take(len)
        .collect()
}

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
}
