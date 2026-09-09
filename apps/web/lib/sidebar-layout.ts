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

export function toggleSidebarWidth(prefs: SidebarPrefs): SidebarPrefs {
  if (prefs.collapsed) return prefs;
  return { ...prefs, width: toggleWidthPreset(prefs.width) };
}

export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (target == null) return false;
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLInputElement) return true;
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  return Boolean(target.closest('[role="textbox"]'));
}
