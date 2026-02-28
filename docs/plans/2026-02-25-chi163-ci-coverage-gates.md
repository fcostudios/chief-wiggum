# Track E: CI Coverage Gates & Reporting (CHI-163) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire coverage reporting and threshold enforcement into the CI pipeline so coverage can never regress, with automated PR comments showing coverage diffs.

**Architecture:** Three new CI jobs added to `.github/workflows/ci.yml`: `coverage-rust` runs `cargo-tarpaulin` on Ubuntu to produce Rust LCOV, `coverage-frontend` runs `vitest --coverage` to produce frontend LCOV, and `coverage-gate` merges both reports, checks the combined threshold (starting at 60%, ramping to 85%+), and posts a PR coverage summary comment. No external services (Codecov/Coveralls) — all self-contained via GitHub Actions artifacts and the `gh` CLI for PR comments. This keeps the project dependency-free and avoids token management.

**Tech Stack:** cargo-tarpaulin, @vitest/coverage-v8 (already installed), lcov (merge tool), GitHub Actions, gh CLI for PR comments

**Current state:**
- `@vitest/coverage-v8` already in devDependencies
- `vitest.config.ts` already has coverage config (v8 provider, lcov reporter)
- `npm run test:coverage` script already exists
- CI has 4 job groups: frontend (matrix), rust (matrix), build (matrix), e2e
- ~230 Rust tests, ~213 frontend unit tests, ~25 E2E tests
- No coverage measurement in CI today

---

## Task 1: Add Rust Coverage CI Job

**Files:**
- Modify: `.github/workflows/ci.yml`

This task adds a `coverage-rust` job that runs `cargo-tarpaulin` on Ubuntu only (tarpaulin is Linux-only) and uploads an LCOV report as an artifact.

---

### Step 1: Add the coverage-rust job to ci.yml

Add after the `e2e` job block in `.github/workflows/ci.yml`:

```yaml
  # ── Coverage: Rust (cargo-tarpaulin, Ubuntu only) ────────────
  coverage-rust:
    name: Coverage (Rust)
    needs: [rust]
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4

      - name: Install system dependencies
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libssl-dev

      - uses: dtolnay/rust-toolchain@stable

      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: src-tauri

      - name: Install cargo-tarpaulin
        run: cargo install cargo-tarpaulin

      - name: Run Rust coverage
        working-directory: src-tauri
        run: |
          cargo tarpaulin \
            --out lcov \
            --output-dir ../coverage \
            --skip-clean \
            --timeout 120 \
            --exclude-files "src/main.rs" \
            -- --test-threads=1

      - name: Upload Rust LCOV
        uses: actions/upload-artifact@v4
        with:
          name: coverage-rust-lcov
          path: coverage/lcov.info
          retention-days: 7
```

**Key decisions:**
- `--exclude-files "src/main.rs"` — main.rs is the Tauri entry point with `#[cfg(not(test))]` blocks that can't be unit-tested
- `--timeout 120` — prevents hanging on tests with real PTY spawning
- `--test-threads=1` — avoids port/resource conflicts in bridge tests
- `--skip-clean` — reuses the Rust cache from the `rust` job
- Only runs on PRs (`if: github.event_name == 'pull_request'`) to save CI minutes on pushes to main

### Step 2: Verify the YAML is valid

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" 2>&1 || echo "Install: pip3 install pyyaml"`

If Python yaml isn't available, just verify indentation manually — all new content is at 2-space indent under `jobs:`.

### Step 3: Commit

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add Rust coverage job with cargo-tarpaulin (CHI-163)

Adds coverage-rust CI job that:
- Runs cargo-tarpaulin on Ubuntu after Rust tests pass
- Generates LCOV report excluding main.rs entry point
- Uploads lcov.info as artifact for downstream merge
- Only runs on pull requests to save CI minutes"
```

---

## Task 2: Add Frontend Coverage CI Job

**Files:**
- Modify: `.github/workflows/ci.yml`

This task adds a `coverage-frontend` job that runs `npm run test:coverage` and uploads the LCOV output.

---

### Step 1: Add the coverage-frontend job

Add after the `coverage-rust` job in `.github/workflows/ci.yml`:

```yaml
  # ── Coverage: Frontend (vitest --coverage) ───────────────────
  coverage-frontend:
    name: Coverage (Frontend)
    needs: [frontend]
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - run: npm ci

      - name: Run frontend coverage
        run: npm run test:coverage

      - name: Upload Frontend LCOV
        uses: actions/upload-artifact@v4
        with:
          name: coverage-frontend-lcov
          path: coverage/lcov.info
          retention-days: 7
```

**Notes:**
- `npm run test:coverage` already runs `vitest run --coverage`
- `vitest.config.ts` already has `coverage.reporter: ['text', 'html', 'lcov']` and outputs to `coverage/`
- The LCOV file lands at `coverage/lcov.info` by default

### Step 2: Commit

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add frontend coverage job with vitest v8 provider (CHI-163)

Adds coverage-frontend CI job that:
- Runs vitest with @vitest/coverage-v8 provider
- Generates LCOV report to coverage/lcov.info
- Uploads as artifact for downstream merge
- Only runs on pull requests"
```

---

## Task 3: Create Coverage Gate Script

**Files:**
- Create: `scripts/coverage-gate.sh`

This script merges Rust + Frontend LCOV reports, extracts the combined coverage percentage, checks it against a threshold, and generates a Markdown summary for PR comments.

---

### Step 1: Write the coverage gate script

```bash
#!/usr/bin/env bash
# scripts/coverage-gate.sh
# Merges Rust + Frontend LCOV reports, checks threshold, outputs summary.
#
# Usage: ./scripts/coverage-gate.sh <rust-lcov> <frontend-lcov> <threshold>
# Example: ./scripts/coverage-gate.sh coverage-rust/lcov.info coverage-frontend/lcov.info 60
#
# Outputs:
#   - coverage/combined.info (merged LCOV)
#   - coverage/summary.md (Markdown summary for PR comment)
#   - Exit code 0 if above threshold, 1 if below

set -euo pipefail

RUST_LCOV="${1:-coverage-rust/lcov.info}"
FRONTEND_LCOV="${2:-coverage-frontend/lcov.info}"
THRESHOLD="${3:-60}"
OUTPUT_DIR="coverage"

mkdir -p "$OUTPUT_DIR"

# ── Helper: extract coverage % from a single LCOV file ──────
extract_coverage() {
  local lcov_file="$1"
  if [ ! -f "$lcov_file" ]; then
    echo "0.0"
    return
  fi

  local lines_hit=0
  local lines_total=0

  while IFS= read -r line; do
    if [[ "$line" == LF:* ]]; then
      lines_total=$((lines_total + ${line#LF:}))
    elif [[ "$line" == LH:* ]]; then
      lines_hit=$((lines_hit + ${line#LH:}))
    fi
  done < "$lcov_file"

  if [ "$lines_total" -eq 0 ]; then
    echo "0.0"
  else
    # Use awk for floating point
    awk "BEGIN { printf \"%.1f\", ($lines_hit / $lines_total) * 100 }"
  fi
}

# ── Extract individual coverages ─────────────────────────────
RUST_PCT=$(extract_coverage "$RUST_LCOV")
FRONTEND_PCT=$(extract_coverage "$FRONTEND_LCOV")

echo "Rust coverage:     ${RUST_PCT}%"
echo "Frontend coverage: ${FRONTEND_PCT}%"

# ── Merge LCOV files ─────────────────────────────────────────
# Simple concatenation works for LCOV format (no overlapping source files)
COMBINED="$OUTPUT_DIR/combined.info"
cat /dev/null > "$COMBINED"

if [ -f "$RUST_LCOV" ]; then
  cat "$RUST_LCOV" >> "$COMBINED"
fi
if [ -f "$FRONTEND_LCOV" ]; then
  cat "$FRONTEND_LCOV" >> "$COMBINED"
fi

COMBINED_PCT=$(extract_coverage "$COMBINED")
echo "Combined coverage: ${COMBINED_PCT}%"
echo "Threshold:         ${THRESHOLD}%"

# ── Count lines for summary ──────────────────────────────────
rust_lines_hit=0
rust_lines_total=0
if [ -f "$RUST_LCOV" ]; then
  rust_lines_hit=$(grep "^LH:" "$RUST_LCOV" | awk -F: '{s+=$2} END {print s+0}')
  rust_lines_total=$(grep "^LF:" "$RUST_LCOV" | awk -F: '{s+=$2} END {print s+0}')
fi

frontend_lines_hit=0
frontend_lines_total=0
if [ -f "$FRONTEND_LCOV" ]; then
  frontend_lines_hit=$(grep "^LH:" "$FRONTEND_LCOV" | awk -F: '{s+=$2} END {print s+0}')
  frontend_lines_total=$(grep "^LF:" "$FRONTEND_LCOV" | awk -F: '{s+=$2} END {print s+0}')
fi

combined_lines_hit=$((rust_lines_hit + frontend_lines_hit))
combined_lines_total=$((rust_lines_total + frontend_lines_total))

# ── Determine pass/fail ──────────────────────────────────────
PASS=$(awk "BEGIN { print ($COMBINED_PCT >= $THRESHOLD) ? 1 : 0 }")

if [ "$PASS" -eq 1 ]; then
  STATUS_EMOJI="white_check_mark"
  STATUS_TEXT="PASS"
else
  STATUS_EMOJI="x"
  STATUS_TEXT="FAIL"
fi

# ── Generate Markdown summary ────────────────────────────────
cat > "$OUTPUT_DIR/summary.md" << EOF
## :test_tube: Coverage Report

| Layer | Lines Hit | Lines Total | Coverage |
|-------|-----------|-------------|----------|
| **Rust** (cargo-tarpaulin) | ${rust_lines_hit} | ${rust_lines_total} | **${RUST_PCT}%** |
| **Frontend** (vitest v8) | ${frontend_lines_hit} | ${frontend_lines_total} | **${FRONTEND_PCT}%** |
| **Combined** | ${combined_lines_hit} | ${combined_lines_total} | **${COMBINED_PCT}%** |

**Threshold:** ${THRESHOLD}% | **Status:** :${STATUS_EMOJI}: ${STATUS_TEXT}

<details>
<summary>How coverage is measured</summary>

- **Rust:** \`cargo-tarpaulin\` with line coverage (\`--out lcov\`), excluding \`main.rs\`
- **Frontend:** \`vitest\` with \`@vitest/coverage-v8\` provider (line coverage)
- **Combined:** Simple merge of both LCOV reports (no overlapping source files)

</details>
EOF

echo ""
echo "Summary written to $OUTPUT_DIR/summary.md"

# ── Set GitHub Actions outputs if running in CI ──────────────
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "combined_pct=$COMBINED_PCT" >> "$GITHUB_OUTPUT"
  echo "rust_pct=$RUST_PCT" >> "$GITHUB_OUTPUT"
  echo "frontend_pct=$FRONTEND_PCT" >> "$GITHUB_OUTPUT"
  echo "pass=$PASS" >> "$GITHUB_OUTPUT"
fi

# ── Exit with appropriate code ───────────────────────────────
if [ "$PASS" -eq 0 ]; then
  echo ""
  echo "::error::Coverage ${COMBINED_PCT}% is below threshold ${THRESHOLD}%"
  exit 1
fi

echo ""
echo "Coverage gate passed: ${COMBINED_PCT}% >= ${THRESHOLD}%"
```

### Step 2: Make the script executable

Run: `chmod +x scripts/coverage-gate.sh`

### Step 3: Test the script locally (dry run)

Run: `./scripts/coverage-gate.sh /dev/null /dev/null 0`
Expected: Should output `Combined coverage: 0.0%` and pass (threshold 0).

### Step 4: Commit

```bash
git add scripts/coverage-gate.sh
git commit -m "ci: add coverage gate script for LCOV merge and threshold check (CHI-163)

Self-contained bash script that:
- Merges Rust + Frontend LCOV reports
- Extracts line coverage percentages from LCOV format
- Checks combined coverage against configurable threshold
- Generates Markdown summary table for PR comments
- Sets GitHub Actions outputs for downstream steps
- Exits non-zero if below threshold"
```

---

## Task 4: Add Coverage Gate CI Job with PR Comment

**Files:**
- Modify: `.github/workflows/ci.yml`

This task adds the `coverage-gate` job that downloads both LCOV artifacts, runs the gate script, and posts a PR comment.

---

### Step 1: Add the coverage-gate job

Add after `coverage-frontend` in `.github/workflows/ci.yml`:

```yaml
  # ── Coverage gate: merge, threshold, PR comment ─────────────
  coverage-gate:
    name: Coverage Gate
    needs: [coverage-rust, coverage-frontend]
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4

      - name: Download Rust LCOV
        uses: actions/download-artifact@v4
        with:
          name: coverage-rust-lcov
          path: coverage-rust

      - name: Download Frontend LCOV
        uses: actions/download-artifact@v4
        with:
          name: coverage-frontend-lcov
          path: coverage-frontend

      - name: Run coverage gate
        id: gate
        run: |
          chmod +x scripts/coverage-gate.sh
          ./scripts/coverage-gate.sh \
            coverage-rust/lcov.info \
            coverage-frontend/lcov.info \
            60
        continue-on-error: true

      - name: Post PR coverage comment
        if: always()
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          PR_NUMBER=${{ github.event.pull_request.number }}
          COMMENT_MARKER="<!-- coverage-report -->"

          # Read the generated summary
          BODY="${COMMENT_MARKER}
          $(cat coverage/summary.md)"

          # Delete previous coverage comment if exists
          EXISTING=$(gh api \
            "repos/${{ github.repository }}/issues/${PR_NUMBER}/comments" \
            --jq ".[] | select(.body | startswith(\"${COMMENT_MARKER}\")) | .id" \
            2>/dev/null || true)

          if [ -n "$EXISTING" ]; then
            for id in $EXISTING; do
              gh api -X DELETE \
                "repos/${{ github.repository }}/issues/comments/${id}" \
                2>/dev/null || true
            done
          fi

          # Post new comment
          gh pr comment "$PR_NUMBER" --body "$BODY"

      - name: Upload combined coverage
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: coverage-combined
          path: |
            coverage/combined.info
            coverage/summary.md
          retention-days: 14

      - name: Fail if below threshold
        if: steps.gate.outcome == 'failure'
        run: |
          echo "::error::Coverage below threshold. See PR comment for details."
          exit 1
```

**Key decisions:**
- **Threshold: 60%** to start — the project has ~230 Rust tests and ~213 frontend unit tests but large portions of UI code are untested. Starting at 60% avoids blocking PRs immediately, then ramp to 85%+ as Track C/D tests land.
- **PR comment with marker** — uses `<!-- coverage-report -->` HTML comment as a marker to find and replace previous coverage comments (avoids comment spam).
- **`continue-on-error: true`** on the gate step ensures the PR comment is always posted, even when coverage fails.
- **`permissions: pull-requests: write`** is required for `gh pr comment`.

### Step 2: Verify final CI structure

The complete job dependency graph should be:

```
frontend (matrix: typecheck, lint, format, test)
  ├── e2e
  └── coverage-frontend ─┐
                          ├── coverage-gate
rust (matrix: test, fmt, clippy)
  ├── coverage-rust ──────┘
  └── build (needs frontend + rust)
```

### Step 3: Commit

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add coverage gate job with PR comment and threshold enforcement (CHI-163)

Adds coverage-gate CI job that:
- Downloads Rust + Frontend LCOV artifacts
- Runs coverage-gate.sh to merge and check threshold (60%)
- Posts/updates a Markdown coverage summary as a PR comment
- Uploads combined LCOV as artifact (14-day retention)
- Fails the job if combined coverage drops below threshold

Uses HTML comment marker to replace previous coverage comments."
```

---

## Task 5: Add Coverage npm Script and .gitignore Entry

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`

---

### Step 1: Add coverage output to .gitignore

Check if `coverage/` is already in `.gitignore`. If not, add it:

```
# Coverage reports
coverage/
```

### Step 2: Verify test:coverage script works locally

Run: `npm run test:coverage`
Expected: Vitest runs all unit tests with coverage, outputs text summary to terminal and generates `coverage/lcov.info`.

### Step 3: Verify lcov.info was generated

Run: `ls -la coverage/lcov.info`
Expected: File exists with non-zero size.

### Step 4: Commit

```bash
git add .gitignore
git commit -m "chore: add coverage/ to .gitignore (CHI-163)"
```

---

## Task 6: Add Threshold Ramp Documentation

**Files:**
- Modify: `docs/TESTING-MATRIX.md` (add coverage targets section)

---

### Step 1: Add coverage targets section to TESTING-MATRIX.md

Add at the top of the file, after the Legend section:

```markdown
## Coverage Targets & Thresholds

CI enforces a minimum combined (Rust + Frontend) line coverage threshold.
The threshold ramps up as test tracks are completed:

| Date | Threshold | Rationale |
|------|-----------|-----------|
| 2026-02-25 (initial) | **60%** | Baseline after Track A/B (CHI-147–152) |
| After Track C (CHI-153–157) | **70%** | Frontend store + component + utility tests |
| After Track D (CHI-158–162) | **75%** | E2E tests don't directly increase line coverage but validate integration |
| After Track E (CHI-163) + gaps filled | **85%** | Target steady-state coverage gate |
| Stretch goal | **90%** | Once all gaps in TESTING-MATRIX are filled |

**How to update the threshold:** Edit the `60` argument in `.github/workflows/ci.yml` → `coverage-gate` job → `Run coverage gate` step.

**Security-critical modules** (`bridge/permission.rs`, `commands/bridge.rs` permission handlers) target **95%** line coverage individually, tracked in the matrix below.
```

### Step 2: Commit

```bash
git add docs/TESTING-MATRIX.md
git commit -m "docs: add coverage threshold ramp targets to TESTING-MATRIX (CHI-163)

Documents the coverage gate threshold ramp from 60% (baseline)
to 85%+ (steady-state), with rationale for each step."
```

---

## Task 7: Local Coverage Verification & Final Polish

**Files:**
- Verify: All CI changes are syntactically valid
- Verify: Local coverage runs successfully

---

### Step 1: Run frontend coverage locally

Run: `npm run test:coverage`
Expected: All tests pass, coverage summary printed to terminal. Note the line coverage percentage.

### Step 2: Run Rust tests locally (coverage requires Linux)

Run: `cd src-tauri && cargo test`
Expected: All ~230 tests pass. (cargo-tarpaulin can only run on Linux, so local coverage measurement is skip on macOS.)

### Step 3: Validate CI YAML syntax

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml')); print('YAML valid')" 2>&1 || echo "Skipping YAML validation (no pyyaml)"`

### Step 4: Verify script is executable

Run: `ls -la scripts/coverage-gate.sh`
Expected: `-rwxr-xr-x` permissions.

### Step 5: Dry-run the gate script with real frontend LCOV

Run: `./scripts/coverage-gate.sh /dev/null coverage/lcov.info 0`
Expected: Should show `Rust coverage: 0.0%`, real frontend coverage %, and pass (threshold 0).

### Step 6: Final commit

```bash
git add -A
git commit -m "ci: Track E complete — CI coverage gates and PR reporting (CHI-163)

Summary:
- coverage-rust job: cargo-tarpaulin LCOV generation (Ubuntu, PR-only)
- coverage-frontend job: vitest v8 LCOV generation (PR-only)
- coverage-gate job: merge reports, enforce 60% threshold, post PR comment
- scripts/coverage-gate.sh: self-contained LCOV merge + threshold checker
- Markdown PR comment with per-layer breakdown table
- coverage/ added to .gitignore
- Threshold ramp documented in TESTING-MATRIX.md

No external services (Codecov/Coveralls) — fully self-contained."
```

---

## Summary

| Task | What | Files | Key Action |
|------|------|-------|------------|
| 1 | Rust coverage CI job | `ci.yml` | `cargo-tarpaulin --out lcov` → artifact |
| 2 | Frontend coverage CI job | `ci.yml` | `npm run test:coverage` → artifact |
| 3 | Coverage gate script | `scripts/coverage-gate.sh` | LCOV merge + threshold + summary.md |
| 4 | Coverage gate CI job + PR comment | `ci.yml` | Download artifacts, run gate, `gh pr comment` |
| 5 | .gitignore + local verification | `.gitignore` | Add `coverage/` |
| 6 | Threshold ramp docs | `TESTING-MATRIX.md` | Document 60% → 85% ramp plan |
| 7 | Local verification | — | End-to-end dry run |

## Architecture Notes for Implementer

### Why No Codecov/Coveralls?
- Zero external service dependencies = no API tokens to manage
- PR comment via `gh` CLI is simple and self-contained
- Combined LCOV artifact allows anyone to analyze coverage locally
- Can always add Codecov later by uploading the `coverage-combined` artifact

### LCOV Format Basics
The gate script parses LCOV's simple text format:
- `SF:path/to/file.rs` — source file
- `LF:42` — total lines in this file
- `LH:35` — lines hit (covered) in this file
- `end_of_record` — separator between files

Combined coverage = sum(all LH) / sum(all LF) * 100.

### Threshold Strategy
Starting at 60% because:
- UI components (`src/components/`) are largely untested by line coverage (E2E tests don't instrument source)
- Stores have good coverage from Track C (CHI-153–157)
- Rust backend has excellent coverage in tested modules but many modules still at 0%
- The gate prevents regression — coverage can only go up from here

### cargo-tarpaulin Caveats
- **Linux-only** — no macOS/Windows support. CI runs on `ubuntu-latest`.
- **Slow** — instruments at compile time. Expect 3-5 minutes for ~230 tests.
- **PTY tests may flake** — `--timeout 120` and `--test-threads=1` mitigate this.
- **`--skip-clean`** — reuses the compiled artifacts from the `rust` job cache.
- Alternative: `cargo-llvm-cov` is faster but requires nightly Rust. Tarpaulin works on stable.
