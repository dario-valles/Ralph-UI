//! HTTP/WebSocket server for browser-based access to Ralph UI
//!
//! This module provides server mode that allows accessing Ralph UI
//! from a browser instead of the native Tauri application.

mod auth;
mod events;
mod file_watcher;
mod proxy;
mod pty;
pub mod pty_registry;
pub mod routes;
pub mod state;
mod static_files;

pub use auth::{generate_auth_token, AuthLayer};
pub use events::{EventBroadcaster, ServerEvent};
pub use file_watcher::{ServerFileWatcher, WatchFileResponse};
pub use proxy::invoke_handler;
pub use pty_registry::PtyRegistry;
pub use state::ServerAppState;

use axum::{
    http::{
        header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE},
        HeaderValue,
    },
    routing::{get, post},
    Json, Router,
};

/// Version information for the server
#[derive(serde::Serialize)]
struct VersionInfo {
    version: String,
    release_url: String,
}
use std::net::SocketAddr;
use tokio::net::TcpListener;
use tower_http::cors::{Any, CorsLayer};

/// Run the HTTP/WebSocket server
pub async fn run_server(
    port: u16,
    bind: &str,
    state: ServerAppState,
    cors_origins: Option<Vec<String>>,
) -> Result<(), String> {
    // Build CORS layer
    // Must be the outermost layer to handle preflight OPTIONS requests before auth
    // Note: Using explicit headers instead of Any to avoid browser deprecation warnings
    // when Authorization header is used with wildcard
    let cors = match &cors_origins {
        Some(origins) if !origins.is_empty() => {
            // Restricted CORS: only allow specified origins
            let allowed_origins: Vec<HeaderValue> =
                origins.iter().filter_map(|o| o.parse().ok()).collect();
            CorsLayer::new()
                .allow_origin(allowed_origins)
                .allow_methods(Any)
                .allow_headers([AUTHORIZATION, CONTENT_TYPE, ACCEPT])
        }
        _ => {
            // Permissive CORS: allow any origin (default for development)
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers([AUTHORIZATION, CONTENT_TYPE, ACCEPT])
        }
    };

    // Check if embedded frontend is available
    let has_frontend = static_files::has_embedded_frontend();

    // Build the router
    // Layer order: cors (outer) -> auth -> handler
    // This ensures CORS preflight requests are handled before auth check
    // Note: /ws/pty handles its own auth via query param (WebSocket limitation)
    let mut app = Router::new()
        .route("/api/invoke", post(proxy::invoke_handler))
        .route("/ws/events", get(events::ws_handler))
        .route("/ws/pty/:terminal_id", get(pty::pty_ws_handler))
        // PTY reconnection endpoint (US-3)
        .route(
            "/ws/pty/:terminal_id/reconnect/:session_id",
            get(pty::pty_reconnect_handler),
        )
        .route("/health", get(health_handler))
        .route("/api/version", get(version_handler));

    // Serve embedded frontend if available, otherwise show connection instructions
    if has_frontend {
        app = app.fallback(static_files::serve_static);
    } else {
        app = app.route("/", get(index_handler));
    }

    let app = app
        .layer(AuthLayer::new(state.auth_token.clone()))
        .layer(cors)
        .with_state(state.clone());

    let addr: SocketAddr = format!("{}:{}", bind, port)
        .parse()
        .map_err(|e| format!("Invalid address: {}", e))?;

    let cors_display = match &cors_origins {
        Some(origins) if !origins.is_empty() => origins.join(", "),
        _ => "*".to_string(),
    };
    let frontend_status = if has_frontend {
        "Embedded"
    } else {
        "External (use Vite dev server)"
    };

    println!("\n╔══════════════════════════════════════════════════════════════╗");
    println!("║                    Ralph UI Server Mode                       ║");
    println!("╠══════════════════════════════════════════════════════════════╣");
    println!("║                                                               ║");
    println!("║  Server URL: http://{}:{:<24}  ║", bind, port);
    println!("║                                                               ║");
    println!("║  Auth Token: {}  ║", state.auth_token);
    println!("║                                                               ║");
    println!("║  CORS Origins: {:<45}║", cors_display);
    println!("║  Frontend: {:<49}║", frontend_status);
    println!("║                                                               ║");
    println!("║  Endpoints:                                                   ║");
    println!("║    POST /api/invoke      - Command proxy                     ║");
    println!("║    GET  /api/version     - Server version info               ║");
    println!("║    GET  /ws/events       - WebSocket events                  ║");
    println!("║    GET  /ws/pty/:id      - WebSocket PTY terminal            ║");
    println!("║    GET  /health          - Health check                      ║");
    println!("║                                                               ║");
    println!("╚══════════════════════════════════════════════════════════════╝\n");

    let listener = TcpListener::bind(addr)
        .await
        .map_err(|e| format!("Failed to bind to {}: {}", addr, e))?;

    log::info!("Server listening on http://{}", addr);

    // Create shutdown signal that waits for the shutdown state flag
    let shutdown_state = state.shutdown_state.clone();
    let shutdown_signal = async move {
        loop {
            if shutdown_state.is_shutdown_requested() {
                log::info!("Shutdown signal received, stopping server...");
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }
    };

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal)
        .await
        .map_err(|e| format!("Server error: {}", e))
}

/// Health check endpoint
async fn health_handler() -> &'static str {
    "OK"
}

/// Version endpoint - returns server version and release URL
async fn version_handler() -> Json<VersionInfo> {
    Json(VersionInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        release_url: format!(
            "https://github.com/dario-valles/Ralph-UI/releases/tag/v{}",
            env!("CARGO_PKG_VERSION")
        ),
    })
}

/// Index handler - shows connection instructions
async fn index_handler() -> axum::response::Html<&'static str> {
    axum::response::Html(
        r#"<!DOCTYPE html>
<html>
<head>
    <title>Ralph UI Server</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 600px;
            margin: 50px auto;
            padding: 20px;
            background: #1a1a2e;
            color: #eee;
        }
        h1 { color: #4ade80; }
        code {
            background: #2a2a4e;
            padding: 2px 6px;
            border-radius: 4px;
            font-family: 'Monaco', 'Consolas', monospace;
        }
        .endpoint {
            background: #2a2a4e;
            padding: 10px;
            border-radius: 8px;
            margin: 10px 0;
        }
    </style>
</head>
<body>
    <h1>Ralph UI Server</h1>
    <p>The Ralph UI server is running. Connect from the browser UI with your auth token.</p>
    <h2>Endpoints</h2>
    <div class="endpoint">
        <strong>POST /api/invoke</strong><br>
        Command proxy - send commands with <code>Authorization: Bearer &lt;token&gt;</code>
    </div>
    <div class="endpoint">
        <strong>GET /ws/events</strong><br>
        WebSocket for real-time events
    </div>
    <div class="endpoint">
        <strong>GET /health</strong><br>
        Health check endpoint
    </div>
</body>
</html>"#,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_health_handler() {
        // Basic compilation test
    }
}
