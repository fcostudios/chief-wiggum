import { describe, expect, it } from 'vitest';
import { languageKeyForFilePath } from './EditorTakeover';

describe('EditorTakeover languageKeyForFilePath', () => {
  it('maps common code extensions', () => {
    expect(languageKeyForFilePath('src/main.ts')).toBe('javascript');
    expect(languageKeyForFilePath('src/view.tsx')).toBe('javascript');
    expect(languageKeyForFilePath('src/app.rs')).toBe('rust');
    expect(languageKeyForFilePath('config/settings.json')).toBe('json');
  });

  it('maps config and shell-like files', () => {
    expect(languageKeyForFilePath('.env')).toBe('shell');
    expect(languageKeyForFilePath('.env.local')).toBe('shell');
    expect(languageKeyForFilePath('Dockerfile')).toBe('shell');
    expect(languageKeyForFilePath('Makefile')).toBe('shell');
    expect(languageKeyForFilePath('scripts/dev.sh')).toBe('shell');
    expect(languageKeyForFilePath('compose.yaml')).toBe('yaml');
    expect(languageKeyForFilePath('Cargo.toml')).toBe('toml');
  });

  it('returns null when extension is unsupported', () => {
    expect(languageKeyForFilePath('assets/logo.bin')).toBeNull();
  });
});
