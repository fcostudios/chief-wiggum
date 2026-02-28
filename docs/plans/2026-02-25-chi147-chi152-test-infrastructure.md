# Test Infrastructure: Frontend Unit Tests & Rust Backend Coverage Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Establish frontend unit testing with vitest + solid-testing-library + IPC mocks (Track A), then fill critical Rust backend test gaps across event loop, IPC commands, actions system, and permission security (Track B) to reach 85-95% coverage on all untested modules.

**Architecture:** Track A bootstraps vitest with `jsdom` environment, SolidJS JSX transform via `vite-plugin-solid`, a `mockIPC` helper that intercepts `@tauri-apps/api/core` `invoke()` calls, and 8 store smoke tests proving the mock layer works. Track B adds ~70 Rust tests across 5 tasks: event loop payload mapping (CHI-148), bridge IPC commands (CHI-149), actions system (CHI-150), remaining IPC commands (CHI-151), and security-focused permission tests at 95% coverage (CHI-152). All Rust tests use existing patterns: `#[tokio::test]`, `MockBridge`, in-memory `Database`, and `tempfile` for filesystem tests.

**Tech Stack:** Vitest 3.x, @solidjs/testing-library, jsdom, @vitest/coverage-v8, Rust (tokio, tempfile, uuid), existing MockBridge infrastructure

---

## Track A: Frontend Test Infrastructure

### Task 1: Install Dependencies & Configure Vitest (CHI-147)

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Modify: `tsconfig.json`

**Step 1: Install vitest and testing dependencies**

Run:
```bash
npm install -D vitest @solidjs/testing-library jsdom @vitest/coverage-v8 @testing-library/jest-dom
```

**Step 2: Create vitest.config.ts**

```typescript
// vitest.config.ts
/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import solid from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solid()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/test/**', 'src/**/*.test.*', 'src/index.tsx'],
    },
    // SolidJS requires these for proper reactive testing
    testTransformMode: {
      web: ['/.[jt]sx?$/'],
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify('0.0.0-test'),
  },
});
```

**Step 3: Add npm scripts to package.json**

Add to `"scripts"`:
```json
"test:unit": "vitest run",
"test:unit:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

**Step 4: Update tsconfig.json**

Add `"vitest/globals"` to the `"types"` array:
```json
"types": ["vite/client", "vitest/globals"]
```

**Step 5: Run verification**

Run: `npx tsc --noEmit`
Expected: Clean (vitest global types recognized)

**Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts tsconfig.json
git commit -m "feat: install vitest + solid-testing-library + coverage tooling (CHI-147)"
```

---

### Task 2: Mock IPC Layer & Test Helpers (CHI-147)

**Files:**
- Create: `src/test/setup.ts`
- Create: `src/test/helpers.ts`
- Create: `src/test/mockIPC.ts`

**Step 1: Create mockIPC.ts**

This intercepts `@tauri-apps/api/core` `invoke()` calls so store tests can run without a Tauri backend.

```typescript
// src/test/mockIPC.ts
// Mock layer for @tauri-apps/api/core invoke() calls.
// Use mockIPC() in test setup to register handlers per command name.

import { vi } from 'vitest';

type IpcHandler = (args: Record<string, unknown>) => unknown;

const handlers = new Map<string, IpcHandler>();
let defaultHandler: IpcHandler | null = null;

/** Register a mock handler for a specific IPC command. */
export function mockIpcCommand(command: string, handler: IpcHandler): void {
  handlers.set(command, handler);
}

/** Register a default handler for unmatched commands (returns undefined). */
export function mockIpcDefault(handler: IpcHandler): void {
  defaultHandler = handler;
}

/** Clear all registered mock handlers. */
export function clearIpcMocks(): void {
  handlers.clear();
  defaultHandler = null;
}

/** The mock invoke function that replaces @tauri-apps/api/core invoke(). */
export async function mockInvoke(cmd: string, args?: Record<string, unknown>): Promise<unknown> {
  const handler = handlers.get(cmd);
  if (handler) {
    return handler(args ?? {});
  }
  if (defaultHandler) {
    return defaultHandler(args ?? {});
  }
  // Default: return undefined (no-op) rather than throwing
  return undefined;
}

/** The mock listen function that replaces @tauri-apps/api/event listen(). */
export function mockListen(): Promise<() => void> {
  return Promise.resolve(() => {});
}

// Set up the module mocks — vitest will intercept imports
vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: mockListen,
  emit: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-os', () => ({
  platform: () => 'macos',
}));
```

**Step 2: Create setup.ts**

```typescript
// src/test/setup.ts
// Global test setup — runs before every test file.

import './mockIPC';
import { clearIpcMocks } from './mockIPC';
import { afterEach } from 'vitest';

// Clean up IPC mocks between tests
afterEach(() => {
  clearIpcMocks();
});

// Mock window.matchMedia (used by theme system)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: query.includes('dark'),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Mock localStorage
const localStorageMock: Storage = {
  length: 0,
  clear: () => {},
  getItem: () => null,
  key: () => null,
  removeItem: () => {},
  setItem: () => {},
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock crypto.randomUUID
if (!globalThis.crypto?.randomUUID) {
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      randomUUID: () =>
        'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        }),
    },
  });
}
```

**Step 3: Create helpers.ts**

```typescript
// src/test/helpers.ts
// Test data factories for common types.

import type { Message, Session } from '@/lib/types';

let idCounter = 0;

export function createTestSession(overrides?: Partial<Session>): Session {
  idCounter++;
  return {
    id: `test-session-${idCounter}`,
    title: `Test Session ${idCounter}`,
    model: 'claude-sonnet-4-6',
    project_id: null,
    cli_session_id: null,
    pinned: false,
    total_input_tokens: 0,
    total_output_tokens: 0,
    total_cost_cents: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

export function createTestMessage(overrides?: Partial<Message>): Message {
  idCounter++;
  return {
    id: `test-msg-${idCounter}`,
    session_id: 'test-session-1',
    role: 'user',
    content: `Test message ${idCounter}`,
    model: null,
    input_tokens: null,
    output_tokens: null,
    thinking_tokens: null,
    cost_cents: null,
    is_compacted: false,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

/** Reset the ID counter between test files. */
export function resetTestIdCounter(): void {
  idCounter = 0;
}
```

**Step 4: Verify setup compiles**

Run: `npx vitest run --no-coverage 2>&1 | head -20`
Expected: "No test files found" or similar (no tests written yet), but no config errors.

**Step 5: Commit**

```bash
git add src/test/
git commit -m "feat: mock IPC layer and test helpers for vitest (CHI-147)"
```

---

### Task 3: Store Smoke Tests (CHI-147)

**Files:**
- Create: `src/stores/uiStore.test.ts`
- Create: `src/stores/sessionStore.test.ts`
- Create: `src/stores/toastStore.test.ts`
- Create: `src/stores/cliStore.test.ts`

**Step 1: Create uiStore smoke test**

```typescript
// src/stores/uiStore.test.ts
import { describe, it, expect } from 'vitest';
import { uiState, setActiveView, toggleSidebar, toggleDetailsPanel, toggleKeyboardHelp } from './uiStore';

describe('uiStore', () => {
  it('initializes with conversation as active view', () => {
    expect(uiState.activeView).toBe('conversation');
  });

  it('switches active view', () => {
    setActiveView('terminal');
    expect(uiState.activeView).toBe('terminal');
    setActiveView('conversation');
  });

  it('toggles sidebar state', () => {
    const initial = uiState.sidebarState;
    toggleSidebar();
    expect(uiState.sidebarState).not.toBe(initial);
    // Reset
    while (uiState.sidebarState !== 'expanded') toggleSidebar();
  });

  it('toggles details panel', () => {
    const initial = uiState.detailsPanelVisible;
    toggleDetailsPanel();
    expect(uiState.detailsPanelVisible).toBe(!initial);
    toggleDetailsPanel(); // Reset
  });

  it('initializes YOLO mode as false by default', () => {
    expect(uiState.yoloMode).toBe(false);
  });
});
```

**Step 2: Create sessionStore smoke test**

```typescript
// src/stores/sessionStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mockIpcCommand } from '@/test/mockIPC';
import { createTestSession } from '@/test/helpers';

describe('sessionStore', () => {
  beforeEach(() => {
    // Mock the create_session IPC command
    mockIpcCommand('create_session', (args) => {
      return createTestSession({
        model: (args as { model: string }).model ?? 'claude-sonnet-4-6',
      });
    });

    mockIpcCommand('list_all_sessions', () => []);
  });

  it('exports sessionState with sessions array', async () => {
    const { sessionState } = await import('./sessionStore');
    expect(Array.isArray(sessionState.sessions)).toBe(true);
  });

  it('exports activeSessionId as null initially', async () => {
    const { sessionState } = await import('./sessionStore');
    expect(sessionState.activeSessionId).toBeNull();
  });
});
```

**Step 3: Create toastStore smoke test**

```typescript
// src/stores/toastStore.test.ts
import { describe, it, expect } from 'vitest';
import { toastState, addToast, dismissToast } from './toastStore';

describe('toastStore', () => {
  it('starts with empty toasts', () => {
    expect(toastState.toasts).toEqual([]);
  });

  it('adds a toast', () => {
    addToast('Test message', 'info');
    expect(toastState.toasts.length).toBeGreaterThan(0);
    expect(toastState.toasts[0].message).toBe('Test message');
    // Cleanup
    dismissToast(toastState.toasts[0].id);
  });

  it('limits to max 3 toasts', () => {
    addToast('One', 'info');
    addToast('Two', 'info');
    addToast('Three', 'info');
    addToast('Four', 'info');
    expect(toastState.toasts.length).toBeLessThanOrEqual(3);
    // Cleanup
    for (const t of [...toastState.toasts]) dismissToast(t.id);
  });
});
```

**Step 4: Create cliStore smoke test**

```typescript
// src/stores/cliStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mockIpcCommand } from '@/test/mockIPC';

describe('cliStore', () => {
  beforeEach(() => {
    mockIpcCommand('get_cli_info', () => ({
      is_detected: true,
      binary_path: '/usr/local/bin/claude',
      version: '2.1.0',
      supports_sdk: true,
    }));
  });

  it('exports cliState with detection fields', async () => {
    const { cliState } = await import('./cliStore');
    expect(cliState).toHaveProperty('isDetected');
    expect(cliState).toHaveProperty('location');
  });
});
```

**Step 5: Run all smoke tests**

Run: `npx vitest run`
Expected: 4 test files, all tests pass

**Step 6: Commit**

```bash
git add src/stores/*.test.ts
git commit -m "test: store smoke tests with mock IPC (CHI-147)"
```

---

### Task 4: CI Integration for Frontend Tests (CHI-147)

**Files:**
- Modify: `.github/workflows/ci.yml`

**Step 1: Add unit test step to CI**

In `.github/workflows/ci.yml`, add a new matrix entry to the `frontend` job:

```yaml
  frontend:
    name: Frontend (${{ matrix.check }})
    runs-on: ubuntu-latest
    strategy:
      matrix:
        check: [typecheck, lint, format, test]
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - run: npm ci

      - name: TypeScript type-check
        if: matrix.check == 'typecheck'
        run: npm run typecheck

      - name: ESLint
        if: matrix.check == 'lint'
        run: npm run lint

      - name: Prettier check
        if: matrix.check == 'format'
        run: npm run format:check

      - name: Unit tests
        if: matrix.check == 'test'
        run: npm run test:unit
```

**Step 2: Run full CI check locally**

Run: `npx tsc --noEmit && npx eslint . && npx vitest run`
Expected: All pass

**Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add frontend unit test step to CI pipeline (CHI-147)"
```

---

## Track B: Rust Backend Test Coverage

### Task 5: Event Loop Tests (CHI-148)

**Files:**
- Modify: `src-tauri/src/bridge/event_loop.rs` (add `#[cfg(test)] mod tests` at end)

**Step 1: Add unit tests for event payload construction**

Append to end of `src-tauri/src/bridge/event_loop.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::bridge::{BridgeEvent, BridgeOutput};

    #[test]
    fn chunk_payload_serializes_correctly() {
        let payload = ChunkPayload {
            session_id: "s1".to_string(),
            content: "Hello world".to_string(),
            token_count: Some(3),
        };
        let json = serde_json::to_string(&payload).unwrap();
        assert!(json.contains("\"session_id\":\"s1\""));
        assert!(json.contains("\"content\":\"Hello world\""));
        assert!(json.contains("\"token_count\":3"));
    }

    #[test]
    fn message_complete_payload_serializes_with_all_fields() {
        let payload = MessageCompletePayload {
            session_id: "s1".to_string(),
            role: "assistant".to_string(),
            content: "Hello!".to_string(),
            model: Some("claude-sonnet-4-6".to_string()),
            input_tokens: Some(10),
            output_tokens: Some(5),
            thinking_tokens: Some(2),
            cost_cents: Some(0.05),
            is_error: false,
        };
        let json = serde_json::to_string(&payload).unwrap();
        assert!(json.contains("\"role\":\"assistant\""));
        assert!(json.contains("\"model\":\"claude-sonnet-4-6\""));
        assert!(json.contains("\"is_error\":false"));
    }

    #[test]
    fn message_complete_payload_handles_null_optionals() {
        let payload = MessageCompletePayload {
            session_id: "s1".to_string(),
            role: "assistant".to_string(),
            content: "Error".to_string(),
            model: None,
            input_tokens: None,
            output_tokens: None,
            thinking_tokens: None,
            cost_cents: None,
            is_error: true,
        };
        let json = serde_json::to_string(&payload).unwrap();
        assert!(json.contains("\"model\":null"));
        assert!(json.contains("\"is_error\":true"));
    }

    #[test]
    fn cli_exited_payload_serializes() {
        let payload = CliExitedPayload {
            session_id: "s1".to_string(),
            exit_code: Some(0),
        };
        let json = serde_json::to_string(&payload).unwrap();
        assert!(json.contains("\"exit_code\":0"));

        let no_code = CliExitedPayload {
            session_id: "s1".to_string(),
            exit_code: None,
        };
        let json = serde_json::to_string(&no_code).unwrap();
        assert!(json.contains("\"exit_code\":null"));
    }

    #[test]
    fn permission_request_payload_serializes() {
        let payload = PermissionRequestPayload {
            session_id: "s1".to_string(),
            request_id: "req-1".to_string(),
            tool: "Bash".to_string(),
            command: "rm -rf /tmp".to_string(),
            file_path: None,
            risk_level: "high".to_string(),
        };
        let json = serde_json::to_string(&payload).unwrap();
        assert!(json.contains("\"tool\":\"Bash\""));
        assert!(json.contains("\"risk_level\":\"high\""));
    }

    #[test]
    fn cli_init_payload_serializes_with_tools_and_mcp() {
        let payload = CliInitPayload {
            session_id: "s1".to_string(),
            cli_session_id: "cli-abc123".to_string(),
            model: "claude-sonnet-4-6".to_string(),
            tools: vec!["Read".to_string(), "Write".to_string()],
            mcp_servers: vec!["server1".to_string()],
        };
        let json = serde_json::to_string(&payload).unwrap();
        assert!(json.contains("\"cli_session_id\":\"cli-abc123\""));
        assert!(json.contains("\"Read\""));
        assert!(json.contains("\"server1\""));
    }

    #[test]
    fn tool_use_payload_serializes() {
        let payload = ToolUsePayload {
            session_id: "s1".to_string(),
            tool_use_id: "tu-1".to_string(),
            tool_name: "Read".to_string(),
            tool_input: r#"{"file_path":"/tmp/test.rs"}"#.to_string(),
        };
        let json = serde_json::to_string(&payload).unwrap();
        assert!(json.contains("\"tool_name\":\"Read\""));
        assert!(json.contains("\"tool_use_id\":\"tu-1\""));
    }

    #[test]
    fn tool_result_payload_serializes() {
        let payload = ToolResultPayload {
            session_id: "s1".to_string(),
            tool_use_id: "tu-1".to_string(),
            content: "file content here".to_string(),
            is_error: false,
        };
        let json = serde_json::to_string(&payload).unwrap();
        assert!(json.contains("\"is_error\":false"));

        let error_result = ToolResultPayload {
            session_id: "s1".to_string(),
            tool_use_id: "tu-2".to_string(),
            content: "Permission denied".to_string(),
            is_error: true,
        };
        let json = serde_json::to_string(&error_result).unwrap();
        assert!(json.contains("\"is_error\":true"));
    }

    #[test]
    fn thinking_payload_serializes() {
        let payload = ThinkingPayload {
            session_id: "s1".to_string(),
            content: "I'm thinking about...".to_string(),
            is_streaming: true,
        };
        let json = serde_json::to_string(&payload).unwrap();
        assert!(json.contains("\"is_streaming\":true"));
    }

    #[test]
    fn all_payloads_roundtrip_serde() {
        // Verify all payload types can be serialized and deserialized
        let chunk = ChunkPayload {
            session_id: "s1".to_string(),
            content: "test".to_string(),
            token_count: None,
        };
        let json = serde_json::to_string(&chunk).unwrap();
        let decoded: ChunkPayload = serde_json::from_str(&json).unwrap();
        assert_eq!(decoded.session_id, "s1");
        assert_eq!(decoded.content, "test");

        let complete = MessageCompletePayload {
            session_id: "s1".to_string(),
            role: "assistant".to_string(),
            content: "done".to_string(),
            model: Some("claude-sonnet-4-6".to_string()),
            input_tokens: Some(100),
            output_tokens: Some(50),
            thinking_tokens: None,
            cost_cents: Some(1.5),
            is_error: false,
        };
        let json = serde_json::to_string(&complete).unwrap();
        let decoded: MessageCompletePayload = serde_json::from_str(&json).unwrap();
        assert_eq!(decoded.role, "assistant");
        assert_eq!(decoded.input_tokens, Some(100));
    }

    #[test]
    fn chunk_payload_handles_unicode_content() {
        let payload = ChunkPayload {
            session_id: "s1".to_string(),
            content: "Hello 世界! 🌍 café".to_string(),
            token_count: Some(5),
        };
        let json = serde_json::to_string(&payload).unwrap();
        let decoded: ChunkPayload = serde_json::from_str(&json).unwrap();
        assert_eq!(decoded.content, "Hello 世界! 🌍 café");
    }

    #[test]
    fn chunk_payload_handles_empty_content() {
        let payload = ChunkPayload {
            session_id: "s1".to_string(),
            content: String::new(),
            token_count: None,
        };
        let json = serde_json::to_string(&payload).unwrap();
        let decoded: ChunkPayload = serde_json::from_str(&json).unwrap();
        assert!(decoded.content.is_empty());
    }
}
```

**Step 2: Run tests**

Run: `cd src-tauri && cargo test --lib event_loop::tests`
Expected: 12 tests pass

**Step 3: Commit**

```bash
git add src-tauri/src/bridge/event_loop.rs
git commit -m "test: event loop payload serialization tests (CHI-148)"
```

---

### Task 6: Session & Database IPC Command Tests (CHI-151 partial)

**Files:**
- Modify: `src-tauri/src/commands/session.rs` (add `#[cfg(test)] mod tests` at end)

**Step 1: Add session command tests**

These tests call the query functions directly (not through `State<>`) since Tauri command tests require an app harness. We test the business logic layer that commands delegate to.

Append to end of `src-tauri/src/commands/session.rs`:

```rust
#[cfg(test)]
mod tests {
    use crate::db::queries;
    use crate::db::Database;

    fn test_db() -> Database {
        Database::open_in_memory().unwrap()
    }

    #[test]
    fn create_and_get_session() {
        let db = test_db();
        let id = uuid::Uuid::new_v4().to_string();
        queries::insert_session(&db, &id, None, "claude-sonnet-4-6").unwrap();

        let session = queries::get_session(&db, &id).unwrap().unwrap();
        assert_eq!(session.id, id);
        assert_eq!(session.model, "claude-sonnet-4-6");
        assert!(session.title.is_none() || session.title == Some(String::new()));
    }

    #[test]
    fn list_sessions_returns_all() {
        let db = test_db();
        queries::insert_session(&db, "s1", None, "claude-sonnet-4-6").unwrap();
        queries::insert_session(&db, "s2", None, "claude-opus-4-6").unwrap();

        let sessions = queries::list_sessions(&db).unwrap();
        assert_eq!(sessions.len(), 2);
    }

    #[test]
    fn delete_session_removes_it() {
        let db = test_db();
        queries::insert_session(&db, "s1", None, "claude-sonnet-4-6").unwrap();
        queries::delete_session(&db, "s1").unwrap();

        let result = queries::get_session(&db, "s1").unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn update_session_title_works() {
        let db = test_db();
        queries::insert_session(&db, "s1", None, "claude-sonnet-4-6").unwrap();
        queries::update_session_title(&db, "s1", "My Session").unwrap();

        let session = queries::get_session(&db, "s1").unwrap().unwrap();
        assert_eq!(session.title, Some("My Session".to_string()));
    }

    #[test]
    fn save_message_and_list() {
        let db = test_db();
        queries::insert_session(&db, "s1", None, "claude-sonnet-4-6").unwrap();

        queries::insert_message(
            &db, "m1", "s1", "user", "Hello!", None, None, None, None,
        )
        .unwrap();
        queries::insert_message(
            &db,
            "m2",
            "s1",
            "assistant",
            "Hi there!",
            Some("claude-sonnet-4-6"),
            Some(10),
            Some(5),
            Some(1),
        )
        .unwrap();

        let messages = queries::list_messages(&db, "s1").unwrap();
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].role, "user");
        assert_eq!(messages[1].role, "assistant");
    }

    #[test]
    fn save_message_accumulates_session_cost() {
        let db = test_db();
        queries::insert_session(&db, "s1", None, "claude-sonnet-4-6").unwrap();

        queries::insert_message(
            &db, "m1", "s1", "assistant", "Response 1",
            Some("claude-sonnet-4-6"), Some(100), Some(50), Some(5),
        )
        .unwrap();
        queries::update_session_cost(&db, "s1", 100, 50, 5).unwrap();

        queries::insert_message(
            &db, "m2", "s1", "assistant", "Response 2",
            Some("claude-sonnet-4-6"), Some(200), Some(100), Some(10),
        )
        .unwrap();
        queries::update_session_cost(&db, "s1", 200, 100, 10).unwrap();

        let session = queries::get_session(&db, "s1").unwrap().unwrap();
        assert_eq!(session.total_input_tokens, Some(300));
        assert_eq!(session.total_output_tokens, Some(150));
        assert_eq!(session.total_cost_cents, Some(15));
    }

    #[test]
    fn delete_messages_after_removes_subsequent() {
        let db = test_db();
        queries::insert_session(&db, "s1", None, "claude-sonnet-4-6").unwrap();

        queries::insert_message(&db, "m1", "s1", "user", "First", None, None, None, None).unwrap();
        // Small sleep to ensure different timestamps
        std::thread::sleep(std::time::Duration::from_millis(10));
        queries::insert_message(&db, "m2", "s1", "assistant", "Second", None, None, None, None).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(10));
        queries::insert_message(&db, "m3", "s1", "user", "Third", None, None, None, None).unwrap();

        let deleted = queries::delete_messages_after(&db, "s1", "m1").unwrap();
        assert_eq!(deleted, 2); // m2 and m3 deleted

        let remaining = queries::list_messages(&db, "s1").unwrap();
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].id, "m1");
    }

    #[test]
    fn update_message_content_works() {
        let db = test_db();
        queries::insert_session(&db, "s1", None, "claude-sonnet-4-6").unwrap();
        queries::insert_message(&db, "m1", "s1", "user", "Original", None, None, None, None).unwrap();

        queries::update_message_content(&db, "m1", "Edited content").unwrap();

        let messages = queries::list_messages(&db, "s1").unwrap();
        assert_eq!(messages[0].content, "Edited content");
    }

    #[test]
    fn update_session_model_works() {
        let db = test_db();
        queries::insert_session(&db, "s1", None, "claude-sonnet-4-6").unwrap();
        queries::update_session_model(&db, "s1", "claude-opus-4-6").unwrap();

        let session = queries::get_session(&db, "s1").unwrap().unwrap();
        assert_eq!(session.model, "claude-opus-4-6");
    }

    #[test]
    fn toggle_session_pinned_works() {
        let db = test_db();
        queries::insert_session(&db, "s1", None, "claude-sonnet-4-6").unwrap();

        db.with_conn(|conn| queries::update_session_pinned(conn, "s1", true)).unwrap();
        let session = queries::get_session(&db, "s1").unwrap().unwrap();
        assert_eq!(session.pinned, Some(true));

        db.with_conn(|conn| queries::update_session_pinned(conn, "s1", false)).unwrap();
        let session = queries::get_session(&db, "s1").unwrap().unwrap();
        assert_eq!(session.pinned, Some(false));
    }

    #[test]
    fn duplicate_session_creates_copy() {
        let db = test_db();
        queries::insert_session(&db, "s1", None, "claude-sonnet-4-6").unwrap();
        queries::update_session_title(&db, "s1", "Original Title").unwrap();

        queries::duplicate_session_metadata_only(&db, "s1", "s2").unwrap();

        let original = queries::get_session(&db, "s1").unwrap().unwrap();
        let copy = queries::get_session(&db, "s2").unwrap().unwrap();
        assert_eq!(copy.model, original.model);
        // Title should be copied with " (copy)" suffix or similar
        assert_ne!(copy.id, original.id);
    }

    #[test]
    fn session_has_messages_checks_correctly() {
        let db = test_db();
        queries::insert_session(&db, "s1", None, "claude-sonnet-4-6").unwrap();

        assert_eq!(queries::count_session_messages(&db, "s1").unwrap(), 0);

        queries::insert_message(&db, "m1", "s1", "user", "Hello", None, None, None, None).unwrap();
        assert!(queries::count_session_messages(&db, "s1").unwrap() > 0);
    }
}
```

**Step 2: Run tests**

Run: `cd src-tauri && cargo test --lib commands::session::tests`
Expected: 12 tests pass

**Step 3: Commit**

```bash
git add src-tauri/src/commands/session.rs
git commit -m "test: session IPC command business logic tests (CHI-151)"
```

---

### Task 7: File Command Tests (CHI-151 partial)

**Files:**
- Modify: `src-tauri/src/files/scanner.rs` (add more tests to existing `#[cfg(test)]` block)

**Step 1: Add file scanner tests with tempdir**

Find the existing `#[cfg(test)] mod tests` block in `scanner.rs` and add these tests:

```rust
// Add to existing tests module in scanner.rs:

#[test]
fn read_file_returns_content() {
    let dir = tempfile::TempDir::new().unwrap();
    let root = dir.path();
    std::fs::write(root.join("test.txt"), "line 1\nline 2\nline 3\n").unwrap();

    let result = read_file(root, "test.txt", None, None).unwrap();
    assert!(result.content.contains("line 1"));
    assert!(result.content.contains("line 3"));
    assert_eq!(result.total_lines, 3);
}

#[test]
fn read_file_with_line_range() {
    let dir = tempfile::TempDir::new().unwrap();
    let root = dir.path();
    std::fs::write(root.join("test.txt"), "line 1\nline 2\nline 3\nline 4\nline 5\n").unwrap();

    // Read lines 2-4 (start_line inclusive, end_line exclusive)
    let result = read_file(root, "test.txt", Some(2), Some(4)).unwrap();
    assert!(result.content.contains("line 2"));
    assert!(result.content.contains("line 3"));
    assert!(!result.content.contains("line 1"));
    assert!(!result.content.contains("line 4"));
}

#[test]
fn read_file_blocks_path_traversal() {
    let dir = tempfile::TempDir::new().unwrap();
    let root = dir.path();
    std::fs::write(root.join("safe.txt"), "safe").unwrap();

    let result = read_file(root, "../../../etc/passwd", None, None);
    assert!(result.is_err());
}

#[test]
fn estimate_tokens_returns_reasonable_value() {
    let dir = tempfile::TempDir::new().unwrap();
    let root = dir.path();
    // 400 bytes ÷ 4 ≈ 100 tokens
    std::fs::write(root.join("test.txt"), "a".repeat(400)).unwrap();

    let result = estimate_tokens(root, "test.txt").unwrap();
    assert!(result > 50 && result < 200, "Token estimate {} out of range", result);
}

#[test]
fn search_files_finds_by_name() {
    let dir = tempfile::TempDir::new().unwrap();
    let root = dir.path();
    std::fs::write(root.join("hello.rs"), "fn main() {}").unwrap();
    std::fs::write(root.join("world.ts"), "export {}").unwrap();

    let results = search_files(root, "hello", Some(10)).unwrap();
    assert!(!results.is_empty());
    assert!(results[0].name.contains("hello"));
}

#[test]
fn search_files_returns_empty_for_no_match() {
    let dir = tempfile::TempDir::new().unwrap();
    let root = dir.path();
    std::fs::write(root.join("test.txt"), "content").unwrap();

    let results = search_files(root, "nonexistent_xyz", Some(10)).unwrap();
    assert!(results.is_empty());
}

#[test]
fn list_files_respects_gitignore() {
    let dir = tempfile::TempDir::new().unwrap();
    let root = dir.path();
    std::fs::write(root.join(".gitignore"), "ignored_dir/\n").unwrap();
    std::fs::create_dir(root.join("ignored_dir")).unwrap();
    std::fs::write(root.join("ignored_dir/secret.txt"), "secret").unwrap();
    std::fs::write(root.join("visible.txt"), "visible").unwrap();

    let files = list_files(root, None, Some(2)).unwrap();
    let names: Vec<&str> = files.iter().map(|f| f.name.as_str()).collect();
    assert!(names.contains(&"visible.txt"));
    assert!(!names.contains(&"ignored_dir"));
}

#[test]
fn read_file_detects_binary_files() {
    let dir = tempfile::TempDir::new().unwrap();
    let root = dir.path();
    // Write binary content (contains null bytes)
    let mut content = vec![0u8; 100];
    content[10] = 0; // null byte
    std::fs::write(root.join("binary.bin"), content).unwrap();

    let result = read_file(root, "binary.bin", None, None).unwrap();
    // Binary files should return empty content
    assert!(result.content.is_empty() || result.estimated_tokens == 0);
}
```

**Step 2: Run tests**

Run: `cd src-tauri && cargo test --lib files::scanner::tests`
Expected: All tests pass (existing + 8 new)

**Step 3: Commit**

```bash
git add src-tauri/src/files/scanner.rs
git commit -m "test: file scanner tests for read, search, path traversal, gitignore (CHI-151)"
```

---

### Task 8: Permission Security Tests (CHI-152)

**Files:**
- Modify: `src-tauri/src/bridge/permission.rs` (add tests to existing `#[cfg(test)]` block)

**Step 1: Add comprehensive security tests**

Find the existing `#[cfg(test)] mod tests` block in `permission.rs` and add these security-focused tests:

```rust
// Add to existing tests module in permission.rs:

// === SECURITY-CRITICAL: Permission Resolution Round-Trip ===

#[tokio::test]
async fn full_permission_round_trip_approve() {
    let manager = PermissionManager::with_timeout(5);
    let request = make_request("Read", "cat /tmp/test.txt");
    let req_id = request.request_id.clone();

    // Spawn permission request in background
    let mgr = manager.clone();
    let handle = tokio::spawn(async move {
        mgr.request_permission(request).await
    });

    // Small delay to ensure request is queued
    tokio::time::sleep(Duration::from_millis(50)).await;

    // Resolve with approve
    let response = PermissionResponse {
        request_id: req_id,
        action: PermissionAction::Approve,
        pattern: None,
    };
    manager.resolve_permission(response).await.unwrap();

    let result = handle.await.unwrap().unwrap();
    assert_eq!(result, PermissionAction::Approve);
}

#[tokio::test]
async fn full_permission_round_trip_deny() {
    let manager = PermissionManager::with_timeout(5);
    let request = make_request("Bash", "rm -rf /");
    let req_id = request.request_id.clone();

    let mgr = manager.clone();
    let handle = tokio::spawn(async move {
        mgr.request_permission(request).await
    });

    tokio::time::sleep(Duration::from_millis(50)).await;

    let response = PermissionResponse {
        request_id: req_id,
        action: PermissionAction::Deny,
        pattern: None,
    };
    manager.resolve_permission(response).await.unwrap();

    let result = handle.await.unwrap().unwrap();
    assert_eq!(result, PermissionAction::Deny);
}

#[tokio::test]
async fn always_allow_saves_rule_and_auto_approves_subsequent() {
    let manager = PermissionManager::with_timeout(5);
    let request = make_request("Read", "cat /tmp/test.txt");
    let req_id = request.request_id.clone();

    let mgr = manager.clone();
    let handle = tokio::spawn(async move {
        mgr.request_permission(request).await
    });

    tokio::time::sleep(Duration::from_millis(50)).await;

    // AlwaysAllow with wildcard pattern
    let response = PermissionResponse {
        request_id: req_id,
        action: PermissionAction::AlwaysAllow,
        pattern: Some("cat *".to_string()),
    };
    manager.resolve_permission(response).await.unwrap();

    // First request resolves as Approve (AlwaysAllow maps to Approve)
    let result = handle.await.unwrap().unwrap();
    assert_eq!(result, PermissionAction::Approve);

    // Verify rule was saved
    let rules = manager.rules().await;
    assert_eq!(rules.len(), 1);
    assert_eq!(rules[0].0, "Read");
    assert_eq!(rules[0].1, "cat *");

    // Second request should auto-approve without blocking
    let request2 = make_request("Read", "cat /tmp/other.txt");
    let result2 = manager.request_permission(request2).await.unwrap();
    assert_eq!(result2, PermissionAction::Approve);
}

// === SECURITY-CRITICAL: Timeout Behavior ===

#[tokio::test]
async fn permission_timeout_auto_denies() {
    // 1-second timeout for fast test
    let manager = PermissionManager::with_timeout(1);
    let request = make_request("Bash", "dangerous_command");

    let start = Instant::now();
    let result = manager.request_permission(request).await.unwrap();
    let elapsed = start.elapsed();

    // Should be auto-denied after timeout
    assert_eq!(result, PermissionAction::Deny);
    // Should have waited approximately 1 second (not instant)
    assert!(elapsed.as_millis() >= 900, "Timeout too fast: {}ms", elapsed.as_millis());
}

#[tokio::test]
async fn expired_request_cleaned_up_after_timeout() {
    let manager = PermissionManager::with_timeout(1);
    let request = make_request("Bash", "test");

    let _ = manager.request_permission(request).await;

    // Pending should be empty after timeout
    assert_eq!(manager.pending_count().await, 0);
}

// === SECURITY-CRITICAL: YOLO Mode Behavior ===

#[tokio::test]
async fn yolo_mode_auto_approves_without_blocking() {
    let manager = PermissionManager::new();
    manager.enable_yolo_mode().await;

    let request = make_request("Bash", "rm -rf /");
    let start = Instant::now();
    let result = manager.request_permission(request).await.unwrap();
    let elapsed = start.elapsed();

    assert_eq!(result, PermissionAction::Approve);
    // Should be instant (no blocking wait)
    assert!(elapsed.as_millis() < 100, "YOLO should be instant, was {}ms", elapsed.as_millis());
}

#[tokio::test]
async fn yolo_mode_does_not_queue_requests() {
    let manager = PermissionManager::new();
    manager.enable_yolo_mode().await;

    let request = make_request("Bash", "test");
    let _ = manager.request_permission(request).await;

    // No pending requests should be queued in YOLO mode
    assert_eq!(manager.pending_count().await, 0);
}

#[tokio::test]
async fn disabling_yolo_restores_normal_flow() {
    let manager = PermissionManager::with_timeout(1);

    // Enable then disable YOLO
    manager.enable_yolo_mode().await;
    manager.disable_yolo_mode().await;

    // Should block and timeout (normal flow)
    let request = make_request("Bash", "test");
    let result = manager.request_permission(request).await.unwrap();
    assert_eq!(result, PermissionAction::Deny); // Timeout → deny
}

// === SECURITY-CRITICAL: Invalid Input Handling ===

#[tokio::test]
async fn resolve_nonexistent_request_returns_error() {
    let manager = PermissionManager::new();

    let response = PermissionResponse {
        request_id: "nonexistent-id".to_string(),
        action: PermissionAction::Approve,
        pattern: None,
    };

    let result = manager.resolve_permission(response).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn cannot_resolve_same_request_twice() {
    let manager = PermissionManager::with_timeout(5);
    let request = make_request("Read", "test");
    let req_id = request.request_id.clone();

    let mgr = manager.clone();
    tokio::spawn(async move {
        let _ = mgr.request_permission(request).await;
    });

    tokio::time::sleep(Duration::from_millis(50)).await;

    // First resolve succeeds
    let response1 = PermissionResponse {
        request_id: req_id.clone(),
        action: PermissionAction::Approve,
        pattern: None,
    };
    manager.resolve_permission(response1).await.unwrap();

    // Second resolve fails (request already consumed)
    let response2 = PermissionResponse {
        request_id: req_id,
        action: PermissionAction::Deny,
        pattern: None,
    };
    let result = manager.resolve_permission(response2).await;
    assert!(result.is_err());
}

// === Developer Mode Tests ===

#[tokio::test]
async fn developer_mode_flag_toggles() {
    let manager = PermissionManager::new();

    assert!(!manager.is_developer_mode().await);
    manager.enable_developer_mode().await;
    assert!(manager.is_developer_mode().await);
    manager.disable_developer_mode().await;
    assert!(!manager.is_developer_mode().await);
}

#[tokio::test]
async fn developer_and_yolo_modes_are_independent() {
    let manager = PermissionManager::new();

    manager.enable_developer_mode().await;
    assert!(manager.is_developer_mode().await);
    assert!(!manager.is_yolo_mode().await);

    manager.enable_yolo_mode().await;
    assert!(manager.is_developer_mode().await);
    assert!(manager.is_yolo_mode().await);

    manager.disable_developer_mode().await;
    assert!(!manager.is_developer_mode().await);
    assert!(manager.is_yolo_mode().await);

    manager.disable_yolo_mode().await;
}

// === Pattern Matching Edge Cases ===

#[test]
fn pattern_matching_exact() {
    assert!(PermissionManager::matches_pattern("git status", "git status"));
    assert!(!PermissionManager::matches_pattern("git status", "git push"));
}

#[test]
fn pattern_matching_wildcard_suffix() {
    assert!(PermissionManager::matches_pattern("git *", "git status"));
    assert!(PermissionManager::matches_pattern("git *", "git push origin main"));
    assert!(!PermissionManager::matches_pattern("git *", "npm install"));
}

#[test]
fn pattern_matching_wildcard_prefix() {
    assert!(PermissionManager::matches_pattern("*.rs", "main.rs"));
    assert!(PermissionManager::matches_pattern("*.rs", "src/lib.rs"));
    assert!(!PermissionManager::matches_pattern("*.rs", "main.ts"));
}

#[test]
fn pattern_matching_universal_wildcard() {
    assert!(PermissionManager::matches_pattern("*", "anything"));
    assert!(PermissionManager::matches_pattern("*", ""));
}

#[test]
fn pattern_matching_empty_value() {
    assert!(!PermissionManager::matches_pattern("git *", ""));
    assert!(PermissionManager::matches_pattern("*", ""));
}

// === Clear Rules ===

#[tokio::test]
async fn clear_rules_removes_all_auto_allow_rules() {
    let manager = PermissionManager::with_timeout(5);

    // Create a rule via always-allow flow
    let request = make_request("Read", "cat test");
    let req_id = request.request_id.clone();

    let mgr = manager.clone();
    let handle = tokio::spawn(async move {
        mgr.request_permission(request).await
    });
    tokio::time::sleep(Duration::from_millis(50)).await;

    manager.resolve_permission(PermissionResponse {
        request_id: req_id,
        action: PermissionAction::AlwaysAllow,
        pattern: Some("cat *".to_string()),
    }).await.unwrap();
    let _ = handle.await;

    assert_eq!(manager.rules().await.len(), 1);
    manager.clear_rules().await;
    assert_eq!(manager.rules().await.len(), 0);
}
```

**Step 2: Run ALL permission tests**

Run: `cd src-tauri && cargo test --lib bridge::permission::tests`
Expected: 15 existing + 17 new = 32 tests pass

**Step 3: Commit**

```bash
git add src-tauri/src/bridge/permission.rs
git commit -m "test: security-focused permission system tests — 95% coverage target (CHI-152)"
```

---

### Task 9: Bridge IPC Command Validation Tests (CHI-149)

**Files:**
- Modify: `src-tauri/src/commands/bridge.rs` (add `#[cfg(test)] mod tests` at end)

**Step 1: Add bridge command tests**

These test the permission resolution and mode toggle logic that lives in `commands/bridge.rs`, which delegates to `PermissionManager`.

Append to end of `src-tauri/src/commands/bridge.rs`:

```rust
#[cfg(test)]
mod tests {
    use crate::bridge::permission::{
        PermissionAction, PermissionManager, PermissionRequest, PermissionResponse,
    };
    use std::time::Duration;

    fn make_request(tool: &str, command: &str) -> PermissionRequest {
        PermissionRequest {
            request_id: uuid::Uuid::new_v4().to_string(),
            tool: tool.to_string(),
            command: command.to_string(),
            file_path: None,
            risk_level: "medium".to_string(),
            tool_input: None,
        }
    }

    // === respond_permission validation logic ===

    #[test]
    fn parse_permission_action_approve() {
        let result: Result<PermissionAction, _> = match "Approve" {
            "Approve" => Ok(PermissionAction::Approve),
            "Deny" => Ok(PermissionAction::Deny),
            "AlwaysAllow" => Ok(PermissionAction::AlwaysAllow),
            other => Err(format!("Invalid action: {}", other)),
        };
        assert_eq!(result.unwrap(), PermissionAction::Approve);
    }

    #[test]
    fn parse_permission_action_deny() {
        let result: Result<PermissionAction, _> = match "Deny" {
            "Approve" => Ok(PermissionAction::Approve),
            "Deny" => Ok(PermissionAction::Deny),
            "AlwaysAllow" => Ok(PermissionAction::AlwaysAllow),
            other => Err(format!("Invalid action: {}", other)),
        };
        assert_eq!(result.unwrap(), PermissionAction::Deny);
    }

    #[test]
    fn parse_permission_action_always_allow() {
        let result: Result<PermissionAction, _> = match "AlwaysAllow" {
            "Approve" => Ok(PermissionAction::Approve),
            "Deny" => Ok(PermissionAction::Deny),
            "AlwaysAllow" => Ok(PermissionAction::AlwaysAllow),
            other => Err(format!("Invalid action: {}", other)),
        };
        assert_eq!(result.unwrap(), PermissionAction::AlwaysAllow);
    }

    #[test]
    fn parse_permission_action_invalid_rejected() {
        let result: Result<PermissionAction, String> = match "InvalidAction" {
            "Approve" => Ok(PermissionAction::Approve),
            "Deny" => Ok(PermissionAction::Deny),
            "AlwaysAllow" => Ok(PermissionAction::AlwaysAllow),
            other => Err(format!("Invalid permission action: {}", other)),
        };
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("InvalidAction"));
    }

    #[test]
    fn parse_permission_action_case_sensitive() {
        // "approve" (lowercase) should be rejected — only PascalCase accepted
        let result: Result<PermissionAction, String> = match "approve" {
            "Approve" => Ok(PermissionAction::Approve),
            "Deny" => Ok(PermissionAction::Deny),
            "AlwaysAllow" => Ok(PermissionAction::AlwaysAllow),
            other => Err(format!("Invalid permission action: {}", other)),
        };
        assert!(result.is_err());
    }

    // === toggle_yolo_mode logic ===

    #[tokio::test]
    async fn toggle_yolo_mode_enable_disable() {
        let manager = PermissionManager::new();

        assert!(!manager.is_yolo_mode().await);
        manager.enable_yolo_mode().await;
        assert!(manager.is_yolo_mode().await);
        manager.disable_yolo_mode().await;
        assert!(!manager.is_yolo_mode().await);
    }

    // === toggle_developer_mode logic ===

    #[tokio::test]
    async fn toggle_developer_mode_enable_disable() {
        let manager = PermissionManager::new();

        assert!(!manager.is_developer_mode().await);
        manager.enable_developer_mode().await;
        assert!(manager.is_developer_mode().await);
        manager.disable_developer_mode().await;
        assert!(!manager.is_developer_mode().await);
    }

    // === Permission resolve with PermissionManager ===

    #[tokio::test]
    async fn resolve_permission_approve_flow() {
        let manager = PermissionManager::with_timeout(5);
        let req = make_request("Read", "cat /tmp/test");
        let req_id = req.request_id.clone();

        let mgr = manager.clone();
        let handle = tokio::spawn(async move { mgr.request_permission(req).await });

        tokio::time::sleep(Duration::from_millis(50)).await;

        let response = PermissionResponse {
            request_id: req_id,
            action: PermissionAction::Approve,
            pattern: None,
        };
        manager.resolve_permission(response).await.unwrap();

        let result = handle.await.unwrap().unwrap();
        assert_eq!(result, PermissionAction::Approve);
    }

    #[tokio::test]
    async fn resolve_nonexistent_request_returns_error() {
        let manager = PermissionManager::new();
        let response = PermissionResponse {
            request_id: "does-not-exist".to_string(),
            action: PermissionAction::Approve,
            pattern: None,
        };
        let result = manager.resolve_permission(response).await;
        assert!(result.is_err());
    }

    // === Session bridge map tests (active bridges/drain) ===

    #[tokio::test]
    async fn list_active_bridges_empty_initially() {
        use crate::bridge::manager::SessionBridgeMap;
        let map = SessionBridgeMap::new();
        let active = map.list_active_sessions().await;
        assert!(active.is_empty());
    }

    #[tokio::test]
    async fn drain_nonexistent_session_returns_empty() {
        use crate::bridge::manager::SessionBridgeMap;
        let map = SessionBridgeMap::new();
        let events = map.drain_session_buffer("nonexistent").await;
        assert!(events.is_empty());
    }
}
```

**Step 2: Run tests**

Run: `cd src-tauri && cargo test --lib commands::bridge::tests`
Expected: 12 tests pass

**Step 3: Commit**

```bash
git add src-tauri/src/commands/bridge.rs
git commit -m "test: bridge IPC command validation and permission flow tests (CHI-149)"
```

---

### Task 10: Actions System Tests (CHI-150)

**Files:**
- Modify: `src-tauri/src/actions/manager.rs` (add more tests to existing `#[cfg(test)]` block)

**Step 1: Add action manager tests**

Find the existing `#[cfg(test)] mod tests` block in `manager.rs` and add:

```rust
// Add to existing tests module in actions/manager.rs:

#[tokio::test]
async fn list_running_returns_empty_when_none() {
    let map = ActionBridgeMap::new();
    let running = map.list_running().await;
    assert!(running.is_empty());
}

#[tokio::test]
async fn active_count_tracks_spawned_actions() {
    let map = ActionBridgeMap::new();
    assert_eq!(map.active_count().await, 0);
}

#[tokio::test]
async fn stop_nonexistent_action_is_safe() {
    let map = ActionBridgeMap::new();
    // Stopping a non-existent action should not panic
    let result = map.stop("nonexistent-action").await;
    // Should either succeed silently or return an error — not panic
    let _ = result;
}

#[tokio::test]
async fn shutdown_all_clears_everything() {
    let map = ActionBridgeMap::new();
    map.shutdown_all().await;
    assert_eq!(map.active_count().await, 0);
}
```

**Step 2: Run tests**

Run: `cd src-tauri && cargo test --lib actions::manager::tests`
Expected: 2 existing + 4 new = 6 tests pass

**Step 3: Commit**

```bash
git add src-tauri/src/actions/manager.rs
git commit -m "test: action manager lifecycle and error handling tests (CHI-150)"
```

---

### Task 11: Run Full Verification

**Step 1: Run all Rust tests**

Run: `cd src-tauri && cargo test --lib`
Expected: 230 existing + ~55 new ≈ 285+ tests pass

**Step 2: Run Rust lint**

Run: `cd src-tauri && cargo clippy -- -D warnings`
Expected: No warnings

**Step 3: Run frontend tests**

Run: `npx vitest run`
Expected: 4 test files, all pass

**Step 4: Run full frontend verification**

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean

**Step 5: Commit (if any fixups needed)**

```bash
git add -A
git commit -m "chore: fix lint/type issues from test additions"
```

---

## Verification Summary

1. `npx vitest run` — All frontend unit tests pass
2. `npx vitest run --coverage` — Coverage report generated
3. `cargo test --lib` — All ~285 Rust tests pass
4. `cargo clippy -- -D warnings` — No warnings
5. `npx tsc --noEmit` — TypeScript clean
6. `npx eslint .` — No lint errors

### Coverage Targets by Module

| Module | Pre-plan | Post-plan | Target |
|--------|----------|-----------|--------|
| bridge/event_loop.rs | 0 tests | 12 tests | 85%+ |
| bridge/permission.rs | 15 tests | 32 tests | 95%+ |
| commands/bridge.rs | 0 tests | 12 tests | 85%+ |
| commands/session.rs | 0 tests | 12 tests | 85%+ |
| files/scanner.rs | existing | +8 tests | 85%+ |
| actions/manager.rs | 2 tests | 6 tests | 85%+ |
| Frontend stores | 0 tests | 4 files, ~15 tests | Smoke coverage |
| **Total Rust** | **~230** | **~285** | — |
