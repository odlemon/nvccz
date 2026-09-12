/**
 * Remove records created by the fundraising verification scripts.
 *
 * fundraising-e2e-roundtrips.mjs and fundraising-role-matrix.mjs create real records through
 * the real API — that is the point of them — but those records then sit in the demo dataset
 * with run stamps in their names ("E2E Pension Fund 918490", "ROLE PROBE exec 041233"), which
 * shows up as untraceable digits in the number trace and as noise on every screen.
 *
 * This deletes only rows whose names carry those two markers. It does not touch the seeded
 * `frs-*` dataset, and it does not touch the `UAT ...` records created by the repo's own
 * uat-fundraising-*.mjs scripts.
 *
 * Usage: npm run db:cleanup:fundraising-test-artefacts
 *        npm run db:cleanup:fundraising-test-artefacts -- --check   (report only)
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const CHECK_ONLY = process.argv.includes("--check");

const NAME_MARKERS = ["E2E ", "ROLE PROBE ", "Refusal probe ", "BEHAVIOUR "];

async function main() {
  const investors = await prisma.investorOrganisation.findMany({
    where: { OR: NAME_MARKERS.map((m) => ({ legalName: { startsWith: m } })) },
    select: { id: true, legalName: true },
  });
  const contacts = await prisma.investorContact.findMany({
    where: { OR: NAME_MARKERS.map((m) => ({ fullName: { startsWith: m } })) },
    select: { id: true, fullName: true },
  });
  const investorIds = investors.map((i) => i.id);

  const opportunities = investorIds.length
    ? await prisma.fundraisingOpportunity.findMany({
        where: { investorId: { in: investorIds } },
        select: { id: true },
      })
    : [];
  const oppIds = opportunities.map((o) => o.id);

  const commitments = investorIds.length
    ? await prisma.fundraisingCommitment.findMany({
        where: { investorId: { in: investorIds } },
        select: { id: true },
      })
    : [];

  console.log(
    `Found: ${investors.length} investors, ${contacts.length} standalone contacts, ` +
      `${opportunities.length} opportunities, ${commitments.length} commitments`,
  );
  for (const i of investors) console.log(`  investor  ${i.id}  ${i.legalName}`);

  if (CHECK_ONLY) {
    console.log("\n--check: nothing deleted.");
    return;
  }

  // Delete children first — opportunity history and commitments reference the opportunity,
  // and contacts cascade from the investor but standalone probe contacts may not.
  if (oppIds.length) {
    await prisma.opportunityAmountHistory.deleteMany({ where: { opportunityId: { in: oppIds } } });
    await prisma.opportunityStageHistory.deleteMany({ where: { opportunityId: { in: oppIds } } });
  }
  const delCommit = await prisma.fundraisingCommitment.deleteMany({
    where: { investorId: { in: investorIds.length ? investorIds : ["__none__"] } },
  });
  const delOpp = await prisma.fundraisingOpportunity.deleteMany({
    where: { investorId: { in: investorIds.length ? investorIds : ["__none__"] } },
  });
  const delContacts = await prisma.investorContact.deleteMany({
    where: {
      OR: [
        ...NAME_MARKERS.map((m) => ({ fullName: { startsWith: m } })),
        ...(investorIds.length ? [{ investorId: { in: investorIds } }] : []),
      ],
    },
  });
  const delInvestors = await prisma.investorOrganisation.deleteMany({
    where: { id: { in: investorIds.length ? investorIds : ["__none__"] } },
  });

  // Scratch campaigns from the behaviour check, with their dependent rows.
  const campaigns = await prisma.fundraisingCampaign.findMany({
    where: { name: { startsWith: "BEHAVIOUR " } },
    select: { id: true },
  });
  const campIds = campaigns.map((c) => c.id);
  let delCampaigns = 0;
  if (campIds.length) {
    await prisma.fundraisingApprovalRequest.deleteMany({ where: { objectId: { in: campIds } } });
    await prisma.fundraisingClosing.deleteMany({ where: { campaignId: { in: campIds } } });
    await prisma.fundraisingPipelineStage.deleteMany({ where: { campaignId: { in: campIds } } });
    delCampaigns = (await prisma.fundraisingCampaign.deleteMany({ where: { id: { in: campIds } } })).count;
  }
  console.log(`Deleted: ${delCampaigns} scratch campaigns`);

  console.log(
    `\nDeleted: ${delInvestors.count} investors, ${delContacts.count} contacts, ` +
      `${delOpp.count} opportunities, ${delCommit.count} commitments`,
  );
}

main()
  .catch((e) => {
    console.error("CLEANUP FAILED:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
