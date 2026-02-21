# SPEC-002: Design System Specification

**Version:** 1.0
**Date:** 2026-02-20
**Status:** Draft
**Parent:** SPEC-001 (Section 10.3)
**Audience:** Frontend developers, coding agents, UI reviewers

---

## 1. Purpose

This document defines the complete visual language for Chief Wiggum. Every component, screen, and interaction must reference this spec to ensure consistency across the application, regardless of which developer or agent builds it.

**Rule:** No component may introduce colors, spacing values, font sizes, or animation durations that are not defined in this document. If a new token is needed, it must be added here first, then referenced.

---

## 2. Design Principles

1. **Density over whitespace.** The target audience is professional developers running complex agent workflows. Every pixel must earn its place. No decorative elements, no hero sections, no excessive padding.

2. **Keyboard-first, mouse-optional.** Every action reachable by mouse must also be reachable by keyboard. Focus rings must be visible. Tab order must be logical.

3. **Information hierarchy through typography, not decoration.** Use font weight, size, and color to establish hierarchy — not borders, shadows, or background colors (except where semantically necessary like status badges).

4. **State changes, not animations.** Transitions exist only to communicate state changes (expanding a panel, switching tabs). Maximum 200ms. No entrance animations, no parallax, no decorative motion.

5. **Accessible by default.** WCAG 2.1 AA minimum. All text meets 4.5:1 contrast ratio against its background. Interactive elements meet 3:1. Focus indicators are always visible.

---

## 3. Color System

### 3.1 Core Palette (Dark Theme — Default)

All colors are defined as CSS custom properties on `:root`. The theme file sets these values.

| Token | Hex | RGB | Usage |
|---|---|---|---|
| `--color-bg-primary` | `#0D1117` | `13, 17, 23` | App background, main canvas |
| `--color-bg-secondary` | `#161B22` | `22, 27, 34` | Cards, panels, sidebar |
| `--color-bg-elevated` | `#1C2128` | `28, 33, 40` | Modals, dropdowns, tooltips, popovers |
| `--color-bg-inset` | `#010409` | `1, 4, 9` | Inset areas (terminal background, code blocks) |
| `--color-border-primary` | `#30363D` | `48, 54, 61` | Panel borders, dividers |
| `--color-border-secondary` | `#21262D` | `33, 38, 45` | Subtle separators |
| `--color-border-focus` | `#E8825A` | `232, 130, 90` | Focus rings (accent color) |
| `--color-text-primary` | `#E6EDF3` | `230, 237, 243` | Primary body text, headings |
| `--color-text-secondary` | `#8B949E` | `139, 148, 158` | Labels, hints, timestamps |
| `--color-text-tertiary` | `#6E7681` | `110, 118, 129` | Disabled text, placeholders |
| `--color-text-link` | `#58A6FF` | `88, 166, 255` | Hyperlinks |
| `--color-accent` | `#E8825A` | `232, 130, 90` | Primary actions, CTAs (Anthropic orange) |
| `--color-accent-hover` | `#F09070` | `240, 144, 112` | Accent hover state |
| `--color-accent-muted` | `#E8825A33` | — | Accent backgrounds (20% opacity) |
| `--color-success` | `#3FB950` | `63, 185, 80` | Success states, connected, Haiku badge |
| `--color-success-muted` | `#3FB95033` | — | Success backgrounds |
| `--color-warning` | `#D29922` | `210, 153, 34` | Budget alerts, caution states |
| `--color-warning-muted` | `#D2992233` | — | Warning backgrounds |
| `--color-error` | `#F85149` | `248, 81, 73` | Errors, critical states, kill actions |
| `--color-error-muted` | `#F8514933` | — | Error backgrounds |
| `--color-info` | `#58A6FF` | `88, 166, 255` | Informational badges |

### 3.2 Model Badge Colors

| Token | Hex | Usage |
|---|---|---|
| `--color-model-opus` | `#A371F7` | Opus 4.6 indicator (purple) |
| `--color-model-sonnet` | `#58A6FF` | Sonnet 4.6 indicator (blue) |
| `--color-model-haiku` | `#3FB950` | Haiku 4.5 indicator (green) |

### 3.3 Context Meter Zone Colors

| Token | Hex | Zone |
|---|---|---|
| `--color-context-green` | `#3FB950` | 0–60% utilization |
| `--color-context-yellow` | `#D29922` | 60–80% utilization |
| `--color-context-red` | `#F85149` | 80–95% utilization |
| `--color-context-critical` | `#FF4040` | 95%+ utilization (pulsing) |

### 3.4 Diff Colors

| Token | Hex | Usage |
|---|---|---|
| `--color-diff-add-bg` | `#1B3A28` | Added line background |
| `--color-diff-add-text` | `#3FB950` | Added line text highlight |
| `--color-diff-remove-bg` | `#3D1A1E` | Removed line background |
| `--color-diff-remove-text` | `#F85149` | Removed line text highlight |
| `--color-diff-modify-bg` | `#2A2112` | Modified line background |

### 3.5 Light Theme (Future)

Light theme will invert the palette. Not in scope for Phase 1–2 but token names are theme-agnostic to support it. When implemented, toggle via `[data-theme="light"]` on `<html>`.

---

## 4. Typography

### 4.1 Font Stacks

| Token | Stack | Usage |
|---|---|---|
| `--font-ui` | `-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif` | All UI text |
| `--font-mono` | `"JetBrains Mono", "Fira Code", "Cascadia Code", "SF Mono", Menlo, Consolas, monospace` | Code, terminal, diffs, token counts |

**Bundled font:** JetBrains Mono (Regular, Medium, Bold) — included in the app binary for consistent cross-platform rendering.

### 4.2 Type Scale

Based on a 4px grid. All sizes in px (rendered at device pixel ratio).

| Token | Size | Weight | Line Height | Usage |
|---|---|---|---|---|
| `--text-xs` | 11px | 400 | 16px | Badges, micro labels |
| `--text-sm` | 12px | 400 | 16px | Secondary labels, timestamps, hints |
| `--text-base` | 13px | 400 | 20px | Body text, messages, descriptions |
| `--text-md` | 14px | 500 | 20px | Input text, button labels |
| `--text-lg` | 15px | 500 | 24px | Message content (conversation) |
| `--text-xl` | 16px | 600 | 24px | Panel titles, section headings |
| `--text-2xl` | 20px | 600 | 28px | Page titles |
| `--text-code` | 13px | 400 | 20px | Inline code (uses `--font-mono`) |
| `--text-terminal` | 14px | 400 | 20px | Terminal text (uses `--font-mono`) |

### 4.3 Typography Rules

- **No bold in body text** unless it's a label or heading. Use `--color-text-primary` vs `--color-text-secondary` for emphasis.
- **Code blocks** use `--text-code` with `--font-mono` and `--color-bg-inset` background.
- **Monospace numbers** in cost displays and token counts for alignment.
- **Truncation:** Use `text-overflow: ellipsis` with `title` attribute for full text on hover. Never wrap sidebar items or agent card titles.

---

## 5. Spacing System

Based on a 4px grid. All spacing uses these tokens.

| Token | Value | Common Usage |
|---|---|---|
| `--space-0` | 0px | Flush elements |
| `--space-1` | 4px | Tight spacing (between badge and text) |
| `--space-2` | 8px | Standard inner padding, gap between inline items |
| `--space-3` | 12px | Panel padding, card padding |
| `--space-4` | 16px | Section spacing, between cards |
| `--space-5` | 20px | Major section breaks |
| `--space-6` | 24px | Panel margins |
| `--space-8` | 32px | Page-level margins |
| `--space-10` | 40px | Large separations |
| `--space-12` | 48px | Layout gutters |

### 5.1 Layout Constants

| Token | Value | Usage |
|---|---|---|
| `--sidebar-width` | 240px | Left sidebar (project nav) |
| `--sidebar-collapsed` | 48px | Collapsed sidebar (icons only) |
| `--details-panel-width` | 280px | Right details panel (context, MCP, cost) |
| `--status-bar-height` | 32px | Bottom status bar |
| `--title-bar-height` | 40px | Top title bar |
| `--input-area-min-height` | 80px | Message input area minimum |
| `--agent-card-min-height` | 120px | Agent card in dashboard |

---

## 6. Borders and Radius

| Token | Value | Usage |
|---|---|---|
| `--radius-sm` | 4px | Badges, small buttons, tags |
| `--radius-md` | 6px | Cards, input fields, buttons |
| `--radius-lg` | 8px | Modals, panels, dropdowns |
| `--radius-full` | 9999px | Pills, avatars, circular indicators |
| `--border-width` | 1px | Standard borders |

---

## 7. Shadows and Elevation

Minimal shadows — rely on background color differences for elevation.

| Token | Value | Usage |
|---|---|---|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.3)` | Dropdowns, tooltips |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.4)` | Modals, command palette |
| `--shadow-lg` | `0 8px 24px rgba(0,0,0,0.5)` | HUD overlay |

---

## 8. Animation

| Token | Value | Usage |
|---|---|---|
| `--duration-fast` | 100ms | Hover states, color transitions |
| `--duration-normal` | 150ms | Panel expand/collapse, tab switch |
| `--duration-slow` | 200ms | Modal open/close, sidebar toggle |
| `--easing-default` | `cubic-bezier(0.4, 0, 0.2, 1)` | All transitions |

**Rules:**
- `prefers-reduced-motion: reduce` must disable all transitions.
- No entrance animations. Elements appear instantly.
- No loading spinners longer than 200ms — use skeleton placeholders instead.
- The only animation that may exceed 200ms is the context meter's "critical" zone pulse (1s period).

---

## 9. Iconography

**Icon library:** Lucide Icons (consistent with many developer tools, MIT licensed, tree-shakeable).

**Icon sizes:**

| Token | Size | Usage |
|---|---|---|
| `--icon-xs` | 12px | Inline with `--text-xs` |
| `--icon-sm` | 14px | Inline with `--text-sm`, sidebar items |
| `--icon-md` | 16px | Buttons, toolbar items |
| `--icon-lg` | 20px | Panel headers, primary actions |
| `--icon-xl` | 24px | Empty states, onboarding |

**Rules:**
- Icons inherit text color via `currentColor`.
- Always paired with a label (visible or `aria-label`).
- Never decorative-only — every icon communicates state or action.

---

## 10. Component Specifications

Each component below defines its visual API. Implementation details are in the codebase; this spec defines how it must look and behave.

### 10.1 Button

**Variants:**

| Variant | Background | Text | Border | Usage |
|---|---|---|---|---|
| `primary` | `--color-accent` | white | none | Primary actions (Send, Accept All) |
| `secondary` | transparent | `--color-text-primary` | `--color-border-primary` | Secondary actions |
| `ghost` | transparent | `--color-text-secondary` | none | Tertiary actions, toolbar |
| `danger` | `--color-error` | white | none | Destructive actions (Kill Agent) |

**Sizes:** `sm` (28px height), `md` (32px height), `lg` (36px height).

**States:** default, hover (+10% lightness), active (-5% lightness), disabled (50% opacity), focus (2px `--color-border-focus` ring).

**Rules:**
- Minimum touch target: 32px.
- Icon-only buttons must have `aria-label`.
- Loading state: replace content with 14px spinner, maintain button width.

### 10.2 Input Field

**Variants:** `text`, `search` (with magnifying glass icon), `textarea` (auto-expanding).

**Dimensions:** Height 32px (single line), padding `--space-2` horizontal, `--space-1` vertical.

**States:**
- Default: `--color-bg-secondary` background, `--color-border-primary` border.
- Focus: `--color-border-focus` border (2px), subtle `--color-accent-muted` glow.
- Error: `--color-error` border, error message below in `--text-sm` `--color-error`.
- Disabled: 50% opacity, `cursor: not-allowed`.

### 10.3 Badge / Tag

Used for model indicators, status labels, priority markers.

**Structure:** `--radius-sm`, `--text-xs`, `--space-1` padding horizontal, `--space-0` padding vertical.

**Semantic variants:**

| Variant | Background | Text |
|---|---|---|
| `opus` | `--color-model-opus` at 20% | `--color-model-opus` |
| `sonnet` | `--color-model-sonnet` at 20% | `--color-model-sonnet` |
| `haiku` | `--color-model-haiku` at 20% | `--color-model-haiku` |
| `success` | `--color-success-muted` | `--color-success` |
| `warning` | `--color-warning-muted` | `--color-warning` |
| `error` | `--color-error-muted` | `--color-error` |
| `neutral` | `--color-bg-elevated` | `--color-text-secondary` |

### 10.4 Card (Agent Card)

**Structure:**
- Background: `--color-bg-secondary`
- Border: `--color-border-primary`
- Radius: `--radius-lg`
- Padding: `--space-3`
- Min height: `--agent-card-min-height`

**Layout (top to bottom):**
1. Header row: Agent name (text-md, bold) + Model badge + Status indicator (dot)
2. Task description (text-sm, text-secondary, 2-line truncate)
3. Mini terminal preview (3–5 lines, text-code, bg-inset, radius-md)
4. Footer row: Token count + Cost + Elapsed time (text-xs, text-tertiary)

**States:**
- Idle: default border
- Active (thinking/executing): left border 3px in model color
- Complete: left border 3px `--color-success`
- Error: left border 3px `--color-error`

### 10.5 Panel

**Variants:**
- `sidebar` — fixed width, full height, scrollable content
- `details` — fixed width, right side, collapsible sections
- `content` — flexible width, main area

**Structure:**
- Background: `--color-bg-secondary` (sidebar, details) or `--color-bg-primary` (content)
- Border: `--color-border-primary` on the connecting edge
- Header: `--text-xl` title, optional collapse toggle

### 10.6 Modal / Dialog

**Structure:**
- Overlay: `rgba(0, 0, 0, 0.6)`, closes on click
- Container: `--color-bg-elevated`, `--radius-lg`, `--shadow-md`
- Max width: 560px (standard), 720px (wide — diff review)
- Padding: `--space-6`
- Header: `--text-xl`, close button (ghost, top-right)
- Footer: right-aligned buttons, `--space-2` gap

**Permission Dialog (special):**
- Left color stripe matching risk level (success/warning/error)
- Command/path in monospace code block
- "Always allow" checkbox
- Keyboard shortcuts shown: Y (yes), N (no), A (always)

### 10.7 Context Meter

**Type:** Linear gauge (horizontal bar) in the details panel. Also available as a compact pill in the status bar.

**Structure:**
- Track: `--color-bg-inset`, `--radius-full`, height 8px
- Fill: gradient from zone color based on percentage
- Label above: "47.2K / 200K tokens" in `--text-sm` `--font-mono`
- Percentage label: right-aligned, `--text-sm`, bold

**Behavior:**
- Green zone (0–60%): static fill
- Yellow zone (60–80%): static fill
- Red zone (80–95%): static fill
- Critical (95%+): pulse animation (1s), "Compact now" button appears

### 10.8 Cost Tracker

**Status bar variant:** "$2.47" in `--text-sm` `--font-mono`. Click to expand.

**Expanded panel:**
- Session total (large, `--text-xl`, `--font-mono`)
- Breakdown bars: Opus (purple), Sonnet (blue), Haiku (green)
- Last message cost in `--text-sm`
- Budget progress bar (if budget set)
- Budget warning at 80% (yellow flash), 95% (red flash)

### 10.9 Diff Viewer

**Structure:** Three-pane layout (original | diff | result). Toggleable to two-pane (unified diff).

**Line rendering:**
- Line numbers: `--text-sm`, `--font-mono`, `--color-text-tertiary`, right-aligned, 48px column
- Content: `--text-code`, `--font-mono`
- Added lines: `--color-diff-add-bg` background
- Removed lines: `--color-diff-remove-bg` background
- Modified lines: `--color-diff-modify-bg` background

**Hunk controls:** Accept (checkmark, green) and Reject (X, red) buttons on gutter hover. Comment icon for inline comments.

### 10.10 Terminal Pane

**Structure:**
- Background: `--color-bg-inset` (`#010409`)
- Font: `--font-mono` at `--text-terminal` size
- Cursor: block cursor, blinking (respects `prefers-reduced-motion`)
- Scrollbar: thin, `--color-border-primary` track, `--color-text-tertiary` thumb

**Overlay widgets (floating):**
- Semi-transparent (`rgba(13,17,23,0.85)`)
- `--radius-md` corners
- `--space-2` padding
- Always on top within the terminal pane

---

## 11. Responsive Behavior

Chief Wiggum has a minimum window size of **1024 x 640px**. Below that, the app clips rather than reflowing.

| Breakpoint | Behavior |
|---|---|
| >= 1440px | Full three-column layout (sidebar + content + details) |
| 1024–1439px | Sidebar collapsed to icons, details panel toggleable |
| < 1024px | Not supported (clip/scroll) |

**Panel collapse priority:** Details panel collapses first (Cmd+B), then sidebar collapses to icon rail (Cmd+Shift+B).

---

## 12. Accessibility Requirements

- All interactive elements have visible focus indicators (`--color-border-focus`, 2px ring).
- All images and icons have `alt` text or `aria-label`.
- Color is never the only indicator of state (always paired with icon or text).
- Minimum contrast: 4.5:1 for text, 3:1 for interactive elements.
- `prefers-reduced-motion`: all transitions set to 0ms.
- `prefers-color-scheme`: dark is default; light theme future.
- Screen reader: semantic HTML, ARIA roles on custom widgets, live regions for streaming content and status updates.
- Keyboard navigation: all actions reachable, logical tab order, Escape closes modals/dropdowns.

---

## 13. Tailwind Configuration Mapping

The design tokens above must be mapped to TailwindCSS v4. The `tailwind.config.ts` must extend the default theme with Chief Wiggum tokens:

```typescript
// tailwind.config.ts — token mapping (reference, not exhaustive)
export default {
  theme: {
    extend: {
      colors: {
        bg: {
          primary: 'var(--color-bg-primary)',
          secondary: 'var(--color-bg-secondary)',
          elevated: 'var(--color-bg-elevated)',
          inset: 'var(--color-bg-inset)',
        },
        border: {
          primary: 'var(--color-border-primary)',
          secondary: 'var(--color-border-secondary)',
          focus: 'var(--color-border-focus)',
        },
        text: {
          primary: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          tertiary: 'var(--color-text-tertiary)',
          link: 'var(--color-text-link)',
        },
        accent: {
          DEFAULT: 'var(--color-accent)',
          hover: 'var(--color-accent-hover)',
          muted: 'var(--color-accent-muted)',
        },
        model: {
          opus: 'var(--color-model-opus)',
          sonnet: 'var(--color-model-sonnet)',
          haiku: 'var(--color-model-haiku)',
        },
        // ... success, warning, error, diff colors
      },
      fontFamily: {
        ui: 'var(--font-ui)',
        mono: 'var(--font-mono)',
      },
      fontSize: {
        xs: ['11px', { lineHeight: '16px' }],
        sm: ['12px', { lineHeight: '16px' }],
        base: ['13px', { lineHeight: '20px' }],
        md: ['14px', { lineHeight: '20px' }],
        lg: ['15px', { lineHeight: '24px' }],
        xl: ['16px', { lineHeight: '24px' }],
        '2xl': ['20px', { lineHeight: '28px' }],
      },
      spacing: {
        // Maps to --space-N tokens
      },
      borderRadius: {
        sm: '4px',
        md: '6px',
        lg: '8px',
        full: '9999px',
      },
      transitionDuration: {
        fast: '100ms',
        normal: '150ms',
        slow: '200ms',
      },
    },
  },
};
```

---

## 14. Compliance Checklist for Developers

Before submitting a PR that includes UI changes, verify:

- [ ] All colors reference design tokens (no hardcoded hex values)
- [ ] All spacing uses the 4px grid tokens (no arbitrary px values)
- [ ] All text uses the type scale (no custom font sizes)
- [ ] Focus states are visible on all interactive elements
- [ ] `prefers-reduced-motion` is respected (no animations without check)
- [ ] Color is not the sole indicator of any state
- [ ] All icons have `aria-label` or accompanying text
- [ ] Component matches the spec in Section 10 for its type
- [ ] No shadows or elevation beyond what's specified in Section 7
