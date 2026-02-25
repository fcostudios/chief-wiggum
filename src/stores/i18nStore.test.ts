import { beforeEach, describe, expect, it, vi } from 'vitest';

type I18nStoreModule = typeof import('./i18nStore');

describe('i18nStore', () => {
  let mod: I18nStoreModule;

  beforeEach(async () => {
    vi.resetModules();
    mod = await import('./i18nStore');
  });

  it('starts with English locale', () => {
    expect(mod.currentLocale()).toBe('en');
  });

  it('normalizeLocale returns en for unsupported values', () => {
    expect(mod.normalizeLocale('fr')).toBe('en');
    expect(mod.normalizeLocale(null)).toBe('en');
    expect(mod.normalizeLocale(undefined)).toBe('en');
    expect(mod.normalizeLocale('')).toBe('en');
  });

  it('normalizeLocale returns valid locale unchanged', () => {
    expect(mod.normalizeLocale('en')).toBe('en');
    expect(mod.normalizeLocale('es')).toBe('es');
  });

  it('t() returns English text for known keys', () => {
    const result = mod.t('common.send');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('t() returns the key itself for unknown keys', () => {
    expect(mod.t('nonexistent.deep.key')).toBe('nonexistent.deep.key');
  });

  it('switchLocale ignores already-active locale', async () => {
    await mod.switchLocale('en');
    expect(mod.currentLocale()).toBe('en');
  });

  it('switchLocale switches to spanish and back', async () => {
    await mod.switchLocale('es');
    expect(mod.currentLocale()).toBe('es');
    await mod.switchLocale('en');
    expect(mod.currentLocale()).toBe('en');
  });

  it('switchLocale coerces unsupported locale to English', async () => {
    await mod.switchLocale('es');
    expect(mod.currentLocale()).toBe('es');
    await mod.switchLocale('zz');
    expect(mod.currentLocale()).toBe('en');
  });
});
