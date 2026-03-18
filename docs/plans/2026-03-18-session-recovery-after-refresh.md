# Session Recovery After UI Refresh Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve accurate running-session state after frontend reloads so a still-running backend session can be recovered cleanly when the user activates it later.

**Architecture:** Keep startup recovery metadata-only for non-selected sessions, then move full reconciliation into an explicit activation-time `resumeSessionView(sessionId)` path. Persisted DB history remains the source of truth; buffered bridge events only fill the gap between the last persisted state and current runtime state.

**Tech Stack:** SolidJS stores, Tauri IPC (`invoke`), TypeScript/Vitest, existing bridge runtime commands in Rust backend.

---

## File Map

- Modify: `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src/stores/conversationStore.ts`
  - Add recovery metadata state, activation-time recovery flow, and stronger replay dedupe helpers.
- Modify: `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src/stores/sessionStore.ts`
  - Ensure session activation path cooperates with recovery-triggered hydration and does not regress selection semantics.
- Modify: `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src/App.tsx`
  - Keep startup reconnect focused on bridge discovery and initial active-session recovery only.
- Modify: `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src/lib/types.ts`
  - Add minimal frontend typing for recovery hints if needed.
- Test: `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src/stores/conversationStore.test.ts`
  - Add store-level regression coverage for recoverable background sessions, activation recovery, and dedupe.

## Chunk 1: Recovery Metadata And Startup Detection

### Task 1: Add failing tests for startup detection of recoverable sessions

**Files:**
- Test: `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src/stores/conversationStore.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('marks non-active running sessions as recoverable after reload', async () => {
  mockIpcCommand('list_active_bridges', () => [
    {
      session_id: 'session-b',
      process_status: 'running',
      cli_session_id: 'cli-b',
      model: 'claude-sonnet-4-6',
      has_buffered_events: true,
    },
  ]);

  sessionState.activeSessionId = 'session-a';

  await reconnectAfterReload('session-a');

  expect(conversationState.recoverableSessions['session-b']).toMatchObject({
    processStatus: 'running',
    cliSessionId: 'cli-b',
    hasBufferedEvents: true,
  });
  expect(sessionState.activeSessionId).toBe('session-a');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum && npx vitest run src/stores/conversationStore.test.ts -t "marks non-active running sessions as recoverable after reload"
```
Expected: FAIL because `recoverableSessions` metadata does not exist yet.

- [ ] **Step 3: Add recovery hint typing and store state**

Implement minimal state in:
- `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src/lib/types.ts`
- `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src/stores/conversationStore.ts`

Add a focused shape like:

```ts
export interface RecoveryHint {
  processStatus: ProcessStatus;
  cliSessionId: string | null;
  hasBufferedEvents: boolean;
  detectedAt: number;
}
```

Store shape should include:

```ts
recoverableSessions: Record<string, RecoveryHint>;
recoveryInFlight: Record<string, boolean>;
lastRecoveredAt: Record<string, number>;
```

- [ ] **Step 4: Update `reconnectAfterReload()` to record recovery metadata for all active bridges**

Implementation notes:
- keep current selected session unchanged
- continue updating per-session statuses for all bridges
- for non-active sessions whose bridge is `running` or `starting`, store a `RecoveryHint`
- do not load messages or drain buffers for those non-active sessions at startup

- [ ] **Step 5: Run tests to verify they pass**

Run:
```bash
cd /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum && npx vitest run src/stores/conversationStore.test.ts -t "marks non-active running sessions as recoverable after reload"
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git -C /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum add src/lib/types.ts src/stores/conversationStore.ts src/stores/conversationStore.test.ts
git -C /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum commit -m "feat: track recoverable sessions after reload"
```

### Task 2: Add failing test for startup recovery of currently active running session

**Files:**
- Test: `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src/stores/conversationStore.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('still recovers the selected active session during reload', async () => {
  mockIpcCommand('list_active_bridges', () => [
    {
      session_id: 'session-a',
      process_status: 'running',
      cli_session_id: 'cli-a',
      model: 'claude-sonnet-4-6',
      has_buffered_events: true,
    },
  ]);
  mockIpcCommand('list_messages', () => persistedMessages);
  mockIpcCommand('drain_session_buffer', () => bufferedEvents);

  await reconnectAfterReload('session-a');

  expect(conversationState.messages).toEqual(expect.arrayContaining(persistedMessages));
  expect(conversationState.processStatus).toBe('running');
});
```

- [ ] **Step 2: Run test to verify behavior fails or regresses if startup logic is too metadata-only**

Run:
```bash
cd /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum && npx vitest run src/stores/conversationStore.test.ts -t "still recovers the selected active session during reload"
```
Expected: FAIL if startup logic no longer preserves current active-session recovery.

- [ ] **Step 3: Refactor startup reconnect to preserve current selected-session recovery path**

Implementation notes:
- extract helper boundaries rather than inlining everything in `reconnectAfterReload()`
- startup may still fully recover the currently selected session when it is active
- non-selected sessions remain metadata-only until activation

- [ ] **Step 4: Run focused tests**

Run:
```bash
cd /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum && npx vitest run src/stores/conversationStore.test.ts -t "recoverable after reload|selected active session during reload"
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git -C /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum add src/stores/conversationStore.ts src/stores/conversationStore.test.ts
git -C /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum commit -m "refactor: split startup recovery from activation recovery"
```

## Chunk 2: Activation-Time Recovery Flow

### Task 3: Add failing test for recovering a background-running session on activation

**Files:**
- Test: `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src/stores/conversationStore.test.ts`
- Modify: `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src/stores/sessionStore.ts`
- Modify: `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src/stores/conversationStore.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('recovers a background-running session when the user activates it', async () => {
  seedRecoverableSession('session-b', {
    processStatus: 'running',
    cliSessionId: 'cli-b',
    hasBufferedEvents: true,
  });
  mockIpcCommand('list_messages', () => persistedMessages);
  mockIpcCommand('drain_session_buffer', () => bufferedEvents);

  await switchSession('session-b', 'session-a');

  expect(conversationState.messages).toEqual(expect.arrayContaining(persistedMessages));
  expect(conversationState.isLoading).toBe(true);
  expect(conversationState.processStatus).toBe('running');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum && npx vitest run src/stores/conversationStore.test.ts -t "recovers a background-running session when the user activates it"
```
Expected: FAIL because activation currently only drains if current UI status is already running and has no dedicated recovery pass.

- [ ] **Step 3: Implement `resumeSessionView(sessionId)` in `conversationStore.ts`**

Implementation requirements:
- guard with `recoveryInFlight[sessionId]`
- load persisted DB messages first
- attach listeners before replay
- re-query `list_active_bridges` and isolate the target session
- drain target-session buffer
- restore `processStatus`, `isLoading`, `isStreaming`, `toolOutputs`, and `thinkingContent` as needed
- clear `lastRecoveredAt[sessionId]` only after a clean attach/replay cycle completes

- [ ] **Step 4: Update `switchSession()` to call `resumeSessionView()` when target session is recoverable**

Implementation requirements:
- keep `clearSessionUnread()` behavior
- preserve existing session-switch semantics for non-recoverable sessions
- do not auto-select any different session during startup

- [ ] **Step 5: Run focused tests**

Run:
```bash
cd /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum && npx vitest run src/stores/conversationStore.test.ts -t "background-running session when the user activates it"
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git -C /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum add src/stores/conversationStore.ts src/stores/sessionStore.ts src/stores/conversationStore.test.ts
git -C /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum commit -m "feat: recover running sessions on activation"
```

### Task 4: Add failing tests for exited-session cleanup and re-entrancy guards

**Files:**
- Test: `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src/stores/conversationStore.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
it('clears the recoverable marker when the bridge already exited before activation', async () => {
  seedRecoverableSession('session-b', {
    processStatus: 'running',
    cliSessionId: 'cli-b',
    hasBufferedEvents: false,
  });
  mockIpcCommand('list_active_bridges', () => []);
  mockIpcCommand('list_messages', () => persistedMessages);

  await switchSession('session-b', 'session-a');

  expect(conversationState.recoverableSessions['session-b']).toBeUndefined();
  expect(conversationState.processStatus).toBe('not_started');
});

it('does not run recovery twice while one recovery is already in flight', async () => {
  // assert drain_session_buffer invoked once even with repeated activation
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum && npx vitest run src/stores/conversationStore.test.ts -t "bridge already exited|recovery is already in flight"
```
Expected: FAIL

- [ ] **Step 3: Implement cleanup and re-entry protections**

Implementation requirements:
- clear `recoverableSessions[sessionId]` when bridge is gone and replay is complete
- preserve retryability when bridge-query or buffer-drain fails
- make `recoveryInFlight` block duplicate recovery passes during rapid HMR or repeated tab changes

- [ ] **Step 4: Re-run focused tests**

Run:
```bash
cd /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum && npx vitest run src/stores/conversationStore.test.ts -t "bridge already exited|recovery is already in flight"
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git -C /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum add src/stores/conversationStore.ts src/stores/conversationStore.test.ts
git -C /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum commit -m "fix: harden activation recovery state management"
```

## Chunk 3: Persisted-State Reconciliation And Replay Dedupe

### Task 5: Add failing tests for duplicate completion replay

**Files:**
- Test: `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src/stores/conversationStore.test.ts`
- Modify: `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src/stores/conversationStore.ts`

- [ ] **Step 1: Write failing test for already-persisted assistant completion**

```ts
it('does not duplicate a persisted assistant completion during recovery replay', async () => {
  mockIpcCommand('list_messages', () => [
    {
      id: 'm1',
      session_id: 'session-b',
      role: 'assistant',
      content: 'Final answer',
      uuid: 'assistant-uuid',
      parent_uuid: 'user-uuid',
      stop_reason: 'end_turn',
      model: 'claude-sonnet-4-6',
    },
  ]);
  mockIpcCommand('drain_session_buffer', () => [
    {
      type: 'MessageComplete',
      session_id: 'session-b',
      role: 'assistant',
      content: 'Final answer',
      uuid: 'assistant-uuid',
      parent_uuid: 'user-uuid',
      stop_reason: 'end_turn',
      model: 'claude-sonnet-4-6',
    },
  ]);

  await resumeSessionView('session-b');

  expect(conversationState.messages.filter((m) => m.content === 'Final answer')).toHaveLength(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum && npx vitest run src/stores/conversationStore.test.ts -t "does not duplicate a persisted assistant completion during recovery replay"
```
Expected: FAIL because duplicate detection currently relies primarily on assistant content.

- [ ] **Step 3: Extract replay snapshot and duplicate-key helpers**

Implementation requirements in `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src/stores/conversationStore.ts`:
- build a recovery snapshot from current persisted messages before replay
- prefer `uuid`-based duplicate detection when available
- fall back to a stricter tuple using `role`, `content`, `model`, `stop_reason`, and timestamp proximity when `uuid` is absent
- keep persisted DB messages as source of truth

- [ ] **Step 4: Re-run focused test**

Run:
```bash
cd /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum && npx vitest run src/stores/conversationStore.test.ts -t "does not duplicate a persisted assistant completion during recovery replay"
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git -C /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum add src/stores/conversationStore.ts src/stores/conversationStore.test.ts
git -C /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum commit -m "fix: dedupe recovery replay against persisted history"
```

### Task 6: Add failing tests for tool replay and partial-stream recovery

**Files:**
- Test: `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src/stores/conversationStore.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
it('does not duplicate tool results already represented by tool_use_id', async () => {
  // persisted tool_result exists, buffered replay carries same tool_use_id
});

it('restores streaming state when only chunks are buffered and no final message exists', async () => {
  // persisted messages stop at user message, buffer has Chunk events only
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum && npx vitest run src/stores/conversationStore.test.ts -t "tool_use_id|only chunks are buffered"
```
Expected: FAIL

- [ ] **Step 3: Implement targeted replay reconciliation**

Implementation requirements:
- build known `tool_use_id` sets from persisted tool messages
- skip replay of tool events already represented
- allow `Chunk` and `Thinking` replay only until a matching persisted `MessageComplete` exists
- restore `isLoading`, `isStreaming`, `streamingContent`, and `thinkingContent` correctly when the completion is not yet persisted

- [ ] **Step 4: Re-run focused tests**

Run:
```bash
cd /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum && npx vitest run src/stores/conversationStore.test.ts -t "tool_use_id|only chunks are buffered"
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git -C /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum add src/stores/conversationStore.ts src/stores/conversationStore.test.ts
git -C /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum commit -m "feat: reconcile buffered tool and streaming recovery state"
```

## Chunk 4: End-To-End Validation And Handoff

### Task 7: Run full targeted validation for session recovery behavior

**Files:**
- Test: `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src/stores/conversationStore.test.ts`
- Test: `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src/App.tsx`
- Modify if needed: `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src/App.tsx`

- [ ] **Step 1: Add or update one integration-oriented test if startup ordering regresses**

Example scope:

```ts
it('keeps the selected session stable while marking background running sessions recoverable', async () => {
  // assert startup ordering from App/onMount + reconnectAfterReload does not switch selection
});
```

- [ ] **Step 2: Run targeted tests**

Run:
```bash
cd /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum && npx vitest run src/stores/conversationStore.test.ts src/App.test.tsx
```
Expected: PASS

- [ ] **Step 3: Run typecheck and lint**

Run:
```bash
cd /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum && npm run lint && npx tsc --noEmit
```
Expected: PASS

- [ ] **Step 4: Run production build**

Run:
```bash
cd /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum && npm run build
```
Expected: PASS

- [ ] **Step 5: Commit final verification adjustments**

```bash
git -C /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum add src/App.tsx src/stores/conversationStore.ts src/stores/conversationStore.test.ts

git -C /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum commit -m "test: verify session recovery after refresh"
```

## Notes For Execution

- Keep `sessionState.activeSessionId` stable across reload unless the user explicitly changes it.
- Do not widen scope into broader crash recovery, cross-device resumption, or persisted UI drafts.
- Prefer extracting small helpers inside `conversationStore.ts` over broad refactors.
- If `list_active_bridges` lacks metadata needed for correct dedupe or state restoration, add the smallest possible backend extension and corresponding tests instead of redesigning the bridge layer.
