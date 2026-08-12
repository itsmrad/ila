import { expect, test } from "bun:test";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

/** Encryption of user-supplied secrets (BYOK provider keys). */

const AAD = "llmKey:user-1:openai";
const SECRET = "sk-test-0123456789abcdef0123456789";

test("round-trips a secret", () => {
  const record = encryptSecret(SECRET, AAD);

  expect(record).not.toContain(SECRET);
  expect(decryptSecret(record, AAD)).toBe(SECRET);
});

test("uses a fresh IV for every record", () => {
  expect(encryptSecret(SECRET, AAD)).not.toBe(encryptSecret(SECRET, AAD));
});

test("rejects a record decrypted with another user's aad", () => {
  const record = encryptSecret(SECRET, AAD);
  expect(() => decryptSecret(record, "llmKey:user-2:openai")).toThrow();
});

test("rejects a tampered ciphertext", () => {
  const parts = encryptSecret(SECRET, AAD).split(".");
  // Flip one bit of a real ciphertext byte. Editing the last base64 character
  // would not be enough: its trailing bits are padding and decode away.
  const data = Buffer.from(parts[3] ?? "", "base64url");
  data.writeUInt8(data.readUInt8(0) ^ 0x01, 0);
  parts[3] = data.toString("base64url");

  expect(() => decryptSecret(parts.join("."), AAD)).toThrow();
});

test("rejects a tampered auth tag", () => {
  const parts = encryptSecret(SECRET, AAD).split(".");
  const tag = Buffer.from(parts[2] ?? "", "base64url");
  tag.writeUInt8(tag.readUInt8(0) ^ 0x01, 0);
  parts[2] = tag.toString("base64url");

  expect(() => decryptSecret(parts.join("."), AAD)).toThrow();
});

test("rejects an unrecognised record format", () => {
  expect(() => decryptSecret("v2.aaa.bbb.ccc", AAD)).toThrow();
});

test("rejects a valid record with an appended segment", () => {
  const record = encryptSecret(SECRET, AAD);
  expect(() => decryptSecret(`${record}.extra`, AAD)).toThrow();
});
