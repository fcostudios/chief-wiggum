# Session Recovery After UI Refresh

Date: 2026-03-18
Status: Approved design
Scope: Preserve the correct running-session behavior after frontend reloads or HMR refreshes without auto-switching the user away from the currently selected session.

## Problem

When the frontend reloads during development, the backend bridge often keeps running but the renderer loses its session attachment.

Current behavior has two visible failures:

- startup reconnection only fully recovers the currently selected session
- other still-running sessions are only marked with status, not actually prepared for recovery
- when the user later opens one of those sessions, it can look interrupted even though backend work never stopped
- persisted messages and buffered runtime events can overlap, which causes incorrect assumptions about whether content is already rendered

The result is a broken mental model for the user:

- they believe the task was interrupted
- they do not see fresh output when switching back to the still-running session
- replay can duplicate or miss message state because persisted history and buffered events are not reconciled explicitly

## Goals

- Keep the currently selected session stable across reloads.
- Detect all still-running backend sessions after reload.
- Recover a running session when the user activates it later.
- Reconcile persisted history and buffered runtime events without duplicates.
- Restore visible loading/running state so a resumed session looks alive rather than interrupted.

## Non-Goals

- Automatic session switching on reload.
- Full crash recovery for terminated backend processes.
- New offline replay or archival features beyond current bridge state and database history.
- Broader session resurrection for completed or inactive sessions.

## Recommended Approach

Use lazy per-session recovery on activation.

- On app startup, inspect backend bridge state for every active session.
- Record recovery metadata for any session whose bridge is still `starting` or `running`.
- Do not switch the selected session automatically.
- When the user activates a recoverable session, run a dedicated recovery flow that reattaches the UI, reloads persisted history, drains buffered events, and restores live state.

This is preferred over background pre-hydration because it fixes the actual bug boundary with less state duplication and less risk of stale frontend caches.

## Recovery Model

Recovery becomes a two-phase process.

### Phase 1: Startup Detection

On app mount or frontend reload:

1. query `list_active_bridges`
2. update per-session runtime status for every active bridge
3. create or refresh a `recoverable session` marker for any session whose backend bridge is still active
4. leave the currently selected session unchanged

This phase is metadata-only for non-selected sessions. It does not attempt to fully render or replay their conversation state.

### Phase 2: Activation Recovery

When the user activates a session marked recoverable:

1. load persisted messages from the database
2. attach live listeners for that session before replay
3. re-query the bridge state for that specific session
4. drain the session buffer
5. replay only what is not already represented in persisted history or current UI state
6. restore UI flags such as `processStatus`, `isLoading`, `isStreaming`, and tool output state
7. clear or retain the recoverable marker depending on whether the bridge is still active

This makes session activation the only place where recovery mutates rendered conversation state.

## Activation Recovery Flow

The recovery flow should be explicit and ordered.

### Recovery Steps

1. Load persisted messages from the database first.
   - Persisted history is the source of truth for committed conversation state.
2. Attach live listeners before draining buffered events.
   - This avoids missing new events emitted while replay is in progress.
3. Query current bridge metadata again for the target session.
   - This catches bridges that exited between startup detection and activation.
4. Drain buffered events for the session.
5. Replay only the gap between persisted history and current runtime state.
6. Restore UI loading/streaming state when the bridge is still active.
7. Refresh session status and clear recovery markers when the bridge is no longer active.

### User-Visible Behavior

- If the session already has the final assistant message in the database, recovery should not duplicate it.
- If only chunks were buffered and no final message has been persisted yet, the session should reopen in a visibly running state.
- If the bridge exited while inactive, activation should still refresh history and show the final persisted state before clearing the recovery marker.

## Persisted History vs Buffered Replay

Persisted database messages must be the source of truth for committed history.

Buffered events are only for closing the gap between:

- the last persisted state in the database
- the current runtime state still held by the backend bridge

The implementation should capture a per-session recovery snapshot before replay.

### Recovery Snapshot

Suggested fields:

- latest persisted assistant message identifiers
- latest message UUIDs and parent UUIDs where available
- known tool-use and tool-result identifiers already represented
- whether the UI currently holds an unfinished streamed assistant turn
- the latest persisted timestamps needed for fallback reconciliation

### Replay Rules

- Skip `MessageComplete` replay if the same completion is already persisted by `uuid`.
- If no `uuid` exists, fall back to a stricter duplicate key such as:
  - `role + content + model + stop_reason + timestamp proximity`
- Skip tool-use or tool-result replay when the same `tool_use_id` is already represented.
- Allow chunk and thinking replay only until a matching persisted completion is reached.
- Never treat plain assistant content equality alone as the only duplicate check.

This directly addresses the current ambiguity around “already saved but not rendered yet” versus “still only buffered”.

## State Shape And Boundaries

Most of this behavior should remain in `conversationStore`, with lightweight metadata kept per session.

### Suggested Frontend State Additions

- `recoverableSessions: Record<sessionId, RecoveryHint>`
- `recoveryInFlight: Record<sessionId, boolean>`
- `lastRecoveredAt: Record<sessionId, number>`

### RecoveryHint

`RecoveryHint` should stay minimal and carry only what the UI needs to decide whether recovery is possible:

- `processStatus`
- `cliSessionId`
- `hasBufferedEvents`
- `detectedAt`

### Boundary Split

- `reconnectAfterReload()` becomes startup metadata synchronization plus optional recovery for the currently selected session only
- `resumeSessionView(sessionId)` becomes the dedicated attach/reconcile path for recoverable sessions
- `switchSession()` invokes `resumeSessionView(sessionId)` when the target session is recoverable
- replay and duplicate detection move into explicit recovery helpers rather than remaining buried inside one generic replay function

This keeps startup logic simple and makes recovery behavior testable at the session-activation boundary.

## Failure Handling

Recovery must fail safely and remain retryable.

### Bridge State Query Fails

- show persisted messages normally
- keep last known recovery metadata if available
- leave the recoverable marker in place so a later activation can retry

### Buffer Drain Fails

- keep listeners attached
- preserve running/loading state if backend still reports the session as active
- show a warning toast explaining that some live updates may be missing

### Bridge Already Exited

- refresh persisted messages
- show final session state normally
- clear the recoverable marker

### Rapid Re-Activation Or HMR Churn

- guard recovery with `recoveryInFlight`
- use `lastRecoveredAt` to avoid repeated heavy recovery passes when nothing changed

## User Experience Expectations

Success looks like this:

- after a refresh, background-running sessions still appear as running in the sidebar
- the currently selected session stays selected
- when the user later opens a running session, it visibly resumes instead of appearing interrupted
- no duplicate assistant or tool messages appear after recovery
- persisted history wins over runtime guesses whenever there is disagreement

## Testing

The most important tests are store-level recovery regressions.

### Frontend Store Tests

- startup with selected session `A` and running background session `B`
  - `A` remains selected
  - `B` is marked recoverable
- opening recoverable `B`
  - loads persisted messages
  - attaches listeners
  - drains and replays buffer
  - restores running/loading state
- opening a recoverable session whose final assistant message is already persisted
  - does not duplicate the assistant message
- opening a recoverable session whose bridge already exited
  - refreshes persisted messages
  - clears recoverable marker
- repeated activation while recovery is already running
  - only one recovery pass executes

### Backend Coverage

No new backend behavior is required unless implementation reveals missing metadata from `list_active_bridges`.

If existing bridge metadata proves insufficient, coverage should be added only for the missing field or command, not for a broader recovery redesign.

## Implementation Notes

- Preserve current user selection semantics.
- Prefer deterministic reconciliation using IDs and UUIDs over content matching.
- Keep recovery logic centralized so future recovery work can build on the same activation boundary instead of scattering replay rules across startup and session-switch paths.
