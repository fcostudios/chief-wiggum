import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearIpcMocks, mockIpcCommand } from '@/test/mockIPC';
import type { UserSettings } from '@/lib/types';

function makeSettings(): UserSettings {
  return {
    version: 2,
    appearance: { theme: 'dark', font_size: 13, code_font_size: 12, sidebar_default: 'expanded' },
    i18n: { locale: 'en', date_format: 'relative', number_format: 'standard' },
    cli: { default_model: 'claude-sonnet-4-6', default_effort: 'high' },
    sessions: { max_concurrent: 4, auto_save_interval_secs: 0, resume_inactivity_minutes: 5 },
    onboarding: { completed: false },
    keybindings: {},
    privacy: { log_redaction_level: 'standard' },
    advanced: { cli_path_override: '', debug_mode: false, developer_mode: false },
  };
}

function deepMerge(target: Record<string, unknown>, patch: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(patch)) {
    const prev = target[key];
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      prev &&
      typeof prev === 'object' &&
      !Array.isArray(prev)
    ) {
      deepMerge(prev as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      target[key] = value;
    }
  }
}

describe('Integration: settings -> theme sync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearIpcMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    clearIpcMocks();
  });

  it('loadSettings reads theme from get_settings IPC', async () => {
    const current = makeSettings();
    current.appearance.theme = 'light';
    mockIpcCommand('get_settings', () => current);

    const mod = await import('@/stores/settingsStore');
    await mod.loadSettings();

    expect(mod.settingsState.settings.appearance.theme).toBe('light');
    expect(mod.settingsState.isLoaded).toBe(true);
  });

  it('updateSetting persists a theme patch via update_settings IPC', async () => {
    const current = makeSettings();
    const updateSpy = vi.fn((args: Record<string, unknown>) => {
      deepMerge(
        current as unknown as Record<string, unknown>,
        args.patch as Record<string, unknown>,
      );
      return structuredClone(current);
    });
    mockIpcCommand('get_settings', () => structuredClone(current));
    mockIpcCommand('update_settings', updateSpy);

    const mod = await import('@/stores/settingsStore');
    await mod.loadSettings();
    mod.updateSetting('appearance', 'theme', 'light');
    await vi.advanceTimersByTimeAsync(350);

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ patch: { appearance: { theme: 'light' } } }),
    );
    expect(mod.settingsState.settings.appearance.theme).toBe('light');
    expect(mod.settingsState.saveError).toBeNull();
  });

  it('markOnboardingCompleted updates settings and persists onboarding flag', async () => {
    const current = makeSettings();
    const updateSpy = vi.fn((args: Record<string, unknown>) => {
      deepMerge(
        current as unknown as Record<string, unknown>,
        args.patch as Record<string, unknown>,
      );
      return structuredClone(current);
    });
    mockIpcCommand('update_settings', updateSpy);

    const mod = await import('@/stores/settingsStore');
    mod.markOnboardingCompleted();
    await vi.advanceTimersByTimeAsync(350);

    expect(mod.settingsState.settings.onboarding.completed).toBe(true);
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ patch: { onboarding: { completed: true } } }),
    );
  });
});
