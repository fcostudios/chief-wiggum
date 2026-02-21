import type { Component } from 'solid-js';
import { onMount } from 'solid-js';
import MainLayout from '@/components/layout/MainLayout';
import { detectCli } from '@/stores/cliStore';
import { loadProjects } from '@/stores/projectStore';

const App: Component = () => {
  onMount(() => {
    detectCli();
    loadProjects();
  });

  return <MainLayout />;
};

export default App;
