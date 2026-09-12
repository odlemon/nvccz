// @ts-nocheck
import crypto from "crypto";
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import { prisma } from "../../utils/database";
import { LpPortalAdminService } from "./LpPortalAdminService";

const MFA_KEY = process.env.MFA_ENCRYPTION_KEY || process.env.JWT_SECRET || "mfa-dev-key-change-me";

function encryptSecret(secret: string): string {
  const iv = crypto.randomBytes(16);
  const key = crypto.createHash("sha256").update(MFA_KEY).digest();
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const enc = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${enc.toString("hex")}`;
}

function decryptSecret(payload: string): string {
  const [ivHex, encHex] = payload.split(":");
  const key = crypto.createHash("sha256").update(MFA_KEY).digest();
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, Buffer.from(ivHex, "hex"));
  const dec = Buffer.concat([decipher.update(Buffer.from(encHex, "hex")), decipher.final()]);
  return dec.toString("utf8");
}

function hashBackupCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

export class LpPortalMfaService {
  static async getPolicy() {
    return LpPortalAdminService.getMfaPolicy();
  }

  static async userRequiresMfaAtLogin(userId: string): Promise<boolean> {
    const policy = await this.getPolicy();
    if (!policy.requireMfaForLp) return false;
    const rel = await prisma.lpUserRelation.findFirst({ where: { userId, isActive: true } });
    const legacy = await prisma.client.findFirst({ where: { userId, status: "ACTIVE" } });
    if (!rel && !legacy) return false;
    const totp = await prisma.userMfaTotp.findUnique({ where: { userId } });
    return Boolean(totp?.enabledAt);
  }

  static async startEnrollment(userId: string, userEmail: string) {
    const policy = await this.getPolicy();
    const secret = speakeasy.generateSecret({ length: 20, name: userEmail, issuer: policy.issuerName });
    const encryptedSecret = encryptSecret(secret.base32);

    await prisma.userMfaTotp.upsert({
      where: { userId },
      create: { userId, encryptedSecret, enabledAt: null },
      update: { encryptedSecret, enabledAt: null, backupCodes: null },
    });

    const otpauthUrl = secret.otpauth_url!;
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
    return { qrDataUrl, manualEntryKey: secret.base32 };
  }

  static async confirmEnrollment(userId: string, token: string) {
    const row = await prisma.userMfaTotp.findUnique({ where: { userId } });
    if (!row) throw Object.assign(new Error("Enrollment not started"), { statusCode: 400 });
    const secret = decryptSecret(row.encryptedSecret);
    const ok = speakeasy.totp.verify({ secret, encoding: "base32", token, window: 1 });
    if (!ok) throw Object.assign(new Error("Invalid TOTP code"), { statusCode: 400 });

    const backupCodes = Array.from({ length: 8 }, () =>
      crypto.randomBytes(4).toString("hex").toUpperCase()
    );
    const hashed = backupCodes.map((c) => ({ hash: hashBackupCode(c), used: false }));

    await prisma.userMfaTotp.update({
      where: { userId },
      data: { enabledAt: new Date(), backupCodes: hashed },
    });
    return { backupCodes };
  }

  static async verifyTotp(userId: string, token: string): Promise<boolean> {
    const row = await prisma.userMfaTotp.findUnique({ where: { userId } });
    if (!row?.enabledAt) return false;
    const secret = decryptSecret(row.encryptedSecret);
    if (speakeasy.totp.verify({ secret, encoding: "base32", token, window: 1 })) return true;

    const codes = (row.backupCodes as Array<{ hash: string; used: boolean }>) || [];
    const idx = codes.findIndex((c) => !c.used && c.hash === hashBackupCode(token));
    if (idx < 0) return false;
    codes[idx].used = true;
    await prisma.userMfaTotp.update({ where: { userId }, data: { backupCodes: codes } });
    return true;
  }

  static async createPendingToken(userId: string): Promise<string> {
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    await prisma.authMfaPending.deleteMany({ where: { userId } });
    await prisma.authMfaPending.create({ data: { userId, tokenHash, expiresAt } });
    return token;
  }

  static async consumePendingToken(pendingToken: string): Promise<string | null> {
    const tokenHash = crypto.createHash("sha256").update(pendingToken).digest("hex");
    const row = await prisma.authMfaPending.findUnique({ where: { tokenHash } });
    if (!row || row.expiresAt < new Date()) return null;
    await prisma.authMfaPending.delete({ where: { id: row.id } });
    return row.userId;
  }
}
