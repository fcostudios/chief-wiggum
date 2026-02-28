# CHI-124, CHI-135, CHI-136, CHI-133: Settings UI, Error States, Accessibility, FilePreview Enhancement

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a full settings UI (Cmd+,), fix 6 missing error states, achieve WCAG 2.1 AA accessibility compliance, and enhance FilePreview with resizable viewer and editable ranges on ContextChips.

**Architecture:** CHI-124 builds a new `settingsStore.ts` + full-screen `SettingsModal` overlay with category navigation, auto-saving controls, and search — all wired to the existing CHI-122 backend IPC (`get_settings`/`update_settings`/`reset_settings`). CHI-135 adds `error` fields to 3 stores (`fileStore`, `slashStore`, `projectStore`) and wires error/retry UI into 4 components. CHI-136 sweeps 10+ components for ARIA attributes, skip-nav, tree roles, and color-only indicator fixes. CHI-133 removes FilePreview's 240px cap, adds a drag-resize handle, and wires ContextChip click → FilePreview range editing via a new `updateAttachmentRange()` function.

**Tech Stack:** SolidJS 1.9, TailwindCSS v4 (SPEC-002 tokens), lucide-solid, Tauri v2 IPC, tauri-plugin-store

---

## Task 1: Create settingsStore.ts — Settings State Management

**Files:**
- Create: `src/stores/settingsStore.ts`

**Step 1: Create the store**

```typescript
// src/stores/settingsStore.ts
// Settings state: load/save/reset user settings via Tauri IPC.
// Per GUIDE-001 §3.3: createStore singleton, mutations via exported functions.

import { createStore } from 'solid-js/store';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  UserSettings,
  AppearanceSettings,
  I18nSettings,
  CliSettings,
  SessionSettings,
  PrivacySettings,
  AdvancedSettings,
  SettingsChangedPayload,
} from '@/lib/types';
import { createLogger } from '@/lib/logger';
import { addToast } from '@/stores/toastStore';

const log = createLogger('ui/settings');

/** Default settings (mirrors Rust defaults for offline fallback). */
const DEFAULTS: UserSettings = {
  version: 1,
  appearance: {
    theme: 'dark',
    font_size: 13,
    code_font_size: 12,
    sidebar_default: 'expanded',
  },
  i18n: { locale: 'en', date_format: 'relative', number_format: 'standard' },
  cli: { default_model: 'claude-sonnet-4-6', default_effort: 'high' },
  sessions: { max_concurrent: 4, auto_save_interval_secs: 0 },
  keybindings: {},
  privacy: { log_redaction_level: 'standard' },
  advanced: { cli_path_override: '', debug_mode: false, developer_mode: false },
};

interface SettingsStoreState {
  settings: UserSettings;
  isLoaded: boolean;
  isSaving: boolean;
  saveError: string | null;
}

const [state, setState] = createStore<SettingsStoreState>({
  settings: structuredClone(DEFAULTS),
  isLoaded: false,
  isSaving: false,
  saveError: null,
});

let unlistenUpdated: UnlistenFn | null = null;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

/** Load settings from backend on app startup. */
export async function loadSettings(): Promise<void> {
  try {
    const settings = await invoke<UserSettings>('get_settings');
    setState({ settings, isLoaded: true, saveError: null });
  } catch (err) {
    log.error('Failed to load settings: ' + (err instanceof Error ? err.message : String(err)));
    setState('isLoaded', true); // Use defaults
  }
}

/** Update a single setting field. Auto-saves after 300ms debounce. */
export function updateSetting<C extends keyof UserSettings>(
  category: C,
  key: keyof UserSettings[C],
  value: UserSettings[C][keyof UserSettings[C]],
): void {
  // Optimistic local update
  setState('settings', category, key as never, value as never);
  setState('saveError', null);
  scheduleSave();
}

/** Schedule a debounced save to backend. */
function scheduleSave(): void {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void persistSettings();
  }, 300);
}

/** Persist current settings to backend. */
async function persistSettings(): Promise<void> {
  setState('isSaving', true);
  try {
    const updated = await invoke<UserSettings>('update_settings', {
      patch: state.settings,
    });
    setState({ settings: updated, isSaving: false, saveError: null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error('Failed to save settings: ' + msg);
    setState({ isSaving: false, saveError: msg });
    addToast('Settings could not be saved', 'error');
  }
}

/** Reset a category (or all) to defaults. */
export async function resetCategory(category?: string): Promise<void> {
  try {
    const updated = await invoke<UserSettings>('reset_settings', {
      category: category ?? null,
    });
    setState({ settings: updated, saveError: null });
    addToast(category ? `${category} settings reset` : 'All settings reset', 'info');
  } catch (err) {
    log.error('Failed to reset settings: ' + (err instanceof Error ? err.message : String(err)));
    addToast('Failed to reset settings', 'error');
  }
}

/** Start listening for external settings changes. */
export async function startSettingsListener(): Promise<void> {
  unlistenUpdated?.();
  unlistenUpdated = await listen<SettingsChangedPayload>('settings:updated', async () => {
    // Reload from backend to pick up changes from other windows/processes
    try {
      const settings = await invoke<UserSettings>('get_settings');
      setState('settings', settings);
    } catch (err) {
      log.warn('Failed to reload settings after external change: ' + (err instanceof Error ? err.message : String(err)));
    }
  });
}

/** Stop listening and clean up. */
export function cleanupSettingsListener(): void {
  unlistenUpdated?.();
  unlistenUpdated = null;
  clearTimeout(saveTimer);
}

export { state as settingsState, DEFAULTS as settingsDefaults };
```

**Step 2: Run verification**

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean

**Step 3: Commit**

```bash
git add src/stores/settingsStore.ts
git commit -m "feat: settingsStore with IPC sync, debounced auto-save (CHI-124)"
```

---

## Task 2: Add Settings Modal Visibility to uiStore + Keybinding

**Files:**
- Modify: `src/stores/uiStore.ts`
- Modify: `src/lib/keybindings.ts`

**Step 1: Add settingsVisible to UIState**

In `src/stores/uiStore.ts`, add to `UIState` interface:

```typescript
settingsVisible: boolean;
```

Initial state value:

```typescript
settingsVisible: false,
```

Add mutations:

```typescript
/** Open the settings overlay (Cmd+,). */
export function openSettings() {
  setState('settingsVisible', true);
}

/** Close the settings overlay. */
export function closeSettings() {
  setState('settingsVisible', false);
}
```

**Step 2: Add Cmd+, keybinding**

In `src/lib/keybindings.ts`, add import:

```typescript
import { openSettings } from '@/stores/uiStore';
```

(If `openSettings` is not already imported — add it alongside existing uiStore imports.)

In the `handleGlobalKeyDown` function, add a new case for `Cmd+,`:

```typescript
// Cmd+, — Open settings
if (meta && e.key === ',') {
  e.preventDefault();
  openSettings();
  return;
}
```

Place this near the top of the handler (before view switching), after the existing `Cmd+K` block.

**Step 3: Run verification**

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean

**Step 4: Commit**

```bash
git add src/stores/uiStore.ts src/lib/keybindings.ts
git commit -m "feat: Cmd+, keybinding opens settings overlay (CHI-124)"
```

---

## Task 3: SettingsModal Component — Layout Shell

**Files:**
- Create: `src/components/settings/SettingsModal.tsx`
- Modify: `src/components/layout/MainLayout.tsx`

**Step 1: Create SettingsModal with category sidebar + content area**

```typescript
// src/components/settings/SettingsModal.tsx
// Full-screen settings overlay with category navigation.
// Opens via Cmd+, or gear icon. Escape closes.

import type { Component } from 'solid-js';
import { createSignal, For, Show, onMount, onCleanup } from 'solid-js';
import {
  X, Palette, Globe, Terminal, MessageSquare,
  Keyboard, Shield, Wrench, Search,
} from 'lucide-solid';
import { closeSettings } from '@/stores/uiStore';
import {
  settingsState,
  loadSettings,
  updateSetting,
  resetCategory,
  startSettingsListener,
  cleanupSettingsListener,
} from '@/stores/settingsStore';
import type { UserSettings } from '@/lib/types';

type SettingsCategory =
  | 'appearance'
  | 'i18n'
  | 'cli'
  | 'sessions'
  | 'keybindings'
  | 'privacy'
  | 'advanced';

interface CategoryDef {
  id: SettingsCategory;
  label: string;
  icon: Component<{ size?: number }>;
}

const CATEGORIES: CategoryDef[] = [
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'i18n', label: 'Language', icon: Globe },
  { id: 'cli', label: 'CLI', icon: Terminal },
  { id: 'sessions', label: 'Sessions', icon: MessageSquare },
  { id: 'keybindings', label: 'Keybindings', icon: Keyboard },
  { id: 'privacy', label: 'Privacy', icon: Shield },
  { id: 'advanced', label: 'Advanced', icon: Wrench },
];

const SettingsModal: Component = () => {
  const [activeCategory, setActiveCategory] = createSignal<SettingsCategory>('appearance');
  const [searchQuery, setSearchQuery] = createSignal('');
  let searchRef: HTMLInputElement | undefined;

  onMount(async () => {
    await loadSettings();
    await startSettingsListener();
    searchRef?.focus();
  });

  onCleanup(() => {
    cleanupSettingsListener();
  });

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSettings();
    }
  }

  return (
    <div
      class="fixed inset-0 z-50 flex flex-col animate-fade-in"
      style={{ background: 'var(--color-bg-primary)' }}
      on:keydown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
    >
      {/* Header */}
      <div
        class="flex items-center justify-between px-6 py-3 shrink-0"
        style={{ 'border-bottom': '1px solid var(--color-border-secondary)' }}
      >
        <div class="flex items-center gap-3">
          <button
            class="p-1 rounded text-text-tertiary hover:text-text-primary transition-colors"
            style={{ 'transition-duration': 'var(--duration-fast)' }}
            onClick={closeSettings}
            aria-label="Close settings"
          >
            <X size={16} />
          </button>
          <h1 class="text-sm font-semibold text-text-primary tracking-wide">Settings</h1>
        </div>
      </div>

      {/* Body: category sidebar + content */}
      <div class="flex flex-1 overflow-hidden">
        {/* Category sidebar */}
        <div
          class="w-48 shrink-0 overflow-y-auto py-3 px-2"
          style={{ 'border-right': '1px solid var(--color-border-secondary)' }}
        >
          {/* Search */}
          <div
            class="flex items-center gap-1.5 px-2 py-1.5 mb-3 rounded-md"
            style={{
              background: 'var(--color-bg-inset)',
              border: '1px solid var(--color-border-secondary)',
            }}
          >
            <Search size={11} class="shrink-0 text-text-tertiary" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Search settings..."
              value={searchQuery()}
              onInput={(e) => setSearchQuery(e.currentTarget.value)}
              class="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-tertiary/40 outline-none min-w-0"
              aria-label="Search settings"
            />
          </div>

          {/* Category list */}
          <nav aria-label="Settings categories">
            <For each={CATEGORIES}>
              {(cat) => {
                const Icon = cat.icon;
                const isActive = () => activeCategory() === cat.id;
                return (
                  <button
                    class="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs font-medium transition-colors"
                    style={{
                      'transition-duration': 'var(--duration-fast)',
                      background: isActive() ? 'var(--color-bg-elevated)' : 'transparent',
                      color: isActive()
                        ? 'var(--color-text-primary)'
                        : 'var(--color-text-secondary)',
                    }}
                    onClick={() => setActiveCategory(cat.id)}
                    aria-current={isActive() ? 'page' : undefined}
                  >
                    <Icon size={13} />
                    <span>{cat.label}</span>
                  </button>
                );
              }}
            </For>
          </nav>
        </div>

        {/* Content area */}
        <div class="flex-1 overflow-y-auto px-8 py-6">
          <Show when={settingsState.isLoaded} fallback={
            <p class="text-xs text-text-tertiary">Loading settings...</p>
          }>
            <SettingsCategoryContent
              category={activeCategory()}
              settings={settingsState.settings}
              searchQuery={searchQuery().trim().toLowerCase()}
            />
          </Show>
        </div>
      </div>
    </div>
  );
};

/** Renders the settings controls for a given category. */
const SettingsCategoryContent: Component<{
  category: SettingsCategory;
  settings: UserSettings;
  searchQuery: string;
}> = (props) => {
  return (
    <div class="space-y-6 max-w-xl">
      {/* Category header + reset */}
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold text-text-primary capitalize">{props.category}</h2>
        <button
          class="text-[10px] text-text-tertiary hover:text-accent transition-colors"
          style={{ 'transition-duration': 'var(--duration-fast)' }}
          onClick={() => resetCategory(props.category)}
        >
          Reset to defaults
        </button>
      </div>

      {/* Appearance */}
      <Show when={props.category === 'appearance'}>
        <SettingDropdown
          label="Theme"
          description="Application color scheme"
          value={props.settings.appearance.theme}
          options={[
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
            { value: 'system', label: 'System' },
          ]}
          onChange={(v) => updateSetting('appearance', 'theme', v as 'dark' | 'light' | 'system')}
          searchQuery={props.searchQuery}
        />
        <SettingSlider
          label="Font Size"
          description="Base font size for the UI"
          value={props.settings.appearance.font_size}
          min={10}
          max={24}
          unit="px"
          onChange={(v) => updateSetting('appearance', 'font_size', v)}
          searchQuery={props.searchQuery}
        />
        <SettingSlider
          label="Code Font Size"
          description="Font size for code blocks and terminal"
          value={props.settings.appearance.code_font_size}
          min={10}
          max={24}
          unit="px"
          onChange={(v) => updateSetting('appearance', 'code_font_size', v)}
          searchQuery={props.searchQuery}
        />
        <SettingDropdown
          label="Sidebar Default"
          description="Initial sidebar state on app launch"
          value={props.settings.appearance.sidebar_default}
          options={[
            { value: 'expanded', label: 'Expanded' },
            { value: 'collapsed', label: 'Collapsed' },
            { value: 'hidden', label: 'Hidden' },
          ]}
          onChange={(v) =>
            updateSetting('appearance', 'sidebar_default', v as 'expanded' | 'collapsed' | 'hidden')
          }
          searchQuery={props.searchQuery}
        />
      </Show>

      {/* Language & i18n */}
      <Show when={props.category === 'i18n'}>
        <SettingDropdown
          label="Language"
          description="Application language"
          value={props.settings.i18n.locale}
          options={[
            { value: 'en', label: 'English' },
            { value: 'es', label: 'Spanish' },
          ]}
          onChange={(v) => updateSetting('i18n', 'locale', v)}
          searchQuery={props.searchQuery}
        />
        <SettingDropdown
          label="Date Format"
          description="How dates are displayed"
          value={props.settings.i18n.date_format}
          options={[
            { value: 'relative', label: 'Relative (2h ago)' },
            { value: 'iso', label: 'ISO (2026-02-24)' },
            { value: 'locale', label: 'Locale (Feb 24, 2026)' },
          ]}
          onChange={(v) =>
            updateSetting('i18n', 'date_format', v as 'relative' | 'iso' | 'locale')
          }
          searchQuery={props.searchQuery}
        />
        <SettingDropdown
          label="Number Format"
          description="How numbers are displayed"
          value={props.settings.i18n.number_format}
          options={[
            { value: 'standard', label: 'Standard (1,234)' },
            { value: 'compact', label: 'Compact (1.2K)' },
          ]}
          onChange={(v) =>
            updateSetting('i18n', 'number_format', v as 'standard' | 'compact')
          }
          searchQuery={props.searchQuery}
        />
      </Show>

      {/* CLI */}
      <Show when={props.category === 'cli'}>
        <SettingDropdown
          label="Default Model"
          description="Model used for new sessions"
          value={props.settings.cli.default_model}
          options={[
            { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
            { value: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
            { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
          ]}
          onChange={(v) => updateSetting('cli', 'default_model', v)}
          searchQuery={props.searchQuery}
        />
        <SettingDropdown
          label="Default Effort"
          description="Reasoning effort level for new sessions"
          value={props.settings.cli.default_effort}
          options={[
            { value: 'high', label: 'High' },
            { value: 'medium', label: 'Medium' },
            { value: 'low', label: 'Low' },
          ]}
          onChange={(v) =>
            updateSetting('cli', 'default_effort', v as 'low' | 'medium' | 'high')
          }
          searchQuery={props.searchQuery}
        />
      </Show>

      {/* Sessions */}
      <Show when={props.category === 'sessions'}>
        <SettingSlider
          label="Max Concurrent Sessions"
          description="Maximum number of CLI processes running simultaneously"
          value={props.settings.sessions.max_concurrent}
          min={1}
          max={8}
          unit=""
          onChange={(v) => updateSetting('sessions', 'max_concurrent', v)}
          searchQuery={props.searchQuery}
        />
        <SettingSlider
          label="Auto-Save Interval"
          description="Auto-save conversation interval (0 = disabled)"
          value={props.settings.sessions.auto_save_interval_secs}
          min={0}
          max={300}
          unit="s"
          onChange={(v) => updateSetting('sessions', 'auto_save_interval_secs', v)}
          searchQuery={props.searchQuery}
        />
      </Show>

      {/* Keybindings */}
      <Show when={props.category === 'keybindings'}>
        <p class="text-xs text-text-tertiary">
          Keybinding customization coming soon. Current shortcuts are listed in the Command Palette (Cmd+K).
        </p>
      </Show>

      {/* Privacy */}
      <Show when={props.category === 'privacy'}>
        <SettingDropdown
          label="Log Redaction Level"
          description="How aggressively logs are redacted in diagnostic exports"
          value={props.settings.privacy.log_redaction_level}
          options={[
            { value: 'standard', label: 'Standard' },
            { value: 'aggressive', label: 'Aggressive' },
            { value: 'none', label: 'None (not recommended)' },
          ]}
          onChange={(v) =>
            updateSetting('privacy', 'log_redaction_level', v as 'none' | 'standard' | 'aggressive')
          }
          searchQuery={props.searchQuery}
        />
      </Show>

      {/* Advanced */}
      <Show when={props.category === 'advanced'}>
        <SettingInput
          label="CLI Path Override"
          description="Custom path to Claude Code CLI binary (empty = auto-detect)"
          value={props.settings.advanced.cli_path_override}
          placeholder="/usr/local/bin/claude"
          onChange={(v) => updateSetting('advanced', 'cli_path_override', v)}
          searchQuery={props.searchQuery}
        />
        <SettingToggle
          label="Debug Mode"
          description="Enable verbose debug logging to console"
          value={props.settings.advanced.debug_mode}
          onChange={(v) => updateSetting('advanced', 'debug_mode', v)}
          searchQuery={props.searchQuery}
        />
        <SettingToggle
          label="Developer Mode"
          description="Pre-authorize common Bash patterns (git, npm, etc.)"
          value={props.settings.advanced.developer_mode}
          onChange={(v) => updateSetting('advanced', 'developer_mode', v)}
          searchQuery={props.searchQuery}
        />
      </Show>

      {/* Save status */}
      <Show when={settingsState.saveError}>
        <div
          class="flex items-center gap-2 px-3 py-2 rounded-md text-xs"
          style={{
            background: 'rgba(248, 81, 73, 0.1)',
            color: 'var(--color-error)',
            border: '1px solid rgba(248, 81, 73, 0.2)',
          }}
          role="alert"
        >
          <span>Failed to save: {settingsState.saveError}</span>
          <button
            class="underline hover:no-underline"
            onClick={() => void resetCategory(props.category)}
          >
            Retry
          </button>
        </div>
      </Show>
    </div>
  );
};

/* ── Reusable Setting Controls ─────────────────────────────────────── */

/** Check if a setting should be visible based on search query. */
function matchesSearch(label: string, description: string, query: string): boolean {
  if (!query) return true;
  return label.toLowerCase().includes(query) || description.toLowerCase().includes(query);
}

const SettingDropdown: Component<{
  label: string;
  description: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  searchQuery: string;
}> = (props) => {
  return (
    <Show when={matchesSearch(props.label, props.description, props.searchQuery)}>
      <div class="space-y-1.5">
        <label class="block text-xs font-medium text-text-primary">{props.label}</label>
        <p class="text-[10px] text-text-tertiary">{props.description}</p>
        <select
          value={props.value}
          onChange={(e) => props.onChange(e.currentTarget.value)}
          class="block w-full max-w-xs px-2 py-1.5 rounded-md text-xs outline-none focus-ring"
          style={{
            background: 'var(--color-bg-inset)',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-border-secondary)',
          }}
        >
          <For each={props.options}>
            {(opt) => <option value={opt.value}>{opt.label}</option>}
          </For>
        </select>
      </div>
    </Show>
  );
};

const SettingSlider: Component<{
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (value: number) => void;
  searchQuery: string;
}> = (props) => {
  return (
    <Show when={matchesSearch(props.label, props.description, props.searchQuery)}>
      <div class="space-y-1.5">
        <div class="flex items-center justify-between">
          <label class="text-xs font-medium text-text-primary">{props.label}</label>
          <span class="text-[10px] font-mono text-text-tertiary">
            {props.value}{props.unit}
          </span>
        </div>
        <p class="text-[10px] text-text-tertiary">{props.description}</p>
        <input
          type="range"
          min={props.min}
          max={props.max}
          value={props.value}
          onInput={(e) => props.onChange(parseInt(e.currentTarget.value, 10))}
          class="w-full max-w-xs accent-accent"
          aria-label={props.label}
        />
      </div>
    </Show>
  );
};

const SettingToggle: Component<{
  label: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
  searchQuery: string;
}> = (props) => {
  return (
    <Show when={matchesSearch(props.label, props.description, props.searchQuery)}>
      <div class="flex items-center justify-between max-w-xs">
        <div class="space-y-0.5">
          <label class="text-xs font-medium text-text-primary">{props.label}</label>
          <p class="text-[10px] text-text-tertiary">{props.description}</p>
        </div>
        <button
          role="switch"
          aria-checked={props.value}
          aria-label={props.label}
          class="relative w-9 h-5 rounded-full transition-colors shrink-0 ml-4"
          style={{
            'transition-duration': 'var(--duration-fast)',
            background: props.value ? 'var(--color-accent)' : 'var(--color-bg-inset)',
            border: props.value ? 'none' : '1px solid var(--color-border-secondary)',
          }}
          onClick={() => props.onChange(!props.value)}
        >
          <div
            class="absolute top-0.5 w-4 h-4 rounded-full transition-transform"
            style={{
              'transition-duration': 'var(--duration-fast)',
              background: props.value ? 'var(--color-bg-primary)' : 'var(--color-text-tertiary)',
              transform: props.value ? 'translateX(18px)' : 'translateX(2px)',
            }}
          />
        </button>
      </div>
    </Show>
  );
};

const SettingInput: Component<{
  label: string;
  description: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  searchQuery: string;
}> = (props) => {
  return (
    <Show when={matchesSearch(props.label, props.description, props.searchQuery)}>
      <div class="space-y-1.5">
        <label class="block text-xs font-medium text-text-primary">{props.label}</label>
        <p class="text-[10px] text-text-tertiary">{props.description}</p>
        <input
          type="text"
          value={props.value}
          placeholder={props.placeholder}
          onInput={(e) => props.onChange(e.currentTarget.value)}
          class="block w-full max-w-xs px-2 py-1.5 rounded-md text-xs outline-none focus-ring"
          style={{
            background: 'var(--color-bg-inset)',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-border-secondary)',
          }}
        />
      </div>
    </Show>
  );
};

export default SettingsModal;
```

**Step 2: Wire SettingsModal into MainLayout**

In `src/components/layout/MainLayout.tsx`, add import:

```typescript
import SettingsModal from '@/components/settings/SettingsModal';
```

Add before the closing `</div>` of the root, alongside other overlays:

```tsx
{/* Settings overlay (Cmd+,) */}
<Show when={uiState.settingsVisible}>
  <SettingsModal />
</Show>
```

**Step 3: Update TitleBar gear icon to open Settings**

In `src/components/layout/TitleBar.tsx`, change the gear icon's `onClick` from `toggleDetailsPanel` to `openSettings`. Import `openSettings` from `@/stores/uiStore`. Update `aria-label` and `title`:

```typescript
onClick={openSettings}
aria-label="Open settings"
title="Settings (Cmd+,)"
```

**Step 4: Run verification**

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean

**Step 5: Commit**

```bash
git add src/components/settings/SettingsModal.tsx src/components/layout/MainLayout.tsx src/components/layout/TitleBar.tsx
git commit -m "feat: SettingsModal full-screen overlay with categories and controls (CHI-124)"
```

---

## Task 4: Load Settings on App Startup

**Files:**
- Modify: `src/App.tsx`

**Step 1: Wire settings loading into app initialization**

In `src/App.tsx`, import and call `loadSettings`:

```typescript
import { loadSettings, startSettingsListener } from '@/stores/settingsStore';
```

In the existing `onMount` block, add after existing initialization:

```typescript
loadSettings().then(() => startSettingsListener());
```

**Step 2: Run verification**

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean

**Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: load settings on app startup (CHI-124)"
```

---

## Task 5: Error State Fields in Stores (CHI-135 Foundation)

**Files:**
- Modify: `src/stores/fileStore.ts`
- Modify: `src/stores/slashStore.ts`
- Modify: `src/stores/projectStore.ts`

**Step 1: Add `error` field to `FileState` in fileStore.ts**

Add to the `FileState` interface:

```typescript
loadError: string | null;
```

Initial state:

```typescript
loadError: null,
```

In `loadRootFilesInternal()`, in the catch block, add:

```typescript
setState('loadError', err instanceof Error ? err.message : 'Failed to load files');
```

At the start of `loadRootFilesInternal()` before the try, clear the error:

```typescript
setState('loadError', null);
```

Add a retry export:

```typescript
/** Retry loading root files after a failure. */
export async function retryLoadFiles(): Promise<void> {
  const projectId = state.projectId;
  if (projectId) {
    setState('loadError', null);
    await loadRootFilesInternal(projectId);
  }
}
```

**Step 2: Add `error` field to slashStore.ts**

Add to the `SlashState` interface:

```typescript
loadError: string | null;
```

Initial state:

```typescript
loadError: null,
```

In `loadCommands()`, in the catch block, add:

```typescript
setState('loadError', 'Failed to load slash commands');
```

At the start of `loadCommands()`, clear:

```typescript
setState('loadError', null);
```

**Step 3: Add `loadError` field to projectStore.ts**

Add to the `ProjectState` interface:

```typescript
loadError: string | null;
```

Initial state:

```typescript
loadError: null,
```

In `loadProjects()`, wrap the body in a proper try-catch (it currently uses try-finally without catch):

```typescript
export async function loadProjects(): Promise<void> {
  setState('isLoading', true);
  setState('loadError', null);
  try {
    const projects = await invoke<Project[]>('list_projects');
    setState('projects', projects);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to load projects';
    log.error('Failed to load projects: ' + msg);
    setState('loadError', msg);
  } finally {
    setState('isLoading', false);
  }
}
```

In `pickAndCreateProject()`, wrap in try-catch and add toast on failure:

```typescript
export async function pickAndCreateProject(): Promise<void> {
  try {
    const folderPath = await invoke<string | null>('pick_project_folder');
    if (!folderPath) return;
    const project = await invoke<Project>('create_project', { path: folderPath });
    setState('projects', (prev) => [project, ...prev]);
    setActiveProject(project.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to open project';
    log.error('Failed to create project: ' + msg);
    addToast('Folder not accessible: ' + msg, 'error');
  }
}
```

Add import for `addToast` if not present:

```typescript
import { addToast } from '@/stores/toastStore';
```

**Step 4: Run verification**

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean

**Step 5: Commit**

```bash
git add src/stores/fileStore.ts src/stores/slashStore.ts src/stores/projectStore.ts
git commit -m "feat: add error state fields to file/slash/project stores (CHI-135)"
```

---

## Task 6: Error UI in FileTree and FilePreview (CHI-135)

**Files:**
- Modify: `src/components/explorer/FileTree.tsx`
- Modify: `src/components/explorer/FilePreview.tsx`

**Step 1: Add error display to FileTree**

In `FileTree.tsx`, import `retryLoadFiles` from fileStore:

```typescript
import { fileState, ..., retryLoadFiles } from '@/stores/fileStore';
```

Add an error block above the existing tree container (inside the non-search branch, before the tree `<For>` list). Insert after the loading check:

```tsx
<Show when={fileState.loadError}>
  <div
    class="flex flex-col items-center gap-2 px-3 py-4 text-center"
    role="alert"
  >
    <p class="text-xs text-error">Could not load files</p>
    <p class="text-[10px] text-text-tertiary">{fileState.loadError}</p>
    <button
      class="text-[10px] text-accent hover:underline"
      onClick={() => retryLoadFiles()}
    >
      Retry
    </button>
  </div>
</Show>
```

**Step 2: Add persistent error state to FilePreview**

In `FilePreview.tsx`, replace the console.error in `handleLoadMore()` catch block with:

```typescript
log.error('Failed to load more preview lines: ' + (err instanceof Error ? err.message : String(err)));
setLoadError(err instanceof Error ? err.message : 'Failed to read file');
```

Add a local signal at the top of the component:

```typescript
const [loadError, setLoadError] = createSignal<string | null>(null);
```

Add import for `createLogger`:

```typescript
import { createLogger } from '@/lib/logger';
const log = createLogger('ui/file-preview');
```

Add an error display block after the "Loading preview..." placeholder and before the code content:

```tsx
<Show when={loadError()}>
  <div
    class="flex flex-col items-center gap-2 px-3 py-4 text-center"
    role="alert"
  >
    <p class="text-xs text-error">Could not read file</p>
    <p class="text-[10px] text-text-tertiary">{loadError()}</p>
    <button
      class="text-[10px] text-accent hover:underline"
      onClick={() => {
        setLoadError(null);
        // Retry by resetting loaded content to trigger fresh load
      }}
    >
      Retry
    </button>
  </div>
</Show>
```

Clear `loadError` at the top of `handleLoadMore`:

```typescript
setLoadError(null);
```

**Step 3: Run verification**

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean

**Step 4: Commit**

```bash
git add src/components/explorer/FileTree.tsx src/components/explorer/FilePreview.tsx
git commit -m "feat: error display + retry for FileTree and FilePreview (CHI-135)"
```

---

## Task 7: Slash Command and Settings Save Error Toasts (CHI-135)

**Files:**
- Modify: `src/stores/slashStore.ts`

The slash command failure toast and settings save failure toast are already handled:
- **Settings save failure:** Handled in Task 1 — `settingsStore.ts` calls `addToast('Settings could not be saved', 'error')` in `persistSettings()` catch.
- **Slash command failure:** The `slashStore.ts` already logs errors. Add a toast in the catch block of `loadCommands()`:

In `slashStore.ts`, add import for `addToast` if not present:

```typescript
import { addToast } from '@/stores/toastStore';
```

In `loadCommands()` catch block, after `setState('loadError', ...)`, add:

```typescript
addToast('Could not load slash commands', 'error');
```

**Step 1: Run verification**

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean

**Step 2: Commit**

```bash
git add src/stores/slashStore.ts
git commit -m "feat: slash command failure toast notification (CHI-135)"
```

---

## Task 8: Skip-to-Content Link + ARIA Landmarks (CHI-136)

**Files:**
- Modify: `src/styles/tokens.css`
- Modify: `src/components/layout/MainLayout.tsx`

**Step 1: Add skip-nav styles to tokens.css**

Add at the end of the file (before any closing comments):

```css
/* Skip-to-content link — visible only on keyboard focus */
.skip-to-content {
  position: absolute;
  top: -100%;
  left: 16px;
  z-index: 100;
  padding: 8px 16px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 0 0 6px 6px;
  background: var(--color-accent);
  color: var(--color-bg-primary);
  text-decoration: none;
  transition: top var(--duration-fast) var(--ease-default);
}
.skip-to-content:focus {
  top: 0;
  outline: 2px solid var(--color-border-focus);
  outline-offset: 2px;
}
```

**Step 2: Add skip-to-content link in MainLayout**

At the very beginning of the root `<div>` (before `<TitleBar />`):

```tsx
{/* Skip navigation link — visible on Tab focus */}
<a href="#main-content" class="skip-to-content">
  Skip to content
</a>
```

Add `id="main-content"` to the `<main>` element:

```tsx
<main id="main-content" class="flex-1 flex flex-col min-w-0 overflow-hidden" tabindex="-1">
```

**Step 3: Run verification**

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean

**Step 4: Commit**

```bash
git add src/styles/tokens.css src/components/layout/MainLayout.tsx
git commit -m "feat: skip-to-content link + main landmark ID (CHI-136)"
```

---

## Task 9: ARIA Attributes on Collapsible Sections (CHI-136)

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/components/explorer/FileTreeNode.tsx`
- Modify: `src/components/layout/StatusBar.tsx`

**Step 1: Add `aria-expanded` to Sidebar collapsible section headers**

In `Sidebar.tsx`, the Files section header button (around line 286-303) — add `aria-expanded`:

```tsx
<button
  class="flex items-center justify-between w-full px-3 py-2 text-left"
  onClick={() => toggleFilesVisible()}
  aria-expanded={fileState.isVisible}
>
```

For the Actions section header button (around line 337-363) — add `aria-expanded`:

```tsx
<button
  class="flex items-center justify-between w-full px-3 py-2 text-left"
  onClick={() => { /* existing logic */ }}
  aria-expanded={actionsOpen()}
>
```

In the `SidebarSection` function, the section toggle button (around line 538) — add `aria-expanded`:

```tsx
<button
  class="flex items-center gap-1.5 w-full px-3 py-1 ..."
  onClick={() => props.onToggle()}
  aria-expanded={props.open}
>
```

**Step 2: Add `aria-expanded` and `aria-level` to FileTreeNode**

In `FileTreeNode.tsx`, on the main node button, add:

```tsx
aria-expanded={node.is_dir ? isExpanded() : undefined}
aria-level={props.depth + 1}
role="treeitem"
```

**Step 3: Add text alternatives to StatusBar status indicators**

In `StatusBar.tsx`, find the process status dot and add `aria-label` and `title`:

```tsx
<div
  class="w-2 h-2 rounded-full ..."
  aria-label={`Process status: ${conversationState.processStatus}`}
  title={conversationState.processStatus}
/>
```

**Step 4: Run verification**

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean

**Step 5: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/components/explorer/FileTreeNode.tsx src/components/layout/StatusBar.tsx
git commit -m "feat: ARIA attributes on collapsible sections and status indicators (CHI-136)"
```

---

## Task 10: Tree Roles on FileTree + Keyboard Navigation (CHI-136)

**Files:**
- Modify: `src/components/explorer/FileTree.tsx`
- Modify: `src/components/explorer/FileTreeNode.tsx`

**Step 1: Add `role="tree"` to FileTree container**

In `FileTree.tsx`, on the container `<div>` that wraps the `<For each={...}>` tree nodes, add:

```tsx
<div role="tree" aria-label="File explorer">
```

**Step 2: Add `role="group"` to FileTreeNode children container**

In `FileTreeNode.tsx`, wrap the child nodes `<For>` in:

```tsx
<div role="group">
  <For each={children()}>
    {(child) => <FileTreeNode node={child} depth={props.depth + 1} />}
  </For>
</div>
```

**Step 3: Add keyboard navigation to FileTreeNode**

Add `onKeyDown` handler to the node button:

```typescript
function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'ArrowRight' && node.is_dir && !isExpanded()) {
    e.preventDefault();
    toggleExpand();
  } else if (e.key === 'ArrowLeft' && node.is_dir && isExpanded()) {
    e.preventDefault();
    toggleExpand();
  } else if (e.key === 'Enter' && !node.is_dir) {
    e.preventDefault();
    handleFileClick();
  }
}
```

Wire to the button: `on:keydown={handleKeyDown}`

**Step 4: Run verification**

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean

**Step 5: Commit**

```bash
git add src/components/explorer/FileTree.tsx src/components/explorer/FileTreeNode.tsx
git commit -m "feat: tree ARIA roles + keyboard navigation for file explorer (CHI-136)"
```

---

## Task 11: Color-Only Indicator Fixes (CHI-136)

**Files:**
- Modify: `src/components/layout/Sidebar.tsx` (session status dots)
- Modify: `src/components/explorer/FileTreeNode.tsx` (git status colors)

**Step 1: Add `aria-label` and `title` to session status dots**

In `Sidebar.tsx` SessionItem, find the running/error status dots (around line 769-783). Add accessible labels:

For the running dot:

```tsx
<Show when={getSessionStatus(props.session.id) === 'running'}>
  <div
    class="absolute -right-0.5 -top-0.5 w-1.5 h-1.5 rounded-full"
    style={{
      background: 'var(--color-success)',
      animation: 'pulse 2s ease-in-out infinite',
    }}
    aria-label="Running"
    title="Running"
    role="status"
  />
</Show>
```

For the error dot:

```tsx
<Show when={getSessionStatus(props.session.id) === 'error'}>
  <div
    class="absolute -right-0.5 -top-0.5 w-1.5 h-1.5 rounded-full"
    style={{ background: 'var(--color-error)' }}
    aria-label="Error"
    title="Error"
    role="status"
  />
</Show>
```

**Step 2: Ensure git status indicators have text labels**

In `FileTreeNode.tsx`, the git status badges already show text letters (M, U, S, D, R, !). Verify each badge has `aria-label` for the full word:

```tsx
<span aria-label="Modified" title="Modified">M</span>
<span aria-label="Untracked" title="Untracked">U</span>
<span aria-label="Staged" title="Staged">S</span>
<span aria-label="Deleted" title="Deleted">D</span>
<span aria-label="Renamed" title="Renamed">R</span>
<span aria-label="Conflicted" title="Conflicted">!</span>
```

If the spans don't have these attributes, add them.

**Step 3: Run verification**

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean

**Step 4: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/components/explorer/FileTreeNode.tsx
git commit -m "feat: text alternatives for color-only status indicators (CHI-136)"
```

---

## Task 12: FilePreview Resizable Viewer (CHI-133)

**Files:**
- Modify: `src/components/explorer/FilePreview.tsx`

**Step 1: Remove 240px max-height and add resize handle**

In `FilePreview.tsx`, find the root container that applies the 240px constraint (when `fillHeight` is false). Replace the fixed max-height with a resizable container using a local signal:

Add a local signal at the top of the component:

```typescript
const [previewHeight, setPreviewHeight] = createSignal(300);
const [isResizing, setIsResizing] = createSignal(false);
```

Add resize handler:

```typescript
function handleResizeStart(e: MouseEvent) {
  e.preventDefault();
  setIsResizing(true);
  const startY = e.clientY;
  const startHeight = previewHeight();

  function onMove(moveEvent: MouseEvent) {
    const delta = moveEvent.clientY - startY;
    setPreviewHeight(Math.max(200, Math.min(startHeight + delta, 600)));
  }

  function onUp() {
    setIsResizing(false);
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}
```

Replace the container's style so that when `fillHeight` is false, it uses `previewHeight()` instead of 240px:

```tsx
style={{
  height: props.fillHeight ? '100%' : `${previewHeight()}px`,
  'min-height': '200px',
}}
```

Add a drag handle div at the bottom of the component (before the closing tag):

```tsx
<Show when={!props.fillHeight}>
  <div
    class="h-1 cursor-row-resize hover:bg-accent/20 transition-colors"
    style={{
      'transition-duration': 'var(--duration-fast)',
      background: isResizing() ? 'rgba(232, 130, 90, 0.2)' : 'transparent',
    }}
    onMouseDown={handleResizeStart}
    role="separator"
    aria-orientation="horizontal"
    aria-label="Resize file preview"
  />
</Show>
```

**Step 2: Add sticky line number gutter**

The line numbers are already rendered in a table layout. Ensure the line number column has `position: sticky; left: 0`:

```tsx
<td
  class="select-none text-right pr-3 align-top shrink-0"
  style={{
    color: 'var(--color-text-tertiary)',
    opacity: '0.5',
    'min-width': '3ch',
    position: 'sticky',
    left: '0',
    background: 'var(--color-bg-primary)',
    'z-index': '1',
  }}
>
```

**Step 3: Run verification**

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean

**Step 4: Commit**

```bash
git add src/components/explorer/FilePreview.tsx
git commit -m "feat: resizable FilePreview with drag handle and sticky gutter (CHI-133)"
```

---

## Task 13: ContextChip Click-to-Edit + updateAttachmentRange (CHI-133)

**Files:**
- Modify: `src/stores/contextStore.ts`
- Modify: `src/components/conversation/ContextChip.tsx`
- Modify: `src/stores/fileStore.ts`

**Step 1: Add `updateAttachmentRange()` to contextStore**

In `contextStore.ts`, add:

```typescript
/** Update the line range of an existing attachment. Recalculates token estimate. */
export function updateAttachmentRange(
  attachmentId: string,
  startLine: number | undefined,
  endLine: number | undefined,
): void {
  const idx = state.attachments.findIndex((a) => a.id === attachmentId);
  if (idx === -1) return;

  const attachment = state.attachments[idx];
  // Estimate tokens for new range
  const lineCount = startLine != null && endLine != null ? endLine - startLine + 1 : 0;
  // ~40 chars per line, ~4 chars per token
  const estimatedTokens = lineCount > 0 ? Math.ceil((lineCount * 40) / 4) : attachment.reference.estimated_tokens;

  setState('attachments', idx, 'reference', {
    ...attachment.reference,
    start_line: startLine,
    end_line: endLine,
    estimated_tokens: estimatedTokens,
  });
}
```

**Step 2: Make ContextChip clickable to navigate to preview**

In `ContextChip.tsx`, add `onClick` prop and handler:

```typescript
const ContextChip: Component<{
  attachment: ContextAttachment;
  onRemove: (id: string) => void;
  onEdit?: (attachment: ContextAttachment) => void;
}> = (props) => {
```

Update the chip's main container to be clickable:

```tsx
<div
  class="... cursor-pointer"
  onClick={() => props.onEdit?.(props.attachment)}
  title={`${props.attachment.reference.relative_path} (~${props.attachment.reference.estimated_tokens} tokens) — click to edit range`}
>
```

**Step 3: Wire `onEdit` in MessageInput**

In `MessageInput.tsx`, where `<ContextChip>` is rendered, pass `onEdit` that opens the file in FilePreview with the range pre-selected:

```tsx
<ContextChip
  attachment={attachment}
  onRemove={removeAttachment}
  onEdit={(att) => {
    // Open file in preview with existing range
    selectFileForEditing(att.reference.relative_path, att.reference.start_line, att.reference.end_line);
  }}
/>
```

**Step 4: Add `selectFileForEditing` to fileStore**

In `fileStore.ts`, add a function that selects a file and pre-sets a range:

```typescript
/** Open a file for range editing (called from ContextChip click). */
export async function selectFileForEditing(
  relativePath: string,
  startLine?: number,
  endLine?: number,
): Promise<void> {
  // Find the file node or create a minimal ref
  const node = findNodeByPath(state.tree, relativePath);
  if (node) {
    await selectFile(node);
  }
  // Set the range after file loads
  if (startLine != null && endLine != null) {
    setState('selectedRange', { start: startLine, end: endLine });
  }
}

/** Recursively find a node by relative path. */
function findNodeByPath(nodes: FileNode[], path: string): FileNode | null {
  for (const node of nodes) {
    if (node.relative_path === path) return node;
    if (node.children) {
      const found = findNodeByPath(node.children, path);
      if (found) return found;
    }
  }
  return null;
}
```

**Step 5: Add "Update selection" button to FilePreview**

In `FilePreview.tsx`, in the selection action bar (where "Add selection" button lives), add a conditional "Update" button when the current file+range matches an existing ContextChip:

```typescript
import { contextState, updateAttachmentRange } from '@/stores/contextStore';

// Derived: find existing attachment for current file
const existingAttachment = () =>
  contextState.attachments.find(
    (a) => a.reference.relative_path === fileState.previewPath,
  );
```

Add in the selection toolbar, next to "Add selection":

```tsx
<Show when={existingAttachment() && selectedRange()}>
  <button
    class="px-2 py-1 rounded text-[10px] font-medium transition-colors"
    style={{
      background: 'var(--color-accent)',
      color: 'var(--color-bg-primary)',
      'transition-duration': 'var(--duration-fast)',
    }}
    onClick={() => {
      const att = existingAttachment();
      const range = selectedRange();
      if (att && range) {
        updateAttachmentRange(att.id, range.start, range.end);
        addToast('Range updated', 'info');
      }
    }}
  >
    Update range
  </button>
</Show>
```

**Step 6: Run verification**

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean

**Step 7: Commit**

```bash
git add src/stores/contextStore.ts src/components/conversation/ContextChip.tsx src/stores/fileStore.ts src/components/explorer/FilePreview.tsx src/components/conversation/MessageInput.tsx
git commit -m "feat: ContextChip click-to-edit range with updateAttachmentRange (CHI-133)"
```

---

## Verification

1. `npx tsc --noEmit` — TypeScript clean
2. `npx eslint .` — No lint errors
3. `npx vite build` — Build succeeds
4. `cargo test -p chief-wiggum` — All Rust tests pass (existing 218+)
5. Manual test — Settings:
   - Cmd+, opens full-screen settings overlay
   - Gear icon in TitleBar opens settings
   - Escape closes
   - Category navigation works (7 categories)
   - Dropdown, slider, toggle, text input controls function
   - Auto-save debounced (see 300ms delay in network tab)
   - Search filters settings across categories
   - "Reset to defaults" works per category
6. Manual test — Error states:
   - Disconnect from filesystem → FileTree shows "Could not load files" + Retry
   - Invalid file path → FilePreview shows error + retry
   - Slash command load failure → toast notification
   - Project folder moved → toast "Folder not accessible"
   - Settings save failure → toast "Settings could not be saved"
7. Manual test — Accessibility:
   - Tab once → skip-to-content link appears at top
   - Enter → jumps focus to main content area
   - Tab through sidebar sections → `aria-expanded` toggles
   - File tree: Arrow keys expand/collapse folders
   - Status dots have tooltips ("Running", "Error")
   - VoiceOver reads tree items with level info
8. Manual test — FilePreview:
   - Drag resize handle → height changes (min 200px, max 600px)
   - Line numbers sticky when scrolling horizontally
   - Click ContextChip → FilePreview opens at selected range
   - Modify range → click "Update range" → chip token estimate updates
