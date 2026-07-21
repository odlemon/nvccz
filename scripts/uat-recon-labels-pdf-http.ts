/**
 * BA-R7 display labels + BA-R8 statement PDF download.
 * Usage: npm run uat:investments-v2:recon-labels-pdf
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { assertDevDatabase } from "./lib/assert-dev-database";
import { api, BASE, login, log } from "./lib/investments-v2-uat-helpers";

const prisma = new PrismaClient() as any;
const OPS = "/investment-ops";

function isOpaqueId(v: unknown): boolean {
  return /^c[a-z0-9]{20,}$/i.test(String(v || "").trim());
}

function dataOf(r: { json: any }) {
  return r.json?.data ?? r.json;
}

async function main() {
  await assertDevDatabase(prisma);
  const token = await login();
  let failed = 0;

  // ── BA-R7 exceptions ────────────────────────────────────────────────────
  const exc = await api("GET", `${OPS}/cash-exceptions?pageSize=10`, token);
  const excAlias = await api("GET", `${OPS}/reconciliation-exceptions?pageSize=10`, token);
  const excItems = dataOf(exc)?.items || dataOf(exc)?.data || [];
  const aliasItems = dataOf(excAlias)?.items || [];
  const sample = excItems[0];
  const labelsOk =
    sample &&
    sample.cashAccountId &&
    (sample.accountNumber == null || !isOpaqueId(sample.accountNumber)) &&
    (sample.cashAccountLabel == null || !isOpaqueId(sample.cashAccountLabel)) &&
    (sample.clientName == null || !isOpaqueId(sample.clientName)) &&
    ("accountNumberMasked" in sample || "cashAccountLabel" in sample);
  log(
    "BA-R7 exceptions labels",
    Boolean(labelsOk || (!excItems.length && exc.status === 200)),
    sample
      ? `accountNumber=${sample.accountNumber} label=${sample.cashAccountLabel} client=${sample.clientName}`
      : `empty list status=${exc.status} aliasCount=${aliasItems.length}`
  );
  if (!(labelsOk || (!excItems.length && exc.status === 200))) failed++;

  // ── BA-R7 ledger ────────────────────────────────────────────────────────
  const led = await api("GET", `${OPS}/cash-ledger?pageSize=10&view=LINES`, token);
  const ledItems = dataOf(led)?.items || [];
  const ledSample = ledItems[0];
  const ledOk =
    !ledItems.length ||
    ((ledSample.cashAccountName == null || !isOpaqueId(ledSample.cashAccountName)) &&
      (ledSample.clientName == null || !isOpaqueId(ledSample.clientName)) &&
      ("fundName" in ledSample || "fundId" in ledSample));
  log(
    "BA-R7 ledger labels",
    Boolean(led.status === 200 && ledOk),
    ledSample
      ? `acct=${ledSample.cashAccountName} client=${ledSample.clientName} fund=${ledSample.fundName}`
      : `empty status=${led.status}`
  );
  if (!(led.status === 200 && ledOk)) failed++;

  // ── BA-R7 statements ────────────────────────────────────────────────────
  const stmts = await api("GET", `${OPS}/client-statements?pageSize=10`, token);
  const stmtItems = dataOf(stmts)?.items || [];
  const stmtSample = stmtItems[0];
  const stmtOk =
    !stmtItems.length ||
    ("generatedByName" in stmtSample &&
      "approvedByName" in stmtSample &&
      (stmtSample.generatedByName == null || !isOpaqueId(stmtSample.generatedByName)));
  log(
    "BA-R7 statement names",
    Boolean(stmts.status === 200 && stmtOk),
    stmtSample
      ? `generatedBy=${stmtSample.generatedByName} approvedBy=${stmtSample.approvedByName}`
      : `empty status=${stmts.status}`
  );
  if (!(stmts.status === 200 && stmtOk)) failed++;

  // ── BA-R8 PDF binary ────────────────────────────────────────────────────
  let pdfOk = false;
  let pdfDetail = "no statement to download";
  let statementId = stmtSample?.id as string | undefined;

  if (!statementId) {
    const accounts = await api("GET", `${OPS}/client-cash-accounts?pageSize=1`, token);
    const acct = (dataOf(accounts)?.items || [])[0];
    if (acct?.id) {
      const gen = await api(
        "POST",
        `${OPS}/client-statements/generate`,
        token,
        {
          cashAccountId: acct.id,
          currency: acct.currency || acct.baseCurrency || "USD",
          periodFrom: "2026-01-01",
          periodTo: "2026-07-21",
          statementType: "CLIENT_CASH",
        },
        { "Idempotency-Key": `uat-stmt-pdf-${Date.now()}` }
      );
      const created = dataOf(gen);
      statementId = created?.id || created?.statements?.[0]?.id;
      if (!statementId) pdfDetail = `generate failed status=${gen.status}`;
    }
  }

  if (statementId) {
    const res = await fetch(`${BASE}${OPS}/client-statements/${statementId}/download`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/pdf",
      },
    });
    const buf = Buffer.from(await res.arrayBuffer());
    const magic = buf.subarray(0, 4).toString("utf8");
    const ctype = res.headers.get("content-type") || "";
    pdfOk = res.status === 200 && ctype.includes("application/pdf") && magic === "%PDF";
    pdfDetail = `id=${statementId} status=${res.status} content-type=${ctype} magic=${JSON.stringify(magic)} bytes=${buf.length}`;

    const jsonDl = await api(
      "GET",
      `${OPS}/client-statements/${statementId}/download`,
      token,
      undefined,
      { Accept: "application/json" }
    );
    const b64 = dataOf(jsonDl)?.contentBase64 || "";
    const jsonPdfOk = b64.startsWith("JVBERi0");
    log("BA-R8 JSON base64 PDF", jsonPdfOk, `prefix=${b64.slice(0, 12)}`);
    if (!jsonPdfOk) failed++;
  }

  log("BA-R8 PDF stream", pdfOk, pdfDetail);
  if (!pdfOk) failed++;

  console.log(failed ? `\nFAILED ${failed} check(s)` : "\nAll recon label/PDF checks passed");
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
