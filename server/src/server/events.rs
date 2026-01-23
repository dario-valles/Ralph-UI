//! WebSocket event broadcaster for real-time updates
//!
//! Bridges the internal event channels to WebSocket clients.

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;

use super::ServerAppState;

/// A server event that can be broadcast to WebSocket clients
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerEvent {
    /// Event type (e.g., "ralph:progress", "agent:completed")
    pub event: String,
    /// Event payload as JSON value
    pub payload: serde_json::Value,
}

/// Broadcasts events to all connected WebSocket clients
pub struct EventBroadcaster {
    tx: broadcast::Sender<ServerEvent>,
}

impl EventBroadcaster {
    /// Create a new event broadcaster with a channel capacity of 1000 events
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(1000);
        Self { tx }
    }

    /// Broadcast an event to all connected clients
    pub fn broadcast(&self, event_type: &str, payload: impl Serialize) {
        let event = ServerEvent {
            event: event_type.to_string(),
            payload: serde_json::to_value(payload).unwrap_or(serde_json::Value::Null),
        };

        // Ignore send errors (no receivers)
        let _ = self.tx.send(event);
    }

    /// Subscribe to events (returns a receiver)
    pub fn subscribe(&self) -> broadcast::Receiver<ServerEvent> {
        self.tx.subscribe()
    }
}

impl Default for EventBroadcaster {
    fn default() -> Self {
        Self::new()
    }
}

/// WebSocket upgrade handler
pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<ServerAppState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_websocket(socket, state))
}

/// Handle a WebSocket connection
async fn handle_websocket(socket: WebSocket, state: ServerAppState) {
    let (mut sender, mut receiver) = socket.split();

    // Subscribe to broadcast events
    let mut event_rx = state.broadcaster.subscribe();

    log::info!("WebSocket client connected");

    // Spawn a task to forward broadcast events to this client
    let send_task = tokio::spawn(async move {
        while let Ok(event) = event_rx.recv().await {
            match serde_json::to_string(&event) {
                Ok(json) => {
                    if sender.send(Message::Text(json.into())).await.is_err() {
                        break;
                    }
                }
                Err(e) => {
                    log::warn!("Failed to serialize event: {}", e);
                }
            }
        }
    });

    // Handle incoming messages (ping/pong, subscription requests, etc.)
    while let Some(result) = receiver.next().await {
        match result {
            Ok(msg) => {
                match msg {
                    Message::Ping(data) => {
                        // Pong is handled automatically by axum
                        log::trace!("Received ping: {:?}", data);
                    }
                    Message::Pong(_) => {
                        log::trace!("Received pong");
                    }
                    Message::Text(text) => {
                        // Handle subscription requests or other commands
                        log::debug!("Received text message: {}", text);
                        // For now, we broadcast all events to all clients
                        // Could add filtering/subscription logic here
                    }
                    Message::Close(_) => {
                        log::info!("WebSocket client disconnected");
                        break;
                    }
                    _ => {}
                }
            }
            Err(e) => {
                log::warn!("WebSocket error: {}", e);
                break;
            }
        }
    }

    // Clean up
    send_task.abort();
    log::info!("WebSocket connection closed");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_event_broadcaster() {
        let broadcaster = EventBroadcaster::new();

        // Create a subscriber
        let mut rx = broadcaster.subscribe();

        // Broadcast an event
        broadcaster.broadcast("test:event", serde_json::json!({"foo": "bar"}));

        // We need an async runtime to receive
        // This is just a compilation test
    }

    #[test]
    fn test_server_event_serialization() {
        let event = ServerEvent {
            event: "ralph:progress".to_string(),
            payload: serde_json::json!({
                "executionId": "exec-123",
                "progress": 0.5
            }),
        };

        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("ralph:progress"));
        assert!(json.contains("exec-123"));
    }
}
