//! Push notification module for Ralph UI
//!
//! Provides Web Push notification support for real-time updates
//! even when the browser is closed.

pub mod notifier;
pub mod storage;
pub mod types;
pub mod vapid;

pub use notifier::{NotificationResult, PushNotifier};
pub use storage::{
    get_push_subscription, get_push_subscription_settings, get_push_subscriptions,
    remove_push_subscription, remove_push_subscription_by_endpoint, save_push_subscription,
    update_push_subscription_settings,
};
pub use types::{
    NotificationPayload, PushEventType, PushNotificationSettings, PushSubscription,
    PushSubscriptionKeys,
};
pub use vapid::{get_or_create_vapid_keys, get_vapid_public_key, VapidKeys};
