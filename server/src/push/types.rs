//! Types for push notifications

use serde::{Deserialize, Serialize};

/// Keys for a push subscription (from browser)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PushSubscriptionKeys {
    /// The p256dh key for encryption
    pub p256dh: String,
    /// The auth secret
    pub auth: String,
}

/// User notification settings per event type
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushNotificationSettings {
    /// Notify when chat receives a response
    #[serde(default = "default_true")]
    pub chat_response: bool,
    /// Notify when a task is completed
    #[serde(default = "default_true")]
    pub task_completed: bool,
    /// Notify when agent status changes (started/stopped/errored)
    #[serde(default = "default_true")]
    pub agent_status: bool,
    /// Notify on Ralph Loop iterations
    #[serde(default)]
    pub ralph_iteration: bool,
    /// Notify on connection status changes
    #[serde(default = "default_true")]
    pub connection_status: bool,
}

fn default_true() -> bool {
    true
}

impl Default for PushNotificationSettings {
    fn default() -> Self {
        Self {
            chat_response: true,
            task_completed: true,
            agent_status: true,
            ralph_iteration: false,
            connection_status: true,
        }
    }
}

/// A push subscription with settings
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushSubscription {
    /// Unique identifier for this subscription
    pub id: String,
    /// The push endpoint URL
    pub endpoint: String,
    /// Encryption keys
    pub keys: PushSubscriptionKeys,
    /// User notification preferences
    #[serde(default)]
    pub settings: PushNotificationSettings,
    /// When the subscription was created
    pub created_at: String,
    /// Optional user agent for debugging
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_agent: Option<String>,
}

/// Event types that can trigger push notifications
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PushEventType {
    /// Chat received a response
    ChatResponse,
    /// Task was completed
    TaskCompleted,
    /// Agent status changed
    AgentStatus,
    /// Ralph Loop iteration
    RalphIteration,
    /// Connection status changed
    ConnectionStatus,
    /// Test notification
    Test,
}

impl PushEventType {
    /// Check if this event type is enabled in the settings
    pub fn is_enabled(&self, settings: &PushNotificationSettings) -> bool {
        match self {
            PushEventType::ChatResponse => settings.chat_response,
            PushEventType::TaskCompleted => settings.task_completed,
            PushEventType::AgentStatus => settings.agent_status,
            PushEventType::RalphIteration => settings.ralph_iteration,
            PushEventType::ConnectionStatus => settings.connection_status,
            PushEventType::Test => true, // Test notifications are always enabled
        }
    }
}

/// Payload for a push notification
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationPayload {
    /// Notification title
    pub title: String,
    /// Notification body text
    pub body: String,
    /// Icon URL (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    /// Badge URL for mobile (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub badge: Option<String>,
    /// Tag for notification grouping/replacement
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tag: Option<String>,
    /// Additional data for handling clicks
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<NotificationData>,
}

/// Additional data attached to a notification
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationData {
    /// Event type that triggered this notification
    pub event_type: PushEventType,
    /// URL to open when notification is clicked
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    /// Session ID if applicable
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    /// Task ID if applicable
    #[serde(skip_serializing_if = "Option::is_none")]
    pub task_id: Option<String>,
    /// Agent ID if applicable
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_id: Option<String>,
}

impl NotificationPayload {
    /// Create a new notification payload
    pub fn new(title: impl Into<String>, body: impl Into<String>) -> Self {
        Self {
            title: title.into(),
            body: body.into(),
            icon: Some("/pwa-192x192.png".to_string()),
            badge: Some("/pwa-192x192.png".to_string()),
            tag: None,
            data: None,
        }
    }

    /// Add a tag for notification grouping
    pub fn with_tag(mut self, tag: impl Into<String>) -> Self {
        self.tag = Some(tag.into());
        self
    }

    /// Add notification data
    pub fn with_data(mut self, data: NotificationData) -> Self {
        self.data = Some(data);
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_settings() {
        let settings = PushNotificationSettings::default();
        assert!(settings.chat_response);
        assert!(settings.task_completed);
        assert!(settings.agent_status);
        assert!(!settings.ralph_iteration);
        assert!(settings.connection_status);
    }

    #[test]
    fn test_event_type_enabled() {
        let settings = PushNotificationSettings::default();
        assert!(PushEventType::ChatResponse.is_enabled(&settings));
        assert!(!PushEventType::RalphIteration.is_enabled(&settings));
        assert!(PushEventType::Test.is_enabled(&settings));
    }

    #[test]
    fn test_notification_payload_builder() {
        let payload = NotificationPayload::new("Test Title", "Test Body")
            .with_tag("test-tag")
            .with_data(NotificationData {
                event_type: PushEventType::Test,
                url: Some("/test".to_string()),
                session_id: None,
                task_id: None,
                agent_id: None,
            });

        assert_eq!(payload.title, "Test Title");
        assert_eq!(payload.body, "Test Body");
        assert_eq!(payload.tag, Some("test-tag".to_string()));
        assert!(payload.data.is_some());
    }
}
