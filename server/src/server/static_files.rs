//! Static file serving for embedded frontend assets
//!
//! Uses rust-embed to bundle the frontend dist/ folder into the binary,
//! enabling single-binary distribution via npx.

use axum::{
    body::Body,
    http::{header, Request, Response, StatusCode},
    response::IntoResponse,
};
use rust_embed::Embed;

/// Embedded frontend assets from the dist/ folder
/// This is populated at compile time from ../dist/
#[derive(Embed)]
#[folder = "../dist/"]
struct FrontendAssets;

/// Serve embedded static files
/// Returns the file if found, or falls back to index.html for SPA routing
pub async fn serve_static(req: Request<Body>) -> impl IntoResponse {
    let path = req.uri().path().trim_start_matches('/');

    // Try to serve the exact path
    if let Some(response) = serve_file(path) {
        return response;
    }

    // For SPA routing, serve index.html for non-asset paths
    if !path.contains('.') || path.ends_with(".html") {
        if let Some(response) = serve_file("index.html") {
            return response;
        }
    }

    // 404 for truly missing files
    Response::builder()
        .status(StatusCode::NOT_FOUND)
        .body(Body::from("Not found"))
        .unwrap()
}

/// Serve a specific file from embedded assets
fn serve_file(path: &str) -> Option<Response<Body>> {
    let file = FrontendAssets::get(path)?;

    let mime_type = mime_guess::from_path(path)
        .first_or_octet_stream()
        .to_string();

    // Set cache headers based on file type
    let cache_control =
        if path.contains("/assets/") || path.ends_with(".js") || path.ends_with(".css") {
            // Hashed assets can be cached for a long time
            "public, max-age=31536000, immutable"
        } else {
            // HTML and other files should be revalidated
            "public, max-age=0, must-revalidate"
        };

    Some(
        Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, mime_type)
            .header(header::CACHE_CONTROL, cache_control)
            .body(Body::from(file.data.into_owned()))
            .unwrap(),
    )
}

/// Check if frontend assets are embedded (i.e., dist/ was present at compile time)
pub fn has_embedded_frontend() -> bool {
    FrontendAssets::get("index.html").is_some()
}
