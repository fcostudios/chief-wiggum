# CHI-87 & CHI-88: View Tabs with Icons + Sidebar Search Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enhance view tabs with Lucide icons and optional count badges, and add a search/filter input to the sidebar's sessions section.

**Architecture:** Both features are pure frontend — no backend changes. CHI-87 modifies the `ViewTab` component in `MainLayout.tsx` to render icons alongside labels, with badge support from a new `viewBadges` state in `uiStore.ts`. CHI-88 adds a search input in `Sidebar.tsx` with local `createSignal` for the query and a derived filtered-sessions signal that feeds into the existing Pinned/Recent/Older sections.

**Tech Stack:** SolidJS 1.9, TailwindCSS v4, lucide-solid (already installed), SPEC-002 design tokens

---

## Task 1: Add View Tab Icon Mapping and Badge State

**Files:**
- Modify: `src/stores/uiStore.ts`
- Modify: `src/components/layout/MainLayout.tsx`

**Step 1: Add `viewBadges` to UIState**

In `src/stores/uiStore.ts`, add badge counts to the state so other components can set them:

```typescript
// Add to UIState interface:
viewBadges: Record<ActiveView, number>;
```

Initial state:
```typescript
viewBadges: { conversation: 0, agents: 0, diff: 0, terminal: 0 },
```

Add mutation:
```typescript
/** Set the badge count for a view tab. 0 hides the badge. */
export function setViewBadge(view: ActiveView, count: number) {
  setState('viewBadges', view, Math.max(0, count));
}
```

**Step 2: Update ViewTab component with icons**

In `src/components/layout/MainLayout.tsx`:

Add imports:
```typescript
import { MessageSquare, Users, GitCompare, Terminal } from 'lucide-solid';
```

Add icon map (above the ViewTab component):
```typescript
const VIEW_ICONS: Record<string, Component<{ size?: number; class?: string }>> = {
  conversation: MessageSquare,
  agents: Users,
  diff: GitCompare,
  terminal: Terminal,
};
```

Update ViewTab props and body:
```tsx
const ViewTab: Component<{ label: string; view: string }> = (props) => {
  const isActive = () => uiState.activeView === props.view;
  const Icon = VIEW_ICONS[props.view];
  const badge = () => uiState.viewBadges[props.view as ActiveView] ?? 0;

  return (
    <button
      class={`relative flex items-center gap-1.5 px-3 py-2 text-xs font-medium tracking-wide transition-colors ${
        isActive() ? 'text-text-primary' : 'text-text-tertiary hover:text-text-secondary'
      }`}
      style={{ 'transition-duration': 'var(--duration-normal)' }}
      onClick={() => setActiveView(props.view as ActiveView)}
      title={props.label}
    >
      {Icon && <Icon size={13} />}
      <span>{props.label}</span>
      {/* Badge — only visible when count > 0 */}
      <Show when={badge() > 0}>
        <span
          class="ml-0.5 text-[9px] font-semibold leading-none px-1 py-0.5 rounded-full"
          style={{
            background: 'var(--color-accent)',
            color: 'var(--color-bg-primary)',
            'min-width': '14px',
            'text-align': 'center',
          }}
        >
          {badge() > 99 ? '99+' : badge()}
        </span>
      </Show>
      {/* Active indicator — warm accent line with subtle glow */}
      <div
        class="absolute bottom-0 left-2 right-2 h-[2px] rounded-full transition-all"
        style={{
          'transition-duration': 'var(--duration-normal)',
          'transition-timing-function': 'var(--ease-default)',
          background: isActive() ? 'var(--color-accent)' : 'transparent',
          'box-shadow': isActive() ? '0 0 8px rgba(232, 130, 90, 0.4)' : 'none',
          opacity: isActive() ? '1' : '0',
        }}
      />
    </button>
  );
};
```

**Step 3: Add `Show` import if missing**

Verify `Show` is already imported from `solid-js` in MainLayout.tsx (it is — line 10).

**Step 4: Run verification**

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean

**Step 5: Commit**

```bash
git add src/stores/uiStore.ts src/components/layout/MainLayout.tsx
git commit -m "feat: view tabs with Lucide icons and badge support (CHI-87)"
```

---

## Task 2: Sidebar Session Search Input

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

**Step 1: Add search imports and state**

Add `Search` and `X` icons to the lucide-solid import:
```typescript
import {
  Plus, Trash2, MessageSquare, FolderOpen, Pin, FileCode, MoreHorizontal, Zap,
  Search, X,
} from 'lucide-solid';
```

Inside the `Sidebar` component, add search state:
```typescript
const [searchQuery, setSearchQuery] = createSignal('');
let searchInputRef: HTMLInputElement | undefined;
```

**Step 2: Add debounced filter**

Add a debounced query signal and filtered sessions derived from it. Place inside the Sidebar component body:

```typescript
/** Debounced search query — 100ms delay. */
const [debouncedQuery, setDebouncedQuery] = createSignal('');
let debounceTimer: ReturnType<typeof setTimeout> | undefined;

function updateSearch(value: string) {
  setSearchQuery(value);
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    setDebouncedQuery(value.trim().toLowerCase());
  }, 100);
}

onCleanup(() => clearTimeout(debounceTimer));
```

**Step 3: Update session section derivations to respect search**

Replace the existing `filteredSessions` function and section derivations:

```typescript
/** Sessions filtered by active project. Shows all if no project selected. */
const projectFilteredSessions = () => {
  const projectId = projectState.activeProjectId;
  if (!projectId) return sessionState.sessions;
  return sessionState.sessions.filter((s) => s.project_id === projectId || !s.project_id);
};

/** Sessions filtered by both project AND search query. */
const filteredSessions = () => {
  const query = debouncedQuery();
  if (!query) return projectFilteredSessions();
  return projectFilteredSessions().filter((s) => {
    const title = (s.title || 'New Session').toLowerCase();
    return title.includes(query);
  });
};

const pinnedSessions = () => filteredSessions().filter((s) => s.pinned);
const recentSessions = () => {
  const cutoff = Date.now() - 86400000;
  return filteredSessions().filter(
    (s) => !s.pinned && s.updated_at && new Date(s.updated_at).getTime() > cutoff,
  );
};
const olderSessions = () => {
  const cutoff = Date.now() - 86400000;
  return filteredSessions().filter(
    (s) => !s.pinned && (!s.updated_at || new Date(s.updated_at).getTime() <= cutoff),
  );
};
```

**Step 4: Add search input UI below Sessions header**

Replace the existing "Sessions header" `<Show>` block (lines 378-416) with a version that includes the search input:

```tsx
{/* Sessions header */}
<Show
  when={!isCollapsed()}
  fallback={
    /* Collapsed: divider line only (sessions section flows directly below) */
    <div
      class="flex justify-center py-1"
      style={{ 'border-bottom': '1px solid var(--color-border-secondary)' }}
    >
      <span
        class="text-[9px] font-mono px-1 py-0.5 rounded-full"
        style={{
          background: 'var(--color-bg-elevated)',
          color: 'var(--color-text-tertiary)',
        }}
        title={`${filteredSessions().length} sessions`}
      >
        {filteredSessions().length}
      </span>
    </div>
  }
>
  <div style={{ 'border-bottom': '1px solid var(--color-border-secondary)' }}>
    <div class="flex items-center justify-between px-3 py-2">
      <span class="text-[10px] font-semibold text-text-tertiary uppercase tracking-[0.1em]">
        Sessions
      </span>
      <span
        class="text-[10px] font-mono px-1.5 py-0.5 rounded-full"
        style={{
          background: 'var(--color-bg-elevated)',
          color: 'var(--color-text-tertiary)',
        }}
      >
        {filteredSessions().length}
      </span>
    </div>
    {/* Search input */}
    <div class="px-2 pb-2">
      <div
        class="flex items-center gap-1.5 px-2 py-1 rounded-md"
        style={{
          background: 'var(--color-bg-inset)',
          border: '1px solid var(--color-border-secondary)',
        }}
      >
        <Search size={11} class="shrink-0 text-text-tertiary" />
        <input
          ref={searchInputRef}
          type="text"
          placeholder="Filter sessions..."
          value={searchQuery()}
          onInput={(e) => updateSearch(e.currentTarget.value)}
          class="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-tertiary/40 outline-none min-w-0"
        />
        <Show when={searchQuery().length > 0}>
          <button
            class="shrink-0 p-0.5 rounded text-text-tertiary hover:text-text-primary transition-colors"
            style={{ 'transition-duration': 'var(--duration-fast)' }}
            onClick={() => {
              updateSearch('');
              searchInputRef?.focus();
            }}
            aria-label="Clear search"
          >
            <X size={11} />
          </button>
        </Show>
      </div>
    </div>
  </div>
</Show>
```

**Step 5: Update empty state for search results**

Replace the existing `filteredSessions().length > 0` Show block's fallback (lines 422-428) with a version that differentiates "no sessions" from "no search results":

```tsx
<Show
  when={filteredSessions().length > 0}
  fallback={
    <Show when={!isCollapsed()}>
      <div class="px-2 py-6 text-center animate-fade-in">
        <Show
          when={debouncedQuery().length > 0}
          fallback={
            <>
              <p class="text-xs text-text-tertiary/60 tracking-wide">No sessions yet</p>
              <p class="text-[10px] text-text-tertiary/40 mt-1">Create one to get started</p>
            </>
          }
        >
          <p class="text-xs text-text-tertiary/60 tracking-wide">No matching sessions</p>
          <p class="text-[10px] text-text-tertiary/40 mt-1">Try a different search term</p>
        </Show>
      </div>
    </Show>
  }
>
```

**Step 6: Run verification**

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean

**Step 7: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "feat: sidebar session search with debounced filtering (CHI-88)"
```

---

## Verification

1. `npx tsc --noEmit` — TypeScript clean
2. `npx eslint .` — No lint errors
3. `npx vite build` — Build succeeds
4. Manual test — View tabs:
   - All 4 tabs show Lucide icons (MessageSquare, Users, GitCompare, Terminal) alongside labels
   - Active tab has text-primary color + accent underline + icon
   - Inactive tabs have tertiary color, hover transitions to secondary
   - Badge renders when count > 0 (test via dev console: call `setViewBadge('terminal', 3)`)
5. Manual test — Sidebar search:
   - Search input visible below "Sessions" header when sidebar is expanded
   - Typing filters sessions in real-time (100ms debounce)
   - Clear button (X) appears when query is non-empty
   - "No matching sessions" shown when filter yields zero results
   - Collapsed sidebar does NOT show search input
   - Pinned/Recent/Older sections filter correctly
