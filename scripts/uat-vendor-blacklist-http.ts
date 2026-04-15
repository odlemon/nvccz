/**
 * Calls POST .../blacklist and POST .../unblacklist against a running API (default localhost).
 * Uses JWT from createToken(firstUserId) — same secret as the server (.env JWT_SECRET).
 *
 * Run (with `npm run dev` in another terminal):
 *   npx ts-node --transpile-only scripts/uat-vendor-blacklist-http.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { createToken } from "../src/middleware/authenticate";

const prisma = new PrismaClient();
const base = (process.env.APP_BASE_URL || "http://localhost:3008").replace(/\/$/, "");

async function main() {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) throw new Error("No user in DB");

  const vendor =
    (await prisma.vendor.findFirst({
      where: { name: "UAT Vendor Rating Fixture", isActive: true },
    })) ||
    (await prisma.vendor.findFirst({ where: { isActive: true } }));
  if (!vendor) throw new Error("No active vendor in DB");

  const token = createToken(user.id);
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const blUrl = `${base}/api/accounting/vendors/${vendor.id}/blacklist`;
  const blRes = await fetch(blUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ blacklistReason: "UAT automated blacklist endpoint test" }),
  });
  const blJson: any = await blRes.json().catch(() => ({}));
  if (!blRes.ok || !blJson.success || !blJson.data?.isBlacklisted) {
    throw new Error(`Blacklist failed: ${blRes.status} ${JSON.stringify(blJson)}`);
  }
  console.log("OK blacklist:", blRes.status, "isBlacklisted=", blJson.data.isBlacklisted);

  const ubUrl = `${base}/api/accounting/vendors/${vendor.id}/unblacklist`;
  const ubRes = await fetch(ubUrl, { method: "POST", headers });
  const ubJson: any = await ubRes.json().catch(() => ({}));
  if (!ubRes.ok || !ubJson.success || ubJson.data?.isBlacklisted !== false) {
    throw new Error(`Unblacklist failed: ${ubRes.status} ${JSON.stringify(ubJson)}`);
  }
  console.log("OK unblacklist:", ubRes.status, "isBlacklisted=", ubJson.data.isBlacklisted);
  console.log("Vendor blacklist HTTP UAT passed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
