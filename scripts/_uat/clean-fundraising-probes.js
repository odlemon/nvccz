/**
 * Removes records left behind by the fundraising probe scripts.
 *
 * `fundraising-role-matrix.mjs` and `fundraising-e2e-roundtrips.mjs` create real records to prove
 * the write paths work, and say so — the role matrix notes that its investor organisations "are
 * left in place" because `/investors` has no delete route. They accumulate every run, and they
 * show up on the fundraising screens and in the audit trail looking like genuine pipeline: the
 * audit screen was listing "E2E Close 363542" and "BEHAVIOUR close 875180" among real activity.
 *
 * Matched on the names the probes give themselves, so nothing else can be caught by accident.
 * Reports what it deletes rather than doing it silently.
 */
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

// The probes name their records in several shapes: "ROLE PROBE <role> <n>",
// "E2E Close <n>", "E2E Pension Fund <n>" and "BEHAVIOUR <thing> <n>". Matching the
// two distinctive prefixes catches all of them without risking a real record.
const NAME_MATCH = (field) => [
  { [field]: { startsWith: "ROLE PROBE" } },
  { [field]: { contains: "E2E " } },
  { [field]: { contains: "BEHAVIOUR" } },
];

(async () => {
  const closings = await p.fundraisingClosing.findMany({
    where: { OR: NAME_MATCH("name") },
    select: { id: true, name: true },
  });
  const orgs = await p.investorOrganisation.findMany({
    where: { OR: NAME_MATCH("legalName") },
    select: { id: true, legalName: true },
  });

  console.log(`probe closings              : ${closings.length}`);
  for (const c of closings) console.log(`   ${c.name}`);
  console.log(`probe investor organisations: ${orgs.length}`);
  for (const o of orgs) console.log(`   ${o.legalName}`);

  if (!closings.length && !orgs.length) {
    console.log("\nnothing to remove");
    return;
  }

  const delClosings = await p.fundraisingClosing.deleteMany({
    where: { id: { in: closings.map((c) => c.id) } },
  });
  // Commitments and opportunities hold a REQUIRED reference to the organisation, so they have to
  // go first — Prisma refuses the parent delete otherwise. Order matters: commitments reference
  // opportunities as well.
  const orgIds = orgs.map((o) => o.id);
  let removed = { commitments: 0, opportunities: 0, contacts: 0 };
  if (orgIds.length) {
    removed.commitments = (
      await p.fundraisingCommitment.deleteMany({ where: { investorId: { in: orgIds } } })
    ).count;
    removed.opportunities = (
      await p.fundraisingOpportunity.deleteMany({ where: { investorId: { in: orgIds } } })
    ).count;
    removed.contacts = (
      await p.investorContact.deleteMany({ where: { investorId: { in: orgIds } } }).catch(() => ({ count: 0 }))
    ).count;
  }
  console.log(
    `  dependents: ${removed.commitments} commitment(s), ${removed.opportunities} opportunity(ies), ${removed.contacts} contact(s)`
  );
  const delOrgs = await p.investorOrganisation.deleteMany({
    where: { id: { in: orgIds } },
  });

  console.log(`\ndeleted: ${delClosings.count} closing(s), ${delOrgs.count} organisation(s)`);
  console.log(`remaining closings in DB    : ${await p.fundraisingClosing.count()}`);
  console.log(`remaining organisations     : ${await p.investorOrganisation.count()}`);
})()
  .catch((e) => {
    console.error("ERR", e.message.slice(0, 400));
    process.exitCode = 1;
  })
  .finally(() => p.$disconnect());
