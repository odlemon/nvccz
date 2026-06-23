/**
 * UAT — LP Portal revocation → 401.
 * Run: npm run uat:lp-portal:revoke
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3009}/api`;
const prisma = new PrismaClient();

async function main() {
  const rel = await prisma.lpUserRelation.findFirst({ where: { isActive: true } });
  if (!rel) {
    console.log("[SKIP] no active lp_user_relations — seed a linked LP first");
    process.exit(0);
  }

  const user = await prisma.user.findUnique({ where: { id: rel.userId } });
  if (!user) process.exit(1);

  const loginRes = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: user.email, password: process.env.UAT_LP_PASSWORD || "changeme" }),
  });
  const loginJson = await loginRes.json();
  const token = loginJson.token;
  if (!token) {
    console.log("[SKIP] cannot login LP user — set UAT_LP_PASSWORD");
    process.exit(0);
  }

  const before = await fetch(`${BASE}/lp-portal/dashboard`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log(`[info] dashboard before revoke: ${before.status}`);

  await prisma.lpUserRelation.update({
    where: { id: rel.id },
    data: { isActive: false, revokedAt: new Date() },
  });
  await prisma.user.update({
    where: { id: rel.userId },
    data: { tokenVersion: { increment: 1 } },
  });

  const after = await fetch(`${BASE}/lp-portal/dashboard`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const ok = after.status === 401;
  console.log(`[${ok ? "PASS" : "FAIL"}] dashboard after revoke: status ${after.status}`);

  await prisma.lpUserRelation.update({
    where: { id: rel.id },
    data: { isActive: true, revokedAt: null },
  });

  process.exit(ok ? 0 : 1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
