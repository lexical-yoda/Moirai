import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const PBKDF2_ITERATIONS = 600_000;

export function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, KEY_LENGTH, "sha512");
}

export function hashPassphrase(passphrase: string): string {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const hash = crypto.pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, KEY_LENGTH, "sha512");
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassphrase(passphrase: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  const salt = Buffer.from(saltHex, "hex");
  const hash = crypto.pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, KEY_LENGTH, "sha512");
  // Constant-time comparison to prevent timing attacks
  const expected = Buffer.from(hashHex, "hex");
  if (hash.length !== expected.length) return false;
  return crypto.timingSafeEqual(hash, expected);
}

const ENCRYPTION_VERSION = "v1";

export function encrypt(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: version:iv:tag:ciphertext (all hex)
  return `${ENCRYPTION_VERSION}:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(ciphertext: string, key: Buffer): string {
  const parts = ciphertext.split(":");

  let ivHex: string, tagHex: string, encryptedHex: string;

  if (parts[0] === "v1" && parts.length === 4) {
    // Versioned format: v1:iv:tag:ciphertext
    [, ivHex, tagHex, encryptedHex] = parts;
  } else if (parts.length === 3) {
    // Legacy format: iv:tag:ciphertext
    [ivHex, tagHex, encryptedHex] = parts;
  } else {
    throw new Error("Invalid encrypted data format");
  }

  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function contentHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}
