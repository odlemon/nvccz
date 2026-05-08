/**
 * End-to-end test: create a DRAFT payroll run for November 2026 and process it
 * through PayrollService.processPayrollRun (same path the API uses), then verify:
 *
 *   - per-employee deduction rows are NOT duplicated (one row per active TaxRule
 *     bracket + non-tax-rule statutory + employee-specific)
 *   - employee + run totals are internally consistent
 *   - exactly one balanced gross-pay accrual JE was posted
 *   - JE 5030 DR = run.totalGrossPay; 2150 + 2160 + 2250 CR = gross
 *   - JE.transactionDate is not parked in the future (clamp working)
 */
import "dotenv/config";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../src/utils/database";
import { PayrollService } from "../src/services/PayrollService";

function dec(d: any): number {
  if (d == null) return 0;
  return Number(typeof d.toString === "function" ? d.toString() : d);
}

async function main() {
  const usd = await prisma.currency.findFirst({
    where: { code: "USD" },
    select: { id: true, code: true },
  });
  if (!usd) throw new Error("USD currency not configured");

  const creator = await prisma.user.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!creator) throw new Error("No user found to set as createdById");

  const startDate = new Date(Date.UTC(2026, 10, 1, 0, 0, 0)); // 2026-11-01
  const endDate = new Date(Date.UTC(2026, 10, 30, 23, 59, 59)); // 2026-11-30
  const payPeriod = "November 2026";

  // Reuse a previous-test run for the same period if it already exists, so this script is re-runnable.
  const existing = await prisma.payrollRun.findFirst({
    where: { payPeriod },
    orderBy: { createdAt: "desc" },
  });
  if (existing && existing.status === "COMPLETED") {
    console.log(
      `Re-using completed run from previous test: ${existing.id} (${existing.payPeriod})`
    );
  }

  let runId: string;
  if (existing && existing.status !== "COMPLETED") {
    runId = existing.id;
    console.log(`Resuming existing DRAFT/PROCESSING run ${runId}`);
  } else if (!existing) {
    const created = await prisma.payrollRun.create({
      data: {
        name: "November Verify",
        payPeriod,
        startDate,
        endDate,
        currencyId: usd.id,
        createdById: creator.id,
      },
      select: { id: true },
    });
    runId = created.id;
    console.log(`Created DRAFT payroll run ${runId}`);
  } else {
    runId = existing.id;
  }

  // Active TaxRules sanity check before we run
  const activeRules = await prisma.taxRules.findMany({
    where: { isActive: true },
    select: { id: true, type: true, name: true, currencyId: true },
  });
  console.log(
    `Active TaxRules going into the run: ${activeRules.length} (${activeRules
      .map((r) => `${r.type}:${r.name}`)
      .join(", ")})`
  );

  // Process the run only if it isn't already COMPLETED
  let needProcess = false;
  if (existing && existing.status === "COMPLETED") {
    needProcess = false;
  } else {
    needProcess = true;
  }

  if (needProcess) {
    console.log("\nCalling PayrollService.processPayrollRun ...");
    await PayrollService.processPayrollRun(runId, creator.id);
    console.log("processPayrollRun completed.");
  }

  // ===== Verification =====
  const run = await prisma.payrollRun.findUnique({
    where: { id: runId },
    include: {
      employeePayrolls: {
        include: { deductions: { include: { deductionType: true } } },
      },
    },
  });
  if (!run) throw new Error("run vanished");

  console.log(
    `\n=== Run summary ${run.name} (${run.payPeriod}) [${run.id}] status=${run.status}`
  );
  console.log(
    `   gross=${dec(run.totalGrossPay)}  ded=${dec(
      run.totalDeductions
    )}  net=${dec(run.totalNetPay)}  employees=${run.employeePayrolls.length}`
  );

  let pass = 0;
  let fail = 0;
  function check(label: string, ok: boolean, detail = "") {
    if (ok) {
      pass += 1;
      console.log(`  [OK]  ${label}`);
    } else {
      fail += 1;
      console.log(`  [FAIL] ${label} :: ${detail}`);
    }
  }

  let sumGross = 0;
  let sumDed = 0;
  let sumNet = 0;

  for (const ep of run.employeePayrolls) {
    sumGross += dec(ep.grossPay);
    sumDed += dec(ep.totalDeductions);
    sumNet += dec(ep.netPay);
    const persisted = ep.deductions.reduce((s, d) => s + dec(d.amount), 0);
    check(
      `   emp ${ep.employeeId} persistedDeductions(${persisted.toFixed(
        2
      )}) == ep.totalDeductions(${dec(ep.totalDeductions).toFixed(2)})`,
      Math.abs(persisted - dec(ep.totalDeductions)) < 0.01
    );

    // Count rows per tax rule type to ensure no duplicate rule application
    const buckets: Record<string, { count: number; amounts: number[] }> = {};
    for (const d of ep.deductions) {
      const key = (d.deductionType?.code || d.deductionType?.name || "?")
        .toUpperCase()
        .trim();
      if (!buckets[key]) buckets[key] = { count: 0, amounts: [] };
      buckets[key].count += 1;
      buckets[key].amounts.push(dec(d.amount));
    }

    // No bracket should have two identical amounts (the duplicate-rule signature)
    for (const [k, b] of Object.entries(buckets)) {
      const seen = new Set<string>();
      let dup = false;
      for (const a of b.amounts) {
        const key = a.toFixed(4);
        if (seen.has(key)) {
          dup = true;
          break;
        }
        seen.add(key);
      }
      check(
        `     emp ${ep.employeeId} no identical-amount duplicates in ${k} (${b.amounts.join(", ")})`,
        !dup,
        `${k} has identical amount duplicates`
      );
    }

    console.log(
      `     emp ${ep.employeeId} gross=${dec(ep.grossPay)} ded=${dec(
        ep.totalDeductions
      )} net=${dec(ep.netPay)} dedRows=${ep.deductions.length}`
    );
  }

  check(
    `sum(emp.gross) == run.totalGrossPay (${sumGross} vs ${dec(
      run.totalGrossPay
    )})`,
    Math.abs(sumGross - dec(run.totalGrossPay)) < 0.01
  );
  check(
    `sum(emp.ded)  == run.totalDeductions (${sumDed} vs ${dec(
      run.totalDeductions
    )})`,
    Math.abs(sumDed - dec(run.totalDeductions)) < 0.01
  );
  check(
    `gross - ded   == run.totalNetPay (${(sumGross - sumDed).toFixed(2)} vs ${dec(
      run.totalNetPay
    )})`,
    Math.abs(sumGross - sumDed - dec(run.totalNetPay)) < 0.01
  );

  // JE check
  const desc = `Payroll Journal - Gross Pay: ${run.name} (${run.payPeriod})`;
  const jes = await prisma.journalEntry.findMany({
    where: { description: desc },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      referenceNumber: true,
      transactionDate: true,
      status: true,
      totalAmount: true,
      journalEntryLines: {
        select: {
          debitAmount: true,
          creditAmount: true,
          chartOfAccount: { select: { accountNo: true, accountName: true } },
        },
      },
    },
  });
  check(
    `exactly one gross-pay accrual JE exists (found ${jes.length})`,
    jes.length === 1
  );
  if (jes.length === 1) {
    const je = jes[0];
    const dr = je.journalEntryLines.reduce((s, l) => s + dec(l.debitAmount), 0);
    const cr = je.journalEntryLines.reduce((s, l) => s + dec(l.creditAmount), 0);
    check(
      `JE ${je.referenceNumber} balanced (DR ${dr.toFixed(2)} == CR ${cr.toFixed(2)})`,
      Math.abs(dr - cr) < 0.01
    );
    check(
      `JE total ${dec(je.totalAmount)} == run.totalGrossPay ${dec(
        run.totalGrossPay
      )}`,
      Math.abs(dec(je.totalAmount) - dec(run.totalGrossPay)) < 0.01
    );
    const today = new Date();
    check(
      `JE.transactionDate (${je.transactionDate.toISOString().slice(0, 10)}) not parked in the future (today=${today.toISOString().slice(0, 10)})`,
      je.transactionDate.getTime() <= today.getTime() + 24 * 3600 * 1000
    );

    const byAcc: Record<string, { dr: number; cr: number }> = {};
    for (const l of je.journalEntryLines) {
      const k = l.chartOfAccount?.accountNo || "?";
      if (!byAcc[k]) byAcc[k] = { dr: 0, cr: 0 };
      byAcc[k].dr += dec(l.debitAmount);
      byAcc[k].cr += dec(l.creditAmount);
    }
    const exp5030 = byAcc["5030"];
    check(
      `5030 Salaries DR == run.totalGrossPay (${exp5030 ? exp5030.dr : "missing"})`,
      !!exp5030 && Math.abs(exp5030.dr - dec(run.totalGrossPay)) < 0.01
    );
    const liabSum =
      (byAcc["2150"] ? byAcc["2150"].cr : 0) +
      (byAcc["2160"] ? byAcc["2160"].cr : 0) +
      (byAcc["2250"] ? byAcc["2250"].cr : 0);
    check(
      `2150+2160+2250 CR (${liabSum.toFixed(2)}) == run.totalGrossPay (${dec(
        run.totalGrossPay
      )})`,
      Math.abs(liabSum - dec(run.totalGrossPay)) < 0.01
    );
    console.log(
      `   account breakdown: ${Object.entries(byAcc)
        .map(([a, v]) => `${a}: DR ${v.dr} / CR ${v.cr}`)
        .join("; ")}`
    );
  }

  console.log(`\n=== Result: ${pass} passed, ${fail} failed ===`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
