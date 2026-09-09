# Collapsible Sidebar (Width Presets) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an icon-rail collapse and two expanded width presets (200 / 256px) to the DataMind AI-BI sidebar, persisted in `localStorage`, with keyboard shortcuts and no drag-resize.

**Architecture:** Pure helpers in `lib/sidebar-layout.ts` own prefs parsing and width math. `useSidebarLayout` hydrates React state, persists, and registers shortcuts. `AppShell` owns the hook once and passes layout props into `Sidebar`, which renders expanded vs icon-rail chrome.

**Tech Stack:** Next.js 15 App Router, React 19 client components, Tailwind CSS, Phosphor icons, `localStorage`, Node `node:test` via `tsx` (same pattern as `apps/api`).

**Spec:** `docs/superpowers/specs/2026-09-09-resizable-sidebar-design.md`

## Global Constraints

- Widths exactly: narrow `200`, default `256`, rail `60` (px).
- Storage key exactly: `datamind.sidebar`; shape `{ collapsed: boolean; width: 'narrow' | 'default' }`.
- Shortcuts: `⌘/Ctrl+B` toggle collapse; `⌘/Ctrl+\` toggle width (expanded only); ignore when focus is in editable / textbox.
- No drag-resize library; no backend prefs; Phosphor `Sidebar` for the collapse control.
- Touch only: new lib + hook + `AppShell` + `Sidebar` (+ web `package.json` test script). Do not redesign session CRUD or nav destinations.

---

## File map

| File | Role |
|------|------|
| Create `apps/web/lib/sidebar-layout.ts` | Constants, types, pure helpers |
| Create `apps/web/lib/sidebar-layout.test.ts` | Unit tests for helpers |
| Create `apps/web/hooks/useSidebarLayout.ts` | State, persistence, keyboard |
| Modify `apps/web/package.json` | Add `"test": "tsx --test lib/**/*.test.ts"` |
| Modify `apps/web/components/layout/AppShell.tsx` | Own hook; pass props |
| Modify `apps/web/components/layout/Sidebar.tsx` | Expanded vs rail UI |

---

### Task 1: Pure sidebar-layout helpers + tests

**Files:**
- Create: `apps/web/lib/sidebar-layout.ts`
- Create: `apps/web/lib/sidebar-layout.test.ts`
- Modify: `apps/web/package.json` (add `test` script; ensure root/`apps/web` can run `tsx` — use workspace root `tsx` via `pnpm exec` from `apps/web`, or add `tsx` as web `devDependency` if `pnpm --filter @ai-bi/web test` cannot resolve it)

**Interfaces:**
- Consumes: nothing
- Produces:
  - `SIDEBAR_STORAGE_KEY = 'datamind.sidebar'`
  - `SIDEBAR_WIDTH = { narrow: 200, default: 256, rail: 60 } as const`
  - `type SidebarWidthPreset = 'narrow' | 'default'`
  - `type SidebarPrefs = { collapsed: boolean; width: SidebarWidthPreset }`
  - `DEFAULT_SIDEBAR_PREFS: SidebarPrefs`
  - `parseSidebarPrefs(raw: string | null): SidebarPrefs`
  - `asideWidthPx(prefs: SidebarPrefs): number`
  - `toggleWidthPreset(width: SidebarWidthPreset): SidebarWidthPreset`
  - `isEditableKeyboardTarget(target: EventTarget | null): boolean`

- [ ] **Step 1: Add test script to `apps/web/package.json`**

Add alongside existing scripts:

```json
"test": "tsx --test lib/**/*.test.ts"
```

If `tsx` is not resolvable from `apps/web`, add `"tsx": "^4.19.0"` under `devDependencies` and run `pnpm install` from the repo root.

- [ ] **Step 2: Write the failing tests**

Create `apps/web/lib/sidebar-layout.test.ts`:

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_SIDEBAR_PREFS,
  SIDEBAR_WIDTH,
  asideWidthPx,
  isEditableKeyboardTarget,
  parseSidebarPrefs,
  toggleWidthPreset,
} from './sidebar-layout';

describe('parseSidebarPrefs', () => {
  it('returns defaults for null / invalid JSON', () => {
    assert.deepEqual(parseSidebarPrefs(null), DEFAULT_SIDEBAR_PREFS);
    assert.deepEqual(parseSidebarPrefs('{'), DEFAULT_SIDEBAR_PREFS);
    assert.deepEqual(parseSidebarPrefs('[]'), DEFAULT_SIDEBAR_PREFS);
  });

  it('accepts valid prefs', () => {
    assert.deepEqual(
      parseSidebarPrefs(JSON.stringify({ collapsed: true, width: 'narrow' })),
      { collapsed: true, width: 'narrow' },
    );
  });

  it('rejects unknown width / non-boolean collapsed', () => {
    assert.deepEqual(
      parseSidebarPrefs(JSON.stringify({ collapsed: true, width: 'wide' })),
      DEFAULT_SIDEBAR_PREFS,
    );
    assert.deepEqual(
      parseSidebarPrefs(JSON.stringify({ collapsed: 'yes', width: 'default' })),
      DEFAULT_SIDEBAR_PREFS,
    );
  });
});

describe('asideWidthPx', () => {
  it('uses rail when collapsed regardless of width preset', () => {
    assert.equal(
      asideWidthPx({ collapsed: true, width: 'default' }),
      SIDEBAR_WIDTH.rail,
    );
    assert.equal(
      asideWidthPx({ collapsed: true, width: 'narrow' }),
      SIDEBAR_WIDTH.rail,
    );
  });

  it('maps presets when expanded', () => {
    assert.equal(
      asideWidthPx({ collapsed: false, width: 'narrow' }),
      SIDEBAR_WIDTH.narrow,
    );
    assert.equal(
      asideWidthPx({ collapsed: false, width: 'default' }),
      SIDEBAR_WIDTH.default,
    );
  });
});

describe('toggleWidthPreset', () => {
  it('flips narrow ↔ default', () => {
    assert.equal(toggleWidthPreset('narrow'), 'default');
    assert.equal(toggleWidthPreset('default'), 'narrow');
  });
});

describe('isEditableKeyboardTarget', () => {
  // No jsdom in apps/web — DOM branches are smoke-tested in Task 3.
  it('returns false for null', () => {
    assert.equal(isEditableKeyboardTarget(null), false);
  });
});
```

- [ ] **Step 3: Run tests — expect FAIL**

```bash
pnpm --filter @ai-bi/web test
```

Expected: FAIL (module not found / cannot resolve `./sidebar-layout`).

- [ ] **Step 4: Implement `apps/web/lib/sidebar-layout.ts`**

```ts
export const SIDEBAR_STORAGE_KEY = 'datamind.sidebar';

export const SIDEBAR_WIDTH = {
  narrow: 200,
  default: 256,
  rail: 60,
} as const;

export type SidebarWidthPreset = 'narrow' | 'default';

export type SidebarPrefs = {
  collapsed: boolean;
  width: SidebarWidthPreset;
};

export const DEFAULT_SIDEBAR_PREFS: SidebarPrefs = {
  collapsed: false,
  width: 'default',
};

function isWidthPreset(value: unknown): value is SidebarWidthPreset {
  return value === 'narrow' || value === 'default';
}

export function parseSidebarPrefs(raw: string | null): SidebarPrefs {
  if (raw == null) return DEFAULT_SIDEBAR_PREFS;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return DEFAULT_SIDEBAR_PREFS;
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.collapsed !== 'boolean') return DEFAULT_SIDEBAR_PREFS;
    if (!isWidthPreset(obj.width)) return DEFAULT_SIDEBAR_PREFS;
    return { collapsed: obj.collapsed, width: obj.width };
  } catch {
    return DEFAULT_SIDEBAR_PREFS;
  }
}

export function asideWidthPx(prefs: SidebarPrefs): number {
  if (prefs.collapsed) return SIDEBAR_WIDTH.rail;
  return SIDEBAR_WIDTH[prefs.width];
}

export function toggleWidthPreset(width: SidebarWidthPreset): SidebarWidthPreset {
  return width === 'narrow' ? 'default' : 'narrow';
}

export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLInputElement) return true;
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  return Boolean(target.closest('[role="textbox"]'));
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
pnpm --filter @ai-bi/web test
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/sidebar-layout.ts apps/web/lib/sidebar-layout.test.ts apps/web/package.json pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(web): add sidebar layout prefs helpers

EOF
)"
```

---

### Task 2: `useSidebarLayout` hook

**Files:**
- Create: `apps/web/hooks/useSidebarLayout.ts`

**Interfaces:**
- Consumes: all exports from `apps/web/lib/sidebar-layout.ts` listed in Task 1
- Produces: `useSidebarLayout(): { collapsed: boolean; width: SidebarWidthPreset; asideWidthPx: number; toggleCollapsed: () => void; toggleWidth: () => void }`

- [ ] **Step 1: Implement the hook**

```ts
'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_SIDEBAR_PREFS,
  SIDEBAR_STORAGE_KEY,
  asideWidthPx as resolveAsideWidthPx,
  isEditableKeyboardTarget,
  parseSidebarPrefs,
  toggleWidthPreset,
  type SidebarPrefs,
  type SidebarWidthPreset,
} from '@/lib/sidebar-layout';

function writePrefs(prefs: SidebarPrefs) {
  try {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore quota / private mode
  }
}

export function useSidebarLayout() {
  const [prefs, setPrefs] = useState<SidebarPrefs>(DEFAULT_SIDEBAR_PREFS);

  useEffect(() => {
    setPrefs(parseSidebarPrefs(localStorage.getItem(SIDEBAR_STORAGE_KEY)));
  }, []);

  const update = useCallback((next: SidebarPrefs) => {
    setPrefs(next);
    writePrefs(next);
  }, []);

  const toggleCollapsed = useCallback(() => {
    setPrefs((prev) => {
      const next = { ...prev, collapsed: !prev.collapsed };
      writePrefs(next);
      return next;
    });
  }, []);

  const toggleWidth = useCallback(() => {
    setPrefs((prev) => {
      if (prev.collapsed) return prev;
      const next = { ...prev, width: toggleWidthPreset(prev.width) };
      writePrefs(next);
      return next;
    });
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isEditableKeyboardTarget(event.target)) return;
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;

      if (event.key === 'b' || event.key === 'B') {
        event.preventDefault();
        toggleCollapsed();
        return;
      }
      if (event.key === '\\') {
        event.preventDefault();
        toggleWidth();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleCollapsed, toggleWidth]);

  return {
    collapsed: prefs.collapsed,
    width: prefs.width as SidebarWidthPreset,
    asideWidthPx: resolveAsideWidthPx(prefs),
    toggleCollapsed,
    toggleWidth,
  };
}
```

Remove unused `update` if present — do not leave dead code.

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @ai-bi/web lint
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/web/hooks/useSidebarLayout.ts
git commit -m "$(cat <<'EOF'
feat(web): add useSidebarLayout hook with shortcuts

EOF
)"
```

---

### Task 3: Wire `AppShell` + collapsible `Sidebar` UI

**Files:**
- Modify: `apps/web/components/layout/AppShell.tsx`
- Modify: `apps/web/components/layout/Sidebar.tsx`

**Interfaces:**
- Consumes: `useSidebarLayout()` return type from Task 2
- Produces: working UI matching the approved spec states

- [ ] **Step 1: Update `AppShell`**

Replace contents of `apps/web/components/layout/AppShell.tsx` with:

```tsx
'use client';

import { useSidebarLayout } from '@/hooks/useSidebarLayout';
import { Sidebar } from './Sidebar';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { collapsed, asideWidthPx, toggleCollapsed } = useSidebarLayout();

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        collapsed={collapsed}
        widthPx={asideWidthPx}
        onToggleCollapsed={toggleCollapsed}
      />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Update `Sidebar` props and shell chrome**

Change `Sidebar` to accept props and apply width + motion. Keep existing session/nav logic.

Key requirements when editing `apps/web/components/layout/Sidebar.tsx`:

1. Props:

```ts
type SidebarProps = {
  collapsed: boolean;
  widthPx: number;
  onToggleCollapsed: () => void;
};
```

2. Root `<aside>`:
   - `id="app-sidebar"`
   - `style={{ width: widthPx }}`
   - classes: `flex h-screen shrink-0 flex-col border-r border-border bg-card overflow-hidden transition-[width] duration-200 ease-out motion-reduce:transition-none` (drop fixed `w-64`)
   - `aria-label="主导航"`

3. Header (both modes):
   - Expanded: brand block + icon button with Phosphor `Sidebar`, `aria-expanded={!collapsed}`, `aria-controls="app-sidebar"`, `aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}`, `title` same as label, focus ring (`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring` or project-equivalent).
   - Collapsed: centered “D” mark (`aria-hidden` if decorative next to expand control) + same toggle button (`aria-label="展开侧边栏"`).

4. New chat:
   - Expanded: existing full-width button with label.
   - Collapsed: icon-only square button, `aria-label="新对话"`, `title="新对话"`.

5. Session `<nav>`: render **only when `!collapsed`** (omit entirely when collapsed).

6. Bottom nav:
   - Expanded: existing icon + text links/buttons.
   - Collapsed: icon-only, centered, each with `aria-label` + `title` matching the Chinese labels (SQL Lab / 我的 Dashboard / 数据源管理 / 退出登录). Keep `aria-hidden="true"` on decorative icons beside visible text in expanded mode.

7. Import `Sidebar as SidebarIcon` from `@phosphor-icons/react` to avoid clashing with the component name.

Illustrative collapsed bottom item pattern:

```tsx
<Link
  href="/lab"
  className={/* icon-centered min-h-11 min-w-11 */}
  title="SQL Lab"
  aria-label="SQL Lab"
>
  <Code size={16} aria-hidden="true" />
</Link>
```

Do not change route paths or delete/create session behavior.

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @ai-bi/web lint
```

Expected: exit 0.

- [ ] **Step 4: Manual smoke (dev server)**

With `pnpm dev` running:

1. Default load → sidebar ~256px, sessions visible.
2. Click collapse → ~60px rail; sessions gone; bottom icons work; tooltip/name present.
3. Expand → restores previous preset width.
4. `⌘/Ctrl+\` while expanded → toggles ~200 ↔ ~256; noop while collapsed.
5. `⌘/Ctrl+B` toggles collapse.
6. Focus chat input, press shortcuts → should **not** toggle (type normally).
7. Refresh → prefs restored from `localStorage` key `datamind.sidebar`.
8. OS reduced-motion → width change is instant (no 200ms tween).

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/layout/AppShell.tsx apps/web/components/layout/Sidebar.tsx
git commit -m "$(cat <<'EOF'
feat(web): collapsible sidebar with narrow/default presets

EOF
)"
```

---

### Task 4: Plan self-check against spec (no new code unless gaps)

**Files:** none unless a gap is found

- [ ] **Step 1: Spec coverage checklist**

Confirm each row is implemented:

| Spec item | Task |
|-----------|------|
| Icon rail ~60px | Task 3 |
| Narrow 200 / default 256 | Task 1–3 |
| `⌘/Ctrl+B`, `⌘/Ctrl+\` | Task 2 |
| Ignore shortcuts in editable fields | Task 2 + Task 3 manual |
| `localStorage` `datamind.sidebar` | Task 1–2 |
| No session list when collapsed | Task 3 |
| Phosphor `Sidebar` toggle + a11y labels | Task 3 |
| Width transition + `motion-reduce` | Task 3 |
| No drag resize | — (not added) |

- [ ] **Step 2: If any gap, fix in a follow-up commit** named `fix(web): sidebar <gap>` — otherwise stop.

---

## Self-review (author)

1. **Spec coverage:** All locked decisions mapped to Task 1–3; mobile drawer explicitly out of scope.
2. **Placeholders:** None intentionally left; Sidebar step uses requirements + patterns instead of a full 130-line paste to avoid drifting from current file — implementer must edit the live `Sidebar.tsx` in place.
3. **Types:** `SidebarPrefs`, `SidebarWidthPreset`, hook return fields, and `SidebarProps` are consistent across tasks.
