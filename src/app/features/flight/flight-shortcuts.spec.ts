import { describe, expect, it } from 'vitest';

import {
  isEditableTarget,
  shouldHandleEscapeAsSettings,
  shouldToggleFullscreenShortcut,
} from './flight-shortcuts';

describe('flight-shortcuts', () => {
  it('ignores KeyF while typing in form controls', () => {
    const input = document.createElement('input');
    expect(
      shouldToggleFullscreenShortcut({
        code: 'KeyF',
        repeat: false,
        target: input,
      }),
    ).toBe(false);

    const textarea = document.createElement('textarea');
    expect(
      shouldToggleFullscreenShortcut({
        code: 'KeyF',
        repeat: false,
        target: textarea,
      }),
    ).toBe(false);

    const select = document.createElement('select');
    expect(
      shouldToggleFullscreenShortcut({
        code: 'KeyF',
        repeat: false,
        target: select,
      }),
    ).toBe(false);

    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    expect(isEditableTarget(editable)).toBe(true);
    expect(
      shouldToggleFullscreenShortcut({
        code: 'KeyF',
        repeat: false,
        target: editable,
      }),
    ).toBe(false);
  });

  it('allows KeyF when not typing', () => {
    expect(
      shouldToggleFullscreenShortcut({
        code: 'KeyF',
        repeat: false,
        target: document.body,
      }),
    ).toBe(true);
  });

  it('ignores repeated KeyF', () => {
    expect(
      shouldToggleFullscreenShortcut({
        code: 'KeyF',
        repeat: true,
        target: document.body,
      }),
    ).toBe(false);
  });

  it('does not treat Escape as Settings while fullscreen', () => {
    expect(shouldHandleEscapeAsSettings(true)).toBe(false);
    expect(shouldHandleEscapeAsSettings(false)).toBe(true);
  });
});
