//! Storage for push subscriptions
//!
//! Subscriptions are stored globally in ~/.ralph-ui/push_subscriptions.json
//! This allows notifications to be sent regardless of which project is active.

use super::types::{PushNotificationSettings, PushSubscription};
use crate::file_storage::{get_global_ralph_ui_dir, init_global_ralph_ui_dir, read_json, write_json};
use std::collections::HashMap;
use std::path::PathBuf;

/// Get the path to the subscriptions file
fn get_subscriptions_path() -> PathBuf {
    get_global_ralph_ui_dir().join("push_subscriptions.json")
}

/// Storage format for subscriptions file
#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
struct SubscriptionsFile {
    /// Map of subscription ID to subscription
    subscriptions: HashMap<String, PushSubscription>,
}

/// Load subscriptions from storage
fn load_subscriptions() -> Result<SubscriptionsFile, String> {
    let path = get_subscriptions_path();
    if !path.exists() {
        return Ok(SubscriptionsFile::default());
    }
    read_json(&path)
}

/// Save subscriptions to storage
fn save_subscriptions(data: &SubscriptionsFile) -> Result<(), String> {
    init_global_ralph_ui_dir()?;
    let path = get_subscriptions_path();
    write_json(&path, data)
}

/// Save a push subscription
pub fn save_push_subscription(subscription: PushSubscription) -> Result<(), String> {
    let mut data = load_subscriptions()?;

    // Check if we already have a subscription with this endpoint
    // If so, update it (keeps the same ID but may update keys/settings)
    let existing_id = data
        .subscriptions
        .iter()
        .find(|(_, s)| s.endpoint == subscription.endpoint)
        .map(|(id, _)| id.clone());

    if let Some(id) = existing_id {
        // Update existing subscription
        data.subscriptions.insert(id, subscription);
    } else {
        // Add new subscription
        data.subscriptions
            .insert(subscription.id.clone(), subscription);
    }

    save_subscriptions(&data)?;
    log::info!(
        "Saved push subscription (total: {})",
        data.subscriptions.len()
    );
    Ok(())
}

/// Remove a push subscription by ID
pub fn remove_push_subscription(subscription_id: &str) -> Result<bool, String> {
    let mut data = load_subscriptions()?;

    let removed = data.subscriptions.remove(subscription_id).is_some();
    if removed {
        save_subscriptions(&data)?;
        log::info!("Removed push subscription {}", subscription_id);
    }
    Ok(removed)
}

/// Remove a push subscription by endpoint
pub fn remove_push_subscription_by_endpoint(endpoint: &str) -> Result<bool, String> {
    let mut data = load_subscriptions()?;

    let initial_count = data.subscriptions.len();
    data.subscriptions.retain(|_, s| s.endpoint != endpoint);
    let removed = data.subscriptions.len() < initial_count;

    if removed {
        save_subscriptions(&data)?;
        log::info!("Removed push subscription by endpoint");
    }
    Ok(removed)
}

/// Get a push subscription by ID
pub fn get_push_subscription(subscription_id: &str) -> Result<Option<PushSubscription>, String> {
    let data = load_subscriptions()?;
    Ok(data.subscriptions.get(subscription_id).cloned())
}

/// Get all push subscriptions
pub fn get_push_subscriptions() -> Result<Vec<PushSubscription>, String> {
    let data = load_subscriptions()?;
    Ok(data.subscriptions.into_values().collect())
}

/// Update settings for a push subscription
pub fn update_push_subscription_settings(
    subscription_id: &str,
    settings: PushNotificationSettings,
) -> Result<bool, String> {
    let mut data = load_subscriptions()?;

    if let Some(subscription) = data.subscriptions.get_mut(subscription_id) {
        subscription.settings = settings;
        save_subscriptions(&data)?;
        log::debug!("Updated settings for subscription {}", subscription_id);
        return Ok(true);
    }

    Ok(false)
}

/// Get settings for a subscription
pub fn get_push_subscription_settings(
    subscription_id: &str,
) -> Result<Option<PushNotificationSettings>, String> {
    let data = load_subscriptions()?;
    Ok(data.subscriptions.get(subscription_id).map(|s| s.settings.clone()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::push::types::PushSubscriptionKeys;

    fn create_test_subscription(id: &str, endpoint: &str) -> PushSubscription {
        PushSubscription {
            id: id.to_string(),
            endpoint: endpoint.to_string(),
            keys: PushSubscriptionKeys {
                p256dh: "test-p256dh".to_string(),
                auth: "test-auth".to_string(),
            },
            settings: PushNotificationSettings::default(),
            created_at: chrono::Utc::now().to_rfc3339(),
            user_agent: None,
        }
    }

    #[test]
    fn test_subscriptions_file_default() {
        let file = SubscriptionsFile::default();
        assert!(file.subscriptions.is_empty());
    }

    #[test]
    fn test_create_subscription() {
        let sub = create_test_subscription("test-1", "https://example.com/push");
        assert_eq!(sub.id, "test-1");
        assert_eq!(sub.endpoint, "https://example.com/push");
    }
}
