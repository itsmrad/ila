import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { env } from "@/config/env";
import { AppError } from "@/lib/errors";

/**
 * Authenticated encryption for user-supplied secrets (BYOK provider keys).
 *
 * AES-256-GCM with a random 96-bit IV per record. The caller supplies an
 * `aad` (additional authenticated data) that binds the ciphertext to its row —
 * a key row copied to another user or provider fails to decrypt instead of
 * silently authorising the wrong owner.
 *
 * The master key lives only in `SECRETS_ENCRYPTION_KEY`. Plaintext secrets exist
 * only inside these two functions' call frames: nothing here logs, serialises,
 * or returns a partial credential.
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const VERSION = "v1";

/** Raised when a secret is handled on a deployment with no encryption key. */
export class SecretsUnavailableError extends AppError {
  constructor() {
    super(
      503,
      "SECRETS_UNAVAILABLE",
      "Storing provider keys is not enabled on this server.",
      { expose: true },
    );
  }
}

function masterKey(): Buffer {
  if (!env.SECRETS_ENCRYPTION_KEY) throw new SecretsUnavailableError();
  return Buffer.from(env.SECRETS_ENCRYPTION_KEY, "base64");
}

/**
 * Encrypt a secret into a self-describing, storable string:
 * `v1.<iv>.<tag>.<ciphertext>` (each segment base64url).
 */
export function encryptSecret(plaintext: string, aad: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, masterKey(), iv, {
    authTagLength: TAG_BYTES,
  });
  cipher.setAAD(Buffer.from(aad, "utf8"));

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return [
    VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

/**
 * Decrypt a value produced by {@link encryptSecret}.
 *
 * Throws on any tampering (wrong AAD, altered ciphertext, truncated or extended
 * record): GCM authentication failure is not recoverable and must never be
 * downgraded to "return the bytes anyway".
 */
export function decryptSecret(record: string, aad: string): string {
  const segments = record.split(".");
  const [version, ivPart, tagPart, dataPart] = segments;
  if (
    segments.length !== 4 ||
    version !== VERSION ||
    !ivPart ||
    !tagPart ||
    !dataPart
  ) {
    throw new Error("Unrecognised secret record format");
  }

  const iv = Buffer.from(ivPart, "base64url");
  const tag = Buffer.from(tagPart, "base64url");
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error("Malformed secret record");
  }

  const decipher = createDecipheriv(ALGORITHM, masterKey(), iv, {
    authTagLength: TAG_BYTES,
  });
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
