'use client';

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  DEFAULT_SIDEBAR_PREFS,
  SIDEBAR_STORAGE_KEY,
  asideWidthPx as resolveAsideWidthPx,
  isEditableKeyboardTarget,
  parseSidebarPrefs,
  toggleSidebarWidth,
  type SidebarPrefs,
} from '@/lib/sidebar-layout';

function writePrefs(prefs: SidebarPrefs) {
  try {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore quota / private mode
  }
}

type SidebarLayoutContextValue = {
  collapsed: boolean;
  width: SidebarPrefs['width'];
  asideWidthPx: number;
  hydrated: boolean;
  toggleCollapsed: () => void;
  toggleWidth: () => void;
};

const SidebarLayoutContext = createContext<SidebarLayoutContextValue | null>(
  null,
);

export function SidebarLayoutProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<SidebarPrefs>(DEFAULT_SIDEBAR_PREFS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setPrefs(parseSidebarPrefs(localStorage.getItem(SIDEBAR_STORAGE_KEY)));
    const frame = requestAnimationFrame(() => setHydrated(true));
    return () => cancelAnimationFrame(frame);
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
      const next = toggleSidebarWidth(prev);
      if (next === prev) return prev;
      writePrefs(next);
      return next;
    });
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat) return;
      if (isEditableKeyboardTarget(event.target)) return;
      const mod = event.metaKey || event.ctrlKey;
      if (!mod || event.altKey) return;

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

  const value: SidebarLayoutContextValue = {
    collapsed: prefs.collapsed,
    // width/toggleWidth support the keyboard path and future width controls.
    width: prefs.width,
    asideWidthPx: resolveAsideWidthPx(prefs),
    hydrated,
    toggleCollapsed,
    toggleWidth,
  };

  return createElement(SidebarLayoutContext.Provider, { value }, children);
}

export function useSidebarLayout() {
  const context = useContext(SidebarLayoutContext);
  if (context == null) {
    throw new Error(
      'useSidebarLayout must be used within a SidebarLayoutProvider',
    );
  }
  return context;
}
