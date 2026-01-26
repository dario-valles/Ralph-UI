// Chat feature constants and configuration

/** Paste preview configuration */
export const PASTE_CONFIG = {
  /** Number of lines that trigger multiline paste handling (2+ lines = multiline) */
  PREVIEW_THRESHOLD: 2,
  /** Maximum content length to show in preview */
  MAX_PREVIEW_LENGTH: 5000,
  /** Maximum characters for first line preview in collapsed chip */
  FIRST_LINE_PREVIEW_MAX: 50,
} as const
