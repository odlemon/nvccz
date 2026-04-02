import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const BASE = "http://localhost:3009";
const START = "2025-01-01";
const END = "2026-03-31";
const AS_OF = "2026-03-31";

async function login(): Promise<string> {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@nts.com", password: "admin123" }),
  });
  const j = await r.json();
  return j.token;
}

async function api(token: string, method: string, path: string, body?: any) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json();
  if (!j.success) throw new Error(`API error ${path}: ${j.message}`);
  return j.data;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function main() {
  const token = await login();

  const { prisma } = await import("../src/utils/database");
  const currencies = await prisma.currency.findMany({ select: { id: true, code: true } });
  const ccyMap = Object.fromEntries(currencies.map((c) => [c.code, c.id]));
  await prisma.$disconnect();

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  CONSOLIDATED REPORT VALIDATION");
  console.log("═══════════════════════════════════════════════════════════════\n");

  // ── 1. Single-currency Balance Sheets ──
  console.log("── STEP 1: Single-currency Balance Sheets ──\n");
  for (const code of ["USD", "ZIG", "ZWL", "ZAR"]) {
    try {
      const bs = await api(token, "POST", "/api/accounting/balance-sheet/generate", {
        asOfDate: AS_OF, currencyId: ccyMap[code], startDate: START, endDate: END,
      });
      console.log(`  ${code} Balance Sheet:`);
      console.log(`    Total Assets:       ${fmt(bs.assets?.totalAssets ?? 0)}`);
      console.log(`    Total Liab+Equity:  ${fmt(bs.totalLiabilitiesAndEquity ?? 0)}`);
      console.log(`    Balanced:           ${bs.isBalanced}`);
      console.log(`    Difference:         ${fmt(bs.difference ?? 0)}\n`);
    } catch (e: any) {
      console.log(`  ${code} Balance Sheet: ERROR - ${e.message}\n`);
    }
  }

  // ── 2. Consolidated Balance Sheets ──
  console.log("── STEP 2: Consolidated Balance Sheets ──\n");
  for (const target of ["USD", "ZIG"]) {
    try {
      const cbs = await api(token, "POST", "/api/accounting/balance-sheet/consolidated", {
        asOfDate: AS_OF, consolidationCurrencyId: ccyMap[target], startDate: START, endDate: END,
      });
      console.log(`  Consolidated BS → ${target}:`);
      console.log(`    Consolidation Currency: ${cbs.consolidationCurrency.code}`);
      console.log(`    Exchange Rates Used:`);
      for (const r of cbs.exchangeRates) {
        console.log(`      ${r.currencyCode} → ${target}: ${r.rate}`);
      }
      console.log(`    Cash & Equivalents:   ${fmt(cbs.assets.cashAndCashEquivalents.total)}`);
      console.log(`    Current Assets:       ${fmt(cbs.assets.currentAssets.total)}`);
      console.log(`    Fixed Assets:         ${fmt(cbs.assets.fixedAssets.total)}`);
      console.log(`    Other Assets:         ${fmt(cbs.assets.otherAssets?.total ?? 0)}`);
      console.log(`    ─── Total Assets:     ${fmt(cbs.assets.totalAssets)}`);
      console.log(`    Current Liabilities:  ${fmt(cbs.liabilities.currentLiabilities.total)}`);
      console.log(`    Long-term Liab:       ${fmt(cbs.liabilities.longTermLiabilities.total)}`);
      console.log(`    ─── Total Liabilities:${fmt(cbs.liabilities.totalLiabilities)}`);
      console.log(`    Equity:               ${fmt(cbs.equity.total)}`);
      console.log(`    ─── Total L+E:        ${fmt(cbs.totalLiabilitiesAndEquity)}`);
      console.log(`    Balanced:             ${cbs.isBalanced}`);
      console.log(`    Difference:           ${fmt(cbs.difference)}`);

      // Show a sample account with currency breakdown
      const sampleAccounts = cbs.assets.cashAndCashEquivalents.breakdown?.filter(
        (a: any) => a.currencyBreakdown.length > 1
      ) ?? [];
      if (sampleAccounts.length > 0) {
        const s = sampleAccounts[0];
        console.log(`    ── Sample multi-currency account: "${s.accountName}" (${s.accountNo})`);
        console.log(`       Consolidated balance: ${fmt(s.balance)}`);
        for (const bd of s.currencyBreakdown) {
          console.log(`       ${bd.sourceCurrency}: ${fmt(bd.sourceAmount)} × ${bd.conversionRate} = ${fmt(bd.consolidatedAmount)}`);
        }
      }
      console.log();
    } catch (e: any) {
      console.log(`  Consolidated BS → ${target}: ERROR - ${e.message}\n`);
    }
  }

  // ── 3. Single-currency Income Statements ──
  console.log("── STEP 3: Single-currency Income Statements ──\n");
  for (const code of ["USD", "ZIG", "ZWL", "ZAR"]) {
    try {
      const is_ = await api(token, "POST", "/api/accounting/income-statement/generate", {
        startDate: START, endDate: END, currencyId: ccyMap[code],
      });
      console.log(`  ${code} Income Statement:`);
      console.log(`    Revenue:              ${fmt(is_.sections?.revenue?.total ?? is_.totals?.revenue ?? 0)}`);
      console.log(`    Operating Expenses:   ${fmt(is_.sections?.operatingExpenses?.total ?? 0)}`);
      console.log(`    Net Income:           ${fmt(is_.totals?.netIncome ?? 0)}\n`);
    } catch (e: any) {
      console.log(`  ${code} Income Statement: ERROR - ${e.message}\n`);
    }
  }

  // ── 4. Consolidated Income Statements ──
  console.log("── STEP 4: Consolidated Income Statements ──\n");
  for (const target of ["USD", "ZIG"]) {
    try {
      const cis = await api(token, "POST", "/api/accounting/income-statement/consolidated", {
        startDate: START, endDate: END, consolidationCurrencyId: ccyMap[target],
      });
      console.log(`  Consolidated IS → ${target}:`);
      console.log(`    Consolidation Currency: ${cis.consolidationCurrency.code}`);
      console.log(`    Exchange Rates Used:`);
      for (const r of cis.exchangeRates) {
        console.log(`      ${r.currencyCode} → ${target}: ${r.rate}`);
      }
      console.log(`    Revenue:              ${fmt(cis.sections.revenue.total)}`);
      console.log(`    Operating Expenses:   ${fmt(cis.sections.operatingExpenses.total)}`);
      console.log(`    Income Tax:           ${fmt(cis.sections.incomeTax.total)}`);
      console.log(`    Below the Line:       ${fmt(cis.sections.belowTheLine.total)}`);
      console.log(`    ─── Net Income Before Tax: ${fmt(cis.totals.netIncomeBeforeTaxes)}`);
      console.log(`    ─── Net Income:       ${fmt(cis.totals.netIncome)}`);

      // Show a sample multi-currency revenue account
      const multiRevAccounts = cis.sections.revenue.accounts.filter(
        (a: any) => a.currencyBreakdown.length > 1
      );
      if (multiRevAccounts.length > 0) {
        const s = multiRevAccounts[0];
        console.log(`    ── Sample multi-currency revenue: "${s.accountName}" (${s.accountNo})`);
        console.log(`       Consolidated balance: ${fmt(s.balance)}`);
        for (const bd of s.currencyBreakdown) {
          console.log(`       ${bd.sourceCurrency}: ${fmt(bd.sourceAmount)} × ${bd.conversionRate} = ${fmt(bd.consolidatedAmount)}`);
        }
      }
      console.log();
    } catch (e: any) {
      console.log(`  Consolidated IS → ${target}: ERROR - ${e.message}\n`);
    }
  }

  // ── 5. Cross-validation: USD consolidated net income × ZIG rate ≈ ZIG consolidated net income ──
  console.log("── STEP 5: Cross-validation ──\n");
  try {
    const cisUSD = await api(token, "POST", "/api/accounting/income-statement/consolidated", {
      startDate: START, endDate: END, consolidationCurrencyId: ccyMap["USD"],
    });
    const cisZIG = await api(token, "POST", "/api/accounting/income-statement/consolidated", {
      startDate: START, endDate: END, consolidationCurrencyId: ccyMap["ZIG"],
    });
    const usdToZigRate = cisZIG.exchangeRates.find((r: any) => r.currencyCode === "USD")?.rate ?? 0;
    const expectedZigNetIncome = cisUSD.totals.netIncome * usdToZigRate;
    const actualZigNetIncome = cisZIG.totals.netIncome;
    const diff = Math.abs(expectedZigNetIncome - actualZigNetIncome);
    const tolerance = Math.abs(actualZigNetIncome * 0.01); // 1% tolerance for rounding

    console.log(`  USD Net Income:         ${fmt(cisUSD.totals.netIncome)}`);
    console.log(`  USD→ZIG rate:           ${usdToZigRate}`);
    console.log(`  Expected ZIG Net Income: ${fmt(expectedZigNetIncome)}`);
    console.log(`  Actual ZIG Net Income:   ${fmt(actualZigNetIncome)}`);
    console.log(`  Difference:             ${fmt(diff)}`);
    console.log(`  Within 1% tolerance:    ${diff <= tolerance ? "YES ✓" : "NO ✗ (rounding from non-USD→non-ZIG triangulation)"}`);
    console.log();
  } catch (e: any) {
    console.log(`  Cross-validation: ERROR - ${e.message}\n`);
  }

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ALL TESTS COMPLETE");
  console.log("═══════════════════════════════════════════════════════════════");
}

main().catch((e) => { console.error(e); process.exit(1); });
