// Lightweight i18n: reads our own _locales/*/messages.json at runtime so the
// user can switch language from within the popup (chrome.i18n's locale is
// fixed to the browser's UI language and can't be switched on demand).
import { storageGet, storageSet, STORAGE_KEYS } from "./storage.js";
import { api } from "./browser.js";

export const SUPPORTED_LOCALES = ["en", "hi", "kn", "ml", "ta", "te"];
export const LOCALE_LABELS = {
  en: "English", hi: "हिन्दी", kn: "ಕನ್ನಡ", ml: "മലയാളം", ta: "தமிழ்", te: "తెలుగు",
};

const cache = {};
let currentLocale = "en";
let currentMessages = null;

async function loadMessages(locale) {
  if (cache[locale]) return cache[locale];
  const url = api.runtime.getURL(`_locales/${locale}/messages.json`);
  const res = await fetch(url);
  const json = await res.json();
  cache[locale] = json;
  return json;
}

export async function initI18n() {
  const saved = (await storageGet([STORAGE_KEYS.locale]))[STORAGE_KEYS.locale];
  currentLocale = SUPPORTED_LOCALES.includes(saved) ? saved : "en";
  currentMessages = await loadMessages(currentLocale);
  if (currentLocale !== "en") await loadMessages("en");
  return currentLocale;
}

export async function setLocale(locale) {
  if (!SUPPORTED_LOCALES.includes(locale)) return;
  currentLocale = locale;
  currentMessages = await loadMessages(locale);
  await storageSet({ [STORAGE_KEYS.locale]: locale });
}

export function getLocale() {
  return currentLocale;
}

export function t(key, substitutions) {
  const entry = (currentMessages && currentMessages[key]) || (cache.en && cache.en[key]);
  let message = entry ? entry.message : key;
  if (substitutions) {
    for (const [k, v] of Object.entries(substitutions)) {
      message = message.replace(new RegExp(`\\{${k}\\}`, "g"), v);
    }
  }
  return message;
}
