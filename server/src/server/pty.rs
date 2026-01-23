//! WebSocket PTY handler for browser-based terminal access
//!
//! Provides interactive terminal sessions over WebSocket for browser clients.

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, Query, State,
    },
    response::IntoResponse,
};
use futures_util::{SinkExt, StreamExt};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::Deserialize;
use std::io::{Read, Write};
use std::sync::Arc;
use tokio::sync::Mutex;

use super::ServerAppState;

/// PTY session setup request (first message from client)
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PtySetup {
    cols: u16,
    rows: u16,
    cwd: Option<String>,
}

/// PTY resize request
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PtyResize {
    cols: u16,
    rows: u16,
}

/// Message types from client
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum ClientMessage {
    Setup(PtySetup),
    Resize(PtyResize),
    Input { data: String },
}

/// Query parameters for PTY WebSocket
#[derive(Debug, Deserialize)]
pub struct PtyQuery {
    token: Option<String>,
}

/// WebSocket upgrade handler for PTY
pub async fn pty_ws_handler(
    ws: WebSocketUpgrade,
    Path(terminal_id): Path<String>,
    Query(query): Query<PtyQuery>,
    State(state): State<ServerAppState>,
) -> impl IntoResponse {
    // Validate token from query parameter (WebSocket can't use headers easily)
    if let Some(token) = query.token {
        if token != state.auth_token {
            return (
                axum::http::StatusCode::UNAUTHORIZED,
                "Invalid token",
            )
                .into_response();
        }
    } else {
        return (
            axum::http::StatusCode::UNAUTHORIZED,
            "Missing token",
        )
            .into_response();
    }

    ws.on_upgrade(move |socket| handle_pty_session(socket, terminal_id, state))
        .into_response()
}

/// Handle a PTY WebSocket session
async fn handle_pty_session(socket: WebSocket, terminal_id: String, _state: ServerAppState) {
    let (mut ws_sender, mut ws_receiver) = socket.split();

    log::info!("PTY WebSocket client connected: {}", terminal_id);

    // Wait for setup message
    let setup: PtySetup = loop {
        match ws_receiver.next().await {
            Some(Ok(Message::Text(text))) => {
                match serde_json::from_str::<ClientMessage>(&text) {
                    Ok(ClientMessage::Setup(setup)) => break setup,
                    Ok(_) => {
                        log::warn!("Expected setup message, got something else");
                        continue;
                    }
                    Err(e) => {
                        log::warn!("Failed to parse setup message: {}", e);
                        let _ = ws_sender
                            .send(Message::Text(
                                format!("{{\"error\": \"Invalid setup message: {}\"}}", e).into(),
                            ))
                            .await;
                        return;
                    }
                }
            }
            Some(Ok(Message::Close(_))) | None => {
                log::info!("PTY client disconnected before setup");
                return;
            }
            Some(Err(e)) => {
                log::warn!("WebSocket error during setup: {}", e);
                return;
            }
            _ => continue,
        }
    };

    // Create PTY
    let pty_system = native_pty_system();
    let pair = match pty_system.openpty(PtySize {
        rows: setup.rows,
        cols: setup.cols,
        pixel_width: 0,
        pixel_height: 0,
    }) {
        Ok(pair) => pair,
        Err(e) => {
            log::error!("Failed to open PTY: {}", e);
            let _ = ws_sender
                .send(Message::Text(
                    format!("{{\"error\": \"Failed to open PTY: {}\"}}", e).into(),
                ))
                .await;
            return;
        }
    };

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
    if let Some(cwd) = setup.cwd {
        cmd.cwd(&cwd);
    }

    // Spawn the shell process
    let child = match pair.slave.spawn_command(cmd) {
        Ok(child) => child,
        Err(e) => {
            log::error!("Failed to spawn shell: {}", e);
            let _ = ws_sender
                .send(Message::Text(
                    format!("{{\"error\": \"Failed to spawn shell: {}\"}}", e).into(),
                ))
                .await;
            return;
        }
    };

    // Drop the slave - we only need the master
    drop(pair.slave);

    // Get reader and writer from master
    let reader = match pair.master.try_clone_reader() {
        Ok(r) => r,
        Err(e) => {
            log::error!("Failed to clone PTY reader: {}", e);
            return;
        }
    };

    let writer = match pair.master.take_writer() {
        Ok(w) => w,
        Err(e) => {
            log::error!("Failed to get PTY writer: {}", e);
            return;
        }
    };

    // Wrap in Arc<Mutex> for sharing between tasks
    let master = Arc::new(Mutex::new(pair.master));
    let writer = Arc::new(Mutex::new(writer));

    // Task: Read from PTY and send to WebSocket
    let ws_sender = Arc::new(Mutex::new(ws_sender));
    let ws_sender_clone = ws_sender.clone();

    let read_task = tokio::task::spawn_blocking(move || {
        let mut reader = reader;
        let mut buf = [0u8; 4096];

        loop {
            match reader.read(&mut buf) {
                Ok(0) => {
                    log::info!("PTY EOF");
                    break;
                }
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let sender = ws_sender_clone.clone();

                    // Send to WebSocket (need to block on async)
                    let rt = tokio::runtime::Handle::current();
                    rt.block_on(async {
                        let mut sender = sender.lock().await;
                        if sender.send(Message::Text(data.into())).await.is_err() {
                            return;
                        }
                    });
                }
                Err(e) => {
                    log::warn!("PTY read error: {}", e);
                    break;
                }
            }
        }
    });

    // Task: Read from WebSocket and write to PTY
    let master_clone = master.clone();
    let writer_clone = writer.clone();

    while let Some(result) = ws_receiver.next().await {
        match result {
            Ok(Message::Text(text)) => {
                // Try to parse as a command message
                match serde_json::from_str::<ClientMessage>(&text) {
                    Ok(ClientMessage::Input { data }) => {
                        let mut writer = writer_clone.lock().await;
                        if let Err(e) = writer.write_all(data.as_bytes()) {
                            log::warn!("Failed to write to PTY: {}", e);
                            break;
                        }
                        let _ = writer.flush();
                    }
                    Ok(ClientMessage::Resize(resize)) => {
                        let master = master_clone.lock().await;
                        if let Err(e) = master.resize(PtySize {
                            rows: resize.rows,
                            cols: resize.cols,
                            pixel_width: 0,
                            pixel_height: 0,
                        }) {
                            log::warn!("Failed to resize PTY: {}", e);
                        }
                    }
                    Ok(ClientMessage::Setup(_)) => {
                        log::warn!("Received duplicate setup message, ignoring");
                    }
                    Err(_) => {
                        // Not a JSON message, treat as raw input
                        let mut writer = writer_clone.lock().await;
                        if let Err(e) = writer.write_all(text.as_bytes()) {
                            log::warn!("Failed to write to PTY: {}", e);
                            break;
                        }
                        let _ = writer.flush();
                    }
                }
            }
            Ok(Message::Binary(data)) => {
                // Binary data goes directly to PTY
                let mut writer = writer_clone.lock().await;
                if let Err(e) = writer.write_all(&data) {
                    log::warn!("Failed to write binary to PTY: {}", e);
                    break;
                }
                let _ = writer.flush();
            }
            Ok(Message::Close(_)) => {
                log::info!("PTY WebSocket client requested close");
                break;
            }
            Err(e) => {
                log::warn!("PTY WebSocket error: {}", e);
                break;
            }
            _ => {}
        }
    }

    // Clean up
    read_task.abort();

    // Kill the child process
    drop(child);

    log::info!("PTY session ended: {}", terminal_id);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_client_message_parsing() {
        let setup = r#"{"type": "setup", "cols": 80, "rows": 24}"#;
        let msg: ClientMessage = serde_json::from_str(setup).unwrap();
        assert!(matches!(msg, ClientMessage::Setup(_)));

        let resize = r#"{"type": "resize", "cols": 120, "rows": 40}"#;
        let msg: ClientMessage = serde_json::from_str(resize).unwrap();
        assert!(matches!(msg, ClientMessage::Resize(_)));

        let input = r#"{"type": "input", "data": "ls -la\n"}"#;
        let msg: ClientMessage = serde_json::from_str(input).unwrap();
        assert!(matches!(msg, ClientMessage::Input { .. }));
    }
}
