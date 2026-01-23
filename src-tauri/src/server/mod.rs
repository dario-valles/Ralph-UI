//! HTTP/WebSocket server for browser-based access to Ralph UI
//!
//! This module provides server mode that allows accessing Ralph UI
//! from a browser instead of the native Tauri application.

mod auth;
mod events;
mod proxy;
mod state;

pub use auth::{generate_auth_token, AuthLayer};
pub use events::{EventBroadcaster, ServerEvent};
pub use proxy::invoke_handler;
pub use state::ServerAppState;

use axum::{
    routing::{get, post},
    Router,
};
use std::net::SocketAddr;
use tokio::net::TcpListener;
use tower_http::cors::{Any, CorsLayer};

/// Run the HTTP/WebSocket server
pub async fn run_server(port: u16, bind: &str, state: ServerAppState) -> Result<(), String> {
    // Build CORS layer - permissive for development
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Build the router
    let app = Router::new()
        .route("/api/invoke", post(proxy::invoke_handler))
        .route("/ws/events", get(events::ws_handler))
        .route("/health", get(health_handler))
        .route("/", get(index_handler))
        .layer(cors)
        .layer(AuthLayer::new(state.auth_token.clone()))
        .with_state(state.clone());

    let addr: SocketAddr = format!("{}:{}", bind, port)
        .parse()
        .map_err(|e| format!("Invalid address: {}", e))?;

    println!("\n╔══════════════════════════════════════════════════════════════╗");
    println!("║                    Ralph UI Server Mode                       ║");
    println!("╠══════════════════════════════════════════════════════════════╣");
    println!("║                                                               ║");
    println!("║  Server URL: http://{}:{:<24}  ║", bind, port);
    println!("║                                                               ║");
    println!("║  Auth Token: {}  ║", state.auth_token);
    println!("║                                                               ║");
    println!("║  Endpoints:                                                   ║");
    println!("║    POST /api/invoke  - Command proxy                         ║");
    println!("║    GET  /ws/events   - WebSocket events                      ║");
    println!("║    GET  /health      - Health check                          ║");
    println!("║                                                               ║");
    println!("╚══════════════════════════════════════════════════════════════╝\n");

    let listener = TcpListener::bind(addr)
        .await
        .map_err(|e| format!("Failed to bind to {}: {}", addr, e))?;

    log::info!("Server listening on http://{}", addr);

    axum::serve(listener, app)
        .await
        .map_err(|e| format!("Server error: {}", e))
}

/// Health check endpoint
async fn health_handler() -> &'static str {
    "OK"
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
