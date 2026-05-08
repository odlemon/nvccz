require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

function decToStr(d) {
  if (d == null) return null;
  return typeof d.toString === "function" ? d.toString() : String(d);
}

async function main() {
  const prisma = new PrismaClient();
  let pass = 0;
  let fail = 0;
  const failures = [];
  function check(label, condition, detail) {
    if (condition) {
      pass += 1;
      console.log(`  [OK]  ${label}`);
    } else {
      fail += 1;
      failures.push({ label, detail });
      console.log(`  [FAIL] ${label} :: ${detail}`);
    }
  }

  try {
    console.log("=== 1. TaxRules: only one per bracket signature ===");
    const rules = await prisma.taxRules.findMany({
      where: { isActive: true },
      select: {
        id: true,
        type: true,
        name: true,
        rate: true,
        threshold: true,
        ceiling: true,
        currencyId: true,
      },
    });
    const sigCount = {};
    for (const r of rules) {
      const k = [
        r.currencyId || "",
        String(r.type).toUpperCase(),
        decToStr(r.rate),
        decToStr(r.threshold) || "",
        decToStr(r.ceiling) || "",
      ].join("|");
      sigCount[k] = (sigCount[k] || 0) + 1;
    }
    const dup = Object.entries(sigCount).filter(([, n]) => n > 1);
    check(
      `Active TaxRules count = ${rules.length}, unique bracket signatures = ${
        Object.keys(sigCount).length
      }`,
      dup.length === 0,
      `Duplicate signatures still exist: ${JSON.stringify(dup)}`
    );

    console.log(
      "  Active rules: " +
        rules
          .map(
            (r) =>
              `${r.type} ${r.name} (rate=${decToStr(r.rate)} thr=${
                decToStr(r.threshold) || "-"
              } ceil=${decToStr(r.ceiling) || "-"})`
          )
          .join("; ")
    );

    console.log("\n=== 2. Inactive duplicate TaxRules: should be hard-deleted ===");
    const inactiveTotal = await prisma.taxRules.count({
      where: { isActive: false },
    });
    check(
      `Inactive TaxRules left = ${inactiveTotal} (expected 0)`,
      inactiveTotal === 0,
      `Inactive TaxRules still in table: ${inactiveTotal}`
    );

    console.log(
      "\n=== 3. Recent COMPLETED runs: persisted deductions & JE consistency ==="
    );
    const runs = await prisma.payrollRun.findMany({
      where: { status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: {
        employeePayrolls: {
          include: {
            deductions: { include: { deductionType: true } },
          },
        },
      },
    });

    for (const run of runs) {
      console.log(`\n  >> Run ${run.name} (${run.payPeriod}) [${run.id}]`);

      // Per-employee totals match header
      let sumGross = 0;
      let sumDed = 0;
      let sumNet = 0;
      const dedSamples = [];
      for (const ep of run.employeePayrolls) {
        sumGross += Number(decToStr(ep.grossPay));
        sumDed += Number(decToStr(ep.totalDeductions));
        sumNet += Number(decToStr(ep.netPay));
        // Sum persisted deductions vs ep.totalDeductions
        const persistedSum = ep.deductions.reduce(
          (s, d) => s + Number(decToStr(d.amount)),
          0
        );
        const epDedNum = Number(decToStr(ep.totalDeductions));
        check(
          `   emp ${ep.employeeId} persistedDeductions(${persistedSum.toFixed(2)}) == ep.totalDeductions(${epDedNum.toFixed(2)})`,
          Math.abs(persistedSum - epDedNum) < 0.01,
          `mismatch: persisted=${persistedSum} ep.totalDeductions=${epDedNum}`
        );
        dedSamples.push(
          `emp=${ep.employeeId} gross=${decToStr(ep.grossPay)} ded=${decToStr(ep.totalDeductions)} net=${decToStr(ep.netPay)} dedRows=${ep.deductions.length}`
        );
      }

      const headerGross = Number(decToStr(run.totalGrossPay));
      const headerDed = Number(decToStr(run.totalDeductions));
      const headerNet = Number(decToStr(run.totalNetPay));
      check(
        `   sum(emp.gross)=${sumGross.toFixed(2)} == run.totalGrossPay=${headerGross.toFixed(2)}`,
        Math.abs(sumGross - headerGross) < 0.01,
        `mismatch`
      );
      check(
        `   sum(emp.ded)=${sumDed.toFixed(2)} == run.totalDeductions=${headerDed.toFixed(2)}`,
        Math.abs(sumDed - headerDed) < 0.01,
        `mismatch`
      );
      check(
        `   gross - ded = ${(headerGross - headerDed).toFixed(2)} == run.totalNetPay=${headerNet.toFixed(2)}`,
        Math.abs(headerGross - headerDed - headerNet) < 0.01,
        `mismatch`
      );

      // Find gross-pay accrual JE
      const desc = `Payroll Journal - Gross Pay: ${run.name} (${run.payPeriod})`;
      const jes = await prisma.journalEntry.findMany({
        where: {
          OR: [
            { description: desc },
            { referenceNumber: { startsWith: "PAYROLL-" }, description: desc },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          referenceNumber: true,
          description: true,
          transactionDate: true,
          status: true,
          totalAmount: true,
          journalEntryLines: {
            select: {
              debitAmount: true,
              creditAmount: true,
              description: true,
              chartOfAccount: { select: { accountNo: true, accountName: true } },
            },
          },
        },
      });

      check(
        `   exactly one gross-pay accrual JE exists (found ${jes.length})`,
        jes.length === 1,
        `expected 1 JE with description "${desc}", got ${jes.length}`
      );

      if (jes.length === 1) {
        const je = jes[0];
        const dr = je.journalEntryLines.reduce(
          (s, l) => s + Number(decToStr(l.debitAmount) || 0),
          0
        );
        const cr = je.journalEntryLines.reduce(
          (s, l) => s + Number(decToStr(l.creditAmount) || 0),
          0
        );
        check(
          `   JE ${je.referenceNumber} balanced (DR ${dr.toFixed(2)} == CR ${cr.toFixed(2)})`,
          Math.abs(dr - cr) < 0.01,
          `dr=${dr} cr=${cr}`
        );
        check(
          `   JE total ${decToStr(je.totalAmount)} == run.totalGrossPay ${headerGross.toFixed(2)}`,
          Math.abs(Number(decToStr(je.totalAmount)) - headerGross) < 0.01,
          `mismatch`
        );

        const txDate = je.transactionDate;
        const now = new Date();
        check(
          `   JE.transactionDate (${txDate.toISOString().slice(0, 10)}) <= today (${now.toISOString().slice(0, 10)})`,
          txDate.getTime() <= now.getTime() + 24 * 3600 * 1000,
          `JE is future-dated: ${txDate.toISOString()}`
        );

        // Aggregate by account no
        const byAcc = {};
        for (const l of je.journalEntryLines) {
          const k = l.chartOfAccount?.accountNo || "?";
          byAcc[k] = byAcc[k] || { dr: 0, cr: 0 };
          byAcc[k].dr += Number(decToStr(l.debitAmount) || 0);
          byAcc[k].cr += Number(decToStr(l.creditAmount) || 0);
        }
        // 5030 (Salaries) should DR the full gross
        const exp5030 = byAcc["5030"];
        check(
          `   5030 Salaries DR == gross (${exp5030 ? exp5030.dr.toFixed(2) : "missing"})`,
          exp5030 && Math.abs(exp5030.dr - headerGross) < 0.01,
          `5030 line missing or wrong DR`
        );
        // 2150/2160/2250 cumulative should equal headerDed + headerNet = headerGross
        const liabSum =
          (byAcc["2150"] ? byAcc["2150"].cr : 0) +
          (byAcc["2160"] ? byAcc["2160"].cr : 0) +
          (byAcc["2250"] ? byAcc["2250"].cr : 0);
        check(
          `   2150+2160+2250 CR (${liabSum.toFixed(2)}) == gross (${headerGross.toFixed(2)})`,
          Math.abs(liabSum - headerGross) < 0.01,
          `mismatch`
        );

        console.log(
          `   account breakdown: ${Object.entries(byAcc)
            .map(([a, v]) => `${a}: DR ${v.dr} / CR ${v.cr}`)
            .join("; ")}`
        );
      }

      for (const s of dedSamples) console.log(`   ${s}`);
    }

    console.log("\n=== 4. Orphan JE lines (would crash GL list) ===");
    const orphans = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) AS cnt FROM journal_entry_lines jel LEFT JOIN chart_of_accounts coa ON coa.id = jel.chartOfAccountId WHERE coa.id IS NULL`
    );
    const orphanCount = Number(orphans?.[0]?.cnt ?? 0);
    check(
      `Orphan JE lines = ${orphanCount} (expected 0)`,
      orphanCount === 0,
      `${orphanCount} lines still point at missing chart accounts`
    );

    console.log(`\n=== Result: ${pass} passed, ${fail} failed ===`);
    if (fail > 0) {
      console.log("Failures:", JSON.stringify(failures, null, 2));
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
