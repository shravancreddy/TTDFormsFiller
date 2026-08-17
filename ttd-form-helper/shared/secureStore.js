// Storage facade that adds *optional* at-rest encryption.
//
// Encryption is OFF by default: values are written to chrome.storage.local as
// plain JSON exactly as before. When the user turns it on, every key listed in
// SENSITIVE_KEYS is stored as an AES-GCM envelope instead, and the extension
// needs the passphrase once per browser session to read it back.
//
// The derived key lives in chrome.storage.session (memory-only, wiped when the
// browser closes) so the popup doesn't demand the passphrase on every open.
// It is never written to disk, and the passphrase itself is never stored at all.
import { api, hasSessionStorage } from "./browser.js";
import { storageGet, storageSet, storageRemove } from "./storage.js";
import {
  createVerifier, unlockWithPassphrase, wrapValue, unwrapValue,
  isEncryptedValue, exportKey, importKey,
} from "./crypto.js";

export const ENCRYPTION_META_KEY = "encryptionMeta";
const SESSION_KEY = "vaultKeyJwk";

/** Keys holding personal data. Preferences (theme, locale, tab order) stay plain. */
export const SENSITIVE_KEYS = [
  "pilgrims",
  "contact",
  "pilgrimVault",
  "pilgrimSets",
  "sevakData",
  "groupSevaData",
  "srivaniPeople",
];

let cachedKey = null;

// ------------------------------------------------------------- session key --
function sessionGet(keys) {
  return new Promise((resolve) => {
    if (!hasSessionStorage) return resolve({});
    try {
      api.storage.session.get(keys, (r) => resolve(r || {}));
    } catch {
      resolve({});
    }
  });
}

function sessionSet(items) {
  return new Promise((resolve) => {
    if (!hasSessionStorage) return resolve();
    try {
      api.storage.session.set(items, () => resolve());
    } catch {
      resolve();
    }
  });
}

function sessionRemove(keys) {
  return new Promise((resolve) => {
    if (!hasSessionStorage) return resolve();
    try {
      api.storage.session.remove(keys, () => resolve());
    } catch {
      resolve();
    }
  });
}

async function getSessionKey() {
  if (cachedKey) return cachedKey;
  const stored = await sessionGet([SESSION_KEY]);
  if (!stored[SESSION_KEY]) return null;
  try {
    cachedKey = await importKey(stored[SESSION_KEY]);
    return cachedKey;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------ vault status --
export async function getEncryptionMeta() {
  return (await storageGet([ENCRYPTION_META_KEY]))[ENCRYPTION_META_KEY] || null;
}

export async function getVaultState() {
  const meta = await getEncryptionMeta();
  if (!meta) return { enabled: false, unlocked: true, supported: hasSessionStorage };
  const key = await getSessionKey();
  return { enabled: true, unlocked: !!key, supported: hasSessionStorage };
}

/** Returns true when the passphrase was correct. */
export async function unlockVault(passphrase) {
  const meta = await getEncryptionMeta();
  if (!meta) return true;
  const key = await unlockWithPassphrase(passphrase, meta);
  if (!key) return false;
  cachedKey = key;
  await sessionSet({ [SESSION_KEY]: await exportKey(key) });
  return true;
}

export async function lockVault() {
  cachedKey = null;
  await sessionRemove([SESSION_KEY]);
}

// -------------------------------------------------------------- read/write --
/**
 * Reads keys, transparently decrypting any that are stored encrypted.
 * Throws VAULT_LOCKED when encrypted data is present but the vault is locked.
 */
export async function secureGet(keys) {
  const list = Array.isArray(keys) ? keys : [keys];
  const raw = await storageGet(list);
  const needsKey = Object.values(raw).some(isEncryptedValue);
  if (!needsKey) return raw;

  const key = await getSessionKey();
  if (!key) throw new Error("VAULT_LOCKED");

  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k] = isEncryptedValue(v) ? await unwrapValue(key, v) : v;
  }
  return out;
}

/** Writes items, encrypting the sensitive ones when the vault is enabled. */
export async function secureSet(items) {
  const meta = await getEncryptionMeta();
  if (!meta) return storageSet(items);

  const key = await getSessionKey();
  if (!key) throw new Error("VAULT_LOCKED");

  const out = {};
  for (const [k, v] of Object.entries(items)) {
    out[k] = SENSITIVE_KEYS.includes(k) ? await wrapValue(key, v) : v;
  }
  return storageSet(out);
}

// ------------------------------------------------- enable / disable / change --
/** Turns encryption on and rewrites all existing sensitive data as ciphertext. */
export async function enableEncryption(passphrase) {
  const existing = await getEncryptionMeta();
  if (existing) throw new Error("ALREADY_ENABLED");

  const plain = await storageGet(SENSITIVE_KEYS);
  const { meta, key } = await createVerifier(passphrase);

  const encrypted = {};
  for (const [k, v] of Object.entries(plain)) {
    if (v === undefined || v === null) continue;
    encrypted[k] = await wrapValue(key, v);
  }

  // Write the data first, then the meta: if the browser dies midway the data is
  // still readable (meta absent => treated as plaintext, and the still-plain
  // keys are what we started from).
  await storageSet(encrypted);
  await storageSet({ [ENCRYPTION_META_KEY]: meta });
  cachedKey = key;
  await sessionSet({ [SESSION_KEY]: await exportKey(key) });
}

/** Turns encryption off, writing everything back as plaintext. Vault must be unlocked. */
export async function disableEncryption() {
  const meta = await getEncryptionMeta();
  if (!meta) return;
  const key = await getSessionKey();
  if (!key) throw new Error("VAULT_LOCKED");

  const raw = await storageGet(SENSITIVE_KEYS);
  const plain = {};
  for (const [k, v] of Object.entries(raw)) {
    plain[k] = isEncryptedValue(v) ? await unwrapValue(key, v) : v;
  }

  // Remove the meta first so a crash mid-way leaves readable plaintext rather
  // than data we can no longer prove a passphrase against.
  await storageRemove([ENCRYPTION_META_KEY]);
  await storageSet(plain);
  await lockVault();
}

export async function changePassphrase(currentPassphrase, newPassphrase) {
  const meta = await getEncryptionMeta();
  if (!meta) throw new Error("NOT_ENABLED");
  const oldKey = await unlockWithPassphrase(currentPassphrase, meta);
  if (!oldKey) return false;

  const raw = await storageGet(SENSITIVE_KEYS);
  const plain = {};
  for (const [k, v] of Object.entries(raw)) {
    plain[k] = isEncryptedValue(v) ? await unwrapValue(oldKey, v) : v;
  }

  const { meta: newMeta, key: newKey } = await createVerifier(newPassphrase);
  const reEncrypted = {};
  for (const [k, v] of Object.entries(plain)) {
    if (v === undefined || v === null) continue;
    reEncrypted[k] = await wrapValue(newKey, v);
  }

  await storageSet({ ...reEncrypted, [ENCRYPTION_META_KEY]: newMeta });
  cachedKey = newKey;
  await sessionSet({ [SESSION_KEY]: await exportKey(newKey) });
  return true;
}
