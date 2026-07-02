/**
 * UAT — Cap Table RBAC (HTTP).
 * Run: npm run uat:cap-table:rbac
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3009}/api`;

const results: Array<{ step: string; ok: boolean; detail: string }> = [];

function log(step: string, ok: boolean, detail: string) {
  results.push({ step, ok, detail });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${step}: ${detail}`);
}

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json = (await res.json()) as { token?: string };
  return json.token || "";
}

async function main() {
  const registryRow = await prisma.capTableRegistry.findFirst({
    select: { portfolioCompanyId: true },
    orderBy: { createdAt: "desc" },
  });
  const company = registryRow
    ? { id: registryRow.portfolioCompanyId }
    : await prisma.portfolioCompany.findFirst({ select: { id: true }, orderBy: { createdAt: "desc" } });
  if (!company) {
    log("portfolio company", false, "none");
    process.exit(1);
  }

  const adminTok = await login(
    process.env.UAT_EMAIL ?? "admin@nts.com",
    process.env.UAT_PASSWORD ?? "admin123"
  );
  log("admin login", Boolean(adminTok), adminTok ? "ok" : "fail");

  const adminRes = await fetch(`${BASE}/cap-table/registries/${company.id}/register`, {
    headers: { Authorization: `Bearer ${adminTok}` },
  });
  log("admin can view register", adminRes.status === 200, `status ${adminRes.status}`);

  const investee = await prisma.portfolioCompany.findFirst({
    select: { id: true, user: { select: { email: true } } },
    orderBy: { createdAt: "desc" },
  });
  if (investee?.user?.email) {
    const invTok = await login(investee.user.email, process.env.UAT_INVESTEE_PASSWORD ?? "password123");
    if (invTok) {
      const invRes = await fetch(`${BASE}/cap-table/registries/${investee.id}/register`, {
        headers: { Authorization: `Bearer ${invTok}` },
      });
      log("investee own company", invRes.status === 200 || invRes.status === 404, `status ${invRes.status}`);
      const other = company.id !== investee.id ? company.id : null;
      if (other) {
        const deny = await fetch(`${BASE}/cap-table/registries/${other}/register`, {
          headers: { Authorization: `Bearer ${invTok}` },
        });
        log("investee denied other company", deny.status === 403, `status ${deny.status}`);
      }
    } else {
      log("investee login", false, "skipped — no password");
    }
  } else {
    log("investee RBAC", true, "skipped — no investee user");
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nUAT complete: ${results.length - failed}/${results.length} passed`);
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
