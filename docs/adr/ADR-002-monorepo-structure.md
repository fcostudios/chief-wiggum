# ADR-002: Monorepo Structure (Frontend + Backend in Single Repository)

**Status:** Accepted
**Date:** 2026-02-20
**Deciders:** Francisco Colomas
**Context:** Determining whether frontend (SolidJS) and backend (Rust/Tauri) should be separate repositories or a single monorepo.

---

## Decision

Chief Wiggum uses a **single monorepo** containing both the Rust/Tauri backend (`src-tauri/`) and the SolidJS frontend (`src/`). This follows the standard Tauri v2 project layout.

## Considered Alternatives

1. **Monorepo (chosen)** — Single repository, `src-tauri/` and `src/` side by side.
2. **Two repositories** — Separate `chief-wiggum-backend` and `chief-wiggum-frontend` repos.
3. **Monorepo with workspaces** — Single repo using npm/pnpm workspaces for multiple frontend packages.

## Rationale

- **Tightly coupled IPC contract.** Every `#[tauri::command]` in Rust has a corresponding TypeScript call in the frontend. These are co-dependent — changing one requires changing the other. Separate repos would require a shared types package, versioning overhead, and coordination that adds friction without benefit.
- **Atomic commits.** A feature like "add effort slider" touches Rust (command handler + cost logic), SolidJS (component + store), and possibly SQLite (schema). These should land in one commit and one PR.
- **Agent-friendly.** A coding agent given a single repo can read both the Rust command signature and the calling component in one context window. Cross-repo navigation is a massive context tax for AI agents.
- **Industry standard.** Tauri's official recommendation is monorepo. The OpenAI Codex CLI (Rust + web frontend) also uses a monorepo.
- **Simpler CI/CD.** One pipeline builds, tests, and packages everything. No need to orchestrate cross-repo builds.

## Consequences

- Must use both `cargo` and `npm/pnpm` toolchains in the same repo.
- Git history contains both Rust and TypeScript changes (acceptable — the project is one product).
- If a separate sync server is ever added (for team features), it would be a new repo.

## Decision Log Update

| # | Decision | Date | Status |
|---|---|---|---|
| 2.1–2.9 | See ADR-001 | 2026-02-20 | Accepted |
| 2.10 | Monorepo structure | 2026-02-20 | Accepted |
