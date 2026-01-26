//! Push notification sender
//!
//! Handles sending push notifications to subscribed clients using the web-push crate.

use super::storage::{get_push_subscriptions, remove_push_subscription};
use super::types::{NotificationPayload, PushEventType, PushSubscription};
use super::vapid::get_or_create_vapid_keys;
use std::sync::Arc;
use tokio::sync::RwLock;
use web_push::{
    ContentEncoding, IsahcWebPushClient, SubscriptionInfo, VapidSignatureBuilder, WebPushClient,
    WebPushError, WebPushMessageBuilder, URL_SAFE_NO_PAD,
};

/// Push notification sender
pub struct PushNotifier {
    /// HTTP client for sending notifications
    client: IsahcWebPushClient,
    /// Cache of active subscriptions
    subscriptions: Arc<RwLock<Vec<PushSubscription>>>,
}

impl PushNotifier {
    /// Create a new push notifier
    pub fn new() -> Self {
        Self {
            client: IsahcWebPushClient::new().expect("Failed to create WebPushClient"),
            subscriptions: Arc::new(RwLock::new(Vec::new())),
        }
    }

    /// Reload subscriptions from storage
    pub async fn reload_subscriptions(&self) -> Result<(), String> {
        let subs = get_push_subscriptions()?;
        let mut cache = self.subscriptions.write().await;
        *cache = subs;
        log::debug!("Reloaded {} push subscriptions", cache.len());
        Ok(())
    }

    /// Get the current subscription count
    pub async fn subscription_count(&self) -> usize {
        self.subscriptions.read().await.len()
    }

    /// Send a notification to all subscribed clients for a given event type
    pub async fn notify(
        &self,
        event_type: PushEventType,
        payload: NotificationPayload,
    ) -> Result<NotificationResult, String> {
        // Ensure subscriptions are loaded
        if self.subscriptions.read().await.is_empty() {
            self.reload_subscriptions().await?;
        }

        let subscriptions = self.subscriptions.read().await.clone();
        let mut result = NotificationResult::default();

        if subscriptions.is_empty() {
            log::debug!("No push subscriptions, skipping notification");
            return Ok(result);
        }

        // Serialize the payload
        let payload_json = serde_json::to_string(&payload)
            .map_err(|e| format!("Failed to serialize payload: {}", e))?;

        for subscription in subscriptions {
            // Check if this event type is enabled for this subscription
            if !event_type.is_enabled(&subscription.settings) {
                result.skipped += 1;
                continue;
            }

            // Try to send the notification
            match self
                .send_to_subscription(&subscription, &payload_json)
                .await
            {
                Ok(()) => {
                    result.sent += 1;
                    log::debug!("Sent push notification to subscription {}", subscription.id);
                }
                Err(e) => {
                    result.failed += 1;
                    log::warn!(
                        "Failed to send push notification to {}: {}",
                        subscription.id,
                        e
                    );

                    // If the subscription is invalid (410 Gone), remove it
                    if e.contains("410") || e.contains("expired") || e.contains("NotFound") {
                        log::info!("Removing expired subscription {}", subscription.id);
                        let _ = remove_push_subscription(&subscription.id);
                        result.removed += 1;
                    }
                }
            }
        }

        // Reload subscriptions if any were removed
        if result.removed > 0 {
            self.reload_subscriptions().await?;
        }

        log::info!(
            "Push notification result: {} sent, {} skipped, {} failed, {} removed",
            result.sent,
            result.skipped,
            result.failed,
            result.removed
        );

        Ok(result)
    }

    /// Send a notification to a single subscription
    async fn send_to_subscription(
        &self,
        subscription: &PushSubscription,
        payload: &str,
    ) -> Result<(), String> {
        // Create subscription info with base64-encoded keys
        let subscription_info = SubscriptionInfo::new(
            &subscription.endpoint,
            &subscription.keys.p256dh,
            &subscription.keys.auth,
        );

        // Get VAPID keys for signing
        let vapid_keys = get_or_create_vapid_keys()?;

        // Create VAPID signature builder from base64-encoded private key
        // We need to use URL_SAFE encoding for the web-push crate
        let sig_builder = VapidSignatureBuilder::from_base64(
            &vapid_keys.private_key,
            URL_SAFE_NO_PAD,
            &subscription_info,
        )
        .map_err(|e| format!("Failed to create VAPID signature builder: {:?}", e))?;

        // Build the message
        let mut builder = WebPushMessageBuilder::new(&subscription_info);
        builder.set_payload(ContentEncoding::Aes128Gcm, payload.as_bytes());

        // Add VAPID signature
        let signature = sig_builder
            .build()
            .map_err(|e| format!("Failed to build VAPID signature: {:?}", e))?;
        builder.set_vapid_signature(signature);

        let message = builder
            .build()
            .map_err(|e| format!("Failed to build push message: {:?}", e))?;

        // Send the notification
        self.client
            .send(message)
            .await
            .map_err(|e: WebPushError| match e {
                WebPushError::EndpointNotValid => "Endpoint not valid".to_string(),
                WebPushError::EndpointNotFound => "Endpoint not found (410)".to_string(),
                WebPushError::Unauthorized => "Unauthorized".to_string(),
                WebPushError::ServerError(retry_after) => {
                    format!("Server error, retry after: {:?}", retry_after)
                }
                _ => format!("Push error: {:?}", e),
            })?;

        Ok(())
    }

    /// Send a test notification to a specific subscription
    pub async fn send_test(&self, subscription_id: &str) -> Result<(), String> {
        // Reload to get fresh subscriptions
        self.reload_subscriptions().await?;

        let subscriptions = self.subscriptions.read().await;
        let subscription = subscriptions
            .iter()
            .find(|s| s.id == subscription_id)
            .ok_or_else(|| format!("Subscription {} not found", subscription_id))?
            .clone();
        drop(subscriptions);

        let payload =
            NotificationPayload::new("Ralph UI Test", "Push notifications are working correctly!")
                .with_tag("test");

        let payload_json = serde_json::to_string(&payload)
            .map_err(|e| format!("Failed to serialize payload: {}", e))?;

        self.send_to_subscription(&subscription, &payload_json)
            .await
    }
}

impl Default for PushNotifier {
    fn default() -> Self {
        Self::new()
    }
}

/// Result of sending notifications
#[derive(Debug, Default)]
pub struct NotificationResult {
    /// Number of notifications sent successfully
    pub sent: usize,
    /// Number of subscriptions skipped (event type disabled)
    pub skipped: usize,
    /// Number of notifications that failed to send
    pub failed: usize,
    /// Number of subscriptions removed (expired/invalid)
    pub removed: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_notification_result_default() {
        let result = NotificationResult::default();
        assert_eq!(result.sent, 0);
        assert_eq!(result.skipped, 0);
        assert_eq!(result.failed, 0);
        assert_eq!(result.removed, 0);
    }

    #[tokio::test]
    async fn test_push_notifier_creation() {
        let notifier = PushNotifier::new();
        assert_eq!(notifier.subscription_count().await, 0);
    }
}
