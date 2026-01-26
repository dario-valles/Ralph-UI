//! PTY Session Registry for mobile resilience (US-3)
//!
//! Tracks active PTY sessions and allows reconnection to running processes.
//! Key features:
//! - Session persistence after client disconnect
//! - Output buffering for reconnection replay (100KB)
//! - Automatic cleanup of stale sessions (10 minutes)

use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{broadcast, Mutex, RwLock};

/// Maximum output buffer size (100KB)
const MAX_BUFFER_SIZE: usize = 100 * 1024;

/// Session timeout duration (10 minutes)
const SESSION_TIMEOUT: Duration = Duration::from_secs(10 * 60);

/// Cleanup interval (1 minute)
const CLEANUP_INTERVAL: Duration = Duration::from_secs(60);

/// Circular buffer for PTY output
#[derive(Debug)]
pub struct OutputBuffer {
    buffer: Vec<u8>,
    capacity: usize,
}

impl OutputBuffer {
    pub fn new(capacity: usize) -> Self {
        Self {
            buffer: Vec::with_capacity(capacity),
            capacity,
        }
    }

    /// Append data to buffer, removing old data if needed
    pub fn append(&mut self, data: &[u8]) {
        // If data is larger than capacity, only keep the last `capacity` bytes
        if data.len() >= self.capacity {
            self.buffer.clear();
            self.buffer
                .extend_from_slice(&data[data.len() - self.capacity..]);
            return;
        }

        // If adding data would exceed capacity, remove old data
        let new_len = self.buffer.len() + data.len();
        if new_len > self.capacity {
            let to_remove = new_len - self.capacity;
            self.buffer.drain(..to_remove);
        }

        self.buffer.extend_from_slice(data);
    }

    /// Get all buffered output
    pub fn get_all(&self) -> &[u8] {
        &self.buffer
    }

    /// Clear the buffer
    pub fn clear(&mut self) {
        self.buffer.clear();
    }

    /// Get buffer size
    pub fn len(&self) -> usize {
        self.buffer.len()
    }

    /// Check if buffer is empty
    pub fn is_empty(&self) -> bool {
        self.buffer.is_empty()
    }
}

/// PTY session state
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SessionState {
    /// Client is connected and active
    Connected,
    /// Client disconnected, waiting for reconnection
    Disconnected,
    /// Session is being cleaned up
    Closing,
}

/// A registered PTY session
pub struct PtySession {
    /// Unique session ID
    pub id: String,
    /// Terminal ID from client
    pub terminal_id: String,
    /// Current working directory
    pub cwd: Option<String>,
    /// PTY size
    pub cols: u16,
    pub rows: u16,
    /// PTY master handle (protected by mutex for concurrent access)
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    /// PTY writer (protected by mutex)
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    /// Output buffer for reconnection replay
    output_buffer: Arc<Mutex<OutputBuffer>>,
    /// Broadcast channel for real-time output
    output_tx: broadcast::Sender<Vec<u8>>,
    /// Session state
    state: Arc<RwLock<SessionState>>,
    /// Last activity time
    last_activity: Arc<RwLock<Instant>>,
    /// Session creation time
    pub created_at: Instant,
}

impl PtySession {
    /// Create a new PTY session
    pub async fn new(
        id: String,
        terminal_id: String,
        cols: u16,
        rows: u16,
        cwd: Option<String>,
    ) -> Result<Self, String> {
        // Create PTY
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to open PTY: {}", e))?;

        // Get the default shell
        let shell = std::env::var("SHELL").unwrap_or_else(|_| {
            if cfg!(target_os = "windows") {
                "cmd.exe".to_string()
            } else {
                "/bin/bash".to_string()
            }
        });

        // Build command
        let mut cmd = CommandBuilder::new(&shell);
        if let Some(ref cwd_path) = cwd {
            cmd.cwd(cwd_path);
        }

        // Spawn the shell process
        let _child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn shell: {}", e))?;

        // Drop the slave - we only need the master
        drop(pair.slave);

        // Get reader and writer from master
        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to clone PTY reader: {}", e))?;

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to get PTY writer: {}", e))?;

        let master = Arc::new(Mutex::new(pair.master));
        let writer = Arc::new(Mutex::new(writer));
        let output_buffer = Arc::new(Mutex::new(OutputBuffer::new(MAX_BUFFER_SIZE)));
        let (output_tx, _) = broadcast::channel(1024);
        let state = Arc::new(RwLock::new(SessionState::Connected));
        let last_activity = Arc::new(RwLock::new(Instant::now()));

        let session = Self {
            id: id.clone(),
            terminal_id,
            cwd,
            cols,
            rows,
            master,
            writer,
            output_buffer: output_buffer.clone(),
            output_tx: output_tx.clone(),
            state,
            last_activity: last_activity.clone(),
            created_at: Instant::now(),
        };

        // Start the reader task
        let buffer_clone = output_buffer;
        let tx_clone = output_tx;
        let activity_clone = last_activity;
        let id_clone = id;

        tokio::task::spawn_blocking(move || {
            let mut reader = reader;
            let mut buf = [0u8; 4096];

            loop {
                match reader.read(&mut buf) {
                    Ok(0) => {
                        log::info!("PTY EOF for session {}", id_clone);
                        break;
                    }
                    Ok(n) => {
                        let data = buf[..n].to_vec();

                        // Update activity time
                        let rt = tokio::runtime::Handle::current();
                        rt.block_on(async {
                            *activity_clone.write().await = Instant::now();

                            // Buffer the output
                            buffer_clone.lock().await.append(&data);

                            // Broadcast to connected clients
                            let _ = tx_clone.send(data);
                        });
                    }
                    Err(e) => {
                        log::warn!("PTY read error for session {}: {}", id_clone, e);
                        break;
                    }
                }
            }
        });

        Ok(session)
    }

    /// Write data to the PTY
    pub async fn write(&self, data: &[u8]) -> Result<(), String> {
        let mut writer = self.writer.lock().await;
        writer
            .write_all(data)
            .map_err(|e| format!("Failed to write to PTY: {}", e))?;
        writer
            .flush()
            .map_err(|e| format!("Failed to flush PTY: {}", e))?;
        *self.last_activity.write().await = Instant::now();
        Ok(())
    }

    /// Resize the PTY
    pub async fn resize(&self, cols: u16, rows: u16) -> Result<(), String> {
        let master = self.master.lock().await;
        master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to resize PTY: {}", e))?;
        *self.last_activity.write().await = Instant::now();
        Ok(())
    }

    /// Get buffered output for replay on reconnection
    pub async fn get_buffered_output(&self) -> Vec<u8> {
        self.output_buffer.lock().await.get_all().to_vec()
    }

    /// Subscribe to real-time output
    pub fn subscribe(&self) -> broadcast::Receiver<Vec<u8>> {
        self.output_tx.subscribe()
    }

    /// Get current session state
    pub async fn get_state(&self) -> SessionState {
        *self.state.read().await
    }

    /// Set session state
    pub async fn set_state(&self, new_state: SessionState) {
        *self.state.write().await = new_state;
        *self.last_activity.write().await = Instant::now();
    }

    /// Check if session has timed out
    pub async fn is_timed_out(&self) -> bool {
        let state = *self.state.read().await;
        if state != SessionState::Disconnected {
            return false;
        }
        let last_activity = *self.last_activity.read().await;
        last_activity.elapsed() > SESSION_TIMEOUT
    }
}

/// Global PTY session registry
pub struct PtyRegistry {
    sessions: RwLock<HashMap<String, Arc<PtySession>>>,
}

impl Default for PtyRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl PtyRegistry {
    pub fn new() -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
        }
    }

    /// Create and register a new PTY session
    pub async fn create_session(
        &self,
        terminal_id: String,
        cols: u16,
        rows: u16,
        cwd: Option<String>,
    ) -> Result<Arc<PtySession>, String> {
        let session_id = uuid::Uuid::new_v4().to_string();
        let session =
            PtySession::new(session_id.clone(), terminal_id.clone(), cols, rows, cwd).await?;

        let session = Arc::new(session);
        self.sessions
            .write()
            .await
            .insert(session_id.clone(), session.clone());

        log::info!(
            "Created PTY session {} for terminal {}",
            session_id,
            terminal_id
        );
        Ok(session)
    }

    /// Get a session by ID
    pub async fn get_session(&self, session_id: &str) -> Option<Arc<PtySession>> {
        self.sessions.read().await.get(session_id).cloned()
    }

    /// Get a session by terminal ID
    pub async fn get_session_by_terminal(&self, terminal_id: &str) -> Option<Arc<PtySession>> {
        self.sessions
            .read()
            .await
            .values()
            .find(|s| s.terminal_id == terminal_id)
            .cloned()
    }

    /// Remove a session
    pub async fn remove_session(&self, session_id: &str) -> Option<Arc<PtySession>> {
        let session = self.sessions.write().await.remove(session_id);
        if let Some(ref s) = session {
            s.set_state(SessionState::Closing).await;
            log::info!("Removed PTY session {}", session_id);
        }
        session
    }

    /// Mark a session as disconnected
    pub async fn mark_disconnected(&self, session_id: &str) {
        if let Some(session) = self.sessions.read().await.get(session_id) {
            session.set_state(SessionState::Disconnected).await;
            log::info!("PTY session {} marked as disconnected", session_id);
        }
    }

    /// Mark a session as connected
    pub async fn mark_connected(&self, session_id: &str) {
        if let Some(session) = self.sessions.read().await.get(session_id) {
            session.set_state(SessionState::Connected).await;
            log::info!("PTY session {} marked as connected", session_id);
        }
    }

    /// Clean up timed out sessions
    pub async fn cleanup_stale_sessions(&self) {
        let sessions = self.sessions.read().await;
        let mut to_remove = Vec::new();

        for (id, session) in sessions.iter() {
            if session.is_timed_out().await {
                to_remove.push(id.clone());
            }
        }
        drop(sessions);

        for id in to_remove {
            if let Some(session) = self.remove_session(&id).await {
                log::info!(
                    "Cleaned up stale PTY session {} (terminal: {})",
                    id,
                    session.terminal_id
                );
            }
        }
    }

    /// List all active sessions
    pub async fn list_sessions(&self) -> Vec<(String, String, SessionState)> {
        let sessions = self.sessions.read().await;
        let mut result = Vec::new();

        for (id, session) in sessions.iter() {
            let state = session.get_state().await;
            result.push((id.clone(), session.terminal_id.clone(), state));
        }

        result
    }

    /// Start the cleanup task
    pub fn start_cleanup_task(registry: Arc<Self>) {
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(CLEANUP_INTERVAL).await;
                registry.cleanup_stale_sessions().await;
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_output_buffer_basic() {
        let mut buffer = OutputBuffer::new(100);

        buffer.append(b"hello");
        assert_eq!(buffer.get_all(), b"hello");
        assert_eq!(buffer.len(), 5);

        buffer.append(b" world");
        assert_eq!(buffer.get_all(), b"hello world");
        assert_eq!(buffer.len(), 11);
    }

    #[test]
    fn test_output_buffer_overflow() {
        let mut buffer = OutputBuffer::new(10);

        buffer.append(b"12345");
        assert_eq!(buffer.get_all(), b"12345");

        buffer.append(b"67890");
        assert_eq!(buffer.get_all(), b"1234567890");

        // This should remove "12345" to make room for "abcde"
        buffer.append(b"abcde");
        assert_eq!(buffer.get_all(), b"67890abcde");
    }

    #[test]
    fn test_output_buffer_large_append() {
        let mut buffer = OutputBuffer::new(10);

        // Append more than capacity
        buffer.append(b"0123456789abcdefghij");
        // Should only keep last 10 bytes
        assert_eq!(buffer.get_all(), b"abcdefghij");
    }

    #[tokio::test]
    async fn test_registry_basic() {
        let registry = PtyRegistry::new();

        // Create session
        let result = registry
            .create_session("term-1".to_string(), 80, 24, None)
            .await;

        // May fail on CI without PTY support, so we just check the registry works
        if let Ok(session) = result {
            assert_eq!(session.terminal_id, "term-1");
            assert_eq!(session.cols, 80);
            assert_eq!(session.rows, 24);

            // Should find by ID
            let found = registry.get_session(&session.id).await;
            assert!(found.is_some());

            // Should find by terminal ID
            let found = registry.get_session_by_terminal("term-1").await;
            assert!(found.is_some());

            // Remove session
            registry.remove_session(&session.id).await;
            let found = registry.get_session(&session.id).await;
            assert!(found.is_none());
        }
    }
}
