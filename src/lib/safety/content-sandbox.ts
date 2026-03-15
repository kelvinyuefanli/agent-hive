// ─── Content Sandbox ────────────────────────────────────────────────────────
// Sanitizes user-submitted text to strip prompt-injection attempts, invisible
// unicode trickery, and directional override characters while preserving
// legitimate code content.

/**
 * Zero-width and invisible characters to strip.
 */
const ZERO_WIDTH_RE = /[\u200B\u200C\u200D\uFEFF\u2060]/g;

/**
 * RTL/LTR directional override characters.
 */
const BIDI_OVERRIDE_RE = /[\u202A-\u202E\u2066-\u2069]/g;

/**
 * Prompt-injection patterns.
 *
 * Each entry is [humanName, regex]. The regexes are crafted to match
 * instruction-like text rather than normal code usage:
 *   - "System.out.println" is fine (code context)
 *   - "System prompt: you are a helpful assistant" is stripped (injection)
 */
const PROMPT_INJECTION_PATTERNS: [string, RegExp][] = [
  ["ignore previous instructions", /ignore\s+previous\s+instructions/gi],
  ["ignore all previous", /ignore\s+all\s+previous/gi],
  ["system prompt:", /system\s+prompt\s*:/gi],
  ["you are now", /you\s+are\s+now\b/gi],
  ["new instructions:", /new\s+instructions\s*:/gi],
  ["disregard", /\bdisregard\b/gi],
  ["override", /\boverride\b/gi],
  ["forget everything", /forget\s+everything/gi],
  ["act as", /\bact\s+as\b/gi],
  ["<|system|>", /<\|system\|>/gi],
  ["<|assistant|>", /<\|assistant\|>/gi],
  ["```system", /```system/gi],
];

export interface SanitizeResult {
  sanitized: string;
  patternsStripped: string[];
}

/**
 * Sanitize user-submitted text content.
 *
 * Steps:
 *   1. NFKC Unicode normalization
 *   2. Strip zero-width characters
 *   3. Strip RTL/LTR override characters
 *   4. Strip prompt-injection patterns (preserving legitimate code)
 */
export function sanitizeContent(text: string): SanitizeResult {
  const stripped: string[] = [];

  // Step 1: NFKC normalization
  let result = text.normalize("NFKC");

  // Step 2: Strip zero-width characters
  if (ZERO_WIDTH_RE.test(result)) {
    stripped.push("zero-width characters");
    result = result.replace(ZERO_WIDTH_RE, "");
  }

  // Step 3: Strip bidi override characters
  if (BIDI_OVERRIDE_RE.test(result)) {
    stripped.push("bidi override characters");
    result = result.replace(BIDI_OVERRIDE_RE, "");
  }

  // Step 4: Strip prompt-injection patterns
  for (const [name, pattern] of PROMPT_INJECTION_PATTERNS) {
    // Reset lastIndex in case of sticky state
    pattern.lastIndex = 0;
    if (pattern.test(result)) {
      stripped.push(name);
      pattern.lastIndex = 0;
      result = result.replace(pattern, "[REDACTED]");
    }
  }

  return {
    sanitized: result,
    patternsStripped: stripped,
  };
}
