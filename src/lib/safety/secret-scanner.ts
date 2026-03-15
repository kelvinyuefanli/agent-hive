// ─── Secret Scanner ─────────────────────────────────────────────────────────
// Detects credentials, tokens, and secret material in text content.
// CRITICAL: NEVER log or expose matched values. Only report pattern names.

interface SecretPattern {
  name: string;
  regex: RegExp;
}

const SECRET_PATTERNS: SecretPattern[] = [
  {
    name: "AWS Access Key",
    regex: /AKIA[0-9A-Z]{16}/,
  },
  {
    name: "AWS Secret Key",
    regex: /(?:aws_secret|aws_secret_access_key|secret_key)\s*[:=]\s*["']?([A-Za-z0-9/+=]{40})["']?/i,
  },
  {
    name: "GitHub Token",
    regex: /gh[ps]_[A-Za-z0-9_]{36,}/,
  },
  {
    name: "GitHub Fine-grained Token",
    regex: /github_pat_[A-Za-z0-9_]{22,}/,
  },
  {
    name: "Stripe Secret Key",
    regex: /sk_live_[A-Za-z0-9]{24,}/,
  },
  {
    name: "Stripe Restricted Key",
    regex: /rk_live_[A-Za-z0-9]{24,}/,
  },
  {
    name: "Generic API Key",
    regex: /(?:api[_-]?key|token|secret|password)\s*[:=]\s*["']?([A-Za-z0-9_-]{32,})["']?/i,
  },
  {
    name: "Database URL",
    regex: /(?:postgres|mysql|mongodb):\/\/[^\s"']+:[^\s"']+@/,
  },
  {
    name: "JWT Token",
    regex: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
  },
  {
    name: "Private Key",
    regex: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/,
  },
  {
    name: "Slack Token",
    regex: /xox[bpras]-[A-Za-z0-9-]+/,
  },
  {
    name: "SendGrid Key",
    regex: /SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/,
  },
];

export interface SecretScanResult {
  found: boolean;
  patterns: string[];
}

/**
 * Scan text for known secret patterns.
 *
 * Returns which pattern types matched. NEVER logs or returns the actual
 * secret values—only the pattern names.
 */
export function scanForSecrets(text: string): SecretScanResult {
  const matched: string[] = [];

  for (const pattern of SECRET_PATTERNS) {
    if (pattern.regex.test(text)) {
      matched.push(pattern.name);
    }
  }

  return {
    found: matched.length > 0,
    patterns: matched,
  };
}
