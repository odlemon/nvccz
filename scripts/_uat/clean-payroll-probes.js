/**
 * Removes records left behind by the payroll probe scripts.
 *
 * `payroll-action-probe.mjs` proves a control reaches a write endpoint by
 * actually writing — that is the whole point of it, and a probe that stops
 * short of the write proves nothing. But `POST /payroll/pay-groups` has no
 * delete route (pay groups are reference data with calendar periods hanging
 * off them), so every proving run leaves a pay group behind and they
 * accumulate on the Pay Groups & Calendar screen looking like real payroll
 * populations.
 *
 * Matched on the codes the probe runs gave themselves, so nothing real can be
 * caught by accident. Reports what it deletes rather than doing it silently.
 *
 * Run: node scripts/_uat/clean-payroll-probes.js [--apply]
 */
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

// Codes used by probe runs. Anything not on this list is left alone.
const PROBE_CODES = ["RTCHK", "WK-OPS"];

(async () => {
  const apply = process.argv.includes("--apply");
  const groups = await p.$queryRawUnsafe(
    `SELECT id, name, code FROM payroll_pay_groups WHERE code IN (${PROBE_CODES.map(() => "?").join(",")})`,
    ...PROBE_CODES,
  );

  if (!groups.length) {
    console.log("no probe pay groups present — nothing to do");
    await p.$disconnect();
    return;
  }

  for (const g of groups) {
    const periods = await p.$queryRawUnsafe(
      "SELECT COUNT(*) AS n FROM payroll_calendar_periods WHERE pay_group_id = ?",
      g.id,
    );
    console.log(`  ${g.code.padEnd(10)} ${g.name}  (periods: ${Number(periods[0].n)})`);
  }

  if (!apply) {
    console.log(`\n${groups.length} probe pay group(s) would be removed. Re-run with --apply.`);
    await p.$disconnect();
    return;
  }

  // Periods first: they hold a required reference to the group.
  for (const g of groups) {
    await p.$executeRawUnsafe("DELETE FROM payroll_calendar_periods WHERE pay_group_id = ?", g.id);
    await p.$executeRawUnsafe("DELETE FROM payroll_pay_groups WHERE id = ?", g.id);
    console.log(`removed ${g.code}`);
  }
  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});
