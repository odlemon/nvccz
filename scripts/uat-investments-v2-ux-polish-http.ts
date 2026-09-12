/**
 * HTTP smoke for Investments V2 UX polish enrichments (2026-07-20).
 */
import "dotenv/config";
import { assertDevDatabase } from "./lib/assert-dev-database";
import { api, login, log, summarizeFail } from "./lib/investments-v2-uat-helpers";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient() as any;
const FUND_ID = "cmrdhkyoq003zkt4oo9paby46";
const OPS = "/investment-ops";
const results: Array<{ step: string; ok: boolean; detail: string }> = [];

function record(step: string, ok: boolean, detail: string) {
  results.push({ step, ok, detail });
  log(step, ok, detail);
}

async function main() {
  console.log("\n=== Investments V2 UX polish HTTP smoke ===\n");
  await assertDevDatabase(prisma);
  const token = await login();
  record("login", Boolean(token), "admin@nts.com");

  {
    const r = await api("GET", `${OPS}/portfolios/${FUND_ID}/holdings`, token);
    const rows = Array.isArray(r.json?.data) ? r.json.data : [];
    const hasInstrument = rows.some((h: any) => h.instrument?.symbol);
    record(
      "holdings instrument snapshot",
      r.status === 200 && hasInstrument,
      `rows=${rows.length} withInstrument=${hasInstrument}`
    );
  }

  {
    const r = await api("GET", `${OPS}/portfolios/${FUND_ID}/positions`, token);
    const items = r.json?.data?.items ?? [];
    const hasInstrument = items.some((i: any) => i.instrument?.symbol);
    record(
      "positions instrument snapshot",
      r.status === 200 && (items.length === 0 || hasInstrument),
      `items=${items.length} withInstrument=${hasInstrument}`
    );
  }

  {
    const r = await api("GET", `${OPS}/instruments?pageSize=5`, token);
    const items = r.json?.data?.items ?? [];
    const hasField = items.length === 0 || items.every((i: any) => "createdByName" in i);
    record(
      "instruments createdByName",
      r.status === 200 && hasField,
      `items=${items.length} fieldPresent=${hasField}`
    );
  }

  {
    const r = await api("GET", `${OPS}/portfolios/${FUND_ID}/overview`, token);
    const d = r.json?.data ?? {};
    const ok =
      r.status === 200 &&
      "dividendIncome" in d &&
      "interestIncome" in d &&
      "marginUsed" in d;
    record("overview income KPIs", ok, `div=${d.dividendIncome} int=${d.interestIncome}`);
  }

  {
    const r = await api("GET", `${OPS}/portfolios/${FUND_ID}/exposure`, token);
    const d = r.json?.data ?? {};
    const ok =
      r.status === 200 &&
      Array.isArray(d.bySector) &&
      d.bySector.length > 0 &&
      Array.isArray(d.byCountry);
    record(
      "exposure bySector/byCountry",
      ok,
      `sectors=${d.bySector?.length ?? 0} countries=${d.byCountry?.length ?? 0}`
    );
  }

  {
    const r = await api("GET", `${OPS}/market-data/validation-queue`, token);
    const ticks = Array.isArray(r.json?.data) ? r.json.data : [];
    const ok =
      r.status === 200 &&
      (ticks.length === 0 || ticks.every((t: any) => typeof t.reviewable === "boolean"));
    record("validation-queue reviewable", ok, `ticks=${ticks.length}`);
  }

  {
    const imp = await prisma.spCashStatementImport.findFirst({ orderBy: { createdAt: "desc" } });
    if (!imp) {
      record("import canSubmit flags", false, "no import row");
    } else {
      const r = await api("GET", `${OPS}/external-statements/imports/${imp.id}`, token);
      const d = r.json?.data ?? {};
      const ok =
        r.status === 200 &&
        typeof d.canSubmit === "boolean" &&
        typeof d.canValidate === "boolean" &&
        typeof d.canCommit === "boolean";
      record("import canSubmit flags", ok, `status=${d.status} canSubmit=${d.canSubmit}`);
    }
  }

  summarizeFail(results);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
