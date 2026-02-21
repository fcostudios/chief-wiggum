import type { Component } from 'solid-js';
import { onMount } from 'solid-js';
import MainLayout from '@/components/layout/MainLayout';
import { detectCli } from '@/stores/cliStore';

const App: Component = () => {
  onMount(() => {
    detectCli();
  });

  return <MainLayout />;
};

export default App;
