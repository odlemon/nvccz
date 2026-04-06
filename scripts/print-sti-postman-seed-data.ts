/**
 * Prints real IDs from the DB for Short-term investment Postman requests.
 * Run: npx ts-node --transpile-only scripts/print-sti-postman-seed-data.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const zigi = await prisma.currency.findFirst({
    where: { isActive: true, code: { in: ["ZIG", "ZWL", "ZWG"] } },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
  const usd = await prisma.currency.findFirst({
    where: { isActive: true, code: "USD" },
    select: { id: true, code: true, name: true },
  });

  const bank =
    zigi &&
    (await prisma.bank.findFirst({
      where: { isActive: true, currencyId: zigi.id, glAccountId: { not: null } },
      select: {
        id: true,
        name: true,
        accountNumber: true,
        currencyId: true,
        glAccountId: true,
      },
    }));

  async function firstCoa(where: Parameters<typeof prisma.chartOfAccounts.findFirst>[0]["where"]) {
    return prisma.chartOfAccounts.findFirst({
      where: { isActive: true, ...where },
      select: { id: true, accountNo: true, accountName: true, accountType: true },
      orderBy: { accountNo: "asc" },
    });
  }

  // Prefer explicit account numbers used in UATs when present
  const principalGl =
    (await firstCoa({ accountNo: "1500" })) ||
    (await firstCoa({
      accountType: "Asset",
      accountName: { contains: "Equipment" },
    })) ||
    (await firstCoa({ accountType: "Asset", accountNo: { startsWith: "15" } }));

  const accruedGl =
    (await firstCoa({
      OR: [
        { accountName: { contains: "Accrued Interest" } },
        { accountName: { contains: "accrued interest" } },
        { accountNo: "2300" },
      ],
    })) ||
    (await firstCoa({ accountNo: "1550" })) ||
    (await firstCoa({
      accountType: "Asset",
      OR: [
        { accountName: { contains: "Accrued" } },
        { accountName: { contains: "Accumulated" } },
      ],
    }));

  const incomeGl =
    (await firstCoa({ accountNo: "4000" })) ||
    (await firstCoa({ accountType: "Revenue", accountNo: { startsWith: "4" } }));

  const expenseGl =
    (await firstCoa({ accountNo: "5200" })) ||
    (await firstCoa({ accountType: "Expense", accountNo: { startsWith: "5" } }));

  const fxUnreal = await firstCoa({
    accountType: "Asset",
    OR: [
      { accountName: { contains: "Unrealized" } },
      { accountName: { contains: "FX" } },
    ],
  });
  const fxReal = await firstCoa({
    accountType: "Revenue",
    OR: [{ accountName: { contains: "Realized" } }, { accountName: { contains: "Exchange" } }],
  });

  const user = await prisma.user.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true },
  });

  const missing: string[] = [];
  if (!zigi) missing.push("No ZIG/ZWL/ZWG currency");
  if (!bank) missing.push("No bank with GL for local currency");
  if (!principalGl) missing.push("No principal asset GL (e.g. 1500)");
  if (!accruedGl) missing.push("No accrued/accumulated GL (e.g. 1550)");
  if (!incomeGl) missing.push("No interest income / revenue GL (e.g. 4000)");
  if (!expenseGl) missing.push("No expense GL for negative yield (e.g. 5200)");

  const today = new Date().toISOString().slice(0, 10);

  const common = {
    name: `Postman STI seed ${today}`,
    category: "Money market",
    broker: null as string | null,
    principal: 10000,
    currencyId: zigi?.id,
    compoundingMethod: "SIMPLE",
    dayCountConvention: "ACTUAL_365",
    settlementBankId: bank?.id,
    principalGlAccountId: principalGl?.id,
    accruedInterestGlAccountId: accruedGl?.id,
    interestIncomeGlAccountId: incomeGl?.id,
    negativeYieldExpenseGlAccountId: expenseGl?.id,
    startDateIso: today,
    maturityDateIso: `${Number(today.slice(0, 4)) + 1}-12-31`,
    initialApy: 0.05,
    initialApyEffectiveFromIso: today,
  };

  /** Same instrument currency + books: month-end STI FX job skips these. Always send keys; use null. */
  const createBodySingleCurrency = {
    ...common,
    functionalCurrencyId: null,
    unrealizedFxGlAccountId: null,
    realizedFxGlAccountId: null,
  };

  /** Instrument in `currencyId`, reporting in `functionalCurrencyId` — set both FX GLs for unrealized/realized JEs. */
  const useFunctionalFx = Boolean(usd && zigi && usd.id !== zigi.id);
  const createBodyWithFunctionalFx = {
    ...common,
    functionalCurrencyId: useFunctionalFx ? usd!.id : null,
    unrealizedFxGlAccountId: useFunctionalFx ? (fxUnreal?.id ?? null) : null,
    realizedFxGlAccountId: useFunctionalFx ? (fxReal?.id ?? null) : null,
  };

  const report = {
    resolved_from_database: {
      currency_local: zigi,
      currency_usd: usd,
      settlement_bank: bank,
      principal_gl: principalGl,
      accrued_interest_gl: accruedGl,
      interest_income_gl: incomeGl,
      negative_yield_expense_gl: expenseGl,
      optional_unrealized_fx_gl: fxUnreal,
      optional_realized_fx_gl: fxReal,
      sample_user_for_reference: user,
    },
    validation: missing.length ? { missing_requirements: missing } : { ok: true },
    postman_create_instrument_single_currency_json: createBodySingleCurrency,
    postman_create_instrument_with_functional_fx_json: createBodyWithFunctionalFx,
    note:
      "POST /instruments must include functionalCurrencyId, unrealizedFxGlAccountId, realizedFxGlAccountId in the JSON (null for single-currency). Omitting keys also works but leaves DB null.",
  };

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
