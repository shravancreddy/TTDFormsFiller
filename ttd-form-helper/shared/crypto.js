// Passphrase-based encryption used for (a) optional at-rest storage encryption
// and (b) optional encrypted backup files.
//
// Scheme: PBKDF2-SHA256 (210,000 iterations, per OWASP 2023 guidance) derives a
// 256-bit AES-GCM key from the user's passphrase + a random 16-byte salt.
// Every encrypted payload carries its own random 12-byte IV. AES-GCM supplies
// authentication, so tampering or a wrong passphrase fails loudly rather than
// yielding garbage.
//
// Everything here runs in the browser's native WebCrypto — no libraries, no
// network, and the passphrase itself is never stored anywhere.

export const KDF_ITERATIONS = 210000;
export const ENC_VERSION = 1;
const VERIFIER_PLAINTEXT = "ttd-form-helper-vault-v1";

// ---------------------------------------------------------------- encoding --
export function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(b64) {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function randomBytes(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

// ------------------------------------------------------------ key handling --
export function newSalt() {
  return bytesToBase64(randomBytes(16));
}

/**
 * Derive an AES-GCM key from a passphrase. `extractable` must be true when the
 * key needs to survive a service-worker restart via chrome.storage.session.
 */
export async function deriveKey(passphrase, saltB64, iterations = KDF_ITERATIONS, extractable = true) {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: base64ToBytes(saltB64), iterations, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    extractable,
    ["encrypt", "decrypt"]
  );
}

export async function exportKey(key) {
  return crypto.subtle.exportKey("jwk", key);
}

export async function importKey(jwk) {
  return crypto.subtle.importKey("jwk", jwk, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

// ------------------------------------------------------- encrypt / decrypt --
/** Encrypt any JSON-serialisable value into a {iv, ct} envelope. */
export async function encryptJson(key, value) {
  const iv = randomBytes(12);
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return { iv: bytesToBase64(iv), ct: bytesToBase64(new Uint8Array(ct)) };
}

/** Reverse of encryptJson. Throws if the key is wrong or data was tampered with. */
export async function decryptJson(key, envelope) {
  const iv = base64ToBytes(envelope.iv);
  const ct = base64ToBytes(envelope.ct);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return JSON.parse(new TextDecoder().decode(plaintext));
}

// ------------------------------------------------------- passphrase verify --
/** Build the metadata blob that lets us later check a passphrase is correct. */
export async function createVerifier(passphrase) {
  const salt = newSalt();
  const key = await deriveKey(passphrase, salt);
  const verifier = await encryptJson(key, VERIFIER_PLAINTEXT);
  return { meta: { v: ENC_VERSION, kdf: "PBKDF2-SHA256", iterations: KDF_ITERATIONS, salt, verifier }, key };
}

/** Returns the derived key when the passphrase matches, otherwise null. */
export async function unlockWithPassphrase(passphrase, meta) {
  if (!meta || !meta.salt || !meta.verifier) return null;
  try {
    const key = await deriveKey(passphrase, meta.salt, meta.iterations || KDF_ITERATIONS);
    const value = await decryptJson(key, meta.verifier);
    return value === VERIFIER_PLAINTEXT ? key : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------ stored value --
export function isEncryptedValue(value) {
  return !!value && typeof value === "object" && value.__tfhEnc === ENC_VERSION && value.iv && value.ct;
}

export async function wrapValue(key, value) {
  const envelope = await encryptJson(key, value);
  return { __tfhEnc: ENC_VERSION, ...envelope };
}

export async function unwrapValue(key, stored) {
  if (!isEncryptedValue(stored)) return stored;
  return decryptJson(key, stored);
}

// ----------------------------------------------------------- backup files ---
export const BACKUP_APP_ID = "ttd-form-helper";

/** Encrypt a whole backup payload into a self-describing file object. */
export async function encryptBackup(payload, passphrase) {
  const salt = newSalt();
  const key = await deriveKey(passphrase, salt, KDF_ITERATIONS, false);
  const { iv, ct } = await encryptJson(key, payload);
  return {
    app: BACKUP_APP_ID,
    encrypted: true,
    v: ENC_VERSION,
    kdf: "PBKDF2-SHA256",
    cipher: "AES-GCM",
    iterations: KDF_ITERATIONS,
    exportedAt: new Date().toISOString(),
    salt,
    iv,
    ct,
  };
}

export function isEncryptedBackup(file) {
  return !!file && file.encrypted === true && !!file.salt && !!file.iv && !!file.ct;
}

/** Throws when the passphrase is wrong or the file was modified. */
export async function decryptBackup(file, passphrase) {
  const key = await deriveKey(passphrase, file.salt, file.iterations || KDF_ITERATIONS, false);
  return decryptJson(key, { iv: file.iv, ct: file.ct });
}

/** Rough guidance shown next to the passphrase box. */
export function passphraseStrength(passphrase) {
  const s = String(passphrase || "");
  if (s.length === 0) return { level: "none", label: "" };
  let score = 0;
  if (s.length >= 8) score++;
  if (s.length >= 12) score++;
  if (s.length >= 16) score++;
  if (/[a-z]/.test(s) && /[A-Z]/.test(s)) score++;
  if (/\d/.test(s)) score++;
  if (/[^A-Za-z0-9]/.test(s)) score++;
  if (s.length < 8) return { level: "weak", label: "Too short — use at least 8 characters" };
  if (score <= 2) return { level: "weak", label: "Weak passphrase" };
  if (score <= 4) return { level: "fair", label: "Fair passphrase" };
  return { level: "strong", label: "Strong passphrase" };
}
