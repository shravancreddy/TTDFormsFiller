// Cross-browser namespace shim.
// Chrome/Edge expose `chrome`; Firefox and Safari expose `browser` (and also
// alias `chrome` for most APIs). Preferring `browser` when present keeps the
// promise-based behaviour on Firefox/Safari while staying callback-compatible
// on Chromium, since every call site here uses callbacks.
export const api = globalThis.browser ?? globalThis.chrome;

/** chrome.storage.session is Chrome 102+, Firefox 115+, Safari 16.4+. */
export const hasSessionStorage = !!(api && api.storage && api.storage.session);

export function runtimeId() {
  try {
    return api.runtime && api.runtime.id;
  } catch {
    return null;
  }
}
