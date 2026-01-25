//! Authentication middleware for the server
//!
//! Validates Bearer tokens on all requests except health checks.

use axum::{
    body::Body,
    extract::Request,
    http::{header::AUTHORIZATION, Method, StatusCode},
    response::Response,
};
use std::sync::Arc;
use tower::Layer;

/// Authentication layer that validates Bearer tokens
#[derive(Clone)]
pub struct AuthLayer {
    token: Arc<String>,
}

impl AuthLayer {
    pub fn new(token: String) -> Self {
        Self {
            token: Arc::new(token),
        }
    }
}

impl<S> Layer<S> for AuthLayer {
    type Service = AuthMiddleware<S>;

    fn layer(&self, inner: S) -> Self::Service {
        AuthMiddleware {
            inner,
            token: self.token.clone(),
        }
    }
}

/// The actual middleware service
#[derive(Clone)]
pub struct AuthMiddleware<S> {
    inner: S,
    token: Arc<String>,
}

impl<S> tower::Service<Request> for AuthMiddleware<S>
where
    S: tower::Service<Request, Response = Response> + Clone + Send + 'static,
    S::Future: Send + 'static,
{
    type Response = S::Response;
    type Error = S::Error;
    type Future = std::pin::Pin<
        Box<dyn std::future::Future<Output = Result<Self::Response, Self::Error>> + Send>,
    >;

    fn poll_ready(
        &mut self,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, req: Request) -> Self::Future {
        let token = self.token.clone();
        let mut inner = self.inner.clone();

        Box::pin(async move {
            let path = req.uri().path();
            let method = req.method().clone();

            // Skip auth for CORS preflight OPTIONS requests
            if method == Method::OPTIONS {
                return inner.call(req).await;
            }

            // Only require auth for API and WebSocket endpoints
            // All other paths (static files, index.html, etc.) are public
            let requires_auth = path.starts_with("/api/") || path.starts_with("/ws/");

            if !requires_auth {
                return inner.call(req).await;
            }

            // For WebSocket endpoints, check query parameter (browsers can't set headers on WS)
            if path.starts_with("/ws/") {
                if let Some(query) = req.uri().query() {
                    if query.contains(&format!("token={}", *token)) {
                        return inner.call(req).await;
                    }
                }
            }

            // Check Authorization header for API endpoints
            if let Some(auth_header) = req.headers().get(AUTHORIZATION) {
                if let Ok(auth_str) = auth_header.to_str() {
                    if auth_str.starts_with("Bearer ") {
                        let provided_token = &auth_str[7..];
                        if provided_token == token.as_str() {
                            return inner.call(req).await;
                        }
                    }
                }
            }

            // Unauthorized
            Ok(Response::builder()
                .status(StatusCode::UNAUTHORIZED)
                .body(Body::from("Unauthorized: Invalid or missing Bearer token"))
                .unwrap())
        })
    }
}

/// Generate a secure random auth token
pub fn generate_auth_token() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let bytes: [u8; 16] = rng.gen();
    hex::encode(&bytes)
}

// We need hex crate, but we can use a simple implementation
mod hex {
    const HEX_CHARS: &[u8; 16] = b"0123456789abcdef";

    pub fn encode(bytes: &[u8]) -> String {
        let mut result = String::with_capacity(bytes.len() * 2);
        for &byte in bytes {
            result.push(HEX_CHARS[(byte >> 4) as usize] as char);
            result.push(HEX_CHARS[(byte & 0xf) as usize] as char);
        }
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_auth_token() {
        let token = generate_auth_token();
        assert_eq!(token.len(), 32); // 16 bytes = 32 hex chars
        assert!(token.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn test_hex_encode() {
        assert_eq!(hex::encode(&[0x00, 0xff, 0xab]), "00ffab");
        assert_eq!(hex::encode(&[0x12, 0x34]), "1234");
    }
}
