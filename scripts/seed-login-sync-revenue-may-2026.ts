/**
 * Seed posted accounting revenue for login-sync UAT (May 2026).
 *
 * Creates a USD sales invoice dated in-period, sends it (posts revenue JE), pays it.
 * Does NOT run login sync — log in manually to trigger AccountingGoalSyncService.maybeRunAfterLogin.
 *
 * Usage:
 *   npx ts-node --transpile-only -r dotenv/config scripts/seed-login-sync-revenue-may-2026.ts
 *   AMOUNT=2500 INVOICE_DATE=2026-05-15 npx ts-node --transpile-only -r dotenv/config scripts/seed-login-sync-revenue-may-2026.ts
 *   RESET_LOGIN_SYNC_COOLDOWN=1  — legacy: clears lastLoginSyncAt audit timestamp (sync no longer throttled)
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";
import { InvoiceService } from "../src/services/InvoiceService";
import {
  getPostedPeriodRevenueExpenseNetProfitExcludingPerformance
} from "../src/services/AccountingGlPeriodTotalsService";
import { defaultLoginSyncPeriod } from "../src/services/performanceGoalSyncUtils";

const AMOUNT = Number(process.env.AMOUNT ?? "2500");
const INVOICE_DATE = new Date(
  process.env.INVOICE_DATE ? `${process.env.INVOICE_DATE}T12:00:00.000Z` : "2026-05-15T12:00:00.000Z"
);
const COMPANY_GOAL_ID = process.env.COMPANY_GOAL_ID ?? "cmpjts5fo0001kt6k6qy97pms";
const RESET_COOLDOWN = process.env.RESET_LOGIN_SYNC_COOLDOWN === "1";

function fmt(n: number): string {
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

async function printGlSnapshot(label: string, periodStart: Date, periodEnd: Date) {
  const gl = await getPostedPeriodRevenueExpenseNetProfitExcludingPerformance(periodStart, periodEnd);
  console.log(`\n--- ${label} ---`);
  console.log(`  Period: ${periodStart.toISOString().slice(0, 10)} → ${periodEnd.toISOString().slice(0, 10)}`);
  console.log(`  GL revenue (excl. PERF/KPI journals): $${fmt(gl.revenue)}`);
  console.log(`  GL expenses: $${fmt(gl.totalExpense)}`);
  console.log(`  GL net profit: $${fmt(gl.netProfit)}`);
  return gl;
}

async function main() {
  if (!Number.isFinite(AMOUNT) || AMOUNT <= 0) {
    throw new Error("AMOUNT must be a positive number");
  }

  const loginPeriod = defaultLoginSyncPeriod();
  const goalPeriodStart = new Date("2026-05-01T00:00:00.000Z");
  const goalPeriodEnd = new Date("2026-05-31T23:59:59.999Z");

  console.log("\n=== Login sync revenue seed (May 2026) ===");
  console.log(`Invoice amount: $${fmt(AMOUNT)}`);
  console.log(`Invoice date:   ${INVOICE_DATE.toISOString().slice(0, 10)}`);

  const user =
    (await prisma.user.findUnique({ where: { email: "admin@nts.com" }, select: { id: true, email: true } })) ??
    (await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true, email: true } }));
  const customer = await prisma.customer.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true }
  });
  const usd = await prisma.currency.findFirst({ where: { code: "USD", isActive: true }, select: { id: true } });

  if (!user?.id) throw new Error("No user found");
  if (!customer?.id) throw new Error("No active customer found");
  if (!usd) throw new Error("USD currency not found");

  const companyGoal = await prisma.performanceGoal.findUnique({
    where: { id: COMPANY_GOAL_ID },
    select: {
      id: true,
      title: true,
      currentValue: true,
      targetValue: true,
      progressPercentage: true,
      syncConfig: true,
      kpi: { select: { code: true, name: true } }
    }
  });

  console.log("\nCompany revenue goal (before invoice):");
  if (companyGoal) {
    console.log(`  ${companyGoal.title} (${companyGoal.kpi?.code ?? "?"})`);
    console.log(`  currentValue: ${companyGoal.currentValue} / target ${companyGoal.targetValue}`);
    console.log(`  progress: ${companyGoal.progressPercentage}%`);
  } else {
    console.log(`  Goal ${COMPANY_GOAL_ID} not found — continuing`);
  }

  const glBeforeLogin = await printGlSnapshot("GL before (login sync window)", loginPeriod.periodStart, loginPeriod.periodEnd);
  await printGlSnapshot("GL before (full May goal window)", goalPeriodStart, goalPeriodEnd);

  const tag = `login-sync-uat-${Date.now()}`;
  const created = await InvoiceService.createInvoice({
    customerId: customer.id,
    amount: AMOUNT,
    currencyId: usd.id,
    transactionDate: INVOICE_DATE,
    description: `Login sync UAT revenue — ${tag}`,
    items: [{ description: "Consulting / services (UAT)", quantity: 1, unitPrice: AMOUNT }],
    isTaxable: false,
    createdById: user.id
  });

  console.log(`\n✅ Invoice created (DRAFT): ${created.invoiceNumber ?? created.id}`);

  await InvoiceService.sendInvoice(created.id);
  const afterSend = await prisma.invoice.findUnique({
    where: { id: created.id },
    include: {
      journalEntry: {
        select: {
          id: true,
          referenceNumber: true,
          status: true,
          transactionDate: true,
          totalAmount: true,
          journalEntryLines: {
            include: { chartOfAccount: { select: { accountNo: true, accountName: true, accountType: true } } }
          }
        }
      }
    }
  });

  console.log(`✅ Invoice SENT — revenue JE posted`);
  if (afterSend?.journalEntry) {
    const je = afterSend.journalEntry;
    console.log(`   JE ${je.referenceNumber} status=${je.status} date=${je.transactionDate?.toISOString?.()?.slice(0, 10)} amount=${je.totalAmount}`);
    for (const line of je.journalEntryLines ?? []) {
      const coa = line.chartOfAccount;
      const dr = Number(line.debitAmount);
      const cr = Number(line.creditAmount);
      if (dr > 0 || cr > 0) {
        console.log(`   · ${coa?.accountNo} ${coa?.accountName} (${coa?.accountType}) Dr ${fmt(dr)} Cr ${fmt(cr)}`);
      }
    }
  }

  await InvoiceService.markAsPaid(created.id, { paymentMethod: "BANK" });
  const afterPaid = await prisma.invoice.findUnique({
    where: { id: created.id },
    select: { id: true, invoiceNumber: true, status: true, paymentDate: true }
  });
  console.log(`✅ Invoice PAID — ${afterPaid?.invoiceNumber} status=${afterPaid?.status}`);

  const glAfterLogin = await printGlSnapshot("GL after (login sync window)", loginPeriod.periodStart, loginPeriod.periodEnd);
  await printGlSnapshot("GL after (full May goal window)", goalPeriodStart, goalPeriodEnd);

  const revenueDelta = glAfterLogin.revenue - glBeforeLogin.revenue;
  console.log(`\n📈 Revenue increase in login window: $${fmt(revenueDelta)} (expected ~$${fmt(AMOUNT)})`);

  if (RESET_COOLDOWN) {
    await prisma.performanceSyncSettings.upsert({
      where: { id: "default" },
      create: { id: "default", lastLoginSyncAt: null },
      update: { lastLoginSyncAt: null }
    });
    console.log("\n📝 Cleared performance_sync_settings.lastLoginSyncAt (audit only; sync runs every login)");
  } else {
    console.log("\nℹ️  KPI login sync runs on every login (no cooldown). Log in to trigger GL → goal merge.");
  }

  console.log("\n=== Ready for manual login test ===");
  console.log("1. Log in via the app (login sync runs in background on auth).");
  console.log(`2. Login sync period: ${loginPeriod.periodStart.toISOString().slice(0, 10)} → ${loginPeriod.periodEnd.toISOString().slice(0, 10)} (current UTC month-to-date).`);
  console.log(`3. Expect TOTAL_REVENUE company goal to merge GL native ~$${fmt(glAfterLogin.revenue)} with existing task progress.`);
  console.log(`4. Invoice: ${afterPaid?.invoiceNumber ?? created.id} ($${fmt(AMOUNT)} on ${INVOICE_DATE.toISOString().slice(0, 10)})`);
  console.log(`5. Verify in accounting: Sales → invoice ${afterPaid?.invoiceNumber ?? created.id}; GL revenue lines for May 2026.`);
}

main()
  .catch((e) => {
    console.error("\n❌ Failed:", e?.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
