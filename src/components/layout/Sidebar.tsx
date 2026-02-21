// src/components/layout/Sidebar.tsx
// Left sidebar (240px) per SPEC-003 §2 Z2.
// Sections: Sessions list (placeholder), New Session button.
// Width managed by parent via uiState.sidebarVisible.

import type { Component } from 'solid-js';
import { Plus } from 'lucide-solid';

const Sidebar: Component = () => {
  return (
    <nav class="flex flex-col h-full" aria-label="Sidebar">
      {/* Sessions header */}
      <div class="flex items-center justify-between px-3 py-2 border-b border-border-secondary">
        <span class="text-xs font-semibold text-text-secondary uppercase tracking-wider">
          Sessions
        </span>
      </div>

      {/* Session list — placeholder */}
      <div class="flex-1 overflow-y-auto px-2 py-2">
        <p class="text-xs text-text-tertiary px-2 py-4 text-center">No active sessions</p>
      </div>

      {/* New session button */}
      <div class="p-2 border-t border-border-secondary">
        <button
          class="flex items-center justify-center gap-2 w-full py-1.5 rounded-md text-sm text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
          style={{ 'transition-duration': 'var(--duration-fast)' }}
          aria-label="New session"
        >
          <Plus size={14} />
          <span>New Session</span>
        </button>
      </div>
    </nav>
  );
};

export default Sidebar;
