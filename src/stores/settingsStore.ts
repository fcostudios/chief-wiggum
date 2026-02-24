// src/stores/settingsStore.ts
// Settings state: load/save/reset user settings via Tauri IPC.
// Per GUIDE-001 §3.3: createStore singleton, mutations via exported functions.

import { createStore } from 'solid-js/store';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { SettingsChangedPayload, UserSettings } from '@/lib/types';
import { createLogger } from '@/lib/logger';
import { addToast } from '@/stores/toastStore';

const log = createLogger('ui/settings');

type SettingsCategory = Exclude<keyof UserSettings, 'version'>;

interface SettingsStoreState {
  settings: UserSettings;
  isLoaded: boolean;
  isSaving: boolean;
  saveError: string | null;
}

/** Mirrors Rust defaults (CHI-122) so the UI still renders if backend load fails. */
const DEFAULTS: UserSettings = {
  version: 1,
  appearance: {
    theme: 'dark',
    font_size: 13,
    code_font_size: 12,
    sidebar_default: 'expanded',
  },
  i18n: {
    locale: 'en',
    date_format: 'relative',
    number_format: 'standard',
  },
  cli: {
    default_model: 'claude-sonnet-4-6',
    default_effort: 'high',
  },
  sessions: {
    max_concurrent: 4,
    auto_save_interval_secs: 0,
  },
  keybindings: {},
  privacy: {
    log_redaction_level: 'standard',
  },
  advanced: {
    cli_path_override: '',
    debug_mode: false,
    developer_mode: false,
  },
};

const [state, setState] = createStore<SettingsStoreState>({
  settings: structuredClone(DEFAULTS),
  isLoaded: false,
  isSaving: false,
  saveError: null,
});

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let unlistenUpdated: UnlistenFn | null = null;
let saveInFlight = false;
let pendingPatch: Record<string, unknown> = {};

function hasPendingPatch(): boolean {
  return Object.keys(pendingPatch).length > 0;
}

function mergePatch(target: Record<string, unknown>, patch: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(patch)) {
    const existing = target[key];
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      existing &&
      typeof existing === 'object' &&
      !Array.isArray(existing)
    ) {
      mergePatch(existing as Record<string, unknown>, value as Record<string, unknown>);
      continue;
    }
    target[key] = value;
  }
}

function queuePatch(category: SettingsCategory, key: string, value: unknown): void {
  const nextPatch = { [category]: { [key]: value } };
  mergePatch(pendingPatch, nextPatch);
}

function clearSaveTimer(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
}

function scheduleSave(delayMs = 300): void {
  clearSaveTimer();
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void persistSettings();
  }, delayMs);
}

/** Load settings from backend (or keep defaults on failure). */
export async function loadSettings(): Promise<void> {
  try {
    const settings = await invoke<UserSettings>('get_settings');
    setState({
      settings,
      isLoaded: true,
      saveError: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('Failed to load settings: ' + message);
    setState({
      settings: structuredClone(DEFAULTS),
      isLoaded: true,
    });
    addToast('Settings loaded with defaults', 'warning');
  }
}

/** Update a single field and debounce persistence. */
export function updateSetting<C extends SettingsCategory, K extends keyof UserSettings[C]>(
  category: C,
  key: K,
  value: UserSettings[C][K],
): void {
  setState('settings', category as never, key as never, value as never);
  setState('saveError', null);
  queuePatch(category, String(key), value);
  scheduleSave();
}

/** Force a retry for the current pending patch (used by save-error UI/toast). */
export function retryPendingSettingsSave(): void {
  if (!hasPendingPatch() && !state.saveError) return;
  void persistSettings();
}

async function persistSettings(): Promise<void> {
  if (saveInFlight || !hasPendingPatch()) return;

  saveInFlight = true;
  const patch = pendingPatch;
  pendingPatch = {};

  setState('isSaving', true);

  try {
    const updated = await invoke<UserSettings>('update_settings', { patch });
    setState({
      settings: updated,
      isSaving: false,
      saveError: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('Failed to save settings: ' + message);
    mergePatch(pendingPatch, patch);
    setState({
      isSaving: false,
      saveError: message,
    });
    addToast('Settings could not be saved', 'error', {
      label: 'Retry',
      onClick: retryPendingSettingsSave,
    });
  } finally {
    saveInFlight = false;
    if (hasPendingPatch()) {
      scheduleSave(250);
    }
  }
}

/** Reset one category or all settings to backend defaults. */
export async function resetCategory(category?: SettingsCategory): Promise<void> {
  clearSaveTimer();
  pendingPatch = {};
  try {
    const updated = await invoke<UserSettings>('reset_settings', {
      category: category ?? null,
    });
    setState({
      settings: updated,
      saveError: null,
    });
    addToast(category ? `${category} settings reset` : 'All settings reset', 'info');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('Failed to reset settings: ' + message);
    addToast('Failed to reset settings', 'error');
  }
}

/** Listen for settings changes emitted by other windows/processes. */
export async function startSettingsListener(): Promise<void> {
  unlistenUpdated?.();
  unlistenUpdated = await listen<SettingsChangedPayload>('settings:updated', () => {
    // Reload authoritative values from backend to pick up external changes.
    void invoke<UserSettings>('get_settings')
      .then((settings) => {
        setState('settings', settings);
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        log.warn('Failed to reload settings after settings:updated event: ' + message);
      });
  });
}

/** Stop external settings change listener. */
export function cleanupSettingsListener(): void {
  unlistenUpdated?.();
  unlistenUpdated = null;
}

export { DEFAULTS as settingsDefaults, state as settingsState };
