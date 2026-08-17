// Thin promise wrapper around the extension's local storage area.
// Uses callbacks rather than the promise form so it behaves identically on
// Chrome/Edge (chrome.*) and Firefox/Safari (browser.*).
import { api } from "./browser.js";

export function storageGet(keys) {
  return new Promise((resolve) => {
    api.storage.local.get(keys, (result) => resolve(result || {}));
  });
}

export function storageSet(items) {
  return new Promise((resolve) => {
    api.storage.local.set(items, () => resolve());
  });
}

export function storageRemove(keys) {
  return new Promise((resolve) => {
    api.storage.local.remove(keys, () => resolve());
  });
}

export function storageClear() {
  return new Promise((resolve) => {
    api.storage.local.clear(() => resolve());
  });
}

export const STORAGE_KEYS = {
  pilgrims: "pilgrims",
  contact: "contact",
  vault: "pilgrimVault",
  sets: "pilgrimSets",
  sevakData: "sevakData",
  groupSevaData: "groupSevaData",
  groupVisibleCount: "groupVisibleCount",
  srivaniPeople: "srivaniPeople",
  tabOrder: "tabOrder",
  hiddenTabs: "hiddenTabs",
  theme: "theme",
  locale: "uiLocale",
};

export function uid() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {}
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9);
}
