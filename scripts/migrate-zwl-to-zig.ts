/**
 * Remap all references from currency code ZWL → ZIG (Zimbabwean Dollar → Zimbabwean Gold).
 *
 * Why: some environments have both currencies present; the product is standardizing on ZIG.
 *
 * Notes:
 * - This does NOT recalculate amounts or exchange rates; it only changes FK references.
 * - Safe to re-run: updates are conditional on matching the source currency id.
 *
 * Run:
 *   npm run db:migrate:zwl-to-zig
 *
 * Optional:
 *   npm run db:migrate:zwl-to-zig -- --dry-run
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

const prisma = new PrismaClient();

function hasFlag(name: string) {
  return process.argv.slice(2).some((a) => String(a).toLowerCase() === name.toLowerCase());
}

async function main() {
  const dryRun = hasFlag("--dry-run") || hasFlag("-n");

  const [zwl, zig] = await Promise.all([
    prisma.currency.findFirst({ where: { code: "ZWL" }, select: { id: true, code: true, name: true } }),
    prisma.currency.findFirst({ where: { code: "ZIG" }, select: { id: true, code: true, name: true } }),
  ]);

  if (!zwl) {
    console.log("[skip] No currency with code ZWL found.");
    return;
  }
  if (!zig) {
    throw new Error("No currency with code ZIG found. Create ZIG currency first, then re-run.");
  }
  if (zwl.id === zig.id) {
    console.log("[skip] ZWL and ZIG are the same currency id. Nothing to do.");
    return;
  }

  console.log(`Source: ${zwl.code} (${zwl.name}) id=${zwl.id}`);
  console.log(`Target: ${zig.code} (${zig.name}) id=${zig.id}`);
  console.log(`Mode: ${dryRun ? "DRY RUN (no writes)" : "APPLY"}`);

  const countsBefore = {
    journalEntries: await prisma.journalEntry.count({ where: { currencyId: zwl.id } }),
    journalLinesRecorded: await prisma.journalEntryLine.count({ where: { recordedCurrencyId: zwl.id } }),
    cashbookRecorded: await prisma.cashbookEntry.count({ where: { recordedCurrencyId: zwl.id } }),
    banks: await prisma.bank.count({ where: { currencyId: zwl.id } }),
    invoices: await prisma.invoice.count({ where: { currencyId: zwl.id } }),
    invoicesPaymentCurrency: await prisma.invoice.count({ where: { paymentCurrencyId: zwl.id } }),
    purchaseInvoices: await prisma.purchaseInvoice.count({ where: { currencyId: zwl.id } }),
    expenses: await prisma.expense.count({ where: { currencyId: zwl.id } }),
    revenues: await prisma.revenue.count({ where: { currencyId: zwl.id } }),
    procurementInvoices: await prisma.procurementInvoice.count({ where: { currencyId: zwl.id } }),
    creditNotes: await prisma.creditNote.count({ where: { currencyId: zwl.id } }),
    assetsRecorded: await prisma.asset.count({ where: { recordedCurrencyId: zwl.id } }),
    assetDisposalsRecorded: await prisma.assetDisposalRecord.count({ where: { recordedCurrencyId: zwl.id } }),
    depreciationRecorded: await prisma.depreciationRecord.count({ where: { recordedCurrencyId: zwl.id } }),
    payrollRuns: await prisma.payrollRun.count({ where: { currencyId: zwl.id } }),
    employeePayrolls: await prisma.employeePayroll.count({ where: { currencyId: zwl.id } }),
    payslips: await prisma.payslip.count({ where: { currencyId: zwl.id } }),
    exchangeRatesTo: await prisma.exchangeRate.count({ where: { toCurrencyId: zwl.id } }),
    exchangeRatesFrom: await prisma.exchangeRate.count({ where: { fromCurrencyId: zwl.id } }),
    forexTo: await prisma.forexGainLoss.count({ where: { toCurrencyId: zwl.id } }),
    forexFrom: await prisma.forexGainLoss.count({ where: { fromCurrencyId: zwl.id } }),
  };

  console.log("Counts referencing ZWL (before):");
  console.table(countsBefore);

  if (dryRun) return;

  // Avoid long interactive transactions on some Windows setups (P2028). These updates are idempotent.
  const updates = {
    journalEntries:
      countsBefore.journalEntries > 0
        ? await prisma.journalEntry.updateMany({
            where: { currencyId: zwl.id },
            data: { currencyId: zig.id },
          })
        : { count: 0 },
    journalLinesRecorded:
      countsBefore.journalLinesRecorded > 0
        ? await prisma.journalEntryLine.updateMany({
            where: { recordedCurrencyId: zwl.id },
            data: { recordedCurrencyId: zig.id },
          })
        : { count: 0 },
    cashbookRecorded:
      countsBefore.cashbookRecorded > 0
        ? await prisma.cashbookEntry.updateMany({
            where: { recordedCurrencyId: zwl.id },
            data: { recordedCurrencyId: zig.id },
          })
        : { count: 0 },
    banks:
      countsBefore.banks > 0
        ? await prisma.bank.updateMany({
            where: { currencyId: zwl.id },
            data: { currencyId: zig.id },
          })
        : { count: 0 },
    invoices:
      countsBefore.invoices > 0
        ? await prisma.invoice.updateMany({
            where: { currencyId: zwl.id },
            data: { currencyId: zig.id },
          })
        : { count: 0 },
    invoicesPaymentCurrency:
      countsBefore.invoicesPaymentCurrency > 0
        ? await prisma.invoice.updateMany({
            where: { paymentCurrencyId: zwl.id },
            data: { paymentCurrencyId: zig.id },
          })
        : { count: 0 },
    purchaseInvoices:
      countsBefore.purchaseInvoices > 0
        ? await prisma.purchaseInvoice.updateMany({
            where: { currencyId: zwl.id },
            data: { currencyId: zig.id },
          })
        : { count: 0 },
    expenses:
      countsBefore.expenses > 0
        ? await prisma.expense.updateMany({
            where: { currencyId: zwl.id },
            data: { currencyId: zig.id },
          })
        : { count: 0 },
    revenues:
      countsBefore.revenues > 0
        ? await prisma.revenue.updateMany({
            where: { currencyId: zwl.id },
            data: { currencyId: zig.id },
          })
        : { count: 0 },
    procurementInvoices:
      countsBefore.procurementInvoices > 0
        ? await prisma.procurementInvoice.updateMany({
            where: { currencyId: zwl.id },
            data: { currencyId: zig.id },
          })
        : { count: 0 },
    creditNotes:
      countsBefore.creditNotes > 0
        ? await prisma.creditNote.updateMany({
            where: { currencyId: zwl.id },
            data: { currencyId: zig.id },
          })
        : { count: 0 },
    assetsRecorded:
      countsBefore.assetsRecorded > 0
        ? await prisma.asset.updateMany({
            where: { recordedCurrencyId: zwl.id },
            data: { recordedCurrencyId: zig.id },
          })
        : { count: 0 },
    assetDisposalsRecorded:
      countsBefore.assetDisposalsRecorded > 0
        ? await prisma.assetDisposalRecord.updateMany({
            where: { recordedCurrencyId: zwl.id },
            data: { recordedCurrencyId: zig.id },
          })
        : { count: 0 },
    depreciationRecorded:
      countsBefore.depreciationRecorded > 0
        ? await prisma.depreciationRecord.updateMany({
            where: { recordedCurrencyId: zwl.id },
            data: { recordedCurrencyId: zig.id },
          })
        : { count: 0 },
    payrollRuns:
      countsBefore.payrollRuns > 0
        ? await prisma.payrollRun.updateMany({
            where: { currencyId: zwl.id },
            data: { currencyId: zig.id },
          })
        : { count: 0 },
    employeePayrolls:
      countsBefore.employeePayrolls > 0
        ? await prisma.employeePayroll.updateMany({
            where: { currencyId: zwl.id },
            data: { currencyId: zig.id },
          })
        : { count: 0 },
    payslips:
      countsBefore.payslips > 0
        ? await prisma.payslip.updateMany({
            where: { currencyId: zwl.id },
            data: { currencyId: zig.id },
          })
        : { count: 0 },
    exchangeRatesTo:
      countsBefore.exchangeRatesTo > 0
        ? await prisma.exchangeRate.updateMany({
            where: { toCurrencyId: zwl.id },
            data: { toCurrencyId: zig.id },
          })
        : { count: 0 },
    exchangeRatesFrom:
      countsBefore.exchangeRatesFrom > 0
        ? await prisma.exchangeRate.updateMany({
            where: { fromCurrencyId: zwl.id },
            data: { fromCurrencyId: zig.id },
          })
        : { count: 0 },
    forexTo:
      countsBefore.forexTo > 0
        ? await prisma.forexGainLoss.updateMany({
            where: { toCurrencyId: zwl.id },
            data: { toCurrencyId: zig.id },
          })
        : { count: 0 },
    forexFrom:
      countsBefore.forexFrom > 0
        ? await prisma.forexGainLoss.updateMany({
            where: { fromCurrencyId: zwl.id },
            data: { fromCurrencyId: zig.id },
          })
        : { count: 0 },
  };

  const still = {
    journalEntries: await prisma.journalEntry.count({ where: { currencyId: zwl.id } }),
    banks: await prisma.bank.count({ where: { currencyId: zwl.id } }),
  };

  console.log("Updated rows:");
  console.table({
    journalEntries: updates.journalEntries.count,
    journalLinesRecorded: updates.journalLinesRecorded.count,
    cashbookRecorded: updates.cashbookRecorded.count,
    banks: updates.banks.count,
    invoices: updates.invoices.count,
    invoicesPaymentCurrency: updates.invoicesPaymentCurrency.count,
    purchaseInvoices: updates.purchaseInvoices.count,
    expenses: updates.expenses.count,
    revenues: updates.revenues.count,
    procurementInvoices: updates.procurementInvoices.count,
    creditNotes: updates.creditNotes.count,
    assetsRecorded: updates.assetsRecorded.count,
    assetDisposalsRecorded: updates.assetDisposalsRecorded.count,
    depreciationRecorded: updates.depreciationRecorded.count,
    payrollRuns: updates.payrollRuns.count,
    employeePayrolls: updates.employeePayrolls.count,
    payslips: updates.payslips.count,
    exchangeRatesTo: updates.exchangeRatesTo.count,
    exchangeRatesFrom: updates.exchangeRatesFrom.count,
    forexTo: updates.forexTo.count,
    forexFrom: updates.forexFrom.count,
  });

  if (still.journalEntries > 0 || still.banks > 0) {
    console.warn("[warn] Some direct ZWL references remain after update:");
    console.table(still);
  }

  const countsAfter = {
    journalEntries: await prisma.journalEntry.count({ where: { currencyId: zwl.id } }),
    journalLinesRecorded: await prisma.journalEntryLine.count({ where: { recordedCurrencyId: zwl.id } }),
    cashbookRecorded: await prisma.cashbookEntry.count({ where: { recordedCurrencyId: zwl.id } }),
    banks: await prisma.bank.count({ where: { currencyId: zwl.id } }),
    invoices: await prisma.invoice.count({ where: { currencyId: zwl.id } }),
    invoicesPaymentCurrency: await prisma.invoice.count({ where: { paymentCurrencyId: zwl.id } }),
    purchaseInvoices: await prisma.purchaseInvoice.count({ where: { currencyId: zwl.id } }),
    expenses: await prisma.expense.count({ where: { currencyId: zwl.id } }),
    revenues: await prisma.revenue.count({ where: { currencyId: zwl.id } }),
    procurementInvoices: await prisma.procurementInvoice.count({ where: { currencyId: zwl.id } }),
    creditNotes: await prisma.creditNote.count({ where: { currencyId: zwl.id } }),
    assetsRecorded: await prisma.asset.count({ where: { recordedCurrencyId: zwl.id } }),
    assetDisposalsRecorded: await prisma.assetDisposalRecord.count({ where: { recordedCurrencyId: zwl.id } }),
    depreciationRecorded: await prisma.depreciationRecord.count({ where: { recordedCurrencyId: zwl.id } }),
    payrollRuns: await prisma.payrollRun.count({ where: { currencyId: zwl.id } }),
    employeePayrolls: await prisma.employeePayroll.count({ where: { currencyId: zwl.id } }),
    payslips: await prisma.payslip.count({ where: { currencyId: zwl.id } }),
    exchangeRatesTo: await prisma.exchangeRate.count({ where: { toCurrencyId: zwl.id } }),
    exchangeRatesFrom: await prisma.exchangeRate.count({ where: { fromCurrencyId: zwl.id } }),
    forexTo: await prisma.forexGainLoss.count({ where: { toCurrencyId: zwl.id } }),
    forexFrom: await prisma.forexGainLoss.count({ where: { fromCurrencyId: zwl.id } }),
  };

  console.log("Counts referencing ZWL (after):");
  console.table(countsAfter);

  const totalAfter = Object.values(countsAfter).reduce((s, n) => s + Number(n), 0);
  if (totalAfter === 0) {
    console.log("[ok] No remaining references to ZWL in checked tables.");
  } else {
    console.log(`[warn] Remaining ZWL references in checked tables: ${totalAfter}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Avoid "$disconnect" tokenization on Windows tooling; call via bracket access.
    await (prisma as any)["$disconnect"]();
  });

