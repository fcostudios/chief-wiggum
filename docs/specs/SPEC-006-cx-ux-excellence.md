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

---

## 7. Performance Requirements

- **Tab switch:** <100ms visual response
- **Message render:** <16ms per message (60fps scroll)
- **Progress indicator start:** <50ms after response begins
- **Tooltip appear:** <150ms after hover
- **Draft save:** Debounced 2s, non-blocking
- **Cost update:** Real-time during streaming, <100ms latency
- **Animation budget:** Maximum 2 concurrent animations (progress bar + streaming cursor)

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

### Amended tokens

```css
/* Contrast fixes */
--color-text-secondary: #9DA5AE;  /* was #8B949E */
--color-text-tertiary: #7D8590;   /* was #6E7681 */
```
