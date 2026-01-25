// Chat feature constants and configuration

/** Paste preview configuration */
export const PASTE_CONFIG = {
  /** Number of lines that trigger the paste preview dialog */
  PREVIEW_THRESHOLD: 3,
  /** Maximum content length to show in preview */
  MAX_PREVIEW_LENGTH: 5000,
} as const

/** Supported programming languages for code blocks */
export const CODE_LANGUAGES = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'python', label: 'Python' },
  { value: 'rust', label: 'Rust' },
  { value: 'go', label: 'Go' },
  { value: 'java', label: 'Java' },
  { value: 'csharp', label: 'C#' },
  { value: 'cpp', label: 'C++' },
  { value: 'c', label: 'C' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'php', label: 'PHP' },
  { value: 'swift', label: 'Swift' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'sql', label: 'SQL' },
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'bash', label: 'Bash' },
  { value: 'shell', label: 'Shell' },
] as const

/** Common code patterns for auto-detection */
export const CODE_PATTERNS = {
  /** TypeScript/JavaScript patterns */
  typescript: [
    /^import\s+/m,
    /^export\s+(default\s+)?(function|const|class|interface|type)/m,
    /^(const|let|var)\s+\w+\s*[:=]/m,
    /^(async\s+)?function\s+\w+/m,
    /^class\s+\w+/m,
    /^interface\s+\w+/m,
    /^type\s+\w+\s*=/m,
    /:\s*(string|number|boolean|any)\s*[;,)=]/,
  ],
  /** Python patterns */
  python: [
    /^(from|import)\s+\w+/m,
    /^def\s+\w+\s*\(/m,
    /^class\s+\w+(\(.*\))?:/m,
    /^if\s+__name__\s*==\s*['"]__main__['"]/m,
    /^\s*@\w+/m,
    /:\s*$/m,
  ],
  /** Rust patterns */
  rust: [
    /^(pub\s+)?(fn|struct|enum|impl|trait|mod|use)\s+/m,
    /^#\[derive/m,
    /^let\s+(mut\s+)?\w+\s*(:\s*\w+)?\s*=/m,
    /->.*\{$/m,
    /&(mut\s+)?self/,
  ],
  /** Go patterns */
  go: [
    /^package\s+\w+/m,
    /^import\s+(\(|")/m,
    /^func\s+(\(\w+\s+\*?\w+\)\s+)?\w+\s*\(/m,
    /^type\s+\w+\s+(struct|interface)/m,
    /:=\s*$/m,
  ],
  /** JSON patterns */
  json: [/^\s*\{[\s\S]*"[\w-]+":/m, /^\s*\[[\s\S]*\{/m],
  /** YAML patterns */
  yaml: [/^\w+:\s*$/m, /^\s*-\s+\w+:/m, /^---\s*$/m],
  /** SQL patterns */
  sql: [/^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\s+/im, /^FROM\s+\w+/im, /^WHERE\s+/im],
  /** HTML patterns */
  html: [
    /^<!DOCTYPE\s+html/i,
    /^<html/i,
    /<\/\w+>\s*$/m,
    /^<(div|span|p|h[1-6]|ul|li|table|form)/im,
  ],
  /** CSS patterns */
  css: [
    /^\s*\.\w+\s*\{/m,
    /^\s*#\w+\s*\{/m,
    /^\s*@(media|import|keyframes)/m,
    /:\s*(px|em|rem|%|vh|vw)/,
  ],
  /** Bash/Shell patterns */
  bash: [/^#!/m, /^\$\s*\w+=/m, /^(if|for|while|case)\s+/m, /\|\s*\w+/, /&&\s*\w+/],
} as const
