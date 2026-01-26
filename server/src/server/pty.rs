//! WebSocket PTY handler for browser-based terminal access
//!
//! Provides interactive terminal sessions over WebSocket for browser clients.
//! Supports session persistence and reconnection for mobile resilience (US-3, US-4).

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, Query, State,
    },
    response::IntoResponse,
};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::Mutex;

use super::pty_registry::SessionState;
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

/// Response with session info
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionInfo {
    session_id: String,
    terminal_id: String,
}

/// Query parameters for PTY WebSocket
#[derive(Debug, Deserialize)]
pub struct PtyQuery {
    token: Option<String>,
}

/// Path parameters for reconnect endpoint
#[derive(Debug, Deserialize)]
pub struct ReconnectPath {
    terminal_id: String,
    session_id: String,
}

/// WebSocket upgrade handler for new PTY sessions
pub async fn pty_ws_handler(
    ws: WebSocketUpgrade,
    Path(terminal_id): Path<String>,
    Query(query): Query<PtyQuery>,
    State(state): State<ServerAppState>,
) -> impl IntoResponse {
    // Validate token from query parameter
    if let Some(token) = query.token {
        if token != state.auth_token {
            return (axum::http::StatusCode::UNAUTHORIZED, "Invalid token").into_response();
        }
    } else {
        return (axum::http::StatusCode::UNAUTHORIZED, "Missing token").into_response();
    }

    ws.on_upgrade(move |socket| handle_new_pty_session(socket, terminal_id, state))
        .into_response()
}

/// WebSocket upgrade handler for PTY reconnection
pub async fn pty_reconnect_handler(
    ws: WebSocketUpgrade,
    Path(path): Path<ReconnectPath>,
    Query(query): Query<PtyQuery>,
    State(state): State<ServerAppState>,
) -> impl IntoResponse {
    // Validate token
    if let Some(token) = query.token {
        if token != state.auth_token {
            return (axum::http::StatusCode::UNAUTHORIZED, "Invalid token").into_response();
        }
    } else {
        return (axum::http::StatusCode::UNAUTHORIZED, "Missing token").into_response();
    }

    // Check if session exists
    let session = state.pty_registry.get_session(&path.session_id).await;
    if session.is_none() {
        return (
            axum::http::StatusCode::NOT_FOUND,
            "Session not found or expired",
        )
            .into_response();
    }

    ws.on_upgrade(move |socket| {
        handle_pty_reconnection(socket, path.terminal_id, path.session_id, state)
    })
    .into_response()
}

/// Handle a new PTY WebSocket session
async fn handle_new_pty_session(socket: WebSocket, terminal_id: String, state: ServerAppState) {
    let (mut ws_sender, mut ws_receiver) = socket.split();

    log::info!("PTY WebSocket client connected: {}", terminal_id);

    // Wait for setup message
    let setup: PtySetup = loop {
        match ws_receiver.next().await {
            Some(Ok(Message::Text(text))) => match serde_json::from_str::<ClientMessage>(&text) {
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
            },
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

    // Create session in registry
    let session = match state
        .pty_registry
        .create_session(terminal_id.clone(), setup.cols, setup.rows, setup.cwd)
        .await
    {
        Ok(session) => session,
        Err(e) => {
            log::error!("Failed to create PTY session: {}", e);
            let _ = ws_sender
                .send(Message::Text(format!("{{\"error\": \"{}\"}}", e).into()))
                .await;
            return;
        }
    };

    // Send session info to client
    let session_info = SessionInfo {
        session_id: session.id.clone(),
        terminal_id: terminal_id.clone(),
    };
    if let Ok(info_json) = serde_json::to_string(&session_info) {
        let _ = ws_sender
            .send(Message::Text(
                format!("{{\"type\": \"session\", \"data\": {}}}", info_json).into(),
            ))
            .await;
    }

    // Handle the session
    handle_pty_io(ws_sender, ws_receiver, session, state).await;
}

/// Handle PTY reconnection
async fn handle_pty_reconnection(
    socket: WebSocket,
    terminal_id: String,
    session_id: String,
    state: ServerAppState,
) {
    let (mut ws_sender, ws_receiver) = socket.split();

    log::info!(
        "PTY WebSocket reconnecting: terminal={}, session={}",
        terminal_id,
        session_id
    );

    // Get the session
    let session = match state.pty_registry.get_session(&session_id).await {
        Some(s) => s,
        None => {
            log::warn!("Session not found for reconnection: {}", session_id);
            let _ = ws_sender
                .send(Message::Text(
                    "{\"error\": \"Session not found or expired\"}".into(),
                ))
                .await;
            return;
        }
    };

    // Check session state
    let session_state = session.get_state().await;
    if session_state == SessionState::Closing {
        log::warn!("Session is closing, cannot reconnect: {}", session_id);
        let _ = ws_sender
            .send(Message::Text("{\"error\": \"Session is closing\"}".into()))
            .await;
        return;
    }

    // Mark as connected
    state.pty_registry.mark_connected(&session_id).await;

    // Send session info
    let session_info = SessionInfo {
        session_id: session.id.clone(),
        terminal_id: terminal_id.clone(),
    };
    if let Ok(info_json) = serde_json::to_string(&session_info) {
        let _ = ws_sender
            .send(Message::Text(
                format!("{{\"type\": \"session\", \"data\": {}}}", info_json).into(),
            ))
            .await;
    }

    // Send buffered output for replay
    let buffered = session.get_buffered_output().await;
    if !buffered.is_empty() {
        let data = String::from_utf8_lossy(&buffered).to_string();
        log::info!(
            "Sending {} bytes of buffered output for session {}",
            buffered.len(),
            session_id
        );
        let _ = ws_sender
            .send(Message::Text(
                format!(
                    "{{\"type\": \"replay\", \"data\": {}}}",
                    serde_json::to_string(&data).unwrap_or_default()
                )
                .into(),
            ))
            .await;
    }

    // Handle the session
    handle_pty_io(ws_sender, ws_receiver, session, state).await;
}

/// Handle PTY I/O for a session (shared between new and reconnect)
async fn handle_pty_io(
    ws_sender: futures_util::stream::SplitSink<WebSocket, Message>,
    mut ws_receiver: futures_util::stream::SplitStream<WebSocket>,
    session: Arc<super::pty_registry::PtySession>,
    state: ServerAppState,
) {
    let session_id = session.id.clone();
    let ws_sender = Arc::new(Mutex::new(ws_sender));

    // Subscribe to output
    let mut output_rx = session.subscribe();
    let ws_sender_clone = ws_sender.clone();

    // Task: Forward PTY output to WebSocket
    let output_task = tokio::spawn(async move {
        while let Ok(data) = output_rx.recv().await {
            let text = String::from_utf8_lossy(&data).to_string();
            let mut sender = ws_sender_clone.lock().await;
            if sender.send(Message::Text(text.into())).await.is_err() {
                break;
            }
        }
    });

    // Handle input from WebSocket
    while let Some(result) = ws_receiver.next().await {
        match result {
            Ok(Message::Text(text)) => {
                // Try to parse as a command message
                match serde_json::from_str::<ClientMessage>(&text) {
                    Ok(ClientMessage::Input { data }) => {
                        if let Err(e) = session.write(data.as_bytes()).await {
                            log::warn!("Failed to write to PTY: {}", e);
                            break;
                        }
                    }
                    Ok(ClientMessage::Resize(resize)) => {
                        if let Err(e) = session.resize(resize.cols, resize.rows).await {
                            log::warn!("Failed to resize PTY: {}", e);
                        }
                    }
                    Ok(ClientMessage::Setup(_)) => {
                        log::warn!("Received duplicate setup message, ignoring");
                    }
                    Err(_) => {
                        // Not a JSON message, treat as raw input
                        if let Err(e) = session.write(text.as_bytes()).await {
                            log::warn!("Failed to write to PTY: {}", e);
                            break;
                        }
                    }
                }
            }
            Ok(Message::Binary(data)) => {
                if let Err(e) = session.write(&data).await {
                    log::warn!("Failed to write binary to PTY: {}", e);
                    break;
                }
            }
            Ok(Message::Close(_)) => {
                log::info!("PTY WebSocket client requested close: {}", session_id);
                break;
            }
            Err(e) => {
                log::warn!("PTY WebSocket error: {}", e);
                break;
            }
            _ => {}
        }
    }

    // Client disconnected - mark session as disconnected but keep it alive
    output_task.abort();
    state.pty_registry.mark_disconnected(&session_id).await;

    log::info!("PTY client disconnected, session preserved: {}", session_id);
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

    #[test]
    fn test_session_info_serialization() {
        let info = SessionInfo {
            session_id: "abc123".to_string(),
            terminal_id: "term-1".to_string(),
        };
        let json = serde_json::to_string(&info).unwrap();
        assert!(json.contains("sessionId"));
        assert!(json.contains("terminalId"));
    }
}
