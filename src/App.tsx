import type { Component } from 'solid-js';
import { createEffect, onCleanup, onMount } from 'solid-js';
import MainLayout from '@/components/layout/MainLayout';
import { detectCli } from '@/stores/cliStore';
import { getActiveProject, loadProjects, projectState } from '@/stores/projectStore';
import { loadCommands, startSdkCommandListener } from '@/stores/slashStore';
import { reconnectAfterReload } from '@/stores/conversationStore';
import { loadSettings, settingsState, startSettingsListener } from '@/stores/settingsStore';
import {
  setupActionListeners,
  cleanupActionListeners,
  syncRunningActions,
  discoverActions,
  clearActionCatalog,
} from '@/stores/actionStore';
import { sessionState } from '@/stores/sessionStore';
import { switchLocale } from '@/stores/i18nStore';

const App: Component = () => {
  let lastAppliedLocale: string | null = null;

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

  onMount(() => {
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
  });

  onCleanup(() => {
    void cleanupActionListeners();
  });

  return <MainLayout />;
};

export default App;
