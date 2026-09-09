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
