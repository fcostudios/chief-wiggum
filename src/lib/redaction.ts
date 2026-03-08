export interface RedactionRule {
  name: string;
  pattern: RegExp;
  replacement: string;
}

export interface RedactionFinding {
  ruleName: string;
  index: number;
  preview: string;
}

export interface RedactionResult {
  content: string;
  findings: RedactionFinding[];
  redactionCount: number;
}

export const DEFAULT_RULES: RedactionRule[] = [
  {
    name: 'generic-api-key',
    pattern: /\b(?:sk|pk|api)_[a-zA-Z0-9_\-]{20,}/g,
    replacement: '[API_KEY REDACTED]',
  },
  {
    name: 'bearer-token',
    pattern: /\bBearer\s+[A-Za-z0-9\-._~+/=]{20,}/g,
    replacement: 'Bearer [TOKEN REDACTED]',
  },
  {
    name: 'aws-access-key',
    pattern: /\bAKIA[A-Z0-9]{16}\b/g,
    replacement: '[AWS_KEY REDACTED]',
  },
  {
    name: 'jwt',
    pattern: /\beyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_.+/=]+\b/g,
    replacement: '[JWT REDACTED]',
  },
  {
    name: 'private-key',
    pattern:
      /-----BEGIN (?:[A-Z ]+)?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z ]+)?PRIVATE KEY-----/g,
    replacement: '[PRIVATE_KEY REDACTED]',
  },
  {
    name: 'connection-string',
    pattern:
      /\b(?:mongodb|postgres|postgresql|mysql|redis|amqp|amqps):\/\/[A-Za-z0-9._~-]+:[^\s@"'<>]+@[^\s"'<>]+/g,
    replacement: '[CONNECTION_STRING REDACTED]',
  },
  {
    name: 'password-field',
    pattern: /\b(?:password|secret|passwd|pwd)\s*[:=]\s*["'][^"']{6,}["']/gi,
    replacement: '[PASSWORD REDACTED]',
  },
  {
    name: 'github-token',
    pattern: /\bgh[ps]_[A-Za-z0-9]{36,}/g,
    replacement: '[GITHUB_TOKEN REDACTED]',
  },
  {
    name: 'anthropic-key',
    pattern: /\bsk-ant-[A-Za-z0-9\-_]{20,}/g,
    replacement: '[ANTHROPIC_KEY REDACTED]',
  },
];

export function redactSecrets(
  content: string,
  extraRules: RedactionRule[] = [],
): RedactionResult {
  const rules = [...DEFAULT_RULES, ...extraRules];
  const findings: RedactionFinding[] = [];
  let redactionCount = 0;
  let result = content;

  for (const rule of rules) {
    rule.pattern.lastIndex = 0;

    result = result.replace(rule.pattern, (match, ...args) => {
      const offset = args[args.length - 2] as number;
      findings.push({
        ruleName: rule.name,
        index: offset,
        preview: match.slice(0, 20),
      });
      redactionCount += 1;
      return rule.replacement;
    });

    rule.pattern.lastIndex = 0;
  }

  return { content: result, findings, redactionCount };
}
