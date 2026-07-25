export type BrowserSupportStatus = 'fully-supported' | 'supported-with-limitations' | 'unsupported';

export interface BrowserCapabilityResult {
  status: BrowserSupportStatus;
  webgl: boolean;
  webgl2: boolean;
  gamepad: boolean;
  pointerLock: boolean;
  fullscreen: boolean;
  webAudio: boolean;
  indexedDb: boolean;
  localStorage: boolean;
  resizeObserver: boolean;
  limitations: string[];
  blockers: string[];
  summary: string;
}

export function detectBrowserCapabilities(
  win: Window | undefined = typeof window !== 'undefined' ? window : undefined,
): BrowserCapabilityResult {
  if (!win) {
    return {
      status: 'unsupported',
      webgl: false,
      webgl2: false,
      gamepad: false,
      pointerLock: false,
      fullscreen: false,
      webAudio: false,
      indexedDb: false,
      localStorage: false,
      resizeObserver: false,
      limitations: [],
      blockers: ['Browser APIs unavailable'],
      summary: 'Unsupported environment',
    };
  }

  const canvas = win.document.createElement('canvas');
  let webgl = false;
  let webgl2 = false;
  try {
    webgl2 = !!canvas.getContext('webgl2');
    webgl = webgl2 || !!canvas.getContext('webgl') || !!canvas.getContext('experimental-webgl');
  } catch {
    webgl = false;
  }

  const gamepad = typeof navigator !== 'undefined' && 'getGamepads' in navigator;
  const pointerLock = 'pointerLockElement' in win.document;
  const fullscreen =
    'requestFullscreen' in win.document.documentElement ||
    'webkitRequestFullscreen' in win.document.documentElement;
  const webAudio =
    typeof (win as Window & { AudioContext?: unknown }).AudioContext !== 'undefined' ||
    typeof (win as Window & { webkitAudioContext?: unknown }).webkitAudioContext !==
      'undefined';
  const indexedDb = typeof win.indexedDB !== 'undefined';
  let localStorageOk = false;
  try {
    const key = '__fpv_cap_test__';
    win.localStorage.setItem(key, '1');
    win.localStorage.removeItem(key);
    localStorageOk = true;
  } catch {
    localStorageOk = false;
  }
  const resizeObserver =
    typeof (win as Window & { ResizeObserver?: unknown }).ResizeObserver !== 'undefined';

  const limitations: string[] = [];
  const blockers: string[] = [];

  if (!webgl) blockers.push('WebGL is required to fly.');
  if (!localStorageOk) limitations.push('Settings may not persist between visits.');
  if (!gamepad) limitations.push('Gamepad API unavailable — keyboard controls only.');
  if (!webAudio) limitations.push('Audio may be unavailable.');
  if (!fullscreen) limitations.push('Fullscreen is unavailable.');
  if (!pointerLock) limitations.push('Pointer lock is unavailable.');
  if (!indexedDb) limitations.push('Large local replays may not be stored.');
  if (!webgl2 && webgl) limitations.push('WebGL 2 unavailable — some effects reduced.');

  let status: BrowserSupportStatus = 'fully-supported';
  if (blockers.length) status = 'unsupported';
  else if (limitations.length) status = 'supported-with-limitations';

  return {
    status,
    webgl,
    webgl2,
    gamepad,
    pointerLock,
    fullscreen,
    webAudio,
    indexedDb,
    localStorage: localStorageOk,
    resizeObserver,
    limitations,
    blockers,
    summary:
      status === 'fully-supported'
        ? 'Fully supported'
        : status === 'supported-with-limitations'
          ? `Supported with limitations: ${limitations.join(' ')}`
          : blockers.join(' '),
  };
}
