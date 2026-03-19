# CLI Exit Diagnostics And Session Project Authority

Date: 2026-03-19
Status: Approved design
Scope: Make the session's project the authoritative source for Claude Code working directory and resume behavior, and surface abnormal CLI exits with enough runtime evidence to debug failures such as `exit code -1`.

## Problem

Two distinct failures are causing user-visible confusion.

### 1. Session / project drift

A session can belong to project A while the globally active project in the sidebar is project B.
Current send and resume paths still resolve `project_path` from the active project instead of the target session. That allows a session opened under project A to continue in project B after the user changes projects in the sidebar.

This causes:

- Claude turns running in the wrong working directory
- follow-up prompts using the wrong repository context
- resumed sessions appearing to mix two different projects
- downstream confusion in file context, slash commands, actions, and terminal behavior

### 2. Opaque CLI exit failures

The UI currently surfaces process exits as a generic message such as `CLI exited with code -1`.
That message is not actionable because it omits the actual runtime context:

- which CLI binary was used
- which cwd was used
- whether this was SDK stdin send, SDK resume spawn, or legacy prompt mode
- what the process wrote to stderr before exiting
- whether any structured output arrived first

As a result, the user sees a failure but the logs do not explain it clearly enough to identify whether the issue is Claude itself, spawn configuration, resume state, or working-directory drift.

## Goals

- Make `session.project_id` the source of truth for Claude working directory.
- Switch the active UI project to the session project when a session is activated.
- Prevent message send and resume paths from silently falling back to the wrong project.
- Bind projectless sessions explicitly before first dispatch so they become stable.
- Surface richer abnormal-exit diagnostics to the frontend instead of a bare exit code.
- Distinguish unknown abnormal termination from a normal numeric exit code.

## Non-Goals

- Broader crash recovery beyond the current bridge/session model.
- Reworking unrelated project-scoped stores that do not participate in session dispatch.
- Adding full persisted diagnostics history beyond the current runtime and error surfaces.
- Changing model selection or permission behavior.

## Recommended Approach

Use session-owned project authority with a backend guard, and add explicit bridge exit diagnostics.

### Session authority

- A session's `project_id` becomes the authoritative source for CLI cwd, resume, and dispatch.
- When the user activates a session, the UI switches the active project to that session's project.
- When the user sends a message, dispatch resolves the project from the target session first, not from global UI state.
- If a session has no project and there is an active project, the app binds that project to the session before the turn starts.

### Exit diagnostics

- Capture spawn context and short stderr/stdout tails at the bridge layer.
- Emit a richer frontend event when the process exits abnormally.
- Show a precise, compact error instead of only `exit code -1`.

This is preferred over a UI-only sync because it fixes the actual authority boundary instead of depending on sidebar state remaining aligned.

## Session Project Authority

The session becomes the authority for project context.

### Rules

1. Every send or resume operation resolves the target session first.
2. If that session has a `project_id`, use it as the source of truth.
3. If that session has no `project_id` and there is an active project, bind the session to that project before dispatch.
4. If no project can be resolved, fail closed with a precise error instead of silently using `.`.

### Activation behavior

When a session is activated:

1. load the session
2. if it has a `project_id` and it differs from the current active project, switch the active project
3. refresh project-scoped UI that depends on the active project
4. keep the session and active project aligned before any send or resume happens

This makes the visible UI project and the backend working directory consistent.

## Dispatch And Resume Flow

Current dispatch should stop consulting the active sidebar project as the authority.

### New flow

When the user sends a message:

1. resolve the target session by `sessionId`
2. resolve the effective project from the session first
3. resolve project metadata and path from that project
4. pass that resolved path into `start_session_cli` and `send_to_cli`
5. if the project cannot be resolved, stop and surface a useful error

### Session repair for projectless sessions

If a session has no `project_id` but there is an active project:

1. persist that project onto the session before dispatch
2. update frontend session state immediately
3. use the newly bound project for the turn

That prevents repeated ambiguity for older sessions that were created without a project.

## Backend Guard

The backend should not trust caller-provided project paths when it can validate them against the session.

### Guard behavior

For `start_session_cli` and `send_to_cli`:

- accept `session_id`
- derive or validate the effective project for that session
- ensure the working directory matches that project
- reject mismatched session/project combinations instead of silently proceeding

This provides a second line of defense even if frontend state drifts again.

## Exit Diagnostics

A bare exit code is not enough for debugging abnormal termination.

### Diagnostic payload

When a bridge exits unexpectedly, capture and emit:

- resolved CLI binary path
- cwd used for spawn
- model
- execution mode:
  - SDK resume spawn
  - SDK stdin send to existing bridge
  - legacy `-p` spawn
- `cli_session_id` if known
- last stderr lines
- last stdout lines if no structured event explained the failure
- raw process status transition
- exit code if one exists

### Diagnostic semantics

- `None` or missing exit code should be surfaced as `unknown` or `no exit code available`, not rephrased as a fake numeric error.
- `-1` should be treated as abnormal termination evidence, not as a sufficient explanation.
- The UI should present the diagnostic summary in a compact, readable way without hiding the key evidence.

## Frontend Error Behavior

When a process exits abnormally, the frontend should render:

- concise summary
- exit code or `unknown`
- cwd
- mode (`resume`, `sdk`, `legacy`)
- short stderr tail

This should appear in the session error state and logs so the user can tell whether the failure is:

- wrong working directory
- stale resume state
- CLI/runtime failure
- malformed spawn context

## Failure Handling

The system should fail closed when project ownership is ambiguous.

### Project resolution fails

- do not send the turn
- keep the existing conversation state intact
- show a specific error such as `Session project could not be resolved for dispatch`

### Session/project mismatch detected by backend

- reject the operation
- include both session id and resolved project details in the error
- do not fall back to the active project automatically

### Abnormal CLI exit without stderr

- still emit full spawn context
- mark the exit reason as unknown
- preserve enough evidence to reproduce the exact launch conditions

## Testing

### Frontend tests

- opening a session from project A while project B is active switches active project to A
- sending from a session uses that session's project path even if the active project previously differed
- projectless sessions get bound once and then remain stable
- no send path falls back to `.` when a session has a known project mismatch
- abnormal exit diagnostics render code or `unknown`, cwd, and mode

### Backend / Rust tests

- `start_session_cli` and `send_to_cli` reject or correct mismatched session/project inputs
- session-owned project resolution produces the correct cwd
- abnormal exit payload includes stderr tail and spawn context
- unknown exit is surfaced distinctly from a numeric exit code

## Success Criteria

The design is successful when:

- activating a session always aligns the active project with that session's project
- Claude never runs a session in the wrong repository because the sidebar project changed
- projectless sessions are repaired once and stop drifting
- `exit code -1` failures include enough context to determine what actually went wrong
- ambiguous session/project resolution fails safely instead of silently running in the wrong cwd
