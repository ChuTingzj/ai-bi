# Resizable / Collapsible Sidebar — Design Spec

**Date:** 2026-09-09  
**Status:** Approved  
**Product:** DataMind AI-BI (`apps/web`)  
**Approach:** Scheme 1 — collapse toggle + keyboard width presets (no drag resize)

## Problem

The app shell sidebar is fixed at `w-64` (256px). Users need more main-content space for chat/charts without losing access to primary nav. Continuous drag-resize is out of scope; prefer discrete, memorable states.

## Goals

- Collapse the sidebar into an **icon rail** (~60px) that keeps primary actions reachable.
- Support **two expanded widths**: narrow (200px) and default (256px).
- Persist preference in **localStorage**.
- Meet WCAG 2.2 drag alternative by **not** using drag as the only (or any) resize method; keyboard + button are first-class.

## Non-goals

- Continuous drag resize / snap thresholds
- Account-synced preferences (backend)
- Redesigning session list, CRUD, or bottom nav destinations
- Full mobile drawer overhaul (desktop-first; small screens may keep current behavior)

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Collapsed form | Icon rail (~60px) |
| Expanded widths | Narrow 200px + Default 256px |
| Width switching UI | No segmented control; keyboard only (`⌘/Ctrl+\`) |
| Collapse control | Header `Sidebar` icon button + `⌘/Ctrl+B` |
| Persistence | `localStorage` |
| Drag resize | Not implemented |

## Layout & visual states

### Expanded — default (256px)

- Matches current production layout.
- Header: brand title + tagline; collapse button on the right.
- Body: New chat CTA, scrollable session list, bottom nav with icons + labels.

### Expanded — narrow (200px)

- Same structure as default; more truncation on session titles / data-source subtitles.
- Primary content area gains ~56px.

### Collapsed — icon rail (~60px)

- Top: logo mark (“D”) + expand button.
- Middle: New chat as icon-only (+).
- Session list: **not rendered** while collapsed.
- Bottom: SQL Lab / Dashboard / Datasources / Logout as icon-only with tooltips.
- Expand restores previous width preset (`narrow` | `default`).

### Tokens

```ts
const SIDEBAR_WIDTH = {
  narrow: 200,
  default: 256,
  rail: 60,
} as const;
```

Use existing semantic tokens (`bg-card`, `border-border`, `text-muted-foreground`, Phosphor icons). Collapse control icon: Phosphor `Sidebar`.

## Interaction

### State machine

```
                  ⌘/Ctrl+B / button
   ┌──────────────────────────────────────┐
   ▼                                      │
[expanded + width] ─────────────────► [collapsed / rail]
   │                                      │
   │  ⌘/Ctrl+\ (only when expanded)       │
   └── narrow ◄──► default                │
                                          │
                     expand restores last width
```

Persisted shape:

```ts
type SidebarPrefs = {
  collapsed: boolean;
  width: 'narrow' | 'default';
};
```

Storage key: `datamind.sidebar`  
First visit: `{ collapsed: false, width: 'default' }`.

### Controls

- **Collapse / expand button** in sidebar header: toggles `collapsed`; sets `aria-expanded`, `aria-controls` pointing at the sidebar panel id; visible focus ring.
- **Keyboard** (desktop; ignore when focus is in editable field / contenteditable / role=textbox):
  - `⌘/Ctrl+B` → toggle collapsed
  - `⌘/Ctrl+\` → toggle `narrow` ↔ `default` (no-op while collapsed)
- **Icon rail tooltips**: native `title` plus accessible `aria-label` on each icon control (hover and keyboard focus).

### Motion

- Width transition ~200ms `ease-out` on the aside (and shell flex child).
- If `prefers-reduced-motion: reduce`, skip transition (instant width change).

### Small screens

Out of scope for v1 beyond “do not break layout.” Optional later: default to rail below `md`. No requirement to ship a mobile drawer in this change.

## Architecture

### Components / modules

| Unit | Responsibility |
|------|----------------|
| `useSidebarLayout` | Read/write prefs; expose `collapsed`, `width`, `asideWidthPx`, `toggleCollapsed`, `toggleWidth`; register/unregister shortcuts |
| `AppShell` | **Owns** the hook once; applies `asideWidthPx` to the aside slot; passes layout props into `Sidebar` |
| `Sidebar` | Presentational w.r.t. layout: render expanded vs rail from props; host collapse button; omit session list when collapsed |

### Data flow

```
localStorage ←→ useSidebarLayout (in AppShell)
                     ├─► aside width on shell
                     └─► props → Sidebar (collapsed chrome + toggle handler)
```

### SSR / hydration

Client-only prefs: first paint uses defaults (`collapsed: false`, `width: 'default'`), then hydrate from `localStorage` after mount to avoid SSR mismatch. A single-frame flash to the stored width is acceptable for v1.

## Accessibility

- Collapse control has an accessible name (e.g. “收起侧边栏” / “展开侧边栏” based on state).
- Icon-only actions expose `aria-label`.
- Decorative icons beside visible text keep `aria-hidden="true"` (unchanged pattern).
- Keyboard alternatives exist for all width/collapse changes (no drag-only path).
- Focus order remains header → new chat → sessions (expanded) → bottom nav → main.

## Testing

- Prefs survive refresh / new tab (same origin).
- Shortcuts do not fire while typing in chat input or other text fields.
- Bottom nav links work in rail mode with correct accessible names.
- Reduced-motion: no animated width tween.
- Expand after collapse restores the last `width` preset.

## Implementation notes (for plan phase)

- Touch only `AppShell`, `Sidebar`, and a new hook under `apps/web` (e.g. `hooks/useSidebarLayout.ts`).
- Do not add a resize library.
- Keep Phosphor as the icon set.

## Open questions

None — all product choices locked in brainstorming (2026-09-09).
