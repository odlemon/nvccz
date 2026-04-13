/**
 * Verifies STI accruals + journal entries for a fiscal date after a login run.
 * Usage: npx ts-node --transpile-only scripts/verify-sti-run-data.ts [YYYY-MM-DD]
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

const prisma = new PrismaClient();

async function main() {
  const iso = (process.argv[2] || "2026-04-13").trim().slice(0, 10);
  const day = new Date(`${iso}T00:00:00.000Z`);

  const activeCount = await prisma.shortTermInvestmentInstrument.count({
    where: { status: "ACTIVE" },
  });

  const accruals = await prisma.shortTermInvestmentAccrual.findMany({
    where: { accrualDate: day },
    include: {
      instrument: {
        select: {
          id: true,
          name: true,
          status: true,
          currencyId: true,
          principalGlAccountId: true,
          accruedInterestGlAccountId: true,
          interestIncomeGlAccountId: true,
          negativeYieldExpenseGlAccountId: true,
        },
      },
      journalEntry: {
        include: {
          journalEntryLines: true,
        },
      },
    },
    orderBy: { instrumentId: "asc" },
  });

  const issues: string[] = [];
  let jeBalanced = 0;
  let jeUnbalanced = 0;
  let missingJe = 0;
  let zeroAmountNoJe = 0;

  for (const a of accruals) {
    if (a.instrument.status !== "ACTIVE") {
      issues.push(`accrual ${a.id}: instrument ${a.instrumentId} is not ACTIVE`);
    }

    const amt = new Decimal(a.amountInstrumentCcy.toString());
    if (amt.isZero()) {
      if (a.journalEntryId != null) {
        issues.push(`accrual ${a.id}: zero amount but has journalEntryId`);
      } else {
        zeroAmountNoJe += 1;
      }
      continue;
    }

    if (!a.journalEntryId || !a.journalEntry) {
      missingJe += 1;
      issues.push(`accrual ${a.id}: non-zero amount but missing journal entry`);
      continue;
    }

    const je = a.journalEntry;
    const lines = je.journalEntryLines;
    let debit = new Decimal(0);
    let credit = new Decimal(0);
    for (const l of lines) {
      debit = debit.plus(l.debitAmount.toString());
      credit = credit.plus(l.creditAmount.toString());
    }
    const diff = debit.minus(credit).abs();
    if (diff.gt("0.02")) {
      jeUnbalanced += 1;
      issues.push(
        `JE ${je.id} (${je.referenceNumber}): debit ${debit.toFixed(3)} vs credit ${credit.toFixed(3)}`
      );
    } else {
      jeBalanced += 1;
    }

    const hasAccruedLine = lines.some(
      (l) => l.chartOfAccountId === a.instrument.accruedInterestGlAccountId
    );
    const hasIncomeOrExpense = lines.some(
      (l) =>
        l.chartOfAccountId === a.instrument.interestIncomeGlAccountId ||
        l.chartOfAccountId === a.instrument.negativeYieldExpenseGlAccountId
    );
    if (!hasAccruedLine || !hasIncomeOrExpense) {
      issues.push(`JE ${je.id}: missing expected GL lines for STI accrual`);
    }
  }

  const accrualCount = accruals.length;
  const withJe = accruals.filter((a) => a.journalEntryId != null).length;

  console.log(
    JSON.stringify(
      {
        fiscalDate: iso,
        activeInstrumentsInDb: activeCount,
        accrualRowsOnDate: accrualCount,
        accrualsWithJournalEntry: withJe,
        zeroAmountAccrualsNoJe: zeroAmountNoJe,
        journalEntriesBalanced: jeBalanced,
        journalEntriesUnbalanced: jeUnbalanced,
        missingJournalForNonZero: missingJe,
        issues,
        summary:
          issues.length === 0 && accrualCount === activeCount
            ? "OK: accrual count matches active instruments; JEs look balanced."
            : issues.length === 0 && accrualCount !== activeCount
              ? `Note: ${accrualCount} accruals vs ${activeCount} active instruments (some may be skipped: maturity, no APY, period lock).`
            : issues.length
              ? "Review issues array."
              : "OK",
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
