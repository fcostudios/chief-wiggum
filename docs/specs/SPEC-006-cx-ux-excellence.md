# SPEC-006: CX/UX Excellence Specification

**Version:** 1.0
**Date:** 2026-03-02
**Status:** Draft — Phase 3 UX Overhaul
**Parent:** SPEC-002 (Design System), SPEC-003 (UX Design), CX/UX Expert Evaluation Report (2026-03-02)
**Audience:** Frontend developers, coding agents, UX reviewers, designers

---

## 1. Purpose

This document defines the CX/UX excellence standards that Chief Wiggum must achieve. It translates the findings from the March 2026 CX/UX Expert Evaluation into actionable design specifications, updated design tokens, new component specs, and behavioral requirements.

**Relationship to existing specs:**
- **SPEC-002** defines the design system tokens → this spec **amends** SPEC-002 with updated tokens and new tokens
- **SPEC-003** defines screen behaviors → this spec **extends** SPEC-003 with new interaction patterns
- **CX/UX Report** identifies problems → this spec **prescribes solutions**

**Rule:** All UI changes in Phase 3 CX/UX work must reference this spec. No component may deviate from these standards without an amendment to this document.

---

## 2. Design Principles (Updated)

These five principles supersede SPEC-002 §2 for all new development. Existing principles (density, keyboard-first, etc.) remain valid but are now subordinate to these:

### P1: Conversation is King
The conversation area is the primary stage. All other UI zones (sidebar, details, status bar) are supporting cast. Visual hierarchy must always draw the eye to the active conversation first.

**Implementation rules:**
- The conversation zone must have the highest visual contrast (lightest content area)
- Peripheral zones must be visually subordinate (darker, lower contrast)
- No peripheral element may use `--color-text-primary` for regular content (reserved for conversation)
- During active streaming, all non-essential UI chrome should visually recede

### P2: Calm Over Clever
Reduce visual noise aggressively. Every border, badge, animation, and indicator must justify its existence. When in doubt, remove it.

**Implementation rules:**
- Borders: Maximum 60% of zone boundaries may use visible borders; the rest use spacing
- Grain overlay: Removed entirely (see §3.1)
- Badges: Maximum 3 visible badges in any single viewport region
- Animations: Only state-change animations; no ambient loops except critical-zone pulse
- Empty space is not wasted space — it is a design element

### P3: Data at a Glance
Cost, tokens, status, and progress must be readable in <1 second without eye movement from the primary focus area. No squinting, no hunting.

**Implementation rules:**
- All numerical data (cost, tokens) uses minimum `--text-sm` (13px) with `--color-text-primary`
- Cost must be visible in the status bar at all times (not only in details panel)
- Progress indicators must be within the conversation zone during active responses
- Token counts use `--font-mono` with tabular numerals for alignment

### P4: Discover by Doing
Features should be discoverable through natural exploration, not documentation. If a feature needs a manual, it needs a better trigger.

**Implementation rules:**
- All keyboard shortcuts must have a visible trigger (icon, label, or tooltip) within 2 interactions
- Command palette (Cmd+K) hint must appear within 60 seconds for new users
- Right-click context menus must be discoverable via visible "..." overflow menus
- New features must include a contextual tooltip on first encounter

### P5: Reward the Workflow
Small celebrations for completed tasks, clear visual feedback for every action, and metrics that make users feel productive.

**Implementation rules:**
- Every user action must produce visible feedback within 100ms
- Successful operations display a brief success state (checkmark, glow, or color transition)
- Session completion shows a summary card with metrics
- Error states include actionable next-steps, not just error messages

---

## 3. Design System Amendments (SPEC-002 Updates)

### 3.1 Removed Tokens

| Token | Reason |
|-------|--------|
| Grain overlay (`.grain-overlay`) | Adds visual noise without purpose on modern displays. Modern dev tools don't use it. Remove class and all references. |

### 3.2 New Color Tokens — Zone Separation

To create visual separation between the three-column layout (per P1), introduce zone-specific background tokens:

| Token | Hex | RGB | Usage |
|-------|-----|-----|-------|
| `--color-bg-sidebar` | `#0F1519` | `15, 21, 25` | Sidebar background — slightly darker than primary |
| `--color-bg-content` | `#0D1117` | `13, 17, 23` | Main content area — existing primary (the "stage") |
| `--color-bg-details` | `#111820` | `17, 24, 32` | Details panel — slightly different hue than sidebar |

**Implementation:** Replace `--color-bg-secondary` on sidebar root and details panel root with these zone-specific tokens. Inner cards/sections within zones continue to use `--color-bg-secondary`.

### 3.3 Amended Color Tokens — Contrast Fixes

Per WCAG 2.2 audit, these tokens must be updated:

| Token | Old Value | New Value | Reason |
|-------|-----------|-----------|--------|
| `--color-text-secondary` | `#8B949E` (4.06:1) | `#9DA5AE` (5.0:1) | WCAG AA compliance on dark backgrounds |
| `--color-text-tertiary` | `#6E7681` (3.2:1) | `#7D8590` (3.8:1) | Improved readability for tab labels, placeholders |

### 3.4 New Tokens — Progress & Feedback

| Token | Value | Usage |
|-------|-------|-------|
| `--color-progress-track` | `rgba(232, 130, 90, 0.12)` | Response progress bar track |
| `--color-progress-fill` | `#E8825A` | Response progress bar fill (accent) |
| `--duration-micro` | `60ms` | Micro-feedback (button press, checkbox) |
| `--duration-celebration` | `400ms` | Success animations (checkmark, confetti) |
| `--ease-celebration` | `cubic-bezier(0.22, 1.0, 0.36, 1.0)` | Overshoot for success states |

### 3.5 New Tokens — Active Tab

| Token | Value | Usage |
|-------|-------|-------|
| `--color-tab-active-bg` | `rgba(232, 130, 90, 0.12)` | Active tab pill background |
| `--color-tab-active-text` | `#E8825A` | Active tab text |
| `--color-tab-inactive-text` | `#7D8590` | Inactive tab text (updated tertiary) |

### 3.6 Amended Typography — Data Readability

| Context | Old | New | Reason |
|---------|-----|-----|--------|
| Token counts (status bar) | `--text-xs` (11px) | `--text-sm` (12px) + `--color-text-primary` | Mission-critical data readability |
| Cost values (all locations) | `--text-xs` or `--text-sm` + secondary | `--text-sm` + `--color-text-primary` + `--font-mono` | Instant scanability |
| Code block line-height | 1.4 (20px on 14px) | 1.6 (22px on 14px) | Readability in long tool output |

---

## 4. Component Specifications (New & Amended)

### 4.1 View Tabs (Amended)

**Current:** Thin 2px accent underline on active tab, text in secondary/tertiary color.

**New:** Filled pill indicator for active tab.

```
Active tab:
┌──────────────┐
│ ● Conversation│  ← accent text + accent bg at 12% + rounded-full
└──────────────┘

Inactive tab:
  Agents          ← tertiary text, no background, hover: elevated bg
```

**Spec:**
- Active: `background: var(--color-tab-active-bg)`, `color: var(--color-tab-active-text)`, `border-radius: var(--radius-full)`, `padding: 4px 12px`
- Inactive: `color: var(--color-tab-inactive-text)`, `background: transparent`
- Hover (inactive): `background: var(--color-bg-elevated)`, `color: var(--color-text-secondary)`
- Transition: `var(--duration-fast)` on background and color
- Badge (unread count): positioned top-right of tab pill, uses existing badge spec

### 4.2 Response Progress Indicator (New)

A thin progress line at the top of the conversation area during active responses.

**Spec:**
```
Position: absolute top of ConversationView, full width, 2px height
Track: var(--color-progress-track)
Fill: var(--color-progress-fill)
Animation: indeterminate shimmer (left-to-right, 1.5s loop)
Visibility: only during isStreaming || isThinking state
```

**Companion: Elapsed timer**
- Position: right-aligned below view tabs, inline with conversation area
- Format: `"12s"` or `"1m 23s"` in `--text-xs`, `--font-mono`, `--color-text-secondary`
- Appears only during active response

### 4.3 Message Type Visual Differentiation (New)

Currently all messages look similar. Add visual markers per message type:

**User messages:**
- Left accent border: 3px, `var(--color-accent)` at 40% opacity
- Background: `var(--color-bg-primary)` (transparent — no card)
- No model badge

**Assistant messages:**
- Left accent border: 3px, model color (opus/sonnet/haiku)
- Background: `var(--color-bg-secondary)`
- Model badge visible in header

**Tool use blocks (within assistant):**
- Background: `var(--color-bg-inset)` (deeper — code context)
- Left stripe: tool-type color (existing)
- Collapsed by default after response completes

**Thinking blocks:**
- Background: transparent
- Left border: 2px dashed, `var(--color-border-secondary)`
- Text: italic, `--color-text-secondary`
- Collapsed by default

**System messages:**
- Background: `var(--color-bg-elevated)` at 50%
- Full width (no max-width constraint)
- Centered text, `--text-sm`

### 4.4 Smart Details Panel (Amended)

**Current:** All accordion sections expanded, always showing.

**New behavior:**
- **Default state:** ALL sections collapsed, showing only section headers
- **Auto-expand logic:**
  - During `@`-mention or file attachment → expand Context section
  - During active response → expand Context Meter (shows token usage growing)
  - After response completes → expand Cost section (show what it cost)
  - When user clicks file in sidebar → expand File Preview section
  - When artifacts detected → expand Artifacts section
- **Manual override:** User can pin any section open (click lock icon on section header)
- **Remember preference:** Store pinned sections in settings per project

**Section header spec:**
```
┌──────────────────────────────────┐
│  ▶ Context Meter        🔒  │  ← chevron + title + optional pin icon
└──────────────────────────────────┘
```

### 4.5 Cost Display — Status Bar (Amended)

**Current:** Small cost pill in right zone of status bar.

**New: Promoted cost chip**

```
Status bar right zone:
[🪙 $2.47 ▾]  [494.9K tokens]

Where:
- 🪙 is a coin icon (Lucide: Coins or DollarSign)
- $2.47 is session cost in --text-sm, --font-mono, --color-text-primary
- ▾ indicates expandable popover
- Tokens chip next to it uses --text-sm, --font-mono
```

**Expanded cost popover (amended):**
- Add per-model breakdown with color bars
- Add input vs output token split
- Add "This message: $0.12" for last completed message
- Add cost trend sparkline (last 10 messages)
- Add daily/weekly spend totals

### 4.6 Input Area (Amended)

**Current:** Functional but plain.

**New enhancements:**

**Send button upgrade:**
- Size: 36px height (up from 32px)
- Background: `var(--color-accent)` (always, not ghost)
- Icon: Send arrow, white, 16px
- Hover: `var(--color-accent-hover)` + subtle glow
- Disabled: 50% opacity when input empty
- Loading (during send): spinning loader, 150ms delay before showing

**Newline hint (new users):**
- Show "↵ Send · ⇧↵ New line" hint below textarea for first 5 sessions
- Dismissible, stored in settings
- `--text-xs`, `--color-text-tertiary`

**Draft auto-save:**
- Save input content to localStorage every 2 seconds
- Restore on session load if draft exists
- Show "Draft restored" toast when restoring
- Clear draft on successful send

**Character counter:**
- Show character count when input > 500 chars
- Format: "1,247" in `--text-xs`, `--font-mono`, `--color-text-tertiary`
- Position: bottom-right of textarea, inside

### 4.7 Empty State (Amended)

**Current:** Three hardcoded sample prompts as plain text.

**New: Contextual welcome screen**

```
┌─────────────────────────────────────────┐
│                                         │
│         ┌────────────────────┐          │
│         │    Chief Wiggum    │          │  ← App wordmark, --text-2xl
│         │  ● Sonnet 4.6     │          │  ← Active model badge
│         └────────────────────┘          │
│                                         │
│    How can I help with your project?    │  ← --text-lg, --color-text-secondary
│                                         │
│    ┌──────────┐  ┌──────────┐           │
│    │ 🔍 Review │  │ 🐛 Debug  │          │  ← Context-aware prompt cards
│    │ my code  │  │ an issue │          │
│    └──────────┘  └──────────┘           │
│    ┌──────────┐  ┌──────────┐           │
│    │ ✨ Create │  │ 📝 Explain │          │
│    │ a feature│  │ this code│          │
│    └──────────┘  └──────────┘           │
│                                         │
│    Tip: Press Cmd+K for Command Palette │  ← Rotating tips, --text-xs
│                                         │
└─────────────────────────────────────────┘
```

**Prompt card spec:**
- Background: `var(--color-bg-secondary)`
- Border: `var(--color-border-primary)`
- Radius: `var(--radius-lg)`
- Padding: `var(--space-3)`
- Hover: border becomes `var(--color-accent-muted)`, subtle glow
- Click: populates input with the prompt template
- **Context-aware:** If project is open, show project-relevant prompts (e.g., "Review recent changes in {project}")
- Max 4 cards in a 2x2 grid

**Rotating tips:**
- Cycle through tips every 8 seconds with fade transition
- Tips: "Cmd+K for Command Palette", "@ to mention files", "Cmd+B to toggle sidebar", "Shift+Enter for new line"
- Respects `prefers-reduced-motion` (no animation, show all tips as list)

### 4.8 File Preview / Edit (Major Rework)

**Current problems identified:**
- No visible edit button — users must know to click into the code
- Resize handle is invisible (1px separator)
- Auto-save has no visual feedback
- Conflict detection is reactive, not preventive
- No file info header (size, language, last modified)

**New spec:**

**File header bar:**
```
┌──────────────────────────────────────────────────────┐
│  📄 auth/middleware.ts  ·  TypeScript  ·  42 lines   │
│  Modified: 2m ago  ·  Size: 1.2KB                    │
│                                                      │
│  [👁 Preview]  [✏️ Edit]  [📋 Copy Path]  [+ Context]  │
└──────────────────────────────────────────────────────┘
```

**Spec:**
- File name: `--text-md`, `--font-mono`, `--color-text-primary`
- Metadata: `--text-xs`, `--color-text-secondary`, separated by `·` dots
- Action bar: ghost buttons, 28px height, icon + label
- Preview/Edit toggle: radio-style pills, active has `--color-tab-active-bg`

**Preview mode (default):**
- Read-only syntax-highlighted view
- Line numbers visible
- Click-to-select line ranges (for context addition)
- "Add to context" button appears on selection with token estimate

**Edit mode (explicit activation):**
- Toggle via "Edit" button (not implicit click)
- CodeMirror mounts with full editing capabilities
- **Save indicator:** Status chip in header: "Saving..." → "Saved ✓" (auto-hide after 2s)
- **Conflict prevention:** Check file mtime before mounting edit mode. If changed externally, show warning banner BEFORE editing
- **Unsaved indicator:** Dot next to filename when buffer is dirty
- **Exit edit:** "Done editing" button or Escape key. Prompts if unsaved changes.

**Resize handle (improved):**
- Height: 4px (up from 1px)
- Background: `var(--color-border-secondary)`
- Hover: `var(--color-accent)` with `cursor: row-resize`
- Drag: shows resize ghost line
- Double-click: reset to default height

### 4.9 Onboarding Tooltips (New)

For the first 3 sessions, show contextual discovery tooltips.

**Tooltip spec:**
```
┌──────────────────────────────────┐
│  💡 Quick tip                     │
│                                  │
│  Press Cmd+K to open the         │
│  Command Palette — search any    │
│  action or file instantly.       │
│                                  │
│  [Got it]           [Don't show] │
└──────────────────────────────────┘
```

- Background: `var(--color-bg-elevated)`
- Border: `1px solid var(--color-accent-muted)`
- Radius: `var(--radius-lg)`
- Shadow: `var(--shadow-md)`
- Arrow: CSS triangle pointing to the relevant UI element
- Max width: 280px
- Padding: `var(--space-3)`
- Title: "💡 Quick tip" in `--text-sm`, `--color-accent`
- Body: `--text-sm`, `--color-text-primary`
- Buttons: "Got it" (primary ghost), "Don't show" (text link, `--text-xs`)

**Tooltip sequence (first 3 sessions):**
1. Session 1, after first message sent: Point to Command Palette area → "Press Cmd+K for any action"
2. Session 1, after first response: Point to status bar cost → "Track your costs here"
3. Session 2, on load: Point to sidebar toggle → "Cmd+B to focus on conversation"
4. Session 2, after opening file tree: Point to @-mention → "Type @ in the input to add file context"
5. Session 3, on load: Point to keyboard shortcut help → "Press ? to see all keyboard shortcuts"

**Storage:** `settings.onboarding.tooltipsShown: string[]` — array of tooltip IDs already dismissed.

### 4.10 Success Micro-Animations (New)

**Tool completion checkmark:**
- When a tool use block transitions from streaming → complete: show a brief green checkmark (✓) next to the tool name
- Animation: fade-in + scale from 0.8→1.0, `var(--duration-celebration)`, `var(--ease-celebration)`
- Color: `var(--color-success)`
- Duration visible: 2 seconds, then fades to static ✓ icon

**Message send feedback:**
- On send button click: button briefly shows checkmark icon, then reverts to send arrow
- Animation: swap icon with fade, 300ms total
- Provides tactile "it worked" feedback

**Session cost summary (new):**
- When a conversation ends (session close or 60s of no activity after last response):
- Show inline summary card:
```
┌──────────────────────────────────────┐
│  Session complete                     │
│  12 messages · 47.2K tokens · $2.47  │
│  Duration: 8m 23s                    │
└──────────────────────────────────────┘
```

### 4.11 Border Reduction Strategy

**Current:** Nearly every zone boundary uses a 1px `--color-border-primary` border.

**New strategy:** Replace 30-40% of borders with spacing gaps.

**Rules:**
- **Keep borders:** Between sidebar and content, between content and details panel (structural)
- **Remove borders, add spacing:** Between sections within sidebar, between accordion items in details panel, between view tabs and content
- **Replace with subtle background shift:** Between message input area and conversation (use `--color-bg-secondary` on input area, no border)

**Specific changes:**
| Location | Current | New |
|----------|---------|-----|
| Sidebar → Content | 1px border-right | Keep (structural) |
| Content → Details | 1px border-left | Keep (structural) |
| View tabs → Content | 1px border-bottom | Remove, use 8px spacing gap |
| Status bar top edge | 1px border-top | Keep (structural) |
| Sidebar section dividers | 1px border | Replace with 8px spacing |
| Details panel section dividers | 1px border-bottom | Replace with 8px spacing |
| Message input top | 1px border-top | Remove, use bg-secondary on input area |
| Message bubble borders | 1px border | Remove entirely; use left-accent + spacing |

### 4.12 Tab Rename: "Center" → "Actions"

**Current:** Tab labeled "Center" with no subtitle.

**New:**
- Label: "Actions"
- Tooltip on hover: "Background tasks & execution history"
- Badge: count of currently running actions
- Icon: Lucide `Zap` (was `LayoutGrid`)

### 4.13 Permission Tier Rename: "YOLO" → "Auto-approve" (New)

**Current:** Permission mode labeled "YOLO" — playful jargon that confuses non-native speakers and feels unprofessional in enterprise contexts.

**New display names and descriptions:**

| Internal value | Display Label | One-line Description (tooltip) |
|----------------|--------------|-------------------------------|
| `safe` | Safe | "Manual approval for all actions" |
| `dev` | Developer | "Auto-approve safe operations, confirm destructive ones" |
| `yolo` | Auto-approve | "All operations run without confirmation" |

**Implementation:**
- Rename all UI labels, tooltips, and dialog text from "YOLO" to "Auto-approve"
- Rename `YoloWarningDialog` component → `AutoApproveWarningDialog`
- Rename store references: `isYoloMode` → `isAutoApproveMode`
- Keep backward compatibility in settings storage (migrate old `yolo` key gracefully)
- Each permission tier badge gets a tooltip with its one-line description
- Tooltip: dark bg, 200ms delay, 8px offset (standard tooltip pattern from §4.9)

### 4.14 CTA Button Hierarchy (New)

**Current:** Inconsistent button styles — some dialogs use accent fill for primary, others use ghost.

**Standard hierarchy (applies to ALL buttons/CTAs across the app):**

| Level | Style | Usage |
|-------|-------|-------|
| **Primary** | `background: var(--color-accent)`, white text, `border-radius: var(--radius-md)` | Main CTA: Send, Confirm, Save, Apply |
| **Secondary** | Ghost: `border: 1px solid var(--color-border-primary)`, `--color-text-primary` | Alternative: Cancel, Back, Skip |
| **Tertiary** | Text-only: `--color-text-secondary`, no border/bg | Minor: "Learn more", "Don't show again" |
| **Destructive** | `background: var(--color-error)`, white text | Delete, Remove permanently |

All button instances across PermissionDialog, AutoApproveWarningDialog, CommandPalette, ToastContainer, Settings, and modal dialogs must conform. Document in SPEC-002 §10 (Components).

### 4.15 Help & Documentation System (New)

**Current:** No in-app help, no changelog, no persistent help icon.

**New components:**

**Help menu ("?" in TitleBar Z1):**
- Icon: Lucide `HelpCircle`, 16px, `--color-text-secondary`, right side of title bar
- Dropdown: Keyboard Shortcuts, Documentation (external), What's New, Report Issue, About
- Width: 200px

**Persistent "?" in conversation area:**
- Bottom-right of conversation view, subtle `--color-text-tertiary`
- Click: opens keyboard shortcut overlay
- Visible for first 10 sessions, then hidden (accessible via help menu)

**"What's New" changelog banner:**
- Top of conversation area after app update, dismissible
- `--color-bg-elevated`, accent left border, `--text-sm`
- Click: opens changelog modal (500px wide, 400px max height, scrollable, last 3 versions)

### 4.16 Unsent Content Protection (New)

When input textarea has >50 characters and user navigates away (session switch, app close), show confirmation: "You have an unsent message. Discard or keep editing?"

- Buttons: "Keep Editing" (primary), "Discard" (secondary)
- If draft auto-save (§4.6) is active, mention it in dialog copy
- Threshold: 50 characters

### 4.17 Command Palette Enhancements (New)

**Recently Used section:**
- Shown at top of Command Palette when opened with empty query
- Max 5 recent commands, each with name + shortcut + time since last use
- Section header: "Recent" with clock icon (Lucide `Clock`)
- Persists across sessions (localStorage, max 20)

**Context chip reason labels:**
- Each context chip shows a 12px origin icon before filename:
  - `@` AtSign — manually added via @-mention
  - `↗` Scan — auto-detected from project
  - `💬` MessageSquare — referenced in conversation
  - `📌` Pin — pinned by user
- Color: `--color-text-tertiary`; tooltip explains source on hover

### 4.18 Session Management (New)

**Session pinning:**
- Right-click session → "Pin session" / "Unpin"
- Pinned sessions: top of sidebar in "Pinned" section (max 5)
- Pin icon: Lucide `Pin`, 12px, `--color-text-tertiary` (accent when pinned)
- Stored in SQLite (`is_pinned` boolean on session)

**Quick session switcher:**
- Shortcut: `Ctrl+Tab`
- Overlay: 400px wide, centered, lists 5 most recent sessions
- Each item: session name + last message preview + time
- Tab cycles, release switches, Escape cancels
- Style: `--color-bg-elevated`, `--shadow-xl`, `--radius-lg`

### 4.19 Saved Prompt Templates (New)

**Save:** Right-click in input → "Save as template", or Command Palette action. Name + optional `{placeholder}` variables.

**Use:** `/template` slash command, Command Palette "Insert template", or empty state cards (§4.7).

**Manage:** Settings panel section — edit, duplicate, delete, export/import JSON.

**Storage:** SQLite `prompt_templates(id, name, content, variables, created_at, usage_count)`. Sort by most-used.

### 4.20 Persistent Error Log (New)

**Error count badge in status bar:**
- Position: left zone, after CLI status
- Show red badge with count when errors > 0 (e.g., "⚠ 3")
- Clears on view; no badge at 0 errors

**Error log panel:**
- Opens from badge click, 300px tall popover
- Chronological entries: timestamp, severity icon, human-readable message, expandable details, copy button
- Max 100 entries (FIFO)

**Human-readable error mapping:**
- `ECONNREFUSED` → "Can't connect to Claude CLI. Is it running?"
- `EPERM` → "Permission denied. Check file access settings."
- `TIMEOUT` → "Request timed out."
- Rate limits → "Rate limited. Waiting before retrying..."
- Each includes "What to try" suggestion

### 4.25 Git Panel (New)

**Purpose:** Provide a dedicated Git workflow view for branch management, staging, committing, and remote operations — integrated natively into the 5-zone layout.

**Layout — Z2 Sidebar entry:**
- Icon: `GitBranch` (lucide) in sidebar nav, positioned below Files, above Settings
- Badge: shows count of all uncommitted changes (staged + unstaged + untracked) when > 0
- Badge style: `--color-accent` background, `--text-xs`, `--font-mono`, pill shape

**Layout — Z3 Main Content (when activeView === 'git'):**

```
┌─────────────────────────────────────────────┐
│ Header: Branch + Remote Actions             │
│ ⎇ main ▾  │  ↑2 ↓0  │  Fetch  Pull  Push  │
├─────────────────────────────────────────────┤
│ Staged Changes (N)                  [– all] │
│   ✓ file.ts                      M    [–]   │
├─────────────────────────────────────────────┤
│ Changes (N)                        [+ all]  │
│   ○ file.ts                    M   [+] [✕]  │
├─────────────────────────────────────────────┤
│ Untracked (N)                      [+ all]  │
│   ? file.ts                    ?     [+]    │
├─────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────┐ │
│ │ Commit message...                       │ │
│ └─────────────────────────────────────────┘ │
│ [✨ AI Message]             [Commit (N)]    │
├─────────────────────────────────────────────┤
│ Recent Commits (scrollable)                 │
│  abc1234  Fix type error in utils      2m   │
│  def5678  Add gitStore basics         15m   │
└─────────────────────────────────────────────┘
```

**Header bar:**
- Left: `BranchSelector` (§4.26) — current branch name with dropdown arrow
- Center: Ahead/behind badges — `↑N` (green text if > 0), `↓N` (amber text if > 0)
- Right: Remote action buttons (§4.29) — ghost variant, `--text-sm`

**Changed files groups:**
- Three collapsible sections: Staged, Changes (unstaged modified/deleted), Untracked
- Section header: group name + count in parentheses + bulk action button
- Bulk actions: `[– all]` to unstage all, `[+ all]` to stage all — icon-only buttons with `aria-label`
- Collapse: `ChevronRight` rotates to `ChevronDown`, remembers state per session

**File item row:**
- Left: status icon (✓ staged, ○ modified, ? untracked)
- Center: relative file path, truncated from left with `…/` if needed, `--font-mono --text-sm`
- Right: status letter badge (M/A/D/R/C/?) + action buttons
- Action buttons visible on hover or keyboard focus: `[+]` stage, `[–]` unstage, `[✕]` discard
- Discard uses soft undo pattern (§5.5)
- Click on file → opens diff in Z4 details panel (§4.27)
- Selected file: `--color-bg-elevated` background, `--color-accent` left border (2px)

**Commit box (§4.28):**
- Always visible below file groups
- `textarea` with placeholder "Commit message...", auto-expands up to 4 lines
- Left button: `✨ AI Message` — generates commit message from staged diff via Claude
- Right button: `Commit (N)` — primary variant, N = staged count, disabled when 0

**Recent commits section:**
- Below commit box, scrollable, lazy-loaded (20 entries, load more on scroll)
- Each entry: short hash (`--font-mono --text-xs --color-text-tertiary`), message (truncated), relative time
- Click → shows full commit diff in Z4

**Empty states:**
- No git repo detected: "Not a Git repository. Initialize one?" with [git init] ghost button
- No changes: "Working tree clean ✓" centered text, `--color-text-tertiary`
- No commits yet: "No commits yet. Stage files and make your first commit."

**Performance:**
- Status refresh: auto-refresh on window focus, on file save events (from file watcher), debounced 500ms
- File list: virtualized if > 100 items (use `@tanstack/virtual` or equivalent)

### 4.26 Branch Selector (New)

**Trigger:** Click branch name in Git panel header OR click `BranchIndicator` in status bar (§4.25).

**Dropdown behavior:**
- Position: below trigger element, aligned left, max-height 300px with scroll
- Width: min 200px, max 320px
- Background: `--color-bg-elevated`, `--shadow-lg`, `--radius-md`
- Animation: `--duration-micro` fade + translateY(-4px)

**Content:**
1. Search input (sticky top): placeholder "Find branch...", `--text-sm`, auto-focus on open
2. Current branch: highlighted row with `✓` icon, `--color-accent` text
3. Local branches: sorted alphabetically, grouped under "Local" header
4. Remote branches: grouped under "Remote" header (collapsed by default)
5. Divider + "New Branch..." action at bottom with `+` icon

**Interactions:**
- Type to filter (instant, case-insensitive substring match)
- `Enter` switches to highlighted branch
- `Escape` closes dropdown
- Arrow keys navigate list
- If working tree is dirty when switching: show confirmation dialog — "You have N uncommitted change(s). Stash and switch, or cancel?" with [Stash & Switch] primary + [Cancel] ghost buttons
- On switch success: toast "Switched to `branch-name`", refresh git status

**New branch flow:**
- Click "New Branch..." → inline input replaces the action row
- Placeholder: "new-branch-name", validates kebab-case
- `Enter` creates + switches, `Escape` cancels
- Creates from current HEAD by default

### 4.27 Git Diff Viewer (New)

**Trigger:** Click any file in the Git panel's changed files list.

**Display — Z4 Details Panel:**
- Reuses the existing `DiffPreviewPane` + `InlineDiff` component infrastructure
- Header: file path + status badge + action buttons ([Stage], [Unstage], [Discard], [Open File])
- Content: unified diff with syntax highlighting (existing `highlight.js` integration)

**Diff rendering:**
- Uses existing diff color tokens: `--color-diff-add-bg`, `--color-diff-remove-bg`, `--color-diff-modify-bg`
- Line numbers: dual column (old line / new line), `--font-mono --text-xs`, right-aligned 48px each
- Hunk headers: `@@` lines with `--color-text-tertiary` background, bold
- Context lines: default background, `--color-text-secondary`
- Added lines: `--color-diff-add-bg` background, `+` prefix in green
- Removed lines: `--color-diff-remove-bg` background, `-` prefix in red

**Hunk-level staging:**
- Each hunk has gutter buttons on hover: `[+]` stage hunk, `[–]` unstage hunk
- Buttons appear in the hunk header row, right-aligned
- After staging a hunk: hunk visually moves from "Changes" diff to "Staged" diff
- Split view option: show staged diff on left, unstaged diff on right (via `viewStore.splitView()`)

**Binary files:**
- Show placeholder: "Binary file changed (N bytes → M bytes)" with file type icon
- Image files: show side-by-side thumbnail preview (reuse `ImagePreview` component)

**Large diffs:**
- Diffs > 500 lines: show collapsed with "Show full diff (N lines)" expand button
- Diffs > 5000 lines: show warning "Very large diff — may impact performance" before expanding

**Keyboard navigation:**
- `j`/`k` or arrow keys: move between hunks
- `s`: stage current hunk
- `u`: unstage current hunk
- `n`/`p`: next/previous file in the changed files list

### 4.28 Commit Interface (New)

**Commit message input:**
- `textarea` element, `--font-mono --text-sm`
- Min height: 1 line; max height: 4 lines (auto-expand)
- Placeholder: "Commit message..." in `--color-text-tertiary`
- Border: `1px solid --color-border-primary`, focus: `--color-accent`
- Supports multi-line: first line = summary (≤72 chars), blank line, then body
- Character counter appears after 50 chars on first line: "52/72" in `--color-text-tertiary`, turns `--color-warning` at 72+

**AI commit message generation:**
- Button: `✨ AI Message` — ghost variant, left of commit button
- Behavior: sends staged diff content to Claude via existing CLI bridge
- Loading state: button shows spinner, text changes to "Generating..."
- Result: populates textarea with generated message, cursor at end
- User can edit before committing
- If no staged changes: button disabled, tooltip "Stage changes first"

**Commit button:**
- Text: `Commit (N)` where N = staged file count
- Variant: primary when N > 0, disabled when N === 0
- On click: calls `git_commit` IPC with message text
- Success: toast "Committed abc1234 — message summary", clear textarea, refresh status
- Error: error toast with reason (e.g., "Nothing staged", "Empty commit message")
- Keyboard: `Cmd+Enter` when textarea focused

**Amend mode:**
- Checkbox or toggle below textarea: "☐ Amend last commit"
- When checked: pre-fills textarea with last commit message, button text changes to "Amend (N)"
- When amending with no new staged changes: allowed (message-only amend)

**Commit validation:**
- Empty message → disable commit button, no error
- Whitespace-only message → disable commit button
- No staged files → disable commit button, tooltip "Stage changes to commit"

### 4.29 Remote Operations (New)

**Buttons in Git panel header:**
- Three ghost-variant buttons: Fetch, Pull, Push
- Icons: `RefreshCw` (fetch), `ArrowDown` (pull), `ArrowUp` (push)
- Text labels visible at panel widths ≥ 300px, icon-only below
- Each has `aria-label` for accessibility

**Fetch:**
- Fetches all remotes
- Loading: button shows spinner for duration
- Success: silently updates ahead/behind counts, no toast
- Error: error toast "Fetch failed: reason"
- Auto-fetch: optionally on window focus (configurable in settings)

**Pull:**
- Pulls current branch from tracking remote
- Loading: button shows spinner, disable other remote buttons
- Success: toast "Pulled N commit(s) from origin/branch"
- Conflict: `MergeConflictBanner` appears (see below), toast "Pull completed with conflicts in N file(s)"
- Error: error toast with reason

**Push:**
- Pushes current branch to tracking remote
- Loading: button shows spinner + progress bar in header (use `--color-progress-fill`)
- Success: toast "Pushed to origin/branch"
- Rejected (non-fast-forward): error toast "Push rejected — pull first?" with [Pull & Push] action button
- No upstream: dialog "No upstream branch. Push to origin/branch-name?" with [Push] primary + [Cancel]
- Error: error toast with reason

**Progress streaming (push/pull/fetch):**
- Tauri events: `git:progress` with `{ operation, current, total, message }`
- Progress bar: thin bar in Git panel header, `--color-progress-fill`, animate width
- Cancel: long-running operations (> 5s) show "Cancel" ghost button

**Merge Conflict Banner:**
- Appears at top of Git panel when conflicts detected
- Background: `--color-diff-modify-bg` (amber tone)
- Text: "Merge conflict in N file(s)" with file list
- Actions: [Resolve] (opens first conflicted file in diff viewer), [Abort Merge] (soft undo pattern)
- Conflicted files in the changed files list get a special icon (⚠) and `--color-warning` text

### 4.30 Integrated Terminal (New)

**Location:** Z3 (Main Content) when `activeView === 'terminal'`.
**Sidebar entry:** "Terminal" icon (already registered). Badge shows count of active terminal sessions.
**Existing asset:** `TerminalPane.tsx` — xterm.js v6.0.0 with WebGL, FitAddon, dark/light themes. Currently UI-only (no backend connection).

**Layout — Terminal Panel:**

```
┌──────────────────────────────────────────────────────────┐
│ [+]  │ ● zsh (1)  │ ● node (2)  │         [⊞] [✕]     │  ← Tab bar
├──────────────────────────────────────────────────────────┤
│                                                          │
│  $ npm run build                                         │
│  > chief-wiggum@0.1.0 build                              │
│  > vite build                                            │
│  ...                                                     │
│                                                          │
│  $ █                                                     │  ← Active terminal
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Tab bar:**
- Left: [+] button creates new terminal session (default shell)
- Center: tabs — each tab shows shell name + index (e.g., "zsh (1)")
- Tab has colored dot: green = running, gray = exited
- Right: [⊞] split button (future — Phase 5), [✕] close active tab
- Active tab uses `--color-tab-active-bg` / `--color-tab-active-text`
- Inactive tabs use `--color-tab-inactive-text`
- Close individual tab: middle-click or ✕ icon on hover

**Terminal instance:**
- Each tab owns one xterm.js `Terminal` instance connected to one backend PTY session
- Input: `terminal.onData()` → IPC `terminal_write` → PTY stdin
- Output: Tauri event `terminal:output` → `terminal.write()`
- Resize: `FitAddon.fit()` → `terminal.onResize()` → IPC `terminal_resize` → PTY resize

**Shell selection:**
- Default shell: detected from `$SHELL` (macOS/Linux) or `ComSpec` (Windows)
- [+] button long-press or dropdown arrow: choose shell (bash, zsh, fish, PowerShell, cmd)
- Shell path configurable via Settings → Terminal → Default Shell

**Session lifecycle:**
- Tab created → IPC `spawn_terminal(shell, cwd)` → backend spawns PTY → returns `terminal_id`
- Tab receives output via `terminal:output` event filtered by `terminal_id`
- User types → `terminal_write(terminal_id, data)` → PTY stdin
- Process exits → `terminal:exit` event → tab dot turns gray, "[Process exited]" message
- User closes tab → IPC `kill_terminal(terminal_id)` if still running → confirm if process active

**Empty state (no tabs):**
- Center: terminal icon (muted), "Open a terminal" text, [New Terminal] CTA button
- Matches empty state pattern from §4.7

**Performance:**
- PTY output chunks: 4KB buffer, streamed via Tauri events (not polling)
- xterm.js WebGL addon for GPU-accelerated rendering (fallback to canvas)
- Offscreen terminals (inactive tabs) suspend rendering but continue receiving output
- Maximum 10 concurrent terminal sessions (configurable in settings)
- Output buffer: 10,000 lines scrollback per session (xterm.js `scrollback` option)

### 4.31 Terminal Tab Management (New)

**Tab creation:**
- Keyboard: `Cmd+Shift+T` (macOS) / `Ctrl+Shift+T` — new terminal tab
- Tab bar: click [+] button
- Context menu: right-click tab bar → "New Terminal", "New Terminal with Profile..."
- Working directory: inherits from active project's root path (`projectStore.activeProject.path`)

**Tab switching:**
- Click tab
- Keyboard: `Cmd+Shift+[` / `Cmd+Shift+]` — prev/next terminal tab
- Keyboard: `Cmd+1` through `Cmd+9` — jump to tab by index (when terminal view is active)

**Tab closing:**
- Click ✕ on tab (appears on hover)
- Middle-click tab
- Keyboard: `Cmd+Shift+W` — close active terminal tab
- If process is still running: confirmation dialog "Terminal has a running process. Close anyway?" → [Cancel] [Close]
- Last tab closed → show empty state

**Tab renaming:**
- Double-click tab title → inline edit (text input replaces tab title)
- Enter confirms, Escape cancels
- Default name: shell name + index (e.g., "zsh (1)")

**Tab reordering:**
- Drag-and-drop tabs to reorder
- Visual feedback: drop indicator line between tabs

**Tab overflow:**
- When tabs exceed available width: horizontal scroll with left/right arrow buttons
- Dropdown: overflow menu showing all tabs (click to switch)

### 4.32 Terminal Working Directory & Links (New)

**Working directory:**
- New terminals open in the active project's root directory
- Status: current working directory shown in status bar Z5 when terminal is active (truncated with `~/` prefix)
- CWD tracking: if shell integration is available (see below), update displayed CWD on each prompt

**Clickable file paths (addon-web-links):**
- File paths in terminal output are clickable
- Click: opens file in File Explorer / Details Panel (Z4)
- Cmd+Click: opens file in system default editor
- Visual: underline on hover, `cursor: pointer`
- Pattern matching: absolute paths (`/foo/bar.ts`), relative paths (`./src/index.ts`), and common formats (`file:///`, `at /path:line:col`)

**Shell integration (future enhancement — Phase 5):**
- OSC escape sequences for CWD tracking, command start/end markers
- Enables: command decoration (success/failure icons per command), CWD in prompt
- Not required for MVP — basic terminal works without shell integration

### 4.33 Terminal Settings (New)

**Settings → Terminal section:**

| Setting | Type | Default | Notes |
|---|---|---|---|
| Default shell | string (path) | Auto-detected (`$SHELL`) | Dropdown with detected shells + custom path |
| Font size | number | 14 | Range: 8–32 |
| Font family | string | `'JetBrains Mono', ...` | Monospace fonts only |
| Cursor style | enum | `block` | `block`, `underline`, `bar` |
| Cursor blink | boolean | `true` | |
| Scrollback lines | number | 10,000 | Range: 1,000–100,000 |
| Max concurrent sessions | number | 10 | Range: 1–20 |
| Copy on select | boolean | `false` | Auto-copy selected text to clipboard |
| Paste on right-click | boolean | `false` | Right-click pastes clipboard |
| Bell | enum | `none` | `none`, `sound`, `visual` (flash) |

**Theme:** Terminal theme colors are derived from the global appearance theme (dark/light/system) — already implemented in `TerminalPane.tsx`. No separate terminal theme setting.

---

## 5. Interaction Patterns (New)

### 5.1 Soft Undo

For destructive actions (message delete, context chip remove, session close), provide a 5-second undo window:

**Pattern:**
1. User clicks delete → Item visually fades (50% opacity) but is not removed from DOM
2. Toast appears: "Message deleted. [Undo]" with 5-second countdown bar
3. If Undo clicked → item restores to full opacity, toast dismisses
4. If timeout → item removed from DOM, toast dismisses
5. Toast type: `info` variant with countdown progress bar at bottom

**Applied to:**
- Message delete
- Context chip removal
- Session delete (from sidebar)
- File context removal

### 5.2 Hold-to-Remove for Context Chips

**Current:** Single click removes context chips (easy to accidentally remove).

**New:** Two removal patterns:
- **Click:** Shows "✕ Remove?" confirmation state for 2 seconds, click again to confirm
- **Long press (300ms):** Instant remove with undo toast
- **Keyboard:** Focus + Delete/Backspace → remove with undo toast

### 5.3 Error Toast Persistence

**Current:** Error toasts auto-dismiss after 5 seconds.

**New:**
- `error` variant toasts persist until manually dismissed (click X)
- `error` toasts include "Details" button that expands inline to show full error
- `error` toasts include "Copy error" button for bug reporting
- `warning` and `info` toasts still auto-dismiss (5s and 3s respectively)

### 5.4 Pause Response

**Current:** Only "Cancel" button during response (loses all progress).

**New:** Add "Pause" alongside Cancel:
- Pause button: `⏸` icon, ghost variant
- Behavior: Pauses streaming, keeps received content, shows "Paused — [Resume] [Cancel]" inline
- Resume: continues from where it left off (if CLI supports) or regenerates
- Visual: message bubble shows "Paused" badge, amber left border

### 5.5 Git Operation Undo & Confirmation

**Soft Undo (extends §5.1) — applies to:**
- Discard file changes: "Changes discarded for file.ts. [Undo]" — restores from stash
- Delete branch: "Branch feature-x deleted. [Undo]" — re-creates from last ref
- Stash drop: "Stash dropped. [Undo]" — re-applies stash

**Implementation:** Before discard/delete, Git stashes or stores the ref. Undo re-applies. After 5-second timeout, cleanup.

**Confirmation dialogs (destructive, no undo):**
- Force push: "Force push will overwrite remote history. This cannot be undone." [Force Push] destructive + [Cancel]
- Reset hard: "This will discard all uncommitted changes permanently." [Reset] destructive + [Cancel]
- Abort merge: "Abort merge and discard merge state?" [Abort] destructive + [Cancel]

**No confirmation needed (low risk):**
- Stage / unstage files or hunks
- Commit (reversible via amend or revert)
- Fetch (read-only)
- Create branch
- Switch branch (with dirty-tree stash prompt if needed)

---

## 6. Accessibility Updates

### 6.1 Contrast Fixes (Mandatory)

| Element | Current Contrast | Target | Fix |
|---------|-----------------|--------|-----|
| Sidebar secondary text | 4.06:1 | ≥4.5:1 | `--color-text-secondary` → `#9DA5AE` |
| Status bar text | ~3.8:1 | ≥4.5:1 | Increase to `--text-sm` + primary color |
| Tooltip text (on accent bg) | ~3.2:1 | ≥4.5:1 | Use dark bg instead of accent bg |
| Tab inactive text | ~3.2:1 | ≥4.5:1 | `--color-text-tertiary` → `#7D8590` |
| Cost values (details panel) | ~4.3:1 | ≥4.5:1 | Use `--color-text-primary` |

### 6.2 Non-Color State Indicators

Audit all places where color alone indicates state. Add text or icon pairs:

| Element | Current (color only) | Fix |
|---------|---------------------|-----|
| Tool use left stripe | Color = tool type | Add tool type icon next to name |
| Status dot (CLI) | Green/amber/red dot | Add text label: "Connected", "Waiting", "Error" |
| Context meter zones | Color-coded bar | Add percentage text always visible |
| Model badge | Color = model | Already has text label ✓ |

### 6.3 Screen Reader Improvements

- Add `aria-live="polite"` to cost display (updates during responses)
- Add `aria-label` to progress indicator: "Claude is responding, X seconds elapsed"
- Add `role="status"` to streaming activity section
- Ensure all tooltips use `aria-describedby` pattern

### 6.4 Git Panel Accessibility (New)

- Changed file groups use `role="group"` with `aria-label` ("Staged changes, 3 files")
- File action buttons (stage, unstage, discard) have `aria-label` describing action + filename
- Diff viewer lines use `aria-label` for added/removed status (not color alone)
- Branch selector dropdown uses `role="listbox"` with `aria-activedescendant`
- Commit button announces staged count: `aria-label="Commit 3 staged files"`
- Remote operation progress uses `aria-live="polite"` with `role="progressbar"`
- Merge conflict banner uses `role="alert"` for immediate screen reader announcement
- All keyboard shortcuts listed in help overlay (§4.15)

### 6.5 Terminal Accessibility (New)

- Terminal tab bar uses `role="tablist"` with `aria-label="Terminal sessions"`
- Each tab uses `role="tab"` with `aria-selected` and `aria-label` including shell name and status (e.g., "zsh, running")
- Terminal content area uses `role="tabpanel"` linked to active tab via `aria-labelledby`
- New terminal button: `aria-label="Open new terminal session"`
- Close tab button: `aria-label="Close terminal session: zsh (1)"`
- Terminal exit notification uses `aria-live="polite"`: "Terminal process exited with code 0"
- xterm.js has built-in screen reader support via `screenReaderMode` option (enable when screen reader detected)
- All keyboard shortcuts listed in help overlay (§4.15)

---

## 7. Performance Requirements

- **Tab switch:** <100ms visual response
- **Message render:** <16ms per message (60fps scroll)
- **Progress indicator start:** <50ms after response begins
- **Tooltip appear:** <150ms after hover
- **Draft save:** Debounced 2s, non-blocking
- **Cost update:** Real-time during streaming, <100ms latency
- **Animation budget:** Maximum 2 concurrent animations (progress bar + streaming cursor)
- **Git status refresh:** <200ms for repos with <1000 files, debounced 500ms on file changes
- **Diff render:** <100ms for files under 1000 lines, lazy-load for larger diffs
- **Branch list load:** <150ms for repos with <100 branches
- **Commit log load:** <200ms for initial 20 entries, paginated thereafter
- **Remote progress events:** Streamed at ≤100ms intervals, non-blocking UI
- **Terminal spawn:** PTY process spawn <300ms from tab creation to first output
- **Terminal input latency:** Keypress → PTY write → echo back <50ms (local)
- **Terminal output throughput:** Handle 10MB/s output without dropping frames (xterm.js WebGL)
- **Terminal resize:** FitAddon.fit() + PTY resize <100ms, debounced 150ms on window resize
- **Terminal tab switch:** Inactive → active tab render <50ms (reattach to existing Terminal instance)

---

## 8. Migration Notes

### 8.1 Breaking Changes

- `--color-text-secondary` value changes from `#8B949E` to `#9DA5AE` — affects all components using this token. Visual impact: slightly lighter secondary text throughout.
- `--color-text-tertiary` value changes from `#6E7681` to `#7D8590` — same impact pattern.
- `.grain-overlay` class removed — remove from MainLayout and any global styles.
- View tab styling completely replaced — all tab-related CSS must be rewritten.

### 8.2 Non-Breaking Additions

All new tokens (zone backgrounds, progress, feedback) are additive. Existing components continue to work; new components opt into new tokens.

### 8.3 Recommended Migration Order

1. **Token updates** (contrast fixes + new tokens) — affects everything, do first
2. **Grain overlay removal** — simple deletion
3. **Zone separation** (sidebar/details backgrounds) — layout-level change
4. **Tab redesign** — isolated to ViewTabs component
5. **Message differentiation** — isolated to MessageBubble
6. **Smart details panel** — DetailsPanel component
7. **Progress indicator** — new component in ConversationView
8. **Input area upgrades** — MessageInput component
9. **Empty state** — ConversationView empty state
10. **File preview rework** — FilePreview component
11. **Success animations** — ToolUseBlock + MessageInput
12. **Onboarding tooltips** — new system, low risk
13. **Cost display upgrade** — StatusBar + DetailsPanel
14. **Soft undo system** — new pattern, cross-component

---

## 9. Testing Requirements

Each component change must include:

1. **Visual regression test:** Screenshot comparison before/after
2. **Contrast verification:** Automated check that all text meets 4.5:1 on its background
3. **Keyboard test:** Every new interactive element reachable and operable via keyboard
4. **Motion test:** Verify `prefers-reduced-motion` disables all new animations
5. **Screen reader test:** New ARIA attributes verified with VoiceOver or NVDA
6. **Git integration tests:** Temp repo init → modify files → verify status → stage → commit → verify log
7. **Git error handling:** Test non-repo directory, network failures, merge conflicts, dirty-tree switch
8. **Git performance:** Benchmark status refresh and diff render against target thresholds (§7)
9. **Terminal integration tests:** Spawn PTY → write input → verify output → resize → verify PTY dimensions → kill → verify exit event
10. **Terminal tab management:** Create tab → switch tabs → close tab → verify lifecycle events
11. **Terminal performance:** Benchmark spawn latency, input echo latency, and output throughput against target thresholds (§7)

---

## 10. Appendix: Token Quick Reference

### New tokens added in this spec

```css
/* Zone backgrounds */
--color-bg-sidebar: #0F1519;
--color-bg-content: #0D1117;  /* alias for --color-bg-primary */
--color-bg-details: #111820;

/* Progress */
--color-progress-track: rgba(232, 130, 90, 0.12);
--color-progress-fill: #E8825A;

/* Tabs */
--color-tab-active-bg: rgba(232, 130, 90, 0.12);
--color-tab-active-text: #E8825A;
--color-tab-inactive-text: #7D8590;

/* Animation */
--duration-micro: 60ms;
--duration-celebration: 400ms;
--ease-celebration: cubic-bezier(0.22, 1.0, 0.36, 1.0);
```

### Git-related tokens (reuse existing)

```css
/* Diff colors — already defined in SPEC-002 §3.4 */
--color-diff-add-bg: #1B3A28;
--color-diff-add-text: #3FB950;
--color-diff-remove-bg: #3D1A1E;
--color-diff-remove-text: #F85149;
--color-diff-modify-bg: #2A2112;

/* Reused for git panel */
--color-bg-sidebar       /* file groups */
--color-bg-content       /* diff viewer */
--color-bg-details       /* commit info */
--color-bg-elevated      /* selected file, dropdowns */
--color-progress-fill    /* push/pull progress */
--color-progress-track   /* progress background */
--color-warning          /* merge conflict indicators */
```

### Terminal-related tokens (reuse existing)

```css
/* Terminal themes — already implemented in TerminalPane.tsx */
/* Dark theme: background=#010409, foreground=#e6edf3, cursor=#e8825a */
/* Light theme: background=#ffffff, foreground=#1f2328, cursor=#cf6e3e */
/* Full ANSI color palette mapped to SPEC-002 tokens in both modes */

/* Reused for terminal panel */
--color-tab-active-bg        /* active terminal tab */
--color-tab-active-text      /* active terminal tab text */
--color-tab-inactive-text    /* inactive terminal tabs */
--color-bg-content           /* tab bar background */
--color-bg-elevated          /* tab hover state */
--color-text-secondary       /* CWD display, session status */
--color-success              /* running process indicator (green dot) */
--color-text-tertiary        /* exited process indicator (gray dot) */
```

### Amended tokens

```css
/* Contrast fixes */
--color-text-secondary: #9DA5AE;  /* was #8B949E */
--color-text-tertiary: #7D8590;   /* was #6E7681 */
```
