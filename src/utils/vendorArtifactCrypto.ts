// @ts-nocheck
import crypto from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 16;

function deriveKey(): Buffer {
  const secret = process.env.VENDOR_ARTIFACTS_ENCRYPTION_KEY || process.env.JWT_SECRET || "dev-only-key-change-me";
  return crypto.createHash("sha256").update(String(secret)).digest();
}

export function encryptVendorArtifact(plain: Buffer): {
  ciphertext: Buffer;
  iv: string;
  authTag: string;
} {
  const key = deriveKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv, { authTagLength: 16 });
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: enc,
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

export function decryptVendorArtifact(ciphertext: Buffer, ivB64: string, authTagB64: string): Buffer {
  const key = deriveKey();
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const decipher = crypto.createDecipheriv(ALGO, key, iv, { authTagLength: 16 });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
