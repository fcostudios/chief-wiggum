// src/components/settings/SettingsModal.tsx
// Full-screen settings overlay with category navigation and auto-saving controls.

import type { Component, ParentComponent } from 'solid-js';
import { createEffect, createMemo, createSignal, For, Match, onCleanup, onMount, Show, Switch } from 'solid-js';
import {
  Info,
  Keyboard,
  MessageSquare,
  Monitor,
  Search,
  Settings2,
  Shield,
  Terminal,
  Wrench,
  X,
} from 'lucide-solid';
import { closeSettings } from '@/stores/uiStore';
import {
  cleanupSettingsListener,
  loadSettings,
  resetCategory,
  retryPendingSettingsSave,
  settingsState,
  startSettingsListener,
  updateSetting,
} from '@/stores/settingsStore';
import type { UserSettings } from '@/lib/types';

type SettingsCategory = Exclude<keyof UserSettings, 'version'>;
type ModalCategory = SettingsCategory | 'about';

interface CategoryDef {
  id: ModalCategory;
  label: string;
  icon: Component<{ size?: number; class?: string }>;
  description: string;
}

const CATEGORIES: CategoryDef[] = [
  {
    id: 'appearance',
    label: 'Appearance',
    icon: Monitor,
    description: 'Theme, fonts, and sidebar defaults',
  },
  {
    id: 'i18n',
    label: 'Language',
    icon: Settings2,
    description: 'Locale and date/number display',
  },
  {
    id: 'cli',
    label: 'CLI',
    icon: Terminal,
    description: 'Default model and reasoning effort',
  },
  {
    id: 'sessions',
    label: 'Sessions',
    icon: MessageSquare,
    description: 'Concurrency and autosave behavior',
  },
  {
    id: 'keybindings',
    label: 'Keybindings',
    icon: Keyboard,
    description: 'Shortcut customization (preview)',
  },
  {
    id: 'privacy',
    label: 'Privacy',
    icon: Shield,
    description: 'Diagnostic log redaction preferences',
  },
  {
    id: 'advanced',
    label: 'Advanced',
    icon: Wrench,
    description: 'Debug and developer settings',
  },
  {
    id: 'about',
    label: 'About',
    icon: Info,
    description: 'Schema version and shortcuts',
  },
];

const SEARCH_INDEX: Record<SettingsCategory, Array<{ label: string; description: string }>> = {
  appearance: [
    { label: 'Theme', description: 'Application color scheme' },
    { label: 'Font Size', description: 'Base font size for UI text' },
    { label: 'Code Font Size', description: 'Font size for code and terminal text' },
    { label: 'Sidebar Default', description: 'Default sidebar state on app launch' },
  ],
  i18n: [
    { label: 'Language', description: 'Application locale' },
    { label: 'Date Format', description: 'How dates are displayed' },
    { label: 'Number Format', description: 'How numeric values are formatted' },
  ],
  cli: [
    { label: 'Default Model', description: 'Model used for new sessions' },
    { label: 'Default Effort', description: 'Reasoning effort for new sessions' },
  ],
  sessions: [
    { label: 'Max Concurrent Sessions', description: 'Maximum number of parallel CLI sessions' },
    { label: 'Auto Save Interval', description: 'Automatic draft save interval in seconds' },
  ],
  keybindings: [
    { label: 'Keybindings JSON', description: 'Custom shortcut overrides' },
  ],
  privacy: [
    { label: 'Log Redaction Level', description: 'Diagnostic log redaction aggressiveness' },
  ],
  advanced: [
    { label: 'CLI Path Override', description: 'Use a custom Claude CLI binary path' },
    { label: 'Debug Mode', description: 'Enable additional frontend debug behavior' },
    { label: 'Developer Mode', description: 'Default permission tier preference' },
    { label: 'Raw JSON', description: 'Advanced settings preview' },
  ],
};

function normalizeSearch(query: string): string {
  return query.trim().toLowerCase();
}

function matchesSearch(query: string, ...parts: Array<string | undefined>): boolean {
  const q = normalizeSearch(query);
  if (!q) return true;
  const haystack = parts
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

function categoryMatchesSearch(category: ModalCategory, query: string): boolean {
  if (category === 'about') {
    return matchesSearch(query, 'about settings version keyboard shortcuts');
  }
  const meta = SEARCH_INDEX[category];
  return meta.some((entry) => matchesSearch(query, category, entry.label, entry.description));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const CONTROL_CLASS =
  'rounded-md bg-bg-inset text-text-primary border border-border-secondary px-2.5 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:border-transparent';
const SELECT_CLASS = `${CONTROL_CLASS} min-w-44`;
const INPUT_CLASS = CONTROL_CLASS;
const TEXTAREA_CLASS = `${CONTROL_CLASS} w-full resize-y leading-relaxed`;

const SettingsModal: Component = () => {
  const [activeCategory, setActiveCategory] = createSignal<ModalCategory>('appearance');
  const [searchQuery, setSearchQuery] = createSignal('');
  let searchRef: HTMLInputElement | undefined;

  const visibleCategories = createMemo(() =>
    CATEGORIES.filter((cat) => categoryMatchesSearch(cat.id, searchQuery())),
  );

  createEffect(() => {
    const categories = visibleCategories();
    if (categories.length === 0) return;
    const current = activeCategory();
    if (!categories.some((cat) => cat.id === current)) {
      setActiveCategory(categories[0]!.id);
    }
  });

  onMount(async () => {
    await loadSettings();
    await startSettingsListener();
    queueMicrotask(() => searchRef?.focus());
    window.addEventListener('keydown', handleWindowKeyDown);
  });

  onCleanup(() => {
    window.removeEventListener('keydown', handleWindowKeyDown);
    cleanupSettingsListener();
  });

  function handleWindowKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSettings();
    }
  }

  const activeLabel = () => CATEGORIES.find((cat) => cat.id === activeCategory())?.label ?? 'Settings';

  return (
    <div
      class="fixed inset-0 z-50 flex flex-col bg-bg-primary text-text-primary animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
    >
      <div
        class="h-[44px] shrink-0 flex items-center justify-between px-4"
        style={{ 'border-bottom': '1px solid var(--color-border-secondary)' }}
      >
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="w-8 h-8 rounded-md flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-bg-elevated transition-colors"
            style={{ 'transition-duration': 'var(--duration-fast)' }}
            onClick={closeSettings}
            aria-label="Close settings"
            title="Close settings (Escape)"
          >
            <X size={14} />
          </button>
          <div>
            <h1 class="text-sm font-semibold tracking-wide text-text-primary">Settings</h1>
          </div>
        </div>

        <div class="flex items-center gap-3 text-xs">
          <Show when={settingsState.isSaving}>
            <span class="text-accent">Saving…</span>
          </Show>
          <Show when={!settingsState.isSaving && settingsState.saveError}>
            <button
              type="button"
              class="text-error hover:underline"
              onClick={retryPendingSettingsSave}
            >
              Save failed — Retry
            </button>
          </Show>
          <Show when={!settingsState.isSaving && !settingsState.saveError}>
            <span class="text-text-tertiary">Auto-save enabled</span>
          </Show>
        </div>
      </div>

      <div class="flex-1 min-h-0 flex overflow-hidden">
        <aside
          class="w-64 shrink-0 flex flex-col px-3 py-3 gap-3 bg-bg-secondary/40"
          style={{ 'border-right': '1px solid var(--color-border-secondary)' }}
          aria-label="Settings categories"
        >
          <div
            class="flex items-center gap-2 px-2.5 py-2 rounded-md"
            style={{
              background: 'var(--color-bg-inset)',
              border: '1px solid var(--color-border-secondary)',
            }}
          >
            <Search size={12} class="text-text-tertiary shrink-0" />
            <input
              ref={searchRef}
              type="text"
              value={searchQuery()}
              onInput={(e) => setSearchQuery(e.currentTarget.value)}
              placeholder="Search settings..."
              class="bg-transparent border-0 outline-none min-w-0 flex-1 text-xs text-text-primary placeholder:text-text-tertiary/60"
              aria-label="Search settings"
            />
          </div>

          <nav class="min-h-0 overflow-y-auto pr-1" aria-label="Settings categories list">
            <div class="space-y-1">
              <For each={visibleCategories()}>
                {(cat) => {
                  const Icon = cat.icon;
                  const isActive = () => activeCategory() === cat.id;
                  return (
                    <button
                      type="button"
                      class="w-full text-left px-2.5 py-2 rounded-md transition-colors"
                      style={{
                        'transition-duration': 'var(--duration-fast)',
                        background: isActive() ? 'var(--color-bg-elevated)' : 'transparent',
                        border: isActive()
                          ? '1px solid var(--color-border-primary)'
                          : '1px solid transparent',
                      }}
                      onClick={() => setActiveCategory(cat.id)}
                      aria-current={isActive() ? 'page' : undefined}
                    >
                      <div class="flex items-center gap-2 text-xs font-medium">
                        <Icon size={13} class={isActive() ? 'text-accent' : 'text-text-secondary'} />
                        <span class={isActive() ? 'text-text-primary' : 'text-text-secondary'}>
                          {cat.label}
                        </span>
                      </div>
                      <p class="mt-1 text-[11px] leading-snug text-text-tertiary">{cat.description}</p>
                    </button>
                  );
                }}
              </For>
            </div>

            <Show when={visibleCategories().length === 0}>
              <div class="px-2 py-3 text-xs text-text-tertiary">No settings match this search.</div>
            </Show>
          </nav>
        </aside>

        <main class="flex-1 min-w-0 min-h-0 overflow-y-auto px-6 py-5" aria-label={`${activeLabel()} settings`}>
          <Show when={settingsState.isLoaded} fallback={<p class="text-sm text-text-tertiary">Loading settings…</p>}>
            <SettingsContent category={activeCategory()} searchQuery={searchQuery()} />
          </Show>
        </main>
      </div>
    </div>
  );
};

const SettingsContent: Component<{ category: ModalCategory; searchQuery: string }> = (props) => {
  const settings = () => settingsState.settings;
  const visible = (label: string, description?: string, extra?: string) =>
    matchesSearch(props.searchQuery, props.category, label, description, extra);

  return (
    <div class="max-w-3xl space-y-5">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h2 class="text-lg font-semibold tracking-tight text-text-primary capitalize">
            {props.category === 'i18n' ? 'Language & Locale' : props.category}
          </h2>
          <p class="mt-1 text-sm text-text-tertiary">
            Changes save automatically after a short delay.
          </p>
        </div>
        <Show when={props.category !== 'about'}>
          <button
            type="button"
            class="shrink-0 px-3 py-1.5 rounded-md text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
            style={{
              'transition-duration': 'var(--duration-fast)',
              border: '1px solid var(--color-border-secondary)',
            }}
            onClick={() => resetCategory(props.category as SettingsCategory)}
          >
            Reset to defaults
          </button>
        </Show>
      </div>

      <Show when={settingsState.saveError}>
        <div
          class="rounded-md px-3 py-2 text-sm"
          style={{
            border: '1px solid var(--color-error)',
            background: 'var(--color-error-muted)',
            color: 'var(--color-text-primary)',
          }}
          role="alert"
        >
          <div class="flex items-center justify-between gap-3">
            <span>Settings save failed. Your changes are kept locally.</span>
            <button
              type="button"
              class="text-xs font-medium text-error hover:underline"
              onClick={retryPendingSettingsSave}
            >
              Retry
            </button>
          </div>
        </div>
      </Show>

      <div class="space-y-4">
        <Switch>
          <Match when={props.category === 'appearance'}>
            <Show when={visible('Theme', 'Application color scheme') }>
              <SettingCard label="Theme" description="Application color scheme">
                <select
                  class={SELECT_CLASS}
                  value={settings().appearance.theme}
                  onChange={(e) =>
                    updateSetting('appearance', 'theme', e.currentTarget.value as UserSettings['appearance']['theme'])
                  }
                  aria-label="Theme"
                >
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                  <option value="system">System</option>
                </select>
              </SettingCard>
            </Show>

            <Show when={visible('Font Size', 'Base font size for UI text', 'ui font') }>
              <RangeCard
                label="Font Size"
                description="Base font size for UI text"
                value={settings().appearance.font_size}
                min={10}
                max={24}
                unit="px"
                onChange={(value) => updateSetting('appearance', 'font_size', value)}
              />
            </Show>

            <Show when={visible('Code Font Size', 'Font size for code and terminal text') }>
              <RangeCard
                label="Code Font Size"
                description="Font size for code blocks and terminal text"
                value={settings().appearance.code_font_size}
                min={10}
                max={24}
                unit="px"
                onChange={(value) => updateSetting('appearance', 'code_font_size', value)}
              />
            </Show>

            <Show when={visible('Sidebar Default', 'Default sidebar state on app launch') }>
              <SettingCard label="Sidebar Default" description="Default sidebar state when the app opens">
                <select
                  class={SELECT_CLASS}
                  value={settings().appearance.sidebar_default}
                  onChange={(e) =>
                    updateSetting(
                      'appearance',
                      'sidebar_default',
                      e.currentTarget.value as UserSettings['appearance']['sidebar_default'],
                    )
                  }
                  aria-label="Sidebar Default"
                >
                  <option value="expanded">Expanded</option>
                  <option value="collapsed">Collapsed</option>
                  <option value="hidden">Hidden</option>
                </select>
              </SettingCard>
            </Show>
          </Match>

          <Match when={props.category === 'i18n'}>
            <Show when={visible('Language', 'Application locale') }>
              <SettingCard label="Language" description="Application locale for translated UI copy">
                <select
                  class={SELECT_CLASS}
                  value={settings().i18n.locale}
                  onChange={(e) => updateSetting('i18n', 'locale', e.currentTarget.value)}
                  aria-label="Language"
                >
                  <option value="en">English</option>
                  <option value="es">Español</option>
                </select>
              </SettingCard>
            </Show>

            <Show when={visible('Date Format', 'How dates are displayed') }>
              <SettingCard label="Date Format" description="How timestamps are shown in the UI">
                <select
                  class={SELECT_CLASS}
                  value={settings().i18n.date_format}
                  onChange={(e) =>
                    updateSetting(
                      'i18n',
                      'date_format',
                      e.currentTarget.value as UserSettings['i18n']['date_format'],
                    )
                  }
                  aria-label="Date Format"
                >
                  <option value="relative">Relative (2h ago)</option>
                  <option value="iso">ISO (2026-02-24)</option>
                  <option value="locale">Locale (Feb 24, 2026)</option>
                </select>
              </SettingCard>
            </Show>

            <Show when={visible('Number Format', 'How numeric values are formatted') }>
              <SettingCard label="Number Format" description="Compact formats affect token/cost displays">
                <select
                  class={SELECT_CLASS}
                  value={settings().i18n.number_format}
                  onChange={(e) =>
                    updateSetting(
                      'i18n',
                      'number_format',
                      e.currentTarget.value as UserSettings['i18n']['number_format'],
                    )
                  }
                  aria-label="Number Format"
                >
                  <option value="standard">Standard</option>
                  <option value="compact">Compact</option>
                </select>
              </SettingCard>
            </Show>
          </Match>

          <Match when={props.category === 'cli'}>
            <Show when={visible('Default Model', 'Model used for new sessions') }>
              <SettingCard label="Default Model" description="Default model for newly created sessions">
                <select
                  class={SELECT_CLASS}
                  value={settings().cli.default_model}
                  onChange={(e) => updateSetting('cli', 'default_model', e.currentTarget.value)}
                  aria-label="Default Model"
                >
                  <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
                  <option value="claude-opus-4-1">Claude Opus 4.1</option>
                  <option value="claude-haiku-3-5">Claude Haiku 3.5</option>
                </select>
              </SettingCard>
            </Show>

            <Show when={visible('Default Effort', 'Reasoning effort for new sessions') }>
              <SettingCard label="Default Effort" description="Reasoning depth used by default">
                <select
                  class={SELECT_CLASS}
                  value={settings().cli.default_effort}
                  onChange={(e) =>
                    updateSetting(
                      'cli',
                      'default_effort',
                      e.currentTarget.value as UserSettings['cli']['default_effort'],
                    )
                  }
                  aria-label="Default Effort"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </SettingCard>
            </Show>
          </Match>

          <Match when={props.category === 'sessions'}>
            <Show when={visible('Max Concurrent Sessions', 'Maximum number of parallel CLI sessions') }>
              <RangeCard
                label="Max Concurrent Sessions"
                description="Limit concurrent Claude CLI processes (1–8)"
                value={settings().sessions.max_concurrent}
                min={1}
                max={8}
                unit=""
                onChange={(value) => updateSetting('sessions', 'max_concurrent', value)}
              />
            </Show>

            <Show when={visible('Auto Save Interval', 'Automatic draft save interval in seconds') }>
              <SettingCard label="Auto Save Interval" description="0 disables automatic draft persistence">
                <div class="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="3600"
                    value={settings().sessions.auto_save_interval_secs}
                    onInput={(e) => {
                      const next = Number(e.currentTarget.value || 0);
                      updateSetting('sessions', 'auto_save_interval_secs', clamp(next, 0, 3600));
                    }}
                    class={`${INPUT_CLASS} w-28`}
                    aria-label="Auto Save Interval Seconds"
                  />
                  <span class="text-xs text-text-tertiary">seconds</span>
                </div>
              </SettingCard>
            </Show>
          </Match>

          <Match when={props.category === 'keybindings'}>
            <Show when={visible('Keybindings JSON', 'Custom shortcut overrides') }>
              <SettingCard
                label="Keybindings Overrides"
                description="Custom keybindings are stored as a JSON object (feature wiring to editor is coming next)."
              >
                <textarea
                  class={`${TEXTAREA_CLASS} h-44 font-mono text-xs`}
                  readOnly
                  value={JSON.stringify(settings().keybindings, null, 2)}
                  aria-label="Keybindings JSON preview"
                />
              </SettingCard>
            </Show>
          </Match>

          <Match when={props.category === 'privacy'}>
            <Show when={visible('Log Redaction Level', 'Diagnostic log redaction aggressiveness') }>
              <SettingCard label="Log Redaction Level" description="Controls redaction in exported diagnostics bundles">
                <select
                  class={SELECT_CLASS}
                  value={settings().privacy.log_redaction_level}
                  onChange={(e) =>
                    updateSetting(
                      'privacy',
                      'log_redaction_level',
                      e.currentTarget.value as UserSettings['privacy']['log_redaction_level'],
                    )
                  }
                  aria-label="Log Redaction Level"
                >
                  <option value="none">None</option>
                  <option value="standard">Standard</option>
                  <option value="aggressive">Aggressive</option>
                </select>
              </SettingCard>
            </Show>
          </Match>

          <Match when={props.category === 'advanced'}>
            <Show when={visible('CLI Path Override', 'Use a custom Claude CLI binary path') }>
              <SettingCard label="CLI Path Override" description="Leave empty to auto-detect the Claude CLI binary">
                <input
                  type="text"
                  value={settings().advanced.cli_path_override}
                  onInput={(e) => updateSetting('advanced', 'cli_path_override', e.currentTarget.value)}
                  placeholder="/usr/local/bin/claude"
                  class={`${INPUT_CLASS} w-full`}
                  aria-label="CLI Path Override"
                />
              </SettingCard>
            </Show>

            <Show when={visible('Debug Mode', 'Enable additional frontend debug behavior') }>
              <ToggleCard
                label="Debug Mode"
                description="Enable extra debug logging and troubleshooting UI"
                checked={settings().advanced.debug_mode}
                onChange={(checked) => updateSetting('advanced', 'debug_mode', checked)}
              />
            </Show>

            <Show when={visible('Developer Mode', 'Default permission tier preference') }>
              <ToggleCard
                label="Developer Mode"
                description="Persist developer permission tier preference for future sessions"
                checked={settings().advanced.developer_mode}
                onChange={(checked) => updateSetting('advanced', 'developer_mode', checked)}
              />
            </Show>

            <Show when={visible('Raw JSON', 'Advanced settings preview') }>
              <SettingCard label="Raw JSON" description="Live settings JSON preview for advanced troubleshooting">
                <textarea
                  class={`${TEXTAREA_CLASS} h-56 font-mono text-xs`}
                  readOnly
                  value={JSON.stringify(settings(), null, 2)}
                  aria-label="Raw settings JSON preview"
                />
              </SettingCard>
            </Show>
          </Match>

          <Match when={props.category === 'about'}>
            <SettingCard label="About Settings" description="Current settings schema and quick access guidance">
              <div class="space-y-3 text-sm text-text-secondary">
                <div>
                  <span class="text-text-tertiary">Schema version:</span>{' '}
                  <span class="font-medium text-text-primary">v{settings().version}</span>
                </div>
                <div>
                  <span class="text-text-tertiary">Open settings:</span>{' '}
                  <code class="text-xs px-1.5 py-0.5 rounded bg-bg-inset text-text-primary">Cmd+,</code>
                </div>
                <div>
                  <span class="text-text-tertiary">Close settings:</span>{' '}
                  <code class="text-xs px-1.5 py-0.5 rounded bg-bg-inset text-text-primary">Escape</code>
                </div>
                <p class="text-xs text-text-tertiary">
                  This screen currently reflects the CHI-122 backend settings schema. Additional settings categories from the UX spec can be layered on top as the backend schema expands.
                </p>
              </div>
            </SettingCard>
          </Match>
        </Switch>
      </div>

      <Show when={normalizeSearch(props.searchQuery)}>
        <div class="text-xs text-text-tertiary">
          Filtering by “{props.searchQuery.trim()}”. Results are scoped to the selected category and category list.
        </div>
      </Show>

      <Show when={normalizeSearch(props.searchQuery) && noVisibleSettings(props.category, props.searchQuery)}>
        <div class="text-sm text-text-tertiary rounded-md px-3 py-2 border border-border-secondary bg-bg-secondary/20">
          No settings in this category match the current search.
        </div>
      </Show>
    </div>
  );
};

function noVisibleSettings(category: ModalCategory, query: string): boolean {
  const q = normalizeSearch(query);
  if (!q) return false;
  if (category === 'about') return !matchesSearch(query, 'about settings version keyboard shortcuts');
  return !SEARCH_INDEX[category].some((entry) =>
    matchesSearch(query, category, entry.label, entry.description),
  );
}

const SettingCard: ParentComponent<{ label: string; description: string }> = (props) => (
  <section
    class="rounded-lg p-4"
    style={{
      border: '1px solid var(--color-border-secondary)',
      background: 'var(--color-bg-secondary)',
    }}
  >
    <div class="flex items-start justify-between gap-4">
      <div class="min-w-0">
        <h3 class="text-sm font-medium text-text-primary">{props.label}</h3>
        <p class="mt-1 text-xs leading-relaxed text-text-tertiary">{props.description}</p>
      </div>
      <div class="shrink-0">{props.children}</div>
    </div>
  </section>
);

const RangeCard: Component<{
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (value: number) => void;
}> = (props) => (
  <SettingCard label={props.label} description={props.description}>
    <div class="flex items-center gap-3">
      <input
        type="range"
        min={props.min}
        max={props.max}
        value={props.value}
        onInput={(e) => props.onChange(Number(e.currentTarget.value))}
        class="w-40 accent-[var(--color-accent)]"
        aria-label={props.label}
      />
      <span class="w-12 text-right text-xs font-medium text-text-primary">
        {props.value}
        {props.unit}
      </span>
    </div>
  </SettingCard>
);

const ToggleCard: Component<{
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}> = (props) => (
  <SettingCard label={props.label} description={props.description}>
    <label class="inline-flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.currentTarget.checked)}
        class="accent-[var(--color-accent)]"
        aria-label={props.label}
      />
      <span class="text-xs text-text-secondary">{props.checked ? 'Enabled' : 'Disabled'}</span>
    </label>
  </SettingCard>
);

export default SettingsModal;
