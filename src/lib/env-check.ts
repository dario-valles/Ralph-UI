/**
 * Environment detection utilities.
 *
 * Previously this checked for Tauri desktop environment, but the app
 * now runs exclusively as a browser-based client connecting to the
 * Rust/Axum backend server.
 */

/** Always false - app is browser-only now */
export const isDesktopApp = false

/** @deprecated Use isDesktopApp instead. Always returns false. */
export const isTauri = false
