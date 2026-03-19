# CLI Exit Diagnostics And Session Project Authority Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure every Claude turn runs in the session's correct project, automatically realign the active project when a session is activated, and surface abnormal CLI exits with actionable diagnostics instead of a bare `exit code -1`.

**Architecture:** Treat `session.project_id` as the authority for conversation dispatch and resume. The frontend resolves and repairs session-project binding before any send, while the backend validates the session/project relationship and emits richer process-exit diagnostics gathered at the bridge layer.

**Tech Stack:** SolidJS stores and components, TypeScript/Vitest, Tauri IPC, Rust async bridge/event loop, Tokio, serde.

---

## File Structure

### Existing files to modify

- `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src/stores/conversationStore.ts`
  - Own the session-aware send/resume resolution path.
  - Stop resolving cwd from the globally active project.
  - Consume richer CLI exit payloads and build the user-facing diagnostic error.
- `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src/stores/conversationStore.test.ts`
  - Add regression coverage for cross-project session activation, project repair, and exit diagnostics.
- `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src/stores/sessionStore.ts`
  - Add a minimal helper to persist a repaired `project_id` onto an existing session.
- `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src/stores/sessionStore.test.ts`
  - Cover the new project-binding helper.
- `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src/stores/projectStore.ts`
  - Reuse the existing active-project switch, no architecture change.
- `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src/lib/types.ts`
  - Extend the frontend event/payload typing for richer CLI exit diagnostics.
- `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src-tauri/src/commands/bridge.rs`
  - Enforce session/project authority for `start_session_cli` and `send_to_cli`.
  - Add focused validation helpers and tests.
- `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src-tauri/src/bridge/event_loop.rs`
  - Emit an enriched `cli:exited` payload instead of only `exit_code`.
- `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src-tauri/src/bridge/sdk_bridge.rs`
  - Capture stderr/stdout tail and spawn context for SDK bridge abnormal exits.
- `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src-tauri/src/bridge/process.rs`
  - Introduce the small diagnostic structs shared by the event loop and bridge implementations.

### Optional new file if code stays focused enough

- Create: `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src/lib/cliExitDiagnostics.ts`
  - Only if `conversationStore.ts` starts getting bloated.
  - Keep formatting/parsing of diagnostic payloads out of the store.

### Existing tests to use as references

- `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src/stores/conversationStore.test.ts`
- `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src/stores/sessionStore.test.ts`
- `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src/stores/projectStore.test.ts`
- `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src-tauri/src/commands/bridge.rs`
- `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src-tauri/src/bridge/event_loop.rs`
- `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src-tauri/src/bridge/sdk_bridge.rs`

## Chunk 1: Session Project Authority

### Task 1: Add failing store tests for session-owned project resolution

**Files:**
- Modify: `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src/stores/conversationStore.test.ts`
- Modify: `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src/stores/sessionStore.test.ts`

- [ ] **Step 1: Write the failing tests for cross-project send behavior**

```ts
it('dispatches using the session project instead of the active sidebar project', async () => {
  mockProjectState.activeProjectId = 'proj-b';
  mockProjectState.projects = [
    { id: 'proj-a', name: 'A', path: '/workspace/a', created_at: '', updated_at: '' },
    { id: 'proj-b', name: 'B', path: '/workspace/b', created_at: '', updated_at: '' },
  ];
  mockSessions = [
    makeSession({ id: 'session-a', project_id: 'proj-a', cli_session_id: 'cli-a' }),
  ];
  mockActiveSessionId = 'session-a';

  await sendMessage('status?', 'session-a');

  expect(invoke).toHaveBeenCalledWith(
    'send_to_cli',
    expect.objectContaining({ session_id: 'session-a', project_path: '/workspace/a' }),
  );
});

it('binds a projectless session to the active project before dispatch', async () => {
  mockProjectState.activeProjectId = 'proj-a';
  mockProjectState.projects = [
    { id: 'proj-a', name: 'A', path: '/workspace/a', created_at: '', updated_at: '' },
  ];
  mockSessions = [makeSession({ id: 'session-a', project_id: null })];
  mockActiveSessionId = 'session-a';

  await sendMessage('status?', 'session-a');

  expect(mockUpdateSessionProject).toHaveBeenCalledWith('session-a', 'proj-a');
  expect(invoke).toHaveBeenCalledWith(
    'send_to_cli',
    expect.objectContaining({ project_path: '/workspace/a' }),
  );
});
```

- [ ] **Step 2: Write the failing test for session activation switching the active project**

```ts
it('switches the active project to match the activated session project', async () => {
  mockProjectState.activeProjectId = 'proj-b';
  mockSessions = [makeSession({ id: 'session-a', project_id: 'proj-a' })];

  setActiveSession('session-a');

  expect(mockSetActiveProject).toHaveBeenCalledWith('proj-a');
});
```

- [ ] **Step 3: Write the failing sessionStore test for project repair persistence**

```ts
it('persists an updated project id onto an existing session', async () => {
  vi.mocked(invoke).mockResolvedValue(undefined);
  const mod = await import('./sessionStore');

  await mod.updateSessionProject('session-a', 'proj-a');

  expect(invoke).toHaveBeenCalledWith('update_session_project', {
    session_id: 'session-a',
    project_id: 'proj-a',
  });
});
```

- [ ] **Step 4: Run the targeted tests and verify they fail for the intended reasons**

Run:
```bash
cd /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum && npx vitest run src/stores/conversationStore.test.ts src/stores/sessionStore.test.ts
```

Expected:
- FAIL because send logic still uses the active project instead of the session project
- FAIL because `updateSessionProject` does not exist yet
- FAIL because session activation does not yet realign the active project automatically

### Task 2: Implement frontend session-project authority

**Files:**
- Modify: `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src/stores/conversationStore.ts`
- Modify: `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src/stores/sessionStore.ts`
- Modify: `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src/stores/projectStore.ts`

- [ ] **Step 1: Add a minimal session project update helper in `sessionStore.ts`**

```ts
export async function updateSessionProject(sessionId: string, projectId: string | null): Promise<void> {
  await invoke('update_session_project', { session_id: sessionId, project_id: projectId });
  setState('sessions', (s) => s.id === sessionId, 'project_id', projectId);
}
```

- [ ] **Step 2: Add a small resolver in `conversationStore.ts` for effective session project**

```ts
function resolveSessionProject(sessionId: string): { projectId: string; projectPath: string } {
  const session = statefulSessionLookup(sessionId);
  if (session?.project_id) {
    const project = projectState.projects.find((p) => p.id === session.project_id);
    if (!project) throw new Error(`Session project ${session.project_id} is not loaded`);
    return { projectId: project.id, projectPath: project.path };
  }

  const activeProject = getActiveProject();
  if (!activeProject) {
    throw new Error('Session project could not be resolved for dispatch');
  }

  void updateSessionProject(sessionId, activeProject.id);
  return { projectId: activeProject.id, projectPath: activeProject.path };
}
```

- [ ] **Step 3: Use the resolved session project in `dispatchMessageToCli()` instead of `getActiveProject()`**

```ts
const { projectId, projectPath } = await resolveAndRepairSessionProject(sessionId);
if (projectState.activeProjectId !== projectId) {
  setActiveProject(projectId);
}
```

- [ ] **Step 4: Update session activation to switch active project when needed**

```ts
export function setActiveSession(sessionId: string): void {
  // existing guards...
  const session = state.sessions.find((s) => s.id === sessionId);
  if (session?.project_id && projectState.activeProjectId !== session.project_id) {
    setActiveProject(session.project_id);
  }
  setState('activeSessionId', sessionId);
  bindActiveSessionToFocusedPane(sessionId);
}
```

- [ ] **Step 5: Re-run the targeted tests and verify they pass**

Run:
```bash
cd /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum && npx vitest run src/stores/conversationStore.test.ts src/stores/sessionStore.test.ts
```

Expected:
- PASS for cross-project dispatch
- PASS for projectless session repair
- PASS for session activation project realignment

- [ ] **Step 6: Commit the frontend authority work**

```bash
git add \
  /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src/stores/conversationStore.ts \
  /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src/stores/conversationStore.test.ts \
  /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src/stores/sessionStore.ts \
  /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src/stores/sessionStore.test.ts

git commit -m "fix: bind sessions to their project context"
```

## Chunk 2: Backend Guard And CLI Exit Diagnostics

### Task 3: Add failing Rust tests for session/project validation and enriched exits

**Files:**
- Modify: `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src-tauri/src/commands/bridge.rs`
- Modify: `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src-tauri/src/bridge/event_loop.rs`
- Modify: `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src-tauri/src/bridge/sdk_bridge.rs`
- Modify: `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src/lib/types.ts`
- Modify: `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src/stores/conversationStore.test.ts`

- [ ] **Step 1: Add a failing Rust test for session/project mismatch rejection**

```rust
#[tokio::test]
async fn send_to_cli_rejects_mismatched_session_project_context() {
    let err = validate_session_project_context(
        &session_row_with_project("session-a", Some("proj-a")),
        Some("proj-b"),
        Some("/workspace/b"),
        &project_lookup_for("proj-a", "/workspace/a"),
    )
    .unwrap_err();

    assert!(err.to_string().contains("session/project mismatch"));
}
```

- [ ] **Step 2: Add a failing Rust test for abnormal exit payload diagnostics**

```rust
#[test]
fn cli_exited_payload_marks_unknown_exit_and_preserves_stderr_tail() {
    let payload = build_cli_exited_payload(
        "session-a",
        None,
        Some(BridgeExitDiagnostics {
            cwd: Some("/workspace/a".into()),
            mode: Some("sdk_resume".into()),
            stderr_tail: vec!["resume token invalid".into()],
            ..BridgeExitDiagnostics::default()
        }),
    );

    assert_eq!(payload.exit_code, None);
    assert_eq!(payload.exit_label, "unknown");
    assert_eq!(payload.stderr_tail, vec!["resume token invalid"]);
}
```

- [ ] **Step 3: Add the failing frontend test for richer exit diagnostics**

```ts
it('renders enriched CLI exit diagnostics instead of a bare exit code', async () => {
  emit('cli:exited', {
    session_id: 'session-a',
    exit_code: null,
    exit_label: 'unknown',
    cwd: '/workspace/a',
    mode: 'sdk_resume',
    stderr_tail: ['resume token invalid'],
  });

  expect(conversationState.error).toContain('unknown');
  expect(conversationState.error).toContain('/workspace/a');
  expect(conversationState.error).toContain('sdk_resume');
  expect(conversationState.error).toContain('resume token invalid');
});
```

- [ ] **Step 4: Run the focused Rust and frontend tests to verify they fail**

Run:
```bash
cd /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum && cargo test commands::bridge -- --nocapture
cd /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum && cargo test bridge::event_loop -- --nocapture
cd /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum && npx vitest run src/stores/conversationStore.test.ts
```

Expected:
- FAIL because the backend does not yet validate session/project authority
- FAIL because `cli:exited` payload only contains `exit_code`
- FAIL because the frontend error builder only shows `CLI exited with code ...`

### Task 4: Implement backend guard and bridge diagnostics

**Files:**
- Modify: `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src-tauri/src/commands/bridge.rs`
- Modify: `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src-tauri/src/bridge/process.rs`
- Modify: `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src-tauri/src/bridge/sdk_bridge.rs`
- Modify: `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src-tauri/src/bridge/event_loop.rs`
- Modify: `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src/lib/types.ts`
- Modify: `/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src/stores/conversationStore.ts`

- [ ] **Step 1: Add shared diagnostic structs in `bridge/process.rs`**

```rust
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BridgeExitDiagnostics {
    pub cli_path: Option<String>,
    pub cwd: Option<String>,
    pub model: Option<String>,
    pub mode: Option<String>,
    pub cli_session_id: Option<String>,
    pub stderr_tail: Vec<String>,
    pub stdout_tail: Vec<String>,
    pub status_transition: Option<String>,
}
```

- [ ] **Step 2: Capture stderr/stdout tail and spawn context in `sdk_bridge.rs`**

```rust
// Keep a small ring buffer of recent stderr/stdout lines and snapshot it on ProcessExited.
let diagnostics = BridgeExitDiagnostics {
    cli_path: Some(config.cli_path.clone()),
    cwd: config.working_dir.clone(),
    model: config.model.clone(),
    mode: Some(if resumed { "sdk_resume" } else { "sdk_spawn" }.into()),
    cli_session_id: resumed_cli_session_id,
    stderr_tail: stderr_tail.snapshot(),
    stdout_tail: stdout_tail.snapshot(),
    status_transition: Some(format!("{:?} -> {:?}", ProcessStatus::Running, ProcessStatus::Exited(code))),
};
```

- [ ] **Step 3: Enrich the event payload in `event_loop.rs`**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CliExitedPayload {
    pub session_id: String,
    pub exit_code: Option<i32>,
    pub exit_label: String,
    pub cli_path: Option<String>,
    pub cwd: Option<String>,
    pub mode: Option<String>,
    pub cli_session_id: Option<String>,
    pub stderr_tail: Vec<String>,
    pub stdout_tail: Vec<String>,
    pub status_transition: Option<String>,
}
```

- [ ] **Step 4: Add a validation helper in `commands/bridge.rs` and use it in both `start_session_cli` and `send_to_cli`**

```rust
fn resolve_session_project_context(...) -> Result<ResolvedSessionProject, AppError> {
    // load session row by session_id
    // if session.project_id exists, require that it matches the resolved project and use its path
    // if session.project_id is missing but caller supplied a valid project, bind/return it
    // otherwise fail closed with AppError::Validation(...)
}
```

- [ ] **Step 5: Update frontend typing and error formatting**

```ts
export interface CliExitedEvent {
  session_id: string;
  exit_code: number | null;
  exit_label: string;
  cli_path: string | null;
  cwd: string | null;
  mode: string | null;
  cli_session_id: string | null;
  stderr_tail: string[];
  stdout_tail: string[];
  status_transition: string | null;
}

function formatCliExitError(event: CliExitedEvent): string {
  return [
    `Claude Code CLI exited (${event.exit_label})`,
    event.cwd ? `cwd: ${event.cwd}` : null,
    event.mode ? `mode: ${event.mode}` : null,
    event.stderr_tail[0] ? `stderr: ${event.stderr_tail[0]}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}
```

- [ ] **Step 6: Re-run the focused tests and verify they pass**

Run:
```bash
cd /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum && cargo test commands::bridge -- --nocapture
cd /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum && cargo test bridge::event_loop -- --nocapture
cd /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum && cargo test bridge::sdk_bridge -- --nocapture
cd /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum && npx vitest run src/stores/conversationStore.test.ts
```

Expected:
- PASS for session/project mismatch tests
- PASS for enriched `cli:exited` payload tests
- PASS for frontend diagnostic rendering tests

- [ ] **Step 7: Run the full verification suite**

Run:
```bash
cd /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum && npm run lint
cd /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum && npm run build
cd /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum && cargo fmt --all -- --check
cd /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum && cargo clippy --all-targets -- -D warnings
cd /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum && cargo test
```

Expected:
- all commands exit `0`
- no new lint warnings
- no TypeScript build regressions
- no Rust test regressions

- [ ] **Step 8: Commit the backend guard and diagnostics work**

```bash
git add \
  /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src/lib/types.ts \
  /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src/stores/conversationStore.ts \
  /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src/stores/conversationStore.test.ts \
  /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src-tauri/src/bridge/process.rs \
  /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src-tauri/src/bridge/sdk_bridge.rs \
  /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src-tauri/src/bridge/event_loop.rs \
  /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/src-tauri/src/commands/bridge.rs

git commit -m "fix: enforce session project authority and surface cli diagnostics"
```

## Final Review Checklist

- [ ] Session activation always aligns the active project with the session project.
- [ ] Sending from an older session cannot silently run in the currently selected sidebar project.
- [ ] Projectless sessions are repaired once and persisted.
- [ ] `cli:exited` surfaces cwd, mode, and stderr tail instead of only a numeric code.
- [ ] Unknown exit codes are labeled as unknown, not misrepresented.
- [ ] Full frontend and Rust validation passes before merge.
