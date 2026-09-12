/**
 * Test portfolio letterhead for **Vexma Tech** (no DELETE — data kept/merged).
 *
 * 1) Uses Prisma + PortfolioCompanyLetterheadService (same logic as HTTP handlers).
 * 2) Optionally hits HTTP if `RUN_HTTP=1` and API is up (`PORT`, default 3009).
 *
 * Your `.env` may point at an empty DB; for Vexma use the dev DB that contains it, e.g.:
 *   PowerShell:
 *   $env:DATABASE_URL='mysql://nts_user:StrongPass123!@31.220.82.129:3306/nts?ssl-mode=DISABLED'
 *   $env:RUN_HTTP='1'
 *   npx ts-node -r dotenv/config scripts/test-vexma-portfolio-letterhead-http.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import { PortfolioCompanyLetterheadService } from "../src/services/PortfolioCompanyLetterheadService";

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_here";
const PORT = process.env.PORT || "3009";
const BASE = `http://127.0.0.1:${PORT}/api`;
const RUN_HTTP = process.env.RUN_HTTP === "1" || process.env.RUN_HTTP === "true";

function tokenForUser(userId: string) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });
}

async function httpGetPutGet(pcId: string, userId: string) {
  const token = tokenForUser(userId);
  const auth = { Authorization: `Bearer ${token}` };
  const url = `${BASE}/portfolio-companies/${pcId}/letterhead`;

  let res = await fetch(url, { headers: auth });
  console.log(`\n[HTTP] GET ${url} -> ${res.status}`);
  const get1 = await res.json();
  console.log("[HTTP] GET body:", JSON.stringify(get1, null, 2));

  const prev = get1?.data;
  const putBody = {
    legalName: prev?.legalName ?? "Vexma Tech",
    line1: prev?.line1 ?? "4th floor Blue Bridge",
    line2: prev?.line2 ?? "Eastgate Mall",
    city: prev?.city ?? "Harare",
    country: prev?.country ?? "Zimbabwe",
    email: prev?.email ?? "hello@vexma.example",
    phone: prev?.phone ?? "+263 ...",
  };
  res = await fetch(url, {
    method: "PUT",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify(putBody),
  });
  console.log(`[HTTP] PUT ${url} -> ${res.status}`);
  const putJson = await res.json();
  console.log("[HTTP] PUT body:", JSON.stringify(putJson, null, 2));

  res = await fetch(url, { headers: auth });
  console.log(`[HTTP] GET ${url} -> ${res.status}`);
  const get2 = await res.json();
  console.log("[HTTP] GET after PUT:", JSON.stringify(get2, null, 2));

  if (!res.ok || putJson?.success === false) {
    throw new Error("HTTP letterhead request failed (see logs above)");
  }
}

async function main() {
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string; name: string; userId: string }>>(
    "SELECT id, name, userId FROM portfolio_companies WHERE LOWER(name) LIKE LOWER('%vexma%') LIMIT 3"
  );
  if (!rows.length) {
    console.error(
      "No portfolio company matching Vexma in this DATABASE_URL. Point DATABASE_URL at a DB that has Vexma Tech (e.g. nts dev — see script header)."
    );
    process.exitCode = 1;
    return;
  }
  const pc = rows[0];
  console.log(`\n=== Service-layer test (Vexma) ===\nPortfolio: ${pc.name} (${pc.id})\n`);

  await PortfolioCompanyLetterheadService.ensurePortfolioCompanyExists(pc.id);
  const before = await PortfolioCompanyLetterheadService.getByPortfolioCompanyId(pc.id);
  console.log("GET letterhead (service):", JSON.stringify(before, null, 2));

  const merged = {
    legalName: before?.legalName ?? "Vexma Tech",
    line1: before?.line1 ?? "4th floor Blue Bridge",
    line2: before?.line2 ?? "Eastgate Mall",
    city: before?.city ?? "Harare",
    country: before?.country ?? "Zimbabwe",
    email: before?.email ?? "hello@vexma.example",
    phone: before?.phone ?? "+263 ...",
  };
  const saved = await PortfolioCompanyLetterheadService.upsert(pc.id, merged);
  console.log("PUT letterhead (service, merged):", JSON.stringify(saved, null, 2));

  const after = await PortfolioCompanyLetterheadService.getByPortfolioCompanyId(pc.id);
  console.log("GET letterhead after upsert:", JSON.stringify(after, null, 2));

  console.log("\n✅ Service-layer: OK (no DELETE run — data preserved/updated).");

  if (RUN_HTTP) {
    try {
      await httpGetPutGet(pc.id, pc.userId);
      console.log("\n✅ HTTP: OK");
    } catch (e: any) {
      console.error("\n⚠️ HTTP test failed (server not running or wrong PORT/JWT_SECRET?):", e?.message ?? e);
      process.exitCode = 1;
    }
  } else {
    console.log("\n(Skipping HTTP: set RUN_HTTP=1 with API running on PORT to test GET/PUT over the wire.)");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
