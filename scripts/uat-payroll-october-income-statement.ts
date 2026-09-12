/**
 * UAT: create + process October payroll, verify GL + income statement (no KPI duplicate JEs).
 *
 *   npx ts-node --transpile-only -r dotenv/config scripts/uat-payroll-october-income-statement.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

const prisma = new PrismaClient();
const BASE = process.env.API_BASE_URL || `http://127.0.0.1:${process.env.PORT || "3007"}`;
const EMAIL = process.env.TEST_ADMIN_EMAIL || "admin@nts.com";
const PASSWORD = process.env.TEST_ADMIN_PASSWORD || "admin123";

/** October 2025 pay period (adjust if overlap exists). */
const PERIOD_YEAR = Number(process.env.UAT_PAYROLL_YEAR || "2025");
const PERIOD_MONTH = Number(process.env.UAT_PAYROLL_MONTH || "10"); // October
const PERIOD_KEY = `${PERIOD_YEAR}-${String(PERIOD_MONTH).padStart(2, "0")}`;

let failures = 0;
function fail(msg: string) {
  failures++;
  console.error(`❌ FAIL: ${msg}`);
}
function ok(msg: string) {
  console.log(`✅ ${msg}`);
}

async function api(method: string, path: string, token?: string, body?: object) {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

async function count5030ForMonth(periodKey: string): Promise<{ net: number; payrollRefs: number; kpiAchievement: number }> {
  const [y, m] = periodKey.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));

  const acct5030 = await prisma.chartOfAccounts.findFirst({
    where: { accountNo: "5030", isActive: true },
    select: { id: true },
  });
  if (!acct5030) return { net: 0, payrollRefs: 0, kpiAchievement: 0 };

  const lines = await prisma.journalEntryLine.findMany({
    where: {
      chartOfAccountId: acct5030.id,
      journalEntry: {
        status: "POSTED",
        transactionDate: { gte: start, lte: end },
        referenceNumber: { not: { startsWith: "VR-" } },
      },
    },
    include: {
      journalEntry: { select: { referenceNumber: true, description: true } },
    },
  });

  let net = 0;
  let payrollRefs = 0;
  let kpiAchievement = 0;
  const payrollRefSet = new Set<string>();

  for (const line of lines) {
    const debit = Number(line.debitAmount || 0);
    const credit = Number(line.creditAmount || 0);
    net += debit - credit;
    const ref = line.journalEntry.referenceNumber || "";
    const desc = line.journalEntry.description || "";
    if (ref.startsWith("PAYROLL-")) payrollRefSet.add(ref);
    if (desc.includes("KPI Achievement")) kpiAchievement += debit - credit;
  }
  payrollRefs = payrollRefSet.size;
  return { net, payrollRefs, kpiAchievement };
}

async function main() {
  console.log(`\n🧪 Payroll + Income Statement UAT (${PERIOD_KEY})\n`);
  console.log(`API: ${BASE}\n`);

  const before5030 = await count5030ForMonth(PERIOD_KEY);
  console.log(`5030 before: net=$${before5030.net.toFixed(2)}, PAYROLL refs=${before5030.payrollRefs}, KPI Achievement net=$${before5030.kpiAchievement.toFixed(2)}\n`);

  const login = await api("POST", "/api/auth/login", undefined, { email: EMAIL, password: PASSWORD });
  if (login.status !== 200 || !(login.json as any)?.token) {
    fail(`Login (${login.status}): ${JSON.stringify(login.json).slice(0, 300)}`);
    process.exit(1);
  }
  const token = (login.json as any).token as string;
  ok(`Logged in as ${EMAIL}`);

  const currency = await prisma.currency.findFirst({
    where: { OR: [{ isDefault: true }, { code: "USD" }], isActive: true },
    orderBy: { isDefault: "desc" },
  });
  if (!currency) {
    fail("No active currency");
    process.exit(1);
  }

  const startDate = new Date(Date.UTC(PERIOD_YEAR, PERIOD_MONTH - 1, 1));
  const endDate = new Date(Date.UTC(PERIOD_YEAR, PERIOD_MONTH, 0));

  const payPeriod = `UAT-${PERIOD_KEY}`;
  const name = `UAT Payroll ${PERIOD_KEY}`;

  const existing = await prisma.payrollRun.findFirst({
    where: {
      payPeriod,
      status: { not: "CANCELLED" },
    },
  });

  let payrollRunId: string;
  if (existing?.status === "COMPLETED") {
    payrollRunId = existing.id;
    console.log(`Using existing COMPLETED run: ${payrollRunId}`);
  } else if (existing) {
    payrollRunId = existing.id;
    console.log(`Using existing ${existing.status} run: ${payrollRunId}`);
  } else {
    const create = await api("POST", "/api/payroll/payroll-runs", token, {
      name,
      payPeriod,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      currencyId: currency.id,
    });
    if (create.status !== 200 && create.status !== 201) {
      fail(`Create payroll (${create.status}): ${JSON.stringify(create.json).slice(0, 400)}`);
      process.exit(1);
    }
    payrollRunId = (create.json as any).data?.id || (create.json as any).id;
    if (!payrollRunId) {
      fail("Create payroll: no id in response");
      process.exit(1);
    }
    ok(`Created payroll run ${payrollRunId}`);
  }

  const runBefore = await prisma.payrollRun.findUnique({
    where: { id: payrollRunId },
    select: { status: true, totalGrossPay: true },
  });

  if (runBefore?.status !== "COMPLETED") {
    const proc = await api("POST", `/api/payroll/payroll-runs/${payrollRunId}/process`, token);
    if (proc.status !== 200) {
      fail(`Process payroll (${proc.status}): ${JSON.stringify(proc.json).slice(0, 500)}`);
    } else {
      ok("Payroll processed via API");
    }
  } else {
    ok("Payroll already COMPLETED — skipped process");
  }

  await new Promise((r) => setTimeout(r, 1500));

  const runAfter = await prisma.payrollRun.findUnique({
    where: { id: payrollRunId },
    include: {
      employeePayrolls: { select: { grossPay: true } },
    },
  });

  if (!runAfter || runAfter.status !== "COMPLETED") {
    fail(`Payroll run status is ${runAfter?.status}, expected COMPLETED`);
  } else {
    ok(`Payroll COMPLETED, gross=${runAfter.totalGrossPay?.toString() ?? "0"}`);
  }

  const grossExpected = runAfter?.totalGrossPay
    ? parseFloat(runAfter.totalGrossPay.toString())
    : 0;

  const payrollJe = await prisma.journalEntry.findFirst({
    where: {
      status: "POSTED",
      referenceNumber: { startsWith: "PAYROLL-" },
      description: { contains: runAfter?.name || name },
    },
    include: {
      journalEntryLines: {
        include: { chartOfAccount: { select: { accountNo: true, accountName: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!payrollJe) {
    const payrollJe2 = await prisma.journalEntry.findFirst({
      where: {
        status: "POSTED",
        referenceNumber: { startsWith: "PAYROLL-" },
        transactionDate: { gte: startDate, lte: endDate },
      },
      include: {
        journalEntryLines: {
          include: { chartOfAccount: { select: { accountNo: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!payrollJe2) fail("No PAYROLL-* journal entry found");
    else {
      ok(`Journal ${payrollJe2.referenceNumber} (by period date)`);
      const line5030 = payrollJe2.journalEntryLines.find((l) => l.chartOfAccount.accountNo === "5030");
      const dr5030 = line5030 ? Number(line5030.debitAmount || 0) : 0;
      if (Math.abs(dr5030 - grossExpected) > 1) {
        fail(`5030 debit ${dr5030} != gross ${grossExpected}`);
      } else {
        ok(`5030 debit matches gross pay ($${dr5030.toFixed(2)})`);
      }
    }
  } else {
    ok(`Journal ${payrollJe.referenceNumber}`);
    const line5030 = payrollJe.journalEntryLines.find((l) => l.chartOfAccount.accountNo === "5030");
    const dr5030 = line5030 ? Number(line5030.debitAmount || 0) : 0;
    if (Math.abs(dr5030 - grossExpected) > 1) {
      fail(`5030 debit ${dr5030} != gross ${grossExpected}`);
    } else {
      ok(`5030 debit matches gross pay ($${dr5030.toFixed(2)})`);
    }
  }

  const kpiJesAfterProcess = await prisma.journalEntry.count({
    where: {
      status: "POSTED",
      transactionDate: { gte: startDate, lte: endDate },
      description: { contains: "KPI Achievement" },
      createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
    },
  });
  if (kpiJesAfterProcess > 0) {
    fail(`${kpiJesAfterProcess} new KPI Achievement JE(s) created in last 5 minutes`);
  } else {
    ok("No new KPI Achievement journals after payroll process");
  }

  const is = await api(
    "GET",
    `/api/accounting/income-statement?periodType=month&periodValue=${PERIOD_KEY}&type=detailed`,
    token
  );
  if (is.status !== 200) {
    fail(`Income statement (${is.status}): ${JSON.stringify(is.json).slice(0, 400)}`);
  } else {
    const data = (is.json as any).data;
    const opExp = data?.sections?.operatingExpenses;
    const accounts: any[] = Array.isArray(opExp?.accounts) ? opExp.accounts : [];
    const row5030 = accounts.find((a) => a?.accountNo === "5030");
    const isAmount = row5030?.netAmount ?? row5030?.amount;
    const isNum = isAmount != null ? Number(isAmount) : NaN;

    if (!Number.isFinite(isNum)) {
      console.log("   (5030 line not found in response shape — checking GL net directly)");
    } else {
      console.log(`   Income statement 5030: $${isNum.toFixed(2)}`);
      const after5030 = await count5030ForMonth(PERIOD_KEY);
      if (Math.abs(isNum - after5030.net) > 2) {
        fail(`IS 5030 (${isNum}) != GL net (${after5030.net})`);
      } else {
        ok("Income statement 5030 matches GL net for month");
      }
      if (after5030.kpiAchievement > 1000) {
        fail(`KPI Achievement still on 5030 in month: $${after5030.kpiAchievement}`);
      } else {
        ok("No material KPI Achievement balance on 5030 this month");
      }
    }
    ok("Income statement API returned 200");
  }

  const after5030 = await count5030ForMonth(PERIOD_KEY);
  console.log(`\n5030 after: net=$${after5030.net.toFixed(2)}, PAYROLL refs=${after5030.payrollRefs}`);

  if (grossExpected > 0 && after5030.net < grossExpected * 0.5) {
    fail(`5030 net (${after5030.net}) seems too low vs payroll gross (${grossExpected})`);
  }

  console.log(`\n${failures === 0 ? "✅ ALL CHECKS PASSED" : `❌ ${failures} CHECK(S) FAILED`}\n`);
  process.exit(failures > 0 ? 1 : 0);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
