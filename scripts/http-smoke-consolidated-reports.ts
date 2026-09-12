/**
 * HTTP smoke: login → POST consolidated balance sheet + income statement.
 * Requires API running (e.g. npm run dev) and valid NVCCZ_UAT_* credentials if defaults fail.
 *
 *   npx ts-node --transpile-only -r dotenv/config scripts/http-smoke-consolidated-reports.ts
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";

const port = process.env.PORT || "3000";
const base = (process.env.NVCCZ_BASE_URL || `http://127.0.0.1:${port}`).replace(/\/$/, "");

async function main() {
  const usd =
    (process.env.CONSOLIDATION_CURRENCY_ID?.trim()
      ? await prisma.currency.findUnique({ where: { id: process.env.CONSOLIDATION_CURRENCY_ID.trim() } })
      : null) ?? (await prisma.currency.findFirst({ where: { code: "USD" } }));

  if (!usd) {
    throw new Error("No consolidation currency — set CONSOLIDATION_CURRENCY_ID or seed USD");
  }

  const loginRes = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.NVCCZ_UAT_EMAIL || "admin@nts.com",
      password: process.env.NVCCZ_UAT_PASSWORD || "admin123",
    }),
  });
  const loginJson: any = await loginRes.json().catch(() => ({}));
  if (!loginRes.ok || !loginJson.success || !loginJson.token) {
    throw new Error(`Login failed (${loginRes.status}): ${loginJson.message || loginRes.statusText}`);
  }
  const token = loginJson.token as string;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const bsBody = {
    asOfDate: new Date().toISOString().slice(0, 10),
    consolidationCurrencyId: usd.id,
  };
  const bsRes = await fetch(`${base}/api/accounting/balance-sheet/consolidated`, {
    method: "POST",
    headers,
    body: JSON.stringify(bsBody),
  });
  const bsJson: any = await bsRes.json().catch(() => ({}));

  const isRes = await fetch(
    `${base}/api/accounting/income-statement/consolidated?periodType=month&periodValue=2026-05`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ consolidationCurrencyId: usd.id }),
    }
  );
  const isJson: any = await isRes.json().catch(() => ({}));

  console.log("POST /api/accounting/balance-sheet/consolidated", bsRes.status, bsJson.success === true ? "OK" : "FAIL");
  if (bsJson.success !== true) console.log("  ", bsJson.message || bsJson.error || bsJson);

  console.log(
    "POST /api/accounting/income-statement/consolidated?periodType=month&periodValue=2026-05",
    isRes.status,
    isJson.success === true ? "OK" : "FAIL"
  );
  if (isJson.success !== true) console.log("  ", isJson.message || isJson.error || isJson);

  await prisma.$disconnect();

  if (bsRes.status !== 200 || bsJson.success !== true || isRes.status !== 200 || isJson.success !== true) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
