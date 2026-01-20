/**
 * Check if the app is running inside Tauri (native desktop environment).
 * Use this instead of duplicating the check everywhere.
 */
export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
