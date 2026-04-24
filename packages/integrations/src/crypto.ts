/**
 * AES-256-GCM helper for encrypting sensitive per-user secrets
 * (OAuth refresh tokens, Apple app-specific passwords).
 *
 * Why AES-GCM:
 *   - Authenticated encryption: tampering is detected, not just decoded to junk.
 *   - 96-bit nonce + 128-bit auth tag — standard safe parameters.
 *   - Node's built-in crypto supports it without pulling in WebCrypto polyfills.
 *
 * Key source: `ENCRYPTION_KEY` env var. Must be 32 bytes of entropy,
 * delivered as hex (64 chars) or base64 (44 chars incl padding). If
 * the env var is missing, callers get a clear "not configured" error
 * instead of silently using a zeroed key — that kind of footgun is
 * exactly what led to the Dropbox 2012 leak.
 *
 * NOT safe for per-row key rotation or large payloads — this is for
 * short secrets (tokens, passwords). For bulk data we'd want a KMS /
 * envelope-encryption pattern, which is a later phase.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12; // 96-bit nonce, standard for GCM
const TAG_LEN = 16;

export class EncryptionNotConfiguredError extends Error {
  constructor() {
    super('ENCRYPTION_KEY env var is not set — refuse to encrypt with a default key');
    this.name = 'EncryptionNotConfiguredError';
  }
}

function loadKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new EncryptionNotConfiguredError();
  // Accept either hex (64 chars) or base64 (44 chars w/ padding)
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  const buf = Buffer.from(raw, 'base64');
  if (buf.length === 32) return buf;
  throw new Error(
    'ENCRYPTION_KEY must be 32 bytes (64 hex chars or 44 base64 chars). Generate with: openssl rand -hex 32',
  );
}

/**
 * Encrypts a UTF-8 plaintext. Returns a single base64 string shaped
 * `IV(12) || TAG(16) || CIPHERTEXT` — convenient to store in a single
 * VARCHAR column without a separate IV column.
 */
export function encryptSecret(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

/** Inverse of encryptSecret. Throws if the ciphertext was tampered with. */
export function decryptSecret(packed: string): string {
  const key = loadKey();
  const buf = Buffer.from(packed, 'base64');
  if (buf.length <= IV_LEN + TAG_LEN) throw new Error('ciphertext too short');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

/** Convenience — true when ENCRYPTION_KEY is present AND the right shape. */
export function isEncryptionConfigured(): boolean {
  try {
    loadKey();
    return true;
  } catch {
    return false;
  }
}
