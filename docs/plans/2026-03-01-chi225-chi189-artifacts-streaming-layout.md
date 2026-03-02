# CHI-225 + CHI-189: Artifacts Panel & Streaming Layout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add session artifact indexing (CHI-225) and restructure the streaming message layout so response text is always the visually dominant element (CHI-189).

**Architecture:** CHI-225 adds a `artifacts` DB table (migration v5), Rust extraction logic that scans assistant messages for code blocks on demand, two new IPC commands, sessionStore summary cache, and two new DetailsPanel sections. CHI-189 splits the ConversationView message list into historical + current-turn-tool segments during an active streaming turn, groups the current-turn tools in a new `StreamingActivitySection` collapsible, and leaves the thinking bar + typewriter response as the dominant visual layer.

**Tech Stack:** Rust + SQLite (rusqlite), Tauri v2 IPC, SolidJS 1.9 stores + components, TailwindCSS v4 tokens, lucide-solid icons.

---

## Pre-flight: current state

- **DB at v4** (`action_history`) — confirmed in `migrations.rs`.
- `StreamingThinkingBlock.tsx` **already exists** — thinking bar above streaming text is done.
- `LiveToolOutput.tsx` **already exists** — used internally by `ToolResultBlock.tsx`.
- `CrossProjectRunningAction` + `ActionHistoryEntry` already in `types.ts`.
- Sidebar session row already shows: model chip, cost chip, `formatRelativeTime`.
- DetailsPanel uses `CollapsibleSection` accordion pattern with `focusedSectionId`.

---

## PART A — CHI-225: Session History & Artifact Index

---

### Task A1: DB Migration v5 — artifacts table

**Files:**
- Modify: `src-tauri/src/db/migrations.rs`

**Step 1: Add migration v5 to the MIGRATIONS array**

In `migrations.rs`, the array currently ends at v4. Append v5 **before** the closing `];`:

```rust
    Migration {
        version: 5,
        description: "Add artifacts table for session artifact index (CHI-225)",
        sql: r#"
            CREATE TABLE IF NOT EXISTS artifacts (
                id            TEXT PRIMARY KEY,
                session_id    TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                message_id    TEXT NOT NULL,
                message_index INTEGER NOT NULL,
                block_index   INTEGER NOT NULL DEFAULT 0,
                type          TEXT NOT NULL CHECK(type IN ('code','file','plan','diagram','data')),
                language      TEXT,
                title         TEXT NOT NULL,
                preview       TEXT NOT NULL,
                content       TEXT NOT NULL,
                line_count    INTEGER NOT NULL DEFAULT 0,
                created_at    INTEGER NOT NULL,
                UNIQUE(message_id, block_index)
            );
            CREATE INDEX IF NOT EXISTS idx_artifacts_session
                ON artifacts(session_id, created_at DESC);
        "#,
    },
```

> Note: `UNIQUE(message_id, block_index)` enables `INSERT OR IGNORE` for idempotent extraction.

**Step 2: Update the migration tests (same file)**

Find the three tests that hardcode numeric counts and update them:

```rust
// migrations_apply_on_fresh_db
assert_eq!(version, 5);   // was 4

// migrations_are_idempotent
assert_eq!(count, 5);     // was 4

// schema_version_tracks_correctly
assert_eq!(rows.len(), 5);          // was 4
assert_eq!(rows[4].0, 5);           // new
assert!(rows[4].1.contains("artifacts"));  // new
```

Also add `"artifacts"` to the `tables` list in `all_tables_created`:

```rust
let tables = [
    "projects", "sessions", "messages", "agents",
    "cost_events", "budgets", "action_history", "artifacts",
];
```

**Step 3: Run the migration tests**

```bash
cd src-tauri && cargo test db::migrations -- --nocapture
```

Expected: all 5 tests pass.

**Step 4: Commit**

```bash
git add src-tauri/src/db/migrations.rs
git commit -m "CHI-225: add artifacts table (migration v5)"
```

---

### Task A2: DB Queries — ArtifactRow + CRUD

**Files:**
- Modify: `src-tauri/src/db/queries.rs`

**Step 1: Add ArtifactRow and SessionSummaryRow structs**

Near the top of `queries.rs`, after the existing `MessageRow` struct definition, add:

```rust
/// A persisted code/file/diagram artifact extracted from a session message.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArtifactRow {
    pub id: String,
    pub session_id: String,
    pub message_id: String,
    pub message_index: i64,
    pub block_index: i64,
    pub r#type: String,
    pub language: Option<String>,
    pub title: String,
    pub preview: String,
    pub content: String,
    pub line_count: i64,
    pub created_at: i64,
}

/// Aggregate session summary for the History tab (CHI-225).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionSummaryRow {
    pub message_count: i64,
    pub tool_count: i64,
    pub artifact_count: i64,
    pub duration_secs: i64,
    pub models_used: Vec<String>,
}
```

**Step 2: Add insert_artifact_or_ignore**

```rust
/// Insert an artifact, silently ignoring duplicate (message_id, block_index) pairs.
#[tracing::instrument(target = "db/queries", level = "debug", skip(db))]
pub fn insert_artifact_or_ignore(
    db: &Database,
    id: &str,
    session_id: &str,
    message_id: &str,
    message_index: i64,
    block_index: i64,
    artifact_type: &str,
    language: Option<&str>,
    title: &str,
    preview: &str,
    content: &str,
    line_count: i64,
    created_at: i64,
) -> Result<(), AppError> {
    db.with_conn(|conn| {
        conn.execute(
            "INSERT OR IGNORE INTO artifacts
             (id, session_id, message_id, message_index, block_index,
              type, language, title, preview, content, line_count, created_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
            rusqlite::params![
                id, session_id, message_id, message_index, block_index,
                artifact_type, language, title, preview, content, line_count, created_at
            ],
        )?;
        Ok(())
    })
}
```

**Step 3: Add get_session_artifacts**

```rust
#[tracing::instrument(target = "db/queries", level = "debug", skip(db))]
pub fn get_session_artifacts(
    db: &Database,
    session_id: &str,
) -> Result<Vec<ArtifactRow>, AppError> {
    db.with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, session_id, message_id, message_index, block_index,
                    type, language, title, preview, content, line_count, created_at
             FROM artifacts
             WHERE session_id = ?1
             ORDER BY created_at ASC",
        )?;
        let rows = stmt
            .query_map(rusqlite::params![session_id], |row| {
                Ok(ArtifactRow {
                    id: row.get(0)?,
                    session_id: row.get(1)?,
                    message_id: row.get(2)?,
                    message_index: row.get(3)?,
                    block_index: row.get(4)?,
                    r#type: row.get(5)?,
                    language: row.get(6)?,
                    title: row.get(7)?,
                    preview: row.get(8)?,
                    content: row.get(9)?,
                    line_count: row.get(10)?,
                    created_at: row.get(11)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    })
}
```

**Step 4: Add query_session_summary**

```rust
/// Compute aggregate session stats for the History tab.
#[tracing::instrument(target = "db/queries", level = "debug", skip(db))]
pub fn query_session_summary(
    db: &Database,
    session_id: &str,
) -> Result<SessionSummaryRow, AppError> {
    db.with_conn(|conn| {
        let message_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM messages WHERE session_id = ?1
             AND role NOT IN ('tool_use','tool_result','thinking','permission')",
            rusqlite::params![session_id],
            |r| r.get(0),
        )?;

        let tool_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM messages
             WHERE session_id = ?1 AND role = 'tool_use'",
            rusqlite::params![session_id],
            |r| r.get(0),
        )?;

        let artifact_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM artifacts WHERE session_id = ?1",
            rusqlite::params![session_id],
            |r| r.get(0),
        )?;

        // Duration in seconds between session created_at and updated_at
        let duration_secs: i64 = conn
            .query_row(
                "SELECT COALESCE(
                    CAST((julianday(updated_at) - julianday(created_at)) * 86400 AS INTEGER),
                    0
                 )
                 FROM sessions WHERE id = ?1",
                rusqlite::params![session_id],
                |r| r.get(0),
            )
            .unwrap_or(0);

        // Distinct non-null models used in this session
        let mut stmt = conn.prepare(
            "SELECT DISTINCT model FROM messages
             WHERE session_id = ?1 AND model IS NOT NULL",
        )?;
        let models_used: Vec<String> = stmt
            .query_map(rusqlite::params![session_id], |r| r.get(0))?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(SessionSummaryRow {
            message_count,
            tool_count,
            artifact_count,
            duration_secs,
            models_used,
        })
    })
}
```

**Step 5: Add unit tests at the bottom of queries.rs**

```rust
#[cfg(test)]
mod artifact_tests {
    use super::*;

    fn test_db() -> Database {
        Database::open_in_memory().expect("open in-memory db")
    }

    #[test]
    fn insert_artifact_and_retrieve() {
        let db = test_db();
        insert_project(&db, "p1", "Proj", "/tmp/p1").unwrap();
        insert_session(&db, "s1", Some("p1"), "claude-sonnet-4-6").unwrap();

        insert_artifact_or_ignore(
            &db, "a1", "s1", "m1", 0, 0,
            "code", Some("rust"), "Rust block #1",
            "fn main() {", "fn main() {\n  println!(\"hello\");\n}", 2, 1000,
        ).unwrap();

        let artifacts = get_session_artifacts(&db, "s1").unwrap();
        assert_eq!(artifacts.len(), 1);
        assert_eq!(artifacts[0].id, "a1");
        assert_eq!(artifacts[0].language, Some("rust".to_string()));
    }

    #[test]
    fn insert_artifact_ignores_duplicate_message_block() {
        let db = test_db();
        insert_project(&db, "p1", "Proj", "/tmp/p1").unwrap();
        insert_session(&db, "s1", Some("p1"), "claude-sonnet-4-6").unwrap();

        insert_artifact_or_ignore(
            &db, "a1", "s1", "m1", 0, 0,
            "code", Some("ts"), "TS block #1", "const x", "const x = 1;", 1, 1000,
        ).unwrap();
        // Second insert with same (message_id, block_index) — different id, should be ignored
        insert_artifact_or_ignore(
            &db, "a2", "s1", "m1", 0, 0,
            "code", Some("ts"), "TS block #1", "const x", "const x = 1;", 1, 1001,
        ).unwrap();

        let artifacts = get_session_artifacts(&db, "s1").unwrap();
        assert_eq!(artifacts.len(), 1, "duplicate should be ignored");
        assert_eq!(artifacts[0].id, "a1");
    }

    #[test]
    fn session_summary_counts_correctly() {
        let db = test_db();
        insert_project(&db, "p1", "Proj", "/tmp/p1").unwrap();
        insert_session(&db, "s1", Some("p1"), "claude-sonnet-4-6").unwrap();

        insert_message(&db, "m1", "s1", "user", "hello", None, None, None, None).unwrap();
        insert_message(
            &db, "m2", "s1", "assistant", "hi",
            Some("claude-sonnet-4-6"), Some(10), Some(5), Some(1),
        ).unwrap();
        insert_message(&db, "m3", "s1", "tool_use", r#"{"tool_name":"Read","tool_input":"{}","tool_use_id":"t1"}"#, None, None, None, None).unwrap();

        insert_artifact_or_ignore(
            &db, "a1", "s1", "m2", 1, 0,
            "code", Some("rust"), "Rust block", "fn f", "fn f() {}", 1, 1000,
        ).unwrap();

        let summary = query_session_summary(&db, "s1").unwrap();
        assert_eq!(summary.message_count, 2); // user + assistant (no tool_use/result/thinking)
        assert_eq!(summary.tool_count, 1);
        assert_eq!(summary.artifact_count, 1);
    }
}
```

**Step 6: Run the tests**

```bash
cd src-tauri && cargo test db::queries::artifact_tests -- --nocapture
```

Expected: 3 new tests pass.

**Step 7: Commit**

```bash
git add src-tauri/src/db/queries.rs
git commit -m "CHI-225: ArtifactRow, SessionSummaryRow, CRUD queries"
```

---

### Task A3: Artifact Extraction Logic

**Files:**
- Modify: `src-tauri/src/db/queries.rs` (add helper + extractor)

This is the function that scans assistant messages for fenced code blocks and writes them to the `artifacts` table. It's idempotent — safe to call multiple times.

**Step 1: Add the code block parser (pure function, no DB)**

Add before the artifact CRUD functions:

```rust
/// Parsed code block extracted from markdown content.
#[derive(Debug)]
pub struct CodeBlock {
    pub language: String,
    pub content: String,
}

/// Extract all fenced code blocks (```lang\n...\n```) from markdown text.
/// Returns (language, content) pairs in document order.
/// Pure function — no DB access, easy to unit test.
pub fn extract_code_blocks(markdown: &str) -> Vec<CodeBlock> {
    let mut blocks = Vec::new();
    let mut in_block = false;
    let mut current_lang = String::new();
    let mut current_lines: Vec<&str> = Vec::new();

    for line in markdown.lines() {
        if !in_block {
            if line.starts_with("```") {
                in_block = true;
                current_lang = line[3..].trim().to_string();
                current_lines.clear();
            }
        } else if line.trim() == "```" {
            blocks.push(CodeBlock {
                language: current_lang.clone(),
                content: current_lines.join("\n"),
            });
            in_block = false;
            current_lang.clear();
            current_lines.clear();
        } else {
            current_lines.push(line);
        }
    }
    blocks
}

/// Map a language string to an artifact type.
fn artifact_type_for(language: &str) -> &'static str {
    match language.to_lowercase().as_str() {
        "mermaid" => "diagram",
        "json" | "csv" | "yaml" | "toml" | "xml" => "data",
        _ => "code",
    }
}
```

**Step 2: Add the session-level extractor**

```rust
/// Scan all assistant messages in a session, extract code blocks, and persist
/// them to the artifacts table. Idempotent — duplicate (message_id, block_index)
/// pairs are silently ignored.
#[tracing::instrument(target = "db/queries", level = "info", skip(db))]
pub fn extract_and_save_artifacts(
    db: &Database,
    session_id: &str,
) -> Result<(), AppError> {
    // Load all assistant messages ordered by creation time
    let messages = db.with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, content, created_at FROM messages
             WHERE session_id = ?1 AND role = 'assistant'
             ORDER BY rowid ASC",
        )?;
        let rows = stmt
            .query_map(rusqlite::params![session_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2).unwrap_or(0),
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    })?;

    for (msg_index, (message_id, content, created_at)) in messages.iter().enumerate() {
        let blocks = extract_code_blocks(content);
        for (block_index, block) in blocks.iter().enumerate() {
            if block.content.trim().is_empty() {
                continue;
            }
            let artifact_type = artifact_type_for(&block.language);
            let lang_opt: Option<&str> = if block.language.is_empty() {
                None
            } else {
                Some(&block.language)
            };
            let line_count = block.content.lines().count() as i64;
            let preview: String = block.content
                .chars()
                .take(200)
                .collect::<String>()
                .lines()
                .next()
                .unwrap_or("")
                .to_string();
            let title = if block.language.is_empty() {
                format!("Code block #{}", block_index + 1)
            } else {
                let lang_display = block.language
                    .chars()
                    .enumerate()
                    .map(|(i, c)| if i == 0 { c.to_uppercase().next().unwrap_or(c) } else { c })
                    .collect::<String>();
                format!("{} block #{}", lang_display, block_index + 1)
            };
            // Derive a stable id from message_id + block_index
            let artifact_id = format!("{}-{}", message_id, block_index);

            insert_artifact_or_ignore(
                db,
                &artifact_id,
                session_id,
                message_id,
                *msg_index as i64,
                block_index as i64,
                artifact_type,
                lang_opt,
                &title,
                &preview,
                &block.content,
                line_count,
                *created_at,
            )?;
        }
    }
    Ok(())
}
```

**Step 3: Add unit tests for extract_code_blocks**

```rust
#[cfg(test)]
mod extraction_tests {
    use super::extract_code_blocks;

    #[test]
    fn extracts_single_rust_block() {
        let md = "Here is code:\n```rust\nfn main() {}\n```\nDone.";
        let blocks = extract_code_blocks(md);
        assert_eq!(blocks.len(), 1);
        assert_eq!(blocks[0].language, "rust");
        assert_eq!(blocks[0].content, "fn main() {}");
    }

    #[test]
    fn extracts_multiple_blocks() {
        let md = "```ts\nconst x = 1;\n```\nSome text.\n```json\n{\"a\":1}\n```";
        let blocks = extract_code_blocks(md);
        assert_eq!(blocks.len(), 2);
        assert_eq!(blocks[0].language, "ts");
        assert_eq!(blocks[1].language, "json");
    }

    #[test]
    fn skips_empty_blocks() {
        let md = "```\n```";  // no content
        let blocks = extract_code_blocks(md);
        // block with empty content — content is ""
        assert_eq!(blocks.len(), 1);
        assert!(blocks[0].content.trim().is_empty());
    }

    #[test]
    fn no_blocks_returns_empty() {
        let md = "Plain text only, no code.";
        let blocks = extract_code_blocks(md);
        assert!(blocks.is_empty());
    }
}
```

**Step 4: Run the tests**

```bash
cd src-tauri && cargo test db::queries::extraction_tests -- --nocapture
```

Expected: 4 tests pass.

**Step 5: Commit**

```bash
git add src-tauri/src/db/queries.rs
git commit -m "CHI-225: code block extractor + extract_and_save_artifacts"
```

---

### Task A4: IPC Commands + main.rs Registration

**Files:**
- Modify: `src-tauri/src/commands/session.rs`
- Modify: `src-tauri/src/main.rs`

**Step 1: Add the three commands to session.rs**

Append at the end of `session.rs` (before `#[cfg(test)]`):

```rust
/// Extract code blocks from all assistant messages in a session and persist
/// them to the artifacts table. Idempotent. Returns the full artifact list.
#[tauri::command(rename_all = "snake_case")]
pub fn extract_session_artifacts(
    db: State<'_, Database>,
    session_id: String,
) -> Result<Vec<queries::ArtifactRow>, AppError> {
    queries::extract_and_save_artifacts(&db, &session_id)?;
    queries::get_session_artifacts(&db, &session_id)
}

/// Return cached artifact list for a session (no re-extraction).
#[tauri::command(rename_all = "snake_case")]
pub fn get_session_artifacts(
    db: State<'_, Database>,
    session_id: String,
) -> Result<Vec<queries::ArtifactRow>, AppError> {
    queries::get_session_artifacts(&db, &session_id)
}

/// Return aggregate session stats: message count, tool count, artifact count,
/// duration, models used.
#[tauri::command(rename_all = "snake_case")]
pub fn get_session_summary(
    db: State<'_, Database>,
    session_id: String,
) -> Result<queries::SessionSummaryRow, AppError> {
    queries::query_session_summary(&db, &session_id)
}
```

**Step 2: Register the new commands in main.rs**

In `src-tauri/src/main.rs`, inside the `tauri::generate_handler![...]` block, add after `session_has_messages`:

```rust
chief_wiggum_lib::commands::session::extract_session_artifacts,
chief_wiggum_lib::commands::session::get_session_artifacts,
chief_wiggum_lib::commands::session::get_session_summary,
```

**Step 3: Verify it compiles**

```bash
cd src-tauri && cargo build 2>&1 | grep -E "^error" | head -20
```

Expected: no errors.

**Step 4: Run all Rust tests**

```bash
cd src-tauri && cargo test -- --nocapture 2>&1 | tail -20
```

Expected: all tests pass (the new commands don't need separate tests — covered by the query tests).

**Step 5: Commit**

```bash
git add src-tauri/src/commands/session.rs src-tauri/src/main.rs
git commit -m "CHI-225: extract_session_artifacts, get_session_artifacts, get_session_summary IPC"
```

---

### Task A5: TypeScript Types + sessionStore

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/stores/sessionStore.ts`

**Step 1: Add Artifact and SessionSummary types to types.ts**

Find the `// ── Settings (CHI-122)` comment and add the new types just before it:

```typescript
// ── Artifacts (CHI-225) ──────────────────────────────────

/** A code/diagram/plan block extracted from a session message. */
export interface Artifact {
  id: string;
  session_id: string;
  message_id: string;
  message_index: number;
  block_index: number;
  type: 'code' | 'file' | 'plan' | 'diagram' | 'data';
  language: string | null;
  title: string;
  preview: string;
  content: string;
  line_count: number;
  created_at: number;
}

/** Aggregate session statistics for the History tab. */
export interface SessionSummary {
  message_count: number;
  tool_count: number;
  artifact_count: number;
  duration_secs: number;
  models_used: string[];
}
```

**Step 2: Add sessionSummaries to sessionStore.ts**

Open `src/stores/sessionStore.ts`. Find the existing state shape (where `sessions`, `activeSessionId`, etc. are defined). Add two new fields to the state:

```typescript
// Inside the createStore initial state object:
sessionSummaries: {} as Record<string, SessionSummary>,
summaryLoading: {} as Record<string, boolean>,
```

Add the `loadSessionSummary` action function (exported alongside existing actions):

```typescript
export async function loadSessionSummary(sessionId: string): Promise<void> {
  if (sessionState.summaryLoading[sessionId]) return;
  setSessionState('summaryLoading', sessionId, true);
  try {
    const summary = await invoke<SessionSummary>('get_session_summary', {
      session_id: sessionId,
    });
    setSessionState('sessionSummaries', sessionId, summary);
  } catch (err) {
    devWarn('loadSessionSummary failed', err);
  } finally {
    setSessionState('summaryLoading', sessionId, false);
  }
}
```

Import `SessionSummary` from `@/lib/types`.

**Step 3: Trigger loadSessionSummary on session switch**

Find the `switchSession` function in `sessionStore.ts`. After the existing cleanup/load logic, add:

```typescript
// Load summary for the newly active session (fire-and-forget)
void loadSessionSummary(id);
```

**Step 4: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors.

**Step 5: Commit**

```bash
git add src/lib/types.ts src/stores/sessionStore.ts
git commit -m "CHI-225: Artifact + SessionSummary types, sessionStore summary cache"
```

---

### Task A6: Sidebar Session Metadata Chips

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

**Step 1: Add formatDuration helper**

In `Sidebar.tsx`, near `formatRelativeTime`, add:

```typescript
function formatDuration(createdAt: string | null, updatedAt: string | null): string {
  if (!createdAt || !updatedAt) return '';
  const diffMs = new Date(updatedAt).getTime() - new Date(createdAt).getTime();
  if (diffMs < 1000) return '';
  const totalSecs = Math.floor(diffMs / 1000);
  if (totalSecs < 60) return `${totalSecs}s`;
  const mins = Math.floor(totalSecs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return remainMins > 0 ? `${hours}h ${remainMins}m` : `${hours}h`;
}
```

**Step 2: Import sessionState in the session-row component**

`sessionState` is likely already imported at the top of Sidebar.tsx. If not, ensure:

```typescript
import { sessionState, loadSessionSummary } from '@/stores/sessionStore';
```

**Step 3: Add artifact count badge and duration chip to the session row**

The existing session row metadata section (around line 1105) looks like:

```tsx
<div class="flex items-center gap-1 flex-wrap">
  {/* model chip */}
  <span ...>{modelLabel(props.session.model)}</span>
  {/* cost chip (Show when cost > 0) */}
</div>
<span class="text-[10px] text-text-tertiary/60">
  {formatRelativeTime(props.session.updated_at)}
</span>
```

Replace that metadata `<div>` + time `<span>` block with:

```tsx
<div class="flex items-center gap-1 flex-wrap">
  <span
    class="text-[9px] font-medium shrink-0 px-1 py-0.5 rounded"
    style={{
      background: modelBgColor(props.session.model),
      color: 'var(--color-bg-primary)',
    }}
  >
    {modelLabel(props.session.model)}
  </span>
  <Show when={(props.session.total_cost_cents ?? 0) > 0}>
    <span
      class="text-[9px] font-mono shrink-0 px-1 py-0.5 rounded"
      style={{
        color: 'var(--color-text-tertiary)',
        background: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border-secondary)',
      }}
      title="Session cost"
    >
      {`$${((props.session.total_cost_cents ?? 0) / 100).toFixed(2)}`}
    </span>
  </Show>
  <Show when={formatDuration(props.session.created_at, props.session.updated_at)}>
    <span
      class="text-[9px] font-mono shrink-0 px-1 py-0.5 rounded"
      style={{
        color: 'var(--color-text-tertiary)',
        background: 'var(--color-bg-inset)',
      }}
      title="Session duration"
    >
      {formatDuration(props.session.created_at, props.session.updated_at)}
    </span>
  </Show>
  <Show when={(sessionState.sessionSummaries[props.session.id]?.artifact_count ?? 0) > 0}>
    <span
      class="text-[9px] font-mono shrink-0 px-1 py-0.5 rounded"
      style={{
        color: 'var(--color-accent)',
        background: 'rgba(232, 130, 90, 0.12)',
        border: '1px solid rgba(232, 130, 90, 0.25)',
      }}
      title="Artifacts"
    >
      {`${sessionState.sessionSummaries[props.session.id]?.artifact_count ?? 0} artifacts`}
    </span>
  </Show>
</div>
<span class="text-[10px] text-text-tertiary/60">
  {formatRelativeTime(props.session.updated_at)}
</span>
```

**Step 4: Lint + type check**

```bash
npx tsc --noEmit && npx eslint src/components/layout/Sidebar.tsx
```

Expected: no errors.

**Step 5: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "CHI-225: session row duration chip + artifact count badge"
```

---

### Task A7: DetailsPanel History + Artifacts Sections

**Files:**
- Modify: `src/components/layout/DetailsPanel.tsx`

This task adds two new `CollapsibleSection` entries at the bottom of the DetailsPanel.

**Step 1: Import new types and IPC**

At the top of `DetailsPanel.tsx`, add the new imports:

```typescript
import { invoke } from '@tauri-apps/api/core';
import type { Artifact, SessionSummary } from '@/lib/types';
import { sessionState, loadSessionSummary } from '@/stores/sessionStore';
import { createSignal, For } from 'solid-js';
```

(Most of these may already be imported — only add what's missing.)

**Step 2: Add local signals for History + Artifacts sections**

Inside the `DetailsPanel` component (before the `return`):

```typescript
// History section state
const sessionSummary = () =>
  sessionState.activeSessionId
    ? sessionState.sessionSummaries[sessionState.activeSessionId]
    : undefined;

// Artifacts section state
const [artifacts, setArtifacts] = createSignal<Artifact[]>([]);
const [artifactsLoading, setArtifactsLoading] = createSignal(false);
const [artifactSearch, setArtifactSearch] = createSignal('');

async function loadArtifacts() {
  const sid = sessionState.activeSessionId;
  if (!sid) return;
  setArtifactsLoading(true);
  try {
    const result = await invoke<Artifact[]>('extract_session_artifacts', {
      session_id: sid,
    });
    setArtifacts(result);
  } catch (err) {
    console.error('loadArtifacts failed', err);
  } finally {
    setArtifactsLoading(false);
  }
}

const filteredArtifacts = () => {
  const q = artifactSearch().toLowerCase().trim();
  if (!q) return artifacts();
  return artifacts().filter(
    (a) =>
      a.title.toLowerCase().includes(q) ||
      (a.language ?? '').toLowerCase().includes(q) ||
      a.preview.toLowerCase().includes(q),
  );
};
```

**Step 3: Add to sectionOpenState initial value**

Find `setSectionOpenState` initial value and add the two new keys:

```typescript
const [sectionOpenState, setSectionOpenState] = createSignal<Record<string, boolean>>({
  actionOutput: true,
  filePreview: true,
  projectContext: false,
  context: true,
  cost: true,
  history: false,   // new
  artifacts: false, // new
});
```

**Step 4: Add History and Artifacts CollapsibleSections**

Just before the closing `</aside>` tag in the return JSX, add:

```tsx
<CollapsibleSection
  id="history"
  title={<>History</>}
  open={isSectionOpen('history', false)}
  focused={isFocused('history')}
  onHeaderClick={() => {
    handleSectionHeaderClick('history', false);
    if (!sessionSummary() && sessionState.activeSessionId) {
      void loadSessionSummary(sessionState.activeSessionId);
    }
  }}
>
  <Show
    when={sessionSummary()}
    fallback={
      <p class="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
        Loading…
      </p>
    }
  >
    {(summary) => (
      <div class="space-y-1.5">
        {(
          [
            ['Messages', summary().message_count],
            ['Tool calls', summary().tool_count],
            ['Artifacts', summary().artifact_count],
            [
              'Duration',
              summary().duration_secs < 60
                ? `${summary().duration_secs}s`
                : `${Math.floor(summary().duration_secs / 60)}m`,
            ],
          ] as [string, string | number][]
        ).map(([label, value]) => (
          <div
            class="flex items-center justify-between font-mono"
            style={{ 'font-size': '10px', color: 'var(--color-text-tertiary)' }}
          >
            <span>{label}</span>
            <span>{value}</span>
          </div>
        ))}
        <Show when={summary().models_used.length > 0}>
          <div
            class="flex flex-wrap gap-1 pt-1"
            style={{ 'border-top': '1px solid var(--color-border-secondary)' }}
          >
            <For each={summary().models_used}>
              {(model) => (
                <span
                  class="text-[9px] px-1 py-0.5 rounded font-mono"
                  style={{
                    background: 'var(--color-bg-elevated)',
                    color: 'var(--color-text-tertiary)',
                    border: '1px solid var(--color-border-secondary)',
                  }}
                >
                  {model}
                </span>
              )}
            </For>
          </div>
        </Show>
      </div>
    )}
  </Show>
</CollapsibleSection>

<CollapsibleSection
  id="artifacts"
  title={
    <>
      Artifacts
      <Show when={artifacts().length > 0}>
        <span
          class="ml-1 px-1 py-0.5 rounded text-[8px] font-mono"
          style={{
            background: 'rgba(232, 130, 90, 0.12)',
            color: 'var(--color-accent)',
          }}
        >
          {artifacts().length}
        </span>
      </Show>
    </>
  }
  open={isSectionOpen('artifacts', false)}
  focused={isFocused('artifacts')}
  onHeaderClick={() => {
    const wasOpen = isSectionOpen('artifacts', false);
    handleSectionHeaderClick('artifacts', false);
    if (!wasOpen && artifacts().length === 0) {
      void loadArtifacts();
    }
  }}
>
  <Show when={artifactsLoading()}>
    <p class="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
      Extracting…
    </p>
  </Show>
  <Show when={!artifactsLoading()}>
    <Show when={artifacts().length === 0}>
      <p class="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
        No code blocks found in this session yet.
      </p>
    </Show>
    <Show when={artifacts().length > 0}>
      <input
        type="search"
        placeholder="Search artifacts…"
        value={artifactSearch()}
        onInput={(e) => setArtifactSearch(e.currentTarget.value)}
        class="w-full text-xs px-2 py-1 rounded mb-2"
        style={{
          background: 'var(--color-bg-inset)',
          border: '1px solid var(--color-border-secondary)',
          color: 'var(--color-text-primary)',
          outline: 'none',
        }}
      />
      <div class="space-y-1.5">
        <For each={filteredArtifacts()}>
          {(artifact) => (
            <div
              class="rounded px-2 py-1.5 cursor-pointer hover:opacity-80 transition-opacity"
              style={{
                background: 'var(--color-bg-elevated)',
                border: '1px solid var(--color-border-secondary)',
              }}
              title={`${artifact.type} · ${artifact.line_count} lines`}
            >
              <div class="flex items-center gap-1.5 mb-0.5">
                <Show when={artifact.language}>
                  <span
                    class="text-[8px] font-mono px-1 py-0.5 rounded shrink-0"
                    style={{
                      background: 'var(--color-bg-inset)',
                      color: 'var(--color-text-tertiary)',
                    }}
                  >
                    {artifact.language}
                  </span>
                </Show>
                <span
                  class="text-[10px] font-medium truncate"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  {artifact.title}
                </span>
              </div>
              <p
                class="text-[9px] font-mono truncate"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                {artifact.preview}
              </p>
            </div>
          )}
        </For>
        <Show when={filteredArtifacts().length === 0 && artifactSearch()}>
          <p class="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            No matches for "{artifactSearch()}"
          </p>
        </Show>
      </div>
    </Show>
  </Show>
</CollapsibleSection>
```

**Step 5: Lint + type check**

```bash
npx tsc --noEmit && npx eslint src/components/layout/DetailsPanel.tsx
```

Expected: no errors.

**Step 6: Commit**

```bash
git add src/components/layout/DetailsPanel.tsx
git commit -m "CHI-225: DetailsPanel History + Artifacts sections"
```

---

### Task A8: Rust checks + full test pass

**Step 1: Run all Rust checks**

```bash
cd src-tauri && cargo test && cargo clippy -- -D warnings && cargo fmt --check
```

Expected: all pass. Fix any clippy warnings (common ones: unused imports, needless borrows).

**Step 2: Run frontend checks**

```bash
npx tsc --noEmit && npx eslint . && npx prettier --check .
```

Expected: no errors.

**Step 3: Commit if any lint fixes were needed**

```bash
git add -p
git commit -m "CHI-225: lint + clippy fixes"
```

---

## PART B — CHI-189: Response Content Priority Layout

---

### Task B1: StreamingActivitySection Component

**Files:**
- Create: `src/components/conversation/StreamingActivitySection.tsx`

This component wraps the tool_use + tool_result messages that belong to the current streaming turn in a collapsible "Activity" section. During streaming, it sits between the last user message and the thinking/response blocks.

**Step 1: Write the component**

```typescript
// src/components/conversation/StreamingActivitySection.tsx
// Collapsible "Activity" section shown during an active streaming turn.
// Wraps tool_use/tool_result messages so response text remains the dominant element.

import { Component, createSignal, For, Show } from 'solid-js';
import { ChevronDown, ChevronRight, Zap } from 'lucide-solid';
import type { Message } from '@/lib/types';
import ToolUseBlock from '@/components/conversation/ToolUseBlock';
import ToolResultBlock from '@/components/conversation/ToolResultBlock';

interface StreamingActivitySectionProps {
  messages: Message[];
}

export const StreamingActivitySection: Component<StreamingActivitySectionProps> = (props) => {
  const [expanded, setExpanded] = createSignal(true);

  return (
    <Show when={props.messages.length > 0}>
      <div class="flex justify-start mt-3 animate-fade-in">
        <div
          class="max-w-[85%] w-full rounded-md overflow-hidden"
          style={{
            background: 'rgba(22, 27, 34, 0.35)',
            border: '1px solid var(--color-border-secondary)',
          }}
        >
          {/* Header */}
          <button
            class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.02] transition-colors"
            style={{ 'transition-duration': 'var(--duration-fast)' }}
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded()}
            aria-label={`${expanded() ? 'Collapse' : 'Expand'} activity`}
          >
            <Zap
              size={13}
              class="shrink-0"
              style={{ color: 'var(--color-text-tertiary)' }}
            />
            <span
              class="text-xs font-medium"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              Activity
            </span>
            <span
              class="text-[10px] font-mono ml-1"
              style={{ color: 'var(--color-text-tertiary)', opacity: '0.5' }}
            >
              {props.messages.filter((m) => m.role === 'tool_use').length} calls
            </span>
            <span class="flex-1" />
            <Show
              when={expanded()}
              fallback={
                <ChevronRight size={13} style={{ color: 'var(--color-text-tertiary)' }} />
              }
            >
              <ChevronDown size={13} style={{ color: 'var(--color-text-tertiary)' }} />
            </Show>
          </button>

          {/* Tool blocks */}
          <Show when={expanded()}>
            <div
              class="px-3 pb-3 space-y-1 border-t"
              style={{ 'border-color': 'var(--color-border-secondary)' }}
            >
              <For each={props.messages}>
                {(msg) => (
                  <div class="mt-2">
                    <Show when={msg.role === 'tool_use'}>
                      <ToolUseBlock message={msg} />
                    </Show>
                    <Show when={msg.role === 'tool_result'}>
                      <ToolResultBlock message={msg} />
                    </Show>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>
      </div>
    </Show>
  );
};
```

**Step 2: Verify ToolUseBlock and ToolResultBlock imports exist**

```bash
ls src/components/conversation/ToolUseBlock.tsx src/components/conversation/ToolResultBlock.tsx
```

Expected: both exist (they're used in MessageRenderer already).

**Step 3: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep "StreamingActivitySection"
```

Expected: no errors.

**Step 4: Commit**

```bash
git add src/components/conversation/StreamingActivitySection.tsx
git commit -m "CHI-189: StreamingActivitySection component"
```

---

### Task B2: ConversationView Restructuring

**Files:**
- Modify: `src/components/conversation/ConversationView.tsx`

**Step 1: Add the import**

Near the other streaming imports at the top of `ConversationView.tsx`:

```typescript
import { StreamingActivitySection } from '@/components/conversation/StreamingActivitySection';
```

**Step 2: Add derived signals for message splitting**

Inside the `ConversationView` component body, after the existing `messages()` accessor and `hasActiveTurnLayout()` signal, add:

```typescript
// Index of the last user message (start of current turn)
const currentTurnStartIndex = (): number => {
  const msgs = messages();
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === 'user') return i;
  }
  return 0;
};

// Tool messages that belong to the current active turn (after last user message)
const currentTurnToolMessages = () => {
  if (!hasActiveTurnLayout()) return [];
  const msgs = messages();
  const startIdx = currentTurnStartIndex();
  return msgs.slice(startIdx + 1).filter(
    (m) => m.role === 'tool_use' || m.role === 'tool_result',
  );
};

// Messages to show in the main list: all when idle, historical-only during active turn
const displayMessages = () => {
  if (!hasActiveTurnLayout()) return messages();
  const msgs = messages();
  const startIdx = currentTurnStartIndex();
  // Include historical messages up to and including the last user message
  return msgs.slice(0, startIdx + 1);
};
```

**Step 3: Replace messages() with displayMessages() in the message list**

In the message list JSX (both the virtualized and non-virtualized branches), change `messages()` to `displayMessages()`.

In the non-virtualized branch (around line 640):

```tsx
// BEFORE:
<For each={messages()}>

// AFTER:
<For each={displayMessages()}>
```

In the virtualized branch (around line 663), the virtualizer is configured with `messages()`. The virtualizer's item count depends on the message list. During streaming the virtualizer won't be used (it only activates past a threshold), so replace:

```tsx
// BEFORE:
<For each={virtualizer.getVirtualItems()}>
  {(virtualItem) => {
    const msg = () => messages()[virtualItem.index];

// AFTER:
<For each={virtualizer.getVirtualItems()}>
  {(virtualItem) => {
    const msg = () => displayMessages()[virtualItem.index];
```

Also update the `useVirtualization()` condition: it uses `messages().length`. Replace with `displayMessages().length`:

```tsx
// Find: useVirtualization = () => messages().length > VIRTUALIZATION_THRESHOLD
// Replace:
const useVirtualization = () => displayMessages().length > VIRTUALIZATION_THRESHOLD;
```

> If `useVirtualization` is a derived signal or computed value, find its definition (likely around line 250–280) and update it there.

**Step 4: Insert StreamingActivitySection between message list and thinking block**

Find the streaming section (after the message list, around line 677). Add the `StreamingActivitySection` between the message list close tag and the `StreamingThinkingBlock`:

```tsx
{/* ... message list ... */}

{/* Current-turn tool activity — only during active turn */}
<Show when={hasActiveTurnLayout() && currentTurnToolMessages().length > 0}>
  <StreamingActivitySection messages={currentTurnToolMessages()} />
</Show>

{/* Thinking bar — compact, above response text */}
<Show when={conversationState.isStreaming && conversationState.thinkingContent}>
  <div class="mt-3">
    <StreamingThinkingBlock content={conversationState.thinkingContent} />
  </div>
</Show>

{/* Response text — visually dominant element */}
<Show when={conversationState.isStreaming && typewriter.rendered()}>
  {/* existing streaming response JSX, unchanged */}
</Show>
```

**Step 5: Verify reactivity tracking for new derived signals**

Find the `createEffect` that tracks streaming/loading state (around line 369–390 in the original file):

```typescript
// The effect that triggers scroll measurement
createEffect(() => {
  void conversationState.isStreaming;
  void conversationState.thinkingContent;
  // ...
});
```

Add the new signals to the tracking effect:

```typescript
void currentTurnToolMessages().length;
void displayMessages().length;
```

**Step 6: Lint + type check**

```bash
npx tsc --noEmit && npx eslint src/components/conversation/ConversationView.tsx
```

Expected: no errors. Common issue: `solid/reactivity` warning for reading signals in event handlers — add the `eslint-disable-next-line` comment if needed.

**Step 7: Commit**

```bash
git add src/components/conversation/ConversationView.tsx
git commit -m "CHI-189: group current-turn tools in StreamingActivitySection"
```

---

### Task B3: Final Checks + Build

**Step 1: Run full frontend checks**

```bash
npx tsc --noEmit && npx eslint . && npx prettier --check .
```

Fix any issues. Re-run to confirm clean.

**Step 2: Run full Rust checks**

```bash
cd src-tauri && cargo test && cargo clippy -- -D warnings && cargo fmt --check
```

Expected: all pass.

**Step 3: Manual smoke test checklist**

- Start a new session, send a message that uses tools (e.g. read a file)
- Confirm: tool_use/tool_result blocks appear in the **Activity** collapsible, not in the main message list
- Confirm: thinking block appears as a compact bar above the streaming response text
- Confirm: streaming response text is the largest/dominant element
- Confirm: collapsing/expanding Activity doesn't shift the scroll position
- After streaming completes: the full message (tools + response) appears normally in the message list
- Open DetailsPanel → History: shows message count, tool count, duration
- Open DetailsPanel → Artifacts: click opens section, triggers extraction, shows searchable list
- Sidebar: session with many messages shows duration chip

**Step 4: Final commit if any fixes**

```bash
git add -p
git commit -m "CHI-189 + CHI-225: final lint fixes"
```

---

## Dependency Notes

- **v4 already exists** in `migrations.rs` — only v5 needs adding.
- `extract_session_artifacts` IPC runs the extractor then queries — safe to call multiple times.
- `StreamingActivitySection` only renders when `hasActiveTurnLayout() && currentTurnToolMessages().length > 0` — no visual change in idle/completed states.
- `displayMessages()` falls back to `messages()` when not loading/streaming — zero impact on all non-streaming views.
- After `message:complete` fires and `isLoading`/`isStreaming` revert to false, `displayMessages()` returns all messages (including the newly-completed turn's tool blocks) — they appear in the message list as normal.
