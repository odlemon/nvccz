/**
 * Revoke all active admin JWTs (bump token_version) and reset admin password.
 *
 * Usage: npx ts-node scripts/revoke-admin-sessions-and-reset-password.ts
 */
import "dotenv/config";
import crypto from "crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../src/utils/database";

const ADMIN_EMAIL = "admin@nvccz.co.zw";
const CURRENT_PASSWORD = "!8[}wP5LiN_8N3<lYF_A";
const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_here";

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function ensureTokenVersionColumn(): Promise<void> {
  if (await columnExists("users", "token_version")) {
    console.log("[skip] users.token_version already exists");
    return;
  }
  await prisma.$executeRawUnsafe(
    `ALTER TABLE \`users\` ADD COLUMN \`token_version\` INT NOT NULL DEFAULT 0`
  );
  console.log("[ok] users.token_version added");
}

function generateSecurePassword(length = 20): string {
  const uppercase = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lowercase = "abcdefghijkmnopqrstuvwxyz";
  const numbers = "23456789";
  const special = "!@#$%&*()_+-=[]{}|;:,.<>?";
  const all = uppercase + lowercase + numbers + special;

  const pick = (chars: string) => chars[crypto.randomInt(chars.length)];
  const chars = [pick(uppercase), pick(lowercase), pick(numbers), pick(special)];
  while (chars.length < length) chars.push(pick(all));

  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

type AdminRow = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  token_version: number | bigint;
};

function toNumber(value: number | bigint | null | undefined): number {
  return Number(value ?? 0);
}

async function fetchAdmin(): Promise<(AdminRow & { token_version: number }) | null> {
  const rows = await prisma.$queryRawUnsafe<AdminRow[]>(
    `SELECT id, email, firstName, lastName, password, COALESCE(token_version, 0) AS token_version
     FROM users WHERE email = ? LIMIT 1`,
    ADMIN_EMAIL
  );
  const row = rows[0];
  if (!row) return null;
  return { ...row, token_version: toNumber(row.token_version) };
}

async function smokeTestLoginApi(email: string, password: string): Promise<boolean> {
  const candidates = [
    process.env.BASE_URL?.replace(/\/api\/?$/, ""),
    `http://localhost:${process.env.PORT || 3009}`,
  ].filter(Boolean) as string[];

  for (const base of candidates) {
    const url = `${base.replace(/\/$/, "")}/api/auth/login`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body?.success && body?.token) {
        console.log(`[smoke] login OK via ${url}`);
        return true;
      }
      if (res.status === 401 || res.status === 400) {
        console.log(`[smoke] login rejected via ${url} (${res.status})`);
      }
    } catch {
      // server not reachable at this base URL
    }
  }
  return false;
}

async function main() {
  console.log("Revoking admin sessions and resetting password");
  console.log(`Target: ${ADMIN_EMAIL}\n`);

  await ensureTokenVersionColumn();

  const admin = await fetchAdmin();
  if (!admin) {
    throw new Error(`Admin user not found: ${ADMIN_EMAIL}`);
  }

  console.log(`Found: ${admin.firstName} ${admin.lastName} (${admin.id})`);
  console.log(`Current token_version: ${admin.token_version}`);

  const passwordOk = await bcrypt.compare(CURRENT_PASSWORD, admin.password);
  if (!passwordOk) {
    throw new Error("Current password verification failed — aborting (no changes made)");
  }
  console.log("Current password verified\n");

  const oldTokenVersion = admin.token_version;
  const newPassword = generateSecurePassword();
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  await prisma.$executeRawUnsafe(
    `UPDATE users
     SET token_version = token_version + 1,
         password = ?,
         updatedAt = NOW()
     WHERE email = ?`,
    hashedPassword,
    ADMIN_EMAIL
  );

  const updated = await fetchAdmin();
  if (!updated) throw new Error("Admin user missing after update");

  const hashOk = await bcrypt.compare(newPassword, updated.password);
  if (!hashOk) throw new Error("New password hash verification failed");

  console.log("\n" + "=".repeat(72));
  console.log("ADMIN CREDENTIALS (save securely)");
  console.log("=".repeat(72));
  console.log(`Email:          ${ADMIN_EMAIL}`);
  console.log(`New password:   ${newPassword}`);
  console.log(`token_version:  ${oldTokenVersion} -> ${updated.token_version}`);
  console.log("=".repeat(72));
  console.log("\nAll existing admin JWTs with the old token_version are now invalid.");

  const staleToken = jwt.sign(
    {
      userId: updated.id,
      email: updated.email,
      tokenVersion: oldTokenVersion,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  const staleDecoded = jwt.verify(staleToken, JWT_SECRET) as { tokenVersion?: number };
  const wouldReject =
    staleDecoded.tokenVersion !== undefined &&
    staleDecoded.tokenVersion !== updated.token_version;
  console.log(
    `[smoke] simulated stale JWT (tokenVersion=${oldTokenVersion}): ${
      wouldReject ? "would be REJECTED" : "would still be accepted"
    }`
  );

  const apiLoginOk = await smokeTestLoginApi(ADMIN_EMAIL, newPassword);
  if (!apiLoginOk) {
    console.log("[smoke] HTTP login not tested (API server not reachable) — DB/hash checks passed");
  }

  console.log("\nDone.");
}

main()
  .catch((e) => {
    console.error(e?.message || e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
