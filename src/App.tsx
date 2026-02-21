import type { Component } from 'solid-js';

const App: Component = () => {
  return (
    <main class="flex items-center justify-center h-screen bg-bg-primary text-text-primary font-ui select-none">
      <div class="text-center opacity-70">
        <h1 class="text-2xl font-semibold mb-2">Chief Wiggum</h1>
        <p class="text-sm text-text-secondary">Desktop GUI for Claude Code</p>
      </div>
    </main>
  );
};

export default App;
