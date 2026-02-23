import type { Component } from 'solid-js';
import { onMount } from 'solid-js';
import MainLayout from '@/components/layout/MainLayout';
import { detectCli } from '@/stores/cliStore';
import { loadProjects } from '@/stores/projectStore';
import { loadCommands, startSdkCommandListener } from '@/stores/slashStore';
import { reconnectAfterReload } from '@/stores/conversationStore';
import { sessionState } from '@/stores/sessionStore';

const App: Component = () => {
  onMount(() => {
    detectCli();
    loadProjects();
    loadCommands();
    void startSdkCommandListener();

    // Allow session store to load first, then reconnect to active CLI bridges
    setTimeout(async () => {
      await reconnectAfterReload(sessionState.activeSessionId);
    }, 100);
  });

  return <MainLayout />;
};

export default App;
