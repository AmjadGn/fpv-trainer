/** True when keyboard shortcuts must not run (form / editable focus). */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    return true;
  }
  if (target.isContentEditable) {
    return true;
  }
  const attr = target.getAttribute('contenteditable');
  return attr === '' || attr === 'true';
}

/** Whether KeyF should toggle fullscreen for this keydown. */
export function shouldToggleFullscreenShortcut(
  event: Pick<KeyboardEvent, 'code' | 'repeat' | 'target'>,
): boolean {
  if (event.repeat || event.code !== 'KeyF') {
    return false;
  }
  return !isEditableTarget(event.target);
}

/**
 * Escape opens Settings / closes menus only when not fullscreen.
 * Browser Escape-exit of fullscreen takes priority and must not reopen FS
 * or open Settings on the same keypress.
 */
export function shouldHandleEscapeAsSettings(isFullscreen: boolean): boolean {
  return !isFullscreen;
}
