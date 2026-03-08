import { describe, expect, it } from 'vitest';
import { redactSecrets, DEFAULT_RULES } from './redaction';

describe('redactSecrets — no-op', () => {
  it('returns unchanged content when no secrets present', () => {
    const result = redactSecrets('Hello world, no secrets here.');
    expect(result.content).toBe('Hello world, no secrets here.');
    expect(result.redactionCount).toBe(0);
    expect(result.findings).toHaveLength(0);
  });

  it('returns unchanged content for empty string', () => {
    const result = redactSecrets('');
    expect(result.content).toBe('');
    expect(result.redactionCount).toBe(0);
  });
});

describe('redactSecrets — pattern 1: generic API keys', () => {
  it('redacts sk_ prefixed keys', () => {
    const result = redactSecrets('key=sk_demo_abcdefghijklmnopqrstuvwxyz12345');
    expect(result.content).not.toContain('sk_demo_abcdefghijklmnopqrstuvwxyz12345');
    expect(result.redactionCount).toBeGreaterThan(0);
  });

  it('redacts pk_ prefixed keys', () => {
    const result = redactSecrets('token: pk_demo_aBcDeFgHiJkLmNoPqRsTuVwXyZ');
    expect(result.content).not.toContain('pk_demo_aBcDeFgHiJkLmNoPqRsTuVwXyZ');
  });

  it('redacts api_ prefixed keys', () => {
    const result = redactSecrets('api_key=api_prod_123456789012345678901234');
    expect(result.content).not.toContain('api_prod_123456789012345678901234');
  });
});

describe('redactSecrets — pattern 2: Bearer tokens', () => {
  it('redacts Bearer token in Authorization header', () => {
    const result = redactSecrets(
      'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abc123',
    );
    expect(result.content).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abc123');
    expect(result.redactionCount).toBeGreaterThan(0);
  });
});

describe('redactSecrets — pattern 3: AWS keys', () => {
  it('redacts AWS access key IDs', () => {
    const result = redactSecrets('AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE');
    expect(result.content).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(result.redactionCount).toBeGreaterThan(0);
  });
});

describe('redactSecrets — pattern 4: JWTs', () => {
  it('redacts JWT tokens (3 base64 segments)', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyMSJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const result = redactSecrets(`token: ${jwt}`);
    expect(result.content).not.toContain(jwt);
    expect(result.redactionCount).toBeGreaterThan(0);
  });
});

describe('redactSecrets — pattern 5: private keys', () => {
  it('redacts PEM private keys', () => {
    const pem =
      '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----';
    const result = redactSecrets(pem);
    expect(result.content).not.toContain('MIIEowIBAAKCAQEA');
    expect(result.redactionCount).toBeGreaterThan(0);
  });
});

describe('redactSecrets — pattern 6: connection strings', () => {
  it('redacts mongodb connection string', () => {
    const result = redactSecrets('db: mongodb://admin:password@localhost:27017/mydb');
    expect(result.content).not.toContain('mongodb://admin:password@localhost:27017/mydb');
    expect(result.redactionCount).toBeGreaterThan(0);
  });

  it('redacts postgres connection string', () => {
    const result = redactSecrets('DATABASE_URL=postgres://user:pass@host:5432/dbname');
    expect(result.content).not.toContain('postgres://user:pass@host:5432/dbname');
    expect(result.redactionCount).toBeGreaterThan(0);
  });
});

describe('redactSecrets — pattern 7: password fields', () => {
  it('redacts password: "value" pattern', () => {
    const result = redactSecrets('password: "super_secret_pass_123"');
    expect(result.content).not.toContain('super_secret_pass_123');
    expect(result.redactionCount).toBeGreaterThan(0);
  });

  it("redacts secret = 'value' pattern", () => {
    const result = redactSecrets("secret = 'my_api_secret_key_here'");
    expect(result.content).not.toContain('my_api_secret_key_here');
    expect(result.redactionCount).toBeGreaterThan(0);
  });
});

describe('redactSecrets — pattern 8: GitHub tokens', () => {
  it('redacts ghp_ personal access tokens', () => {
    const result = redactSecrets('GITHUB_TOKEN=ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcde123456');
    expect(result.content).not.toContain('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcde123456');
    expect(result.redactionCount).toBeGreaterThan(0);
  });

  it('redacts ghs_ server tokens', () => {
    const result = redactSecrets('token: ghs_ABCDEFGHIJKLMNOPQRSTUVWXYZabcde123456');
    expect(result.content).not.toContain('ghs_ABCDEFGHIJKLMNOPQRSTUVWXYZabcde123456');
    expect(result.redactionCount).toBeGreaterThan(0);
  });
});

describe('redactSecrets — pattern 9: Anthropic keys', () => {
  it('redacts sk-ant- prefixed keys', () => {
    const result = redactSecrets(
      'ANTHROPIC_API_KEY=sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890ABCDEF',
    );
    expect(result.content).not.toContain('sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890ABCDEF');
    expect(result.redactionCount).toBeGreaterThan(0);
  });
});

describe('redactSecrets — mixed content', () => {
  it('redacts all 3 different secret types in one string', () => {
    const content = [
      'Setting up auth:',
      'AWS_KEY=AKIAIOSFODNN7EXAMPLE',
      'GH_TOKEN=ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcde123456',
      'API=sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890ABCDEF',
      'End of config.',
    ].join('\n');
    const result = redactSecrets(content);
    expect(result.redactionCount).toBeGreaterThanOrEqual(3);
    expect(result.content).toContain('Setting up auth:');
    expect(result.content).toContain('End of config.');
    expect(result.content).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(result.content).not.toContain('ghp_ABCDE');
    expect(result.content).not.toContain('sk-ant-api03');
  });
});

describe('redactSecrets — false positive checks', () => {
  it('does not redact short sk_ variable names in code', () => {
    const result = redactSecrets('const sk = getKey(); const sk_val = 5;');
    expect(result.content).toContain('sk_val = 5');
  });

  it('does not redact plain URL without credentials', () => {
    const result = redactSecrets('Visit https://example.com for docs.');
    expect(result.content).toBe('Visit https://example.com for docs.');
    expect(result.redactionCount).toBe(0);
  });
});

describe('redactSecrets — findings metadata', () => {
  it('reports finding with name and position', () => {
    const result = redactSecrets('key: AKIAIOSFODNN7EXAMPLE');
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings[0].ruleName).toBeTruthy();
  });
});

describe('redactSecrets — custom rules', () => {
  it('applies custom rules in addition to defaults', () => {
    const customRule = {
      name: 'custom-secret',
      pattern: /MYSECRET_[A-Z0-9]{10}/g,
      replacement: '[CUSTOM REDACTED]',
    };
    const result = redactSecrets('token: MYSECRET_ABCDE12345 done', [customRule]);
    expect(result.content).toContain('[CUSTOM REDACTED]');
    expect(result.content).not.toContain('MYSECRET_ABCDE12345');
  });

  it('default rules still apply when custom rules given', () => {
    const customRule = {
      name: 'custom-secret',
      pattern: /MYSECRET/g,
      replacement: '[REDACTED]',
    };
    const result = redactSecrets('ANTHROPIC_API_KEY=sk-ant-api03-abc12345678901234567890', [
      customRule,
    ]);
    expect(result.content).not.toContain('sk-ant-api03');
  });
});

describe('redactSecrets — performance', () => {
  it('redacts 1000 messages with 50 secrets in under 100ms', () => {
    const secret = 'AKIAIOSFODNN7EXAMPLE';
    const messages = Array.from({ length: 1000 }, (_, i) =>
      i % 20 === 0 ? `message with AWS key: ${secret}` : 'regular message content here',
    );
    const bigContent = messages.join('\n');

    const start = performance.now();
    const result = redactSecrets(bigContent);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(100);
    expect(result.redactionCount).toBeGreaterThanOrEqual(50);
  });
});

describe('DEFAULT_RULES', () => {
  it('exports exactly 9 rules', () => {
    expect(DEFAULT_RULES).toHaveLength(9);
  });

  it('all rules have name, pattern, and replacement', () => {
    for (const rule of DEFAULT_RULES) {
      expect(rule.name).toBeTruthy();
      expect(rule.pattern).toBeInstanceOf(RegExp);
      expect(rule.replacement).toBeTruthy();
    }
  });

  it('all patterns have the global flag', () => {
    for (const rule of DEFAULT_RULES) {
      expect(rule.pattern.flags).toContain('g');
    }
  });
});
