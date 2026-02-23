import type { Component } from 'solid-js';
import { createEffect, onMount } from 'solid-js';
import MainLayout from '@/components/layout/MainLayout';
import { detectCli } from '@/stores/cliStore';
import { getActiveProject, loadProjects, projectState } from '@/stores/projectStore';
import { loadCommands, startSdkCommandListener } from '@/stores/slashStore';
import { reconnectAfterReload } from '@/stores/conversationStore';
import { sessionState } from '@/stores/sessionStore';

const App: Component = () => {
  // Reload slash commands after project auto-selection or project switches so
  // project-scoped `.claude/commands` are reflected without needing a CLI init.
  createEffect(() => {
    void projectState.activeProjectId;
    const projectPath = getActiveProject()?.path;
    void loadCommands(projectPath);
  });

  onMount(() => {
    detectCli();
    loadProjects();
    void startSdkCommandListener();

    // Allow session store to load first, then reconnect to active CLI bridges
    setTimeout(async () => {
      await reconnectAfterReload(sessionState.activeSessionId);
    }, 100);
  });

  return <MainLayout />;
};

export default App;
