import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockIpcCommand } from '@/test/mockIPC';

type SettingsStoreModule = typeof import('./settingsStore');

describe('settingsStore', () => {
  let mod: SettingsStoreModule;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();

    mockIpcCommand('get_settings', () => {
      throw new Error('settingsDefaults not initialized yet');
    });
    mockIpcCommand('update_settings', () => {
      throw new Error('update_settings mock not configured');
    });
    mockIpcCommand('reset_settings', () => {
      throw new Error('reset_settings mock not configured');
    });

    mod = await import('./settingsStore');

    mockIpcCommand('get_settings', () => structuredClone(mod.settingsDefaults));
    mockIpcCommand('update_settings', () => structuredClone(mod.settingsDefaults));
    mockIpcCommand('reset_settings', () => structuredClone(mod.settingsDefaults));
  });

  afterEach(async () => {
    await vi.runOnlyPendingTimersAsync();
    vi.useRealTimers();
    mod.cleanupSettingsListener();
  });

  it('has sensible defaults before loading', () => {
    expect(mod.settingsState.settings.version).toBe(2);
    expect(mod.settingsState.settings.appearance.theme).toBe('dark');
    expect(mod.settingsState.settings.cli.default_model).toBe('claude-sonnet-4-6');
    expect(mod.settingsState.settings.sessions.max_concurrent).toBe(4);
    expect(mod.settingsState.settings.sessions.resume_inactivity_minutes).toBe(5);
    expect(mod.settingsState.isLoaded).toBe(false);
  });

  it('loadSettings fetches from backend', async () => {
    await mod.loadSettings();
    expect(mod.settingsState.isLoaded).toBe(true);
    expect(mod.settingsState.saveError).toBeNull();
  });

  it('loadSettings falls back to defaults on IPC error', async () => {
    mockIpcCommand('get_settings', () => {
      throw new Error('backend crash');
    });
    await mod.loadSettings();
    expect(mod.settingsState.isLoaded).toBe(true);
    expect(mod.settingsState.settings.appearance.theme).toBe('dark');
  });

  it('updateSetting updates state immediately', () => {
    mod.updateSetting('appearance', 'font_size', 16);
    expect(mod.settingsState.settings.appearance.font_size).toBe(16);
  });

  it('updateSetting debounces IPC save', async () => {
    const saveSpy = vi.fn().mockReturnValue(structuredClone(mod.settingsDefaults));
    mockIpcCommand('update_settings', saveSpy);

    mod.updateSetting('appearance', 'font_size', 14);
    mod.updateSetting('appearance', 'font_size', 15);
    mod.updateSetting('appearance', 'font_size', 16);

    expect(saveSpy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(350);
    expect(saveSpy).toHaveBeenCalledTimes(1);
  });

  it('resetCategory calls IPC and resets state', async () => {
    const resetResult = structuredClone(mod.settingsDefaults);
    resetResult.appearance.font_size = mod.settingsDefaults.appearance.font_size;
    mockIpcCommand('reset_settings', () => resetResult);

    mod.updateSetting('appearance', 'font_size', 20);
    await mod.resetCategory('appearance');
    expect(mod.settingsState.settings.appearance.font_size).toBe(
      mod.settingsDefaults.appearance.font_size,
    );
  });

  it('isOnboardingCompleted reads from settings', () => {
    expect(mod.isOnboardingCompleted()).toBe(false);
  });

  it('markOnboardingCompleted updates onboarding.completed', () => {
    mod.markOnboardingCompleted();
    expect(mod.settingsState.settings.onboarding.completed).toBe(true);
  });
});
