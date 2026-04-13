import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

async function main() {
  console.log("=== Short-Term Investments Data Analysis ===");

  const instruments = await prisma.shortTermInvestmentInstrument.findMany({
    include: {
      apyRates: { orderBy: { effectiveFrom: "asc" } },
      accruals: {
        orderBy: { accrualDate: "asc" },
        select: {
          id: true,
          accrualDate: true,
          amountInstrumentCcy: true,
          runningAccruedBalance: true,
          status: true,
          journalEntryId: true,
        },
      },
      settlementBank: { select: { id: true, name: true, glAccountId: true } },
      currency: { select: { code: true } },
      functionalCurrency: { select: { code: true } },
    },
  });

  console.log(`Total instruments: ${instruments.length}`);

  const statusDist = instruments.reduce<Record<string, number>>((acc, i) => {
    acc[i.status] = (acc[i.status] ?? 0) + 1;
    return acc;
  }, {});
  console.log("Status distribution:", statusDist);

  let principalTotal = 0;
  let accruedTotal = 0;

  const issues: string[] = [];

  for (const inst of instruments) {
    const principal = Number(inst.principal);
    principalTotal += principal;

    const lastAccrual = inst.accruals.length > 0 ? inst.accruals[inst.accruals.length - 1] : null;
    const accrued = lastAccrual ? Number(lastAccrual.runningAccruedBalance) : 0;
    accruedTotal += accrued;

    if (!inst.settlementBank?.glAccountId) {
      issues.push(`[${inst.id}] Missing settlement bank GL account`);
    }
    if (!inst.principalGlAccountId) issues.push(`[${inst.id}] Missing principal GL mapping`);
    if (!inst.accruedInterestGlAccountId) issues.push(`[${inst.id}] Missing accrued-interest GL mapping`);
    if (!inst.interestIncomeGlAccountId) issues.push(`[${inst.id}] Missing interest-income GL mapping`);
    if (!inst.negativeYieldExpenseGlAccountId) {
      issues.push(`[${inst.id}] Missing negative-yield expense GL mapping`);
    }

    const startIso = iso(inst.startDate);
    const maturityIso = iso(inst.maturityDate);
    if (startIso && maturityIso && maturityIso < startIso) {
      issues.push(`[${inst.id}] Maturity date before start date (${startIso} > ${maturityIso})`);
    }

    if (inst.apyRates.length === 0) {
      issues.push(`[${inst.id}] No APY rates configured`);
    }

    if (inst.accruals.length > 1) {
      for (let i = 1; i < inst.accruals.length; i++) {
        const prev = inst.accruals[i - 1].accrualDate.getTime();
        const curr = inst.accruals[i].accrualDate.getTime();
        const diffDays = Math.round((curr - prev) / 86400000);
        if (diffDays > 1) {
          issues.push(
            `[${inst.id}] Accrual gap ${iso(inst.accruals[i - 1].accrualDate)} -> ${iso(inst.accruals[i].accrualDate)} (${diffDays} days)`
          );
          break;
        }
      }
    }

    if (inst.status === "SETTLED") {
      if (!inst.liquidationDate) issues.push(`[${inst.id}] SETTLED but liquidationDate is null`);
      if (!inst.liquidationJournalEntryId) issues.push(`[${inst.id}] SETTLED but liquidation JE is null`);
      if (inst.liquidationCashReceived == null) {
        issues.push(`[${inst.id}] SETTLED but liquidation cash is null`);
      }
    }

    const latestRate = inst.apyRates.length > 0 ? Number(inst.apyRates[inst.apyRates.length - 1].apy) : null;
    if (latestRate != null && latestRate < 0 && !inst.capitalErosion) {
      issues.push(`[${inst.id}] Latest APY is negative but capitalErosion=false`);
    }

    const jeIds = inst.accruals
      .map((a) => a.journalEntryId)
      .filter((id): id is string => Boolean(id));
    if (jeIds.length > 0) {
      const jes = await prisma.journalEntry.findMany({
        where: { id: { in: jeIds } },
        select: { id: true, status: true },
      });
      const jeById = new Map(jes.map((j) => [j.id, j.status]));
      for (const a of inst.accruals) {
        if (!a.journalEntryId) continue;
        const jeStatus = jeById.get(a.journalEntryId);
        if (!jeStatus) {
          issues.push(`[${inst.id}] Accrual ${a.id} references missing JE ${a.journalEntryId}`);
          continue;
        }
        if (a.status === "POSTED" && jeStatus !== "POSTED") {
          issues.push(`[${inst.id}] Accrual ${a.id}=POSTED but JE ${a.journalEntryId}=${jeStatus}`);
        }
        if (a.status === "PENDING_POST" && jeStatus === "POSTED") {
          issues.push(`[${inst.id}] Accrual ${a.id}=PENDING_POST but JE ${a.journalEntryId}=POSTED`);
        }
      }
    }
  }

  console.log(`Portfolio principal total: ${principalTotal}`);
  console.log(`Portfolio accrued total: ${accruedTotal}`);
  console.log(`Portfolio carrying total: ${principalTotal + accruedTotal}`);

  const pendingAccruals = await prisma.shortTermInvestmentAccrual.count({
    where: { status: "PENDING_POST" },
  });
  const fxRevals = await prisma.shortTermInvestmentFxRevaluation.count();
  console.log(`Pending accrual rows: ${pendingAccruals}`);
  console.log(`FX revaluation rows: ${fxRevals}`);

  console.log("\n=== Issues Found ===");
  if (issues.length === 0) {
    console.log("No obvious data integrity issues found.");
  } else {
    for (const issue of issues) {
      console.log(`- ${issue}`);
    }
  }
}

main()
  .catch((e) => {
    console.error("Analysis failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
