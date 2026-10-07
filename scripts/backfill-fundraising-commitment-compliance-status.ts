/**
 * Backfill `fundraising_commitments.compliance_status` for existing commitments where it was
 * never set (created before this field was wired up — see FINDING-FR-002 in
 * design-refs/fundraising/TEST_FINDINGS.md in the nvccz-new repo).
 *
 * Mirrors each commitment's investor's *current* `investor_organisations.kyc_status` onto the
 * commitment, matching the sync behavior now applied going forward at commitment creation
 * (FundraisingSrdService.createCommitment) and admission (FundraisingSrdService.admitCommitment):
 * a commitment's compliance status reflects the investor's KYC status rather than requiring a
 * separate re-confirmation per commitment, since nothing in the fundraising SRDs calls for
 * per-commitment re-confirmation and the real admission gate (checkComplianceBlocked) already
 * reads investor-level kycStatus/sanctionsStatus directly.
 *
 * Only touches commitments where compliance_status IS NULL — never overwrites an explicit value
 * someone already recorded via PATCH /fundraising/commitments/:id. Idempotent.
 *
 * Run: npx ts-node scripts/backfill-fundraising-commitment-compliance-status.ts
 *   (or: npx ts-node -T scripts/backfill-fundraising-commitment-compliance-status.ts)
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";

async function main() {
  console.log("backfill-fundraising-commitment-compliance-status: starting…\n");

  const commitments = await prisma.fundraisingCommitment.findMany({
    where: { complianceStatus: null },
    select: {
      id: true,
      investorId: true,
      status: true,
      investor: { select: { id: true, legalName: true, kycStatus: true } },
    },
  });

  console.log(`found ${commitments.length} commitment(s) with complianceStatus = null\n`);

  let updated = 0;
  const byKyc: Record<string, number> = {};
  for (const c of commitments) {
    const kyc = c.investor?.kycStatus || null;
    if (!kyc) {
      console.log(`  skip ${c.id} — investor ${c.investorId} has no kycStatus`);
      continue;
    }
    await prisma.fundraisingCommitment.update({
      where: { id: c.id },
      data: { complianceStatus: kyc },
    });
    updated += 1;
    byKyc[kyc] = (byKyc[kyc] || 0) + 1;
    console.log(`  ${c.id} (${c.investor?.legalName ?? c.investorId}, status=${c.status}) -> complianceStatus=${kyc}`);
  }

  console.log(`\ndone. updated ${updated}/${commitments.length} commitment(s).`);
  console.log("by resulting complianceStatus:", byKyc);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
