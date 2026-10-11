const KEY = 'emom.mixWithMusic';

export function isIos() {
  const nav = globalThis.navigator;

  if (nav == null) {
    return false;
  }

  const ipadOs = /Macintosh/.test(nav.userAgent ?? '') && nav.maxTouchPoints > 1;

  return /iPad|iPhone|iPod/.test(nav.userAgent ?? '') || ipadOs;
}

export function getMixWithMusic() {
  try {
    const stored = globalThis.localStorage.getItem(KEY);

    if (stored === 'true' || stored === 'false') {
      return stored === 'true';
    }
  } catch {
    // Storage blocked: fall through to the platform default.
  }

  return !isIos();
}

export function setMixWithMusic(value) {
  try {
    globalThis.localStorage.setItem(KEY, value ? 'true' : 'false');
  } catch {
    // Storage blocked: preference lives for this page only.
  }
}
