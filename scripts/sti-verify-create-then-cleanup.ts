/**
 * Verifies post-create STI catch-up uses startDate (not createdAt), then voids + deletes the row.
 *
 *   npx ts-node --transpile-only -r dotenv/config scripts/sti-verify-create-then-cleanup.ts
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";
import {
  formatYyyyMmDdInTimeZone,
  resolveStiFiscalIanaTimezone,
  ShortTermInvestmentService,
} from "../src/services/ShortTermInvestmentService";

function addCalendarDaysIso(iso: string, deltaDays: number): string {
  const [y, mo, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d + deltaDays));
  return dt.toISOString().slice(0, 10);
}

async function main() {
  const tz = await resolveStiFiscalIanaTimezone();
  const fiscalToday = formatYyyyMmDdInTimeZone(new Date(), tz);
  const startDateIso = addCalendarDaysIso(fiscalToday, -5);

  const usd = await prisma.currency.findFirst({
    where: { isActive: true, code: "USD" },
    select: { id: true },
  });
  const currency =
    usd ??
    (await prisma.currency.findFirst({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { id: true },
    }));
  if (!currency) throw new Error("No active currency");

  const bank = await prisma.bank.findFirst({
    where: { isActive: true, currencyId: currency.id, glAccountId: { not: null } },
    select: { id: true, name: true },
  });
  if (!bank) throw new Error("No active bank with GL for chosen currency");

  async function firstCoa(where: Parameters<typeof prisma.chartOfAccounts.findFirst>[0]["where"]) {
    return prisma.chartOfAccounts.findFirst({
      where: { isActive: true, ...where },
      select: { id: true },
      orderBy: { accountNo: "asc" },
    });
  }

  const principalGl =
    (await firstCoa({ accountNo: "1500" })) ||
    (await firstCoa({ accountType: "Asset", accountNo: { startsWith: "15" } }));
  const accruedGl =
    (await firstCoa({ accountNo: "2300" })) ||
    (await firstCoa({ accountName: { contains: "Accrued" } })) ||
    (await firstCoa({ accountType: "Asset" }));
  const incomeGl =
    (await firstCoa({ accountNo: "4000" })) || (await firstCoa({ accountType: "Revenue" }));
  const expenseGl =
    (await firstCoa({ accountNo: "5200" })) || (await firstCoa({ accountType: "Expense" }));
  if (!principalGl || !accruedGl || !incomeGl || !expenseGl) {
    throw new Error("Could not resolve required GL accounts");
  }

  const actor = await prisma.user.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true },
  });
  if (!actor) throw new Error("No user");

  const tag = `TEMP-STI-verify-${Date.now()}`;
  const created = await ShortTermInvestmentService.createInstrument(
    {
      name: tag,
      category: "Money market",
      broker: null,
      principal: 1000,
      currencyId: currency.id,
      functionalCurrencyId: null,
      compoundingMethod: "SIMPLE",
      dayCountConvention: "ACTUAL_365",
      settlementBankId: bank.id,
      principalGlAccountId: principalGl.id,
      accruedInterestGlAccountId: accruedGl.id,
      interestIncomeGlAccountId: incomeGl.id,
      negativeYieldExpenseGlAccountId: expenseGl.id,
      unrealizedFxGlAccountId: null,
      realizedFxGlAccountId: null,
      startDateIso,
      maturityDateIso: addCalendarDaysIso(fiscalToday, 365),
      initialApy: 0.05,
    },
    { userId: actor.id, ipAddress: null, userAgent: "sti-verify-create-then-cleanup" }
  );

  const createdRec = created as Record<string, unknown>;
  const warn =
    typeof createdRec.initialAccrualCatchUpWarning === "string"
      ? createdRec.initialAccrualCatchUpWarning
      : undefined;

  const instRow = await prisma.shortTermInvestmentInstrument.findUnique({
    where: { id: created.id },
    select: { id: true, startDate: true, createdAt: true },
  });
  const firstAcc = await prisma.shortTermInvestmentAccrual.findFirst({
    where: { instrumentId: created.id },
    orderBy: { accrualDate: "asc" },
    select: { accrualDate: true },
  });
  const accCount = await prisma.shortTermInvestmentAccrual.count({
    where: { instrumentId: created.id },
  });

  const startSlice = instRow!.startDate.toISOString().slice(0, 10);
  const firstSlice = firstAcc?.accrualDate.toISOString().slice(0, 10) ?? null;
  const ok = firstSlice === startSlice && accCount > 0;

  console.log(
    JSON.stringify(
      {
        step: "after_create",
        instrumentId: created.id,
        name: tag,
        fiscalToday,
        startDateIso,
        instrumentStartDate: startSlice,
        createdAt: instRow!.createdAt.toISOString(),
        accrualCount: accCount,
        firstAccrualDate: firstSlice,
        expectFirstAccrualEqualsStart: ok,
        initialAccrualCatchUpWarning: warn ?? null,
      },
      null,
      2
    )
  );

  if (!ok) {
    throw new Error(
      `Verification failed: expected first accrual ${startSlice} and count>0; got first=${firstSlice}, count=${accCount}`
    );
  }

  await ShortTermInvestmentService.voidInstrument({
    instrumentId: created.id,
    actorId: actor.id,
  });

  await prisma.shortTermInvestmentAccrual.deleteMany({ where: { instrumentId: created.id } });
  await prisma.shortTermInvestmentApyRate.deleteMany({ where: { instrumentId: created.id } });
  await prisma.shortTermInvestmentFxRevaluation.deleteMany({
    where: { instrumentId: created.id },
  });
  await prisma.shortTermInvestmentInstrument.delete({ where: { id: created.id } });

  const gone = await prisma.shortTermInvestmentInstrument.findUnique({
    where: { id: created.id },
  });
  console.log(
    JSON.stringify(
      {
        step: "cleanup_done",
        instrumentDeleted: gone === null,
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
