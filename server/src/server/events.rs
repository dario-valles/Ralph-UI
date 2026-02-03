//! WebSocket event broadcaster for real-time updates
//!
//! Bridges the internal event channels to WebSocket clients.
//! Also handles push notifications for background updates.

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::broadcast;

use super::ServerAppState;
use crate::push::{NotificationPayload, PushEventType, PushNotifier};

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
/// Also triggers push notifications for configured event types
pub struct EventBroadcaster {
    tx: broadcast::Sender<ServerEvent>,
    push_notifier: Option<Arc<PushNotifier>>,
}

impl EventBroadcaster {
    /// Create a new event broadcaster with a channel capacity of 1000 events
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(1000);
        Self {
            tx,
            push_notifier: None,
        }
    }

    /// Set the push notifier for sending background notifications
    pub fn set_push_notifier(&mut self, notifier: Arc<PushNotifier>) {
        self.push_notifier = Some(notifier);
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

    /// Broadcast an event and also send a push notification
    /// Use this for important events that should reach users even when browser is closed
    pub fn broadcast_with_push(
        &self,
        event_type: &str,
        payload: impl Serialize + Clone,
        push_event_type: PushEventType,
        push_title: &str,
        push_body: &str,
    ) {
        // First, broadcast to WebSocket clients
        self.broadcast(event_type, payload.clone());

        // Then, send push notification if notifier is available
        if let Some(notifier) = &self.push_notifier {
            let notifier = notifier.clone();
            let title = push_title.to_string();
            let body = push_body.to_string();
            let tag = format!("{}:{}", event_type, chrono::Utc::now().timestamp_millis());

            // Spawn async task to send push notification
            tokio::spawn(async move {
                let notification = NotificationPayload::new(&title, &body).with_tag(&tag);

                if let Err(e) = notifier.notify(push_event_type, notification).await {
                    log::warn!("Failed to send push notification: {}", e);
                }
            });
        }
    }

    /// Subscribe to events (returns a receiver)
    pub fn subscribe(&self) -> broadcast::Receiver<ServerEvent> {
        self.tx.subscribe()
    }

    /// Alias for broadcast - allows calling as send(event, payload)
    pub fn send(&self, event_type: &str, payload: impl Serialize) {
        self.broadcast(event_type, payload);
    }

    /// Get a reference to the push notifier (if set)
    pub fn get_push_notifier(&self) -> Option<Arc<PushNotifier>> {
        self.push_notifier.clone()
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
