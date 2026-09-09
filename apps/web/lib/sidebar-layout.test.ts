import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_SIDEBAR_PREFS,
  SIDEBAR_WIDTH,
  asideWidthPx,
  isEditableKeyboardTarget,
  parseSidebarPrefs,
  toggleSidebarWidth,
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

describe('toggleSidebarWidth', () => {
  it('is a no-op while collapsed', () => {
    const prefs = { collapsed: true, width: 'narrow' } as const;
    assert.equal(toggleSidebarWidth(prefs), prefs);
  });
});

describe('isEditableKeyboardTarget', () => {
  // No jsdom in apps/web — DOM branches are smoke-tested in Task 3.
  it('returns false for null', () => {
    assert.equal(isEditableKeyboardTarget(null), false);
  });
});
