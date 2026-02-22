# SPEC-005: Data Export and Migration

**Version:** 1.0
**Date:** 2026-02-20
**Status:** Draft
**Parent:** SPEC-001 (Section 9), SPEC-004 (Section 8)
**Audience:** Backend developers, coding agents implementing data portability

---

## 1. Purpose

Chief Wiggum stores all session data, cost history, and configuration in a local SQLite database. This spec defines the data portability layer: export, import, backup, restore, and schema migration. Users must have confidence that their data is never locked in.

---

## 2. Requirements

1. Users can export their full data or subsets to open formats (JSON, CSV, SQLite dump).
2. Users can import data from a previous Chief Wiggum installation.
3. Schema upgrades happen automatically and non-destructively on app startup.
4. A backup is taken before any destructive schema migration.
5. Users can access raw SQLite directly for custom queries (power user escape hatch).

---

## 3. Export Formats

### 3.1 JSON Export (Primary)

The default export format. Produces a single `.chiefwiggum-export.json` file.

```json
{
  "export_version": 1,
  "app_version": "0.1.0",
  "schema_version": 2,
  "exported_at": "2026-02-20T15:30:00Z",
  "data": {
    "projects": [ ... ],
    "sessions": [ ... ],
    "messages": [ ... ],
    "agents": [ ... ],
    "cost_events": [ ... ],
    "budgets": [ ... ],
    "mcp_servers": [ ... ],
    "automations": [ ... ],
    "automation_runs": [ ... ]
  },
  "settings": { ... }
}
```

**Export options:**
- Full export (all data)
- By project (all sessions/agents/costs for one project)
- By date range (all data within a time window)
- Sessions only (messages + metadata, no cost events)

### 3.2 CSV Export (Analytics)

Produces a ZIP of CSV files, one per table. Useful for importing into spreadsheets or data tools.

```
chief-wiggum-export-2026-02-20/
├── projects.csv
├── sessions.csv
├── messages.csv
├── agents.csv
├── cost_events.csv
├── budgets.csv
└── automations.csv
```

### 3.3 SQLite Dump (Raw)

Exports the raw `.sqlite` database file. This is the most complete export — includes indexes, schema, and all data. Users can open it with any SQLite client.

**Location of live database:** `~/.chiefwiggum/db/chiefwiggum.sqlite`

The export copies this file (using SQLite's backup API, not filesystem copy, to ensure consistency).

---

## 4. Import/Restore

### 4.1 JSON Import

```
User selects .chiefwiggum-export.json file
  → App validates export_version and schema_version
  → If schema_version > current: "Please update Chief Wiggum first"
  → If schema_version < current: applies forward migrations to data in memory
  → Conflict resolution dialog:
    → "Merge" (add imported data alongside existing, skip duplicates by ID)
    → "Replace" (clear target tables, insert imported data)
    → "New project" (import as a new project, generate new IDs)
  → Preview: shows count of records to import per table
  → User confirms
  → Data inserted in a single transaction (atomic — all or nothing)
  → Success/failure toast
```

### 4.2 SQLite Restore

```
User selects .sqlite file
  → App validates it's a valid Chief Wiggum database (checks schema_version table)
  → Warning: "This will replace ALL current data. A backup will be created first."
  → Auto-backup of current database
  → Replace database file
  → Run forward migrations if needed
  → Restart app
```

---

## 5. Backup System

### 5.1 Automatic Backups

- **Pre-migration backup**: Before any schema migration runs, copy the database file to `~/.chiefwiggum/db/backups/chiefwiggum-v{N}-{timestamp}.sqlite`
- **Daily backup**: If the app is running, create a backup at midnight local time
- **Retention**: Keep the last 7 daily backups + all pre-migration backups

### 5.2 Manual Backup

Via settings UI or command palette: "Export Backup" → saves to user-selected location.

### 5.3 Backup Storage

```
~/.chiefwiggum/db/
├── chiefwiggum.sqlite              # Live database
└── backups/
    ├── chiefwiggum-v1-20260218.sqlite
    ├── chiefwiggum-v2-20260219.sqlite  # Pre-migration backup
    └── chiefwiggum-daily-20260220.sqlite
```

---

## 6. Schema Migration Strategy

### 6.1 Principles

- **Forward-only**: Migrations only go up, never down.
- **Non-destructive**: Adding columns, tables, indexes is safe. Dropping requires two-phase deprecation.
- **Tested**: Every migration has a test that applies it to the previous schema version.
- **Backup-first**: Always backup before running migrations.

### 6.2 Migration Execution

On app startup:
1. Read `schema_version` table to get current version.
2. Compare against `MIGRATIONS` list in code.
3. If behind: backup database, then apply pending migrations in a transaction.
4. If ahead (downgrade scenario): refuse to start, show error directing user to update the app.

### 6.3 Applied Migrations

| Version | Description | Type | Date |
|---------|-------------|------|------|
| 1 | Initial schema — projects, sessions, messages, agents, cost_events, budgets | Create tables + indexes | 2026-02-20 |
| 2 | Add `cli_session_id TEXT` to sessions table for reliable `--resume` | ALTER TABLE ADD COLUMN | 2026-02-22 |

### 6.4 Two-Phase Destructive Changes

**Phase 1 (version N):** Mark column/table as deprecated. Stop writing to it. New code reads from the replacement.

**Phase 2 (version N+2):** Drop the deprecated column/table. By now, two versions have passed, ensuring users who skip one version still have a safe migration path.

---

## 7. IPC Commands

```typescript
// Export
export const exportData = (options: ExportOptions) =>
  invoke<string>('export_data', { options }); // Returns file path

interface ExportOptions {
  format: 'json' | 'csv' | 'sqlite';
  scope: 'all' | 'project' | 'date_range' | 'sessions_only';
  project_id?: string;
  date_from?: string;  // ISO 8601
  date_to?: string;
  output_path: string;
}

// Import
export const importData = (path: string, strategy: 'merge' | 'replace' | 'new_project') =>
  invoke<ImportResult>('import_data', { path, strategy });

interface ImportResult {
  success: boolean;
  records_imported: Record<string, number>;
  records_skipped: number;
  errors: string[];
}

// Backup
export const createBackup = (path?: string) =>
  invoke<string>('create_backup', { path }); // Returns backup path

export const restoreBackup = (path: string) =>
  invoke<void>('restore_backup', { path }); // Triggers app restart

export const listBackups = () =>
  invoke<Backup[]>('list_backups');

interface Backup {
  path: string;
  size_bytes: number;
  schema_version: number;
  created_at: string;
  type: 'daily' | 'pre_migration' | 'manual';
}
```

---

## 8. Settings UI Integration

In Settings → General section, add a "Data" subsection:

- **Export Data**: dropdown (JSON/CSV/SQLite) + scope selector + "Export" button → file save dialog
- **Import Data**: "Import" button → file open dialog → conflict resolution dialog → preview → confirm
- **Backups**: list of recent backups with "Restore" button each + "Create Backup Now" button
- **Database Location**: read-only display of `~/.chiefwiggum/db/chiefwiggum.sqlite` with "Open in file manager" link

---

## 9. Implementation Phase

Data export/import is scheduled for **Phase 2** (Weeks 5–8). The schema migration system is part of **Phase 1** (required for any database usage).

| Deliverable | Phase |
|---|---|
| Schema migration system | Phase 1 |
| Automatic pre-migration backups | Phase 1 |
| Daily automatic backups | Phase 2 |
| JSON export (full + scoped) | Phase 2 |
| JSON import with conflict resolution | Phase 2 |
| CSV export | Phase 2 |
| SQLite dump export | Phase 2 |
| SQLite restore | Phase 2 |
| Settings UI integration | Phase 2 |
