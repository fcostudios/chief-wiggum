import type { Component } from 'solid-js';
import { Show, createEffect, onCleanup, onMount } from 'solid-js';
import MainLayout from '@/components/layout/MainLayout';
import OnboardingFlow from '@/components/onboarding/OnboardingFlow';
import { detectCli } from '@/stores/cliStore';
import { getActiveProject, loadProjects, projectState } from '@/stores/projectStore';
import { loadCommands, startSdkCommandListener } from '@/stores/slashStore';
import { reconnectAfterReload } from '@/stores/conversationStore';
import {
  isOnboardingCompleted,
  loadSettings,
  settingsState,
  startSettingsListener,
} from '@/stores/settingsStore';
import { dismissHint, hintState, maybeShowHint } from '@/stores/hintStore';
import {
  setupActionListeners,
  cleanupActionListeners,
  syncRunningActions,
  discoverActions,
  clearActionCatalog,
} from '@/stores/actionStore';
import { sessionState } from '@/stores/sessionStore';
import { switchLocale } from '@/stores/i18nStore';
import { incrementSessionCount } from '@/stores/onboardingStore';
import { HintTooltip } from '@/components/common/HintTooltip';
import ImportDialog from '@/components/import/ImportDialog';
// Renderer registrations (side effects — register into rendererRegistry)
import './components/conversation/renderers/MermaidRenderer';
import './components/conversation/renderers/MathRenderer';
import './components/conversation/renderers/ImageRenderer';

const App: Component = () => {
  let lastAppliedLocale: string | null = null;

  function applyTheme(theme: string): void {
    if (typeof document === 'undefined') return;

    if (theme === 'system' && typeof window !== 'undefined') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
      return;
    }

    document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : 'dark');
  }

  // Reload slash commands after project auto-selection or project switches so
  // project-scoped `.claude/commands` are reflected without needing a CLI init.
  createEffect(() => {
    void projectState.activeProjectId;
    const projectPath = getActiveProject()?.path;
    void loadCommands(projectPath);

    if (projectPath) {
      void discoverActions(projectPath);
    } else {
      clearActionCatalog();
    }
  });

  // Keep UI locale in sync with persisted settings once settings are loaded.
  createEffect(() => {
    if (!settingsState.isLoaded) return;
    const configuredLocale = settingsState.settings.i18n.locale;
    if (configuredLocale === lastAppliedLocale) return;
    lastAppliedLocale = configuredLocale;
    void switchLocale(configuredLocale);
  });

  createEffect(() => {
    applyTheme(settingsState.settings.appearance.theme ?? 'dark');
  });

  onMount(() => {
    incrementSessionCount();
    detectCli();
    loadProjects();
    void startSdkCommandListener();
    void loadSettings().then(() => startSettingsListener());

    void (async () => {
      await setupActionListeners();
      await syncRunningActions();
      const projectPath = getActiveProject()?.path;
      if (projectPath) {
        void discoverActions(projectPath);
      }
    })();

    // Allow session store to load first, then reconnect to active CLI bridges
    setTimeout(async () => {
      await reconnectAfterReload(sessionState.activeSessionId);
    }, 100);

    const hintTimer = setTimeout(
      () => {
        maybeShowHint('keyboard-shortcuts', 'Press Cmd+/ to see all keyboard shortcuts', 'Cmd+/');
      },
      5 * 60 * 1000,
    );

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = () => {
      if (settingsState.settings.appearance.theme === 'system') {
        applyTheme('system');
      }
    };
    mediaQuery.addEventListener('change', handleSystemThemeChange);
    onCleanup(() => {
      clearTimeout(hintTimer);
      mediaQuery.removeEventListener('change', handleSystemThemeChange);
    });
  });

  onCleanup(() => {
    void cleanupActionListeners();
  });

  return (
    <>
      <MainLayout />
      <Show when={settingsState.isLoaded && !isOnboardingCompleted()}>
        <OnboardingFlow />
      </Show>
      <Show when={hintState.activeHint}>
        {(hint) => (
          <div class="fixed z-[9999]" style={{ bottom: '64px', right: '16px' }}>
            <HintTooltip
              id={hint().id}
              text={hint().text}
              shortcut={hint().shortcut}
              onDismiss={dismissHint}
            />
          </div>
        )}
      </Show>
      <ImportDialog />
    </>
  );
};

export default App;
