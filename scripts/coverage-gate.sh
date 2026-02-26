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

# Helper: sum an LCOV numeric field (LF/LH) across all records.
sum_lcov_field() {
  local lcov_file="$1"
  local field="$2"

  if [ ! -f "$lcov_file" ]; then
    echo "0"
    return
  fi

  awk -F: -v prefix="${field}:" '
    index($0, prefix) == 1 { sum += $2 }
    END { print sum + 0 }
  ' "$lcov_file"
}

# Helper: extract line coverage % from an LCOV file.
extract_coverage() {
  local lcov_file="$1"

  if [ ! -f "$lcov_file" ]; then
    echo "0.0"
    return
  fi

  local lines_hit
  local lines_total
  lines_hit="$(sum_lcov_field "$lcov_file" "LH")"
  lines_total="$(sum_lcov_field "$lcov_file" "LF")"

  if [ "$lines_total" -eq 0 ]; then
    echo "0.0"
  else
    awk "BEGIN { printf \"%.1f\", ($lines_hit / $lines_total) * 100 }"
  fi
}

# Extract individual coverages
RUST_PCT="$(extract_coverage "$RUST_LCOV")"
FRONTEND_PCT="$(extract_coverage "$FRONTEND_LCOV")"

echo "Rust coverage:     ${RUST_PCT}%"
echo "Frontend coverage: ${FRONTEND_PCT}%"

# Merge LCOV files
# Simple concatenation works for LCOV format (no overlapping source files).
COMBINED="$OUTPUT_DIR/combined.info"
: > "$COMBINED"

if [ -f "$RUST_LCOV" ]; then
  cat "$RUST_LCOV" >> "$COMBINED"
fi
if [ -f "$FRONTEND_LCOV" ]; then
  cat "$FRONTEND_LCOV" >> "$COMBINED"
fi

COMBINED_PCT="$(extract_coverage "$COMBINED")"
echo "Combined coverage: ${COMBINED_PCT}%"
echo "Threshold:         ${THRESHOLD}%"

# Count lines for summary
rust_lines_hit="$(sum_lcov_field "$RUST_LCOV" "LH")"
rust_lines_total="$(sum_lcov_field "$RUST_LCOV" "LF")"
frontend_lines_hit="$(sum_lcov_field "$FRONTEND_LCOV" "LH")"
frontend_lines_total="$(sum_lcov_field "$FRONTEND_LCOV" "LF")"

combined_lines_hit=$((rust_lines_hit + frontend_lines_hit))
combined_lines_total=$((rust_lines_total + frontend_lines_total))

# Determine pass/fail
PASS="$(awk "BEGIN { print ($COMBINED_PCT >= $THRESHOLD) ? 1 : 0 }")"

if [ "$PASS" -eq 1 ]; then
  STATUS_EMOJI="white_check_mark"
  STATUS_TEXT="PASS"
else
  STATUS_EMOJI="x"
  STATUS_TEXT="FAIL"
fi

# Generate Markdown summary
cat > "$OUTPUT_DIR/summary.md" <<EOF
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

# Set GitHub Actions outputs if running in CI
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "combined_pct=$COMBINED_PCT" >> "$GITHUB_OUTPUT"
  echo "rust_pct=$RUST_PCT" >> "$GITHUB_OUTPUT"
  echo "frontend_pct=$FRONTEND_PCT" >> "$GITHUB_OUTPUT"
  echo "pass=$PASS" >> "$GITHUB_OUTPUT"
fi

# Exit with appropriate code
if [ "$PASS" -eq 0 ]; then
  echo ""
  echo "::error::Coverage ${COMBINED_PCT}% is below threshold ${THRESHOLD}%"
  exit 1
fi

echo ""
echo "Coverage gate passed: ${COMBINED_PCT}% >= ${THRESHOLD}%"
