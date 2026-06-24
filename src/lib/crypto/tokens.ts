import "server-only";

import crypto from "node:crypto";

/**
 * Token-at-rest encryption (Option A) — AES-256-GCM, server-only.
 *
 * Connector OAuth/API tokens are encrypted before they are written to
 * integration_connections and decrypted only on the server when used. The key
 * comes from the TOKEN_ENCRYPTION_KEY env var and never appears in code.
 *
 * DUAL-READ (zero-downtime, no data loss):
 *  - encryptToken is a no-op passthrough when the key is unset OR the value is
 *    already encrypted — so connectors keep working before the key is set and
 *    backfill is idempotent.
 *  - decryptToken returns legacy plaintext unchanged (no prefix) and only
 *    decrypts values that carry the versioned prefix.
 *
 * Format: `enc:v1:<base64(iv)>:<base64(authTag)>:<base64(ciphertext)>`
 * (base64 never contains ':', so splitting on ':' is unambiguous).
 */

const PREFIX = "enc:v1:";
const ALGO = "aes-256-gcm";
const IV_BYTES = 12; // GCM standard nonce length

/** Resolve a 32-byte key from TOKEN_ENCRYPTION_KEY (base64 / hex / derived). */
function getKey(): Buffer | null {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) return null;
  // Preferred: 32-byte base64 (e.g. `openssl rand -base64 32`).
  try {
    const b64 = Buffer.from(raw, "base64");
    if (b64.length === 32) return b64;
  } catch {
    /* fall through */
  }
  // Accept 64-char hex.
  if (/^[A-Fa-f0-9]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  // Otherwise derive a deterministic 32-byte key from a sufficiently long secret.
  if (raw.length >= 16) return crypto.createHash("sha256").update(raw, "utf8").digest();
  return null;
}

/** True when a usable TOKEN_ENCRYPTION_KEY is configured. */
export function isTokenEncryptionEnabled(): boolean {
  return getKey() !== null;
}

/** True when a stored value is already in the versioned encrypted format. */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

/**
 * Encrypt a token for storage. No-op passthrough when: value is empty, already
 * encrypted, or the key is unset (keeps connectors working pre-key + makes
 * backfill idempotent).
 */
export function encryptToken(plain: string | null): string | null {
  if (plain == null || plain === "") return plain;
  if (plain.startsWith(PREFIX)) return plain;
  const key = getKey();
  if (!key) return plain;

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return (
    PREFIX +
    [iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(":")
  );
}

/**
 * Decrypt a stored token. Legacy plaintext (no prefix) is returned unchanged
 * (dual-read). Returns null only when an encrypted value cannot be decrypted
 * (missing key or tampered ciphertext) — callers then treat the connector as
 * unavailable rather than leaking ciphertext.
 */
export function decryptToken(value: string | null): string | null {
  if (value == null || value === "") return value;
  if (!value.startsWith(PREFIX)) return value;
  const key = getKey();
  if (!key) {
    console.error(
      "[crypto/tokens] encrypted token found but TOKEN_ENCRYPTION_KEY is not set",
    );
    return null;
  }
  try {
    const parts = value.split(":"); // ["enc","v1",iv,tag,ct]
    if (parts.length !== 5) return null;
    const iv = Buffer.from(parts[2], "base64");
    const tag = Buffer.from(parts[3], "base64");
    const ct = Buffer.from(parts[4], "base64");
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const out = Buffer.concat([decipher.update(ct), decipher.final()]);
    return out.toString("utf8");
  } catch (e) {
    console.error("[crypto/tokens] decrypt failed", e instanceof Error ? e.message : e);
    return null;
  }
}
