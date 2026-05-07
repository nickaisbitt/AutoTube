/**
 * Secure API key storage using the Web Crypto API.
 *
 * Strategy:
 *  - Keys are NEVER written to localStorage in plain text.
 *  - When a PIN is provided: config is encrypted with AES-GCM (key derived via
 *    PBKDF2) and the encrypted blob is stored in localStorage.
 *  - When no PIN is set: config lives in sessionStorage only (cleared on tab close).
 *  - Decrypted keys always live in React state (memory) only.
 *
 * localStorage["autotube_config_v2"] shape (encrypted):
 *   { ciphertext: "<base64>", salt: "<base64>", iv: "<base64>" }
 *
 * sessionStorage["autotube_config_session"] shape (unencrypted, session-only):
 *   { ...AppConfig }
 */

import type { AppConfig } from '../types';

const LS_KEY = 'autotube_config_v2';
const SS_KEY = 'autotube_config_session';

// ─── Base64 helpers ──────────────────────────────────────────────────────────

function bufToB64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function b64ToBuf(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return buf.buffer;
}

// ─── Key derivation ──────────────────────────────────────────────────────────

/**
 * Derives an AES-GCM key from a PIN + random salt using PBKDF2.
 * 200,000 iterations of SHA-256 — strong enough for a local-use tool.
 */
async function deriveKey(pin: string, salt: ArrayBuffer): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 200_000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// ─── Encrypt / decrypt ───────────────────────────────────────────────────────

export interface EncryptedBlob {
  ciphertext: string; // base64
  salt: string;       // base64, 16 bytes
  iv: string;         // base64, 12 bytes
}

/**
 * Encrypts the AppConfig JSON with AES-GCM derived from `pin`.
 * Each call generates a fresh random salt + IV so ciphertexts are never reused.
 */
export async function encryptConfig(config: AppConfig, pin: string): Promise<EncryptedBlob> {
  const salt = crypto.getRandomValues(new Uint8Array(16)).buffer;
  const iv   = crypto.getRandomValues(new Uint8Array(12)).buffer;
  const key  = await deriveKey(pin, salt);

  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(JSON.stringify(config)),
  );

  return {
    ciphertext: bufToB64(ciphertext),
    salt:       bufToB64(salt),
    iv:         bufToB64(iv),
  };
}

/**
 * Decrypts a previously encrypted blob.
 * Throws if the PIN is wrong (AES-GCM authentication failure) or data is corrupt.
 */
export async function decryptConfig(blob: EncryptedBlob, pin: string): Promise<AppConfig> {
  const salt       = b64ToBuf(blob.salt);
  const iv         = b64ToBuf(blob.iv);
  const ciphertext = b64ToBuf(blob.ciphertext);
  const key        = await deriveKey(pin, salt);

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  );

  const dec = new TextDecoder();
  return JSON.parse(dec.decode(plaintext)) as AppConfig;
}

// ─── localStorage (encrypted persistent) ─────────────────────────────────────

/** Returns true if an encrypted config blob exists in localStorage. */
export function hasEncryptedConfig(): boolean {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return typeof parsed?.ciphertext === 'string';
  } catch {
    return false;
  }
}

/** Saves an encrypted blob to localStorage. */
export function saveEncryptedBlob(blob: EncryptedBlob): void {
  localStorage.setItem(LS_KEY, JSON.stringify(blob));
}

/** Loads the raw encrypted blob from localStorage (or null). */
export function loadEncryptedBlob(): EncryptedBlob | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.ciphertext === 'string' &&
      typeof parsed?.salt === 'string' &&
      typeof parsed?.iv === 'string'
    ) {
      return parsed as EncryptedBlob;
    }
    return null;
  } catch {
    return null;
  }
}

/** Removes the encrypted blob from localStorage. */
export function clearEncryptedConfig(): void {
  localStorage.removeItem(LS_KEY);
  // Also wipe the old plain-text key so it doesn't linger
  localStorage.removeItem('autotube_config');
}

// ─── sessionStorage (session-only, no PIN) ────────────────────────────────────

/** Saves config to sessionStorage only (cleared on tab close — no PIN required). */
export function saveConfigToSession(config: AppConfig): void {
  try {
    sessionStorage.setItem(SS_KEY, JSON.stringify(config));
  } catch { /* quota exceeded — silently ignore */ }
}

/** Loads config from sessionStorage, or null if absent / corrupt. */
export function loadConfigFromSession(): AppConfig | null {
  try {
    const raw = sessionStorage.getItem(SS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AppConfig;
  } catch {
    return null;
  }
}

/** Removes session config. */
export function clearSessionConfig(): void {
  sessionStorage.removeItem(SS_KEY);
}

// ─── Convenience: save + encrypt in one call ─────────────────────────────────

/**
 * Encrypts `config` with `pin` and persists the blob to localStorage.
 * Also writes to sessionStorage so the current tab doesn't need to decrypt again.
 */
export async function persistEncryptedConfig(config: AppConfig, pin: string): Promise<void> {
  const blob = await encryptConfig(config, pin);
  saveEncryptedBlob(blob);
  saveConfigToSession(config);
}
