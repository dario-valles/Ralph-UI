//! Push notification Backend commands

use crate::push::{
    get_push_subscription_settings, get_push_subscriptions, remove_push_subscription,
    save_push_subscription, update_push_subscription_settings,
    get_vapid_public_key as get_vapid_key,
    PushNotificationSettings, PushNotifier, PushSubscription, PushSubscriptionKeys,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

/// State for push notification management
pub struct PushNotificationState {
    /// The push notifier instance
    pub notifier: Arc<PushNotifier>,
}

impl PushNotificationState {
    /// Create new push notification state
    pub fn new() -> Self {
        Self {
            notifier: Arc::new(PushNotifier::new()),
        }
    }

    /// Get a clone of the notifier for async operations
    pub fn get_notifier(&self) -> Arc<PushNotifier> {
        self.notifier.clone()
    }
}

impl Default for PushNotificationState {
    fn default() -> Self {
        Self::new()
    }
}

/// Response for VAPID public key
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VapidPublicKeyResponse {
    pub public_key: String,
}

/// Get the VAPID public key for client subscription
pub async fn get_vapid_public_key() -> Result<VapidPublicKeyResponse, String> {
    let public_key = get_vapid_key()?;
    Ok(VapidPublicKeyResponse { public_key })
}

/// Input for subscribing to push notifications
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscribePushInput {
    /// Push subscription endpoint
    pub endpoint: String,
    /// Subscription keys
    pub keys: PushSubscriptionKeys,
    /// Optional user agent
    pub user_agent: Option<String>,
    /// Initial notification settings
    pub settings: Option<PushNotificationSettings>,
}

/// Response for push subscription
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushSubscriptionResponse {
    pub id: String,
    pub settings: PushNotificationSettings,
}

/// Subscribe to push notifications
pub async fn subscribe_push(
    input: SubscribePushInput,
    push_state: &PushNotificationState,
) -> Result<PushSubscriptionResponse, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let settings = input.settings.unwrap_or_default();

    let subscription = PushSubscription {
        id: id.clone(),
        endpoint: input.endpoint,
        keys: input.keys,
        settings: settings.clone(),
        created_at: chrono::Utc::now().to_rfc3339(),
        user_agent: input.user_agent,
    };

    save_push_subscription(subscription)?;

    // Reload subscriptions in notifier
    push_state.notifier.reload_subscriptions().await?;

    Ok(PushSubscriptionResponse { id, settings })
}

/// Input for unsubscribing
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnsubscribePushInput {
    /// Subscription ID (optional if endpoint provided)
    pub subscription_id: Option<String>,
    /// Endpoint URL (optional if ID provided)
    pub endpoint: Option<String>,
}

/// Unsubscribe from push notifications
pub async fn unsubscribe_push(
    input: UnsubscribePushInput,
    push_state: &PushNotificationState,
) -> Result<bool, String> {
    let removed = if let Some(id) = input.subscription_id {
        remove_push_subscription(&id)?
    } else if let Some(endpoint) = input.endpoint {
        crate::push::storage::remove_push_subscription_by_endpoint(&endpoint)?
    } else {
        return Err("Either subscriptionId or endpoint must be provided".to_string());
    };

    if removed {
        // Reload subscriptions in notifier
        push_state.notifier.reload_subscriptions().await?;
    }

    Ok(removed)
}

/// Get push notification settings for a subscription
pub async fn get_push_settings(subscription_id: String) -> Result<PushNotificationSettings, String> {
    get_push_subscription_settings(&subscription_id)?
        .ok_or_else(|| format!("Subscription {} not found", subscription_id))
}

/// Input for updating settings
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePushSettingsInput {
    pub subscription_id: String,
    pub settings: PushNotificationSettings,
}

/// Update push notification settings
pub async fn update_push_settings(
    input: UpdatePushSettingsInput,
    push_state: &PushNotificationState,
) -> Result<PushNotificationSettings, String> {
    let updated = update_push_subscription_settings(&input.subscription_id, input.settings.clone())?;

    if !updated {
        return Err(format!("Subscription {} not found", input.subscription_id));
    }

    // Reload subscriptions in notifier
    push_state.notifier.reload_subscriptions().await?;

    Ok(input.settings)
}

/// Send a test push notification
pub async fn test_push(
    subscription_id: String,
    push_state: &PushNotificationState,
) -> Result<(), String> {
    push_state.notifier.send_test(&subscription_id).await
}

/// List all push subscriptions
pub async fn list_push_subscriptions() -> Result<Vec<PushSubscriptionInfo>, String> {
    let subscriptions = get_push_subscriptions()?;
    Ok(subscriptions
        .into_iter()
        .map(|s| PushSubscriptionInfo {
            id: s.id,
            endpoint_domain: extract_domain(&s.endpoint),
            settings: s.settings,
            created_at: s.created_at,
            user_agent: s.user_agent,
        })
        .collect())
}

/// Summary info for a subscription (hides sensitive endpoint)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushSubscriptionInfo {
    pub id: String,
    /// Just the domain of the endpoint (for privacy)
    pub endpoint_domain: String,
    pub settings: PushNotificationSettings,
    pub created_at: String,
    pub user_agent: Option<String>,
}

/// Extract domain from endpoint URL
fn extract_domain(endpoint: &str) -> String {
    // Simple extraction without url crate dependency
    // Format: https://domain.com/...
    endpoint
        .strip_prefix("https://")
        .or_else(|| endpoint.strip_prefix("http://"))
        .and_then(|s| s.split('/').next())
        .map(|s| s.to_string())
        .unwrap_or_else(|| "unknown".to_string())
}

/// Get subscription count
pub async fn get_push_subscription_count(
    push_state: &PushNotificationState,
) -> Result<usize, String> {
    Ok(push_state.notifier.subscription_count().await)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_domain() {
        assert_eq!(
            extract_domain("https://fcm.googleapis.com/fcm/send/abc123"),
            "fcm.googleapis.com"
        );
        assert_eq!(
            extract_domain("https://updates.push.services.mozilla.com/wpush/v2/abc"),
            "updates.push.services.mozilla.com"
        );
        assert_eq!(extract_domain("invalid"), "unknown");
    }

    #[test]
    fn test_push_notification_state_creation() {
        let state = PushNotificationState::new();
        // Just verify it creates without panic
        let _ = state.get_notifier();
    }
}
