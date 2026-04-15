/**
 * Sets a fund disbursement back to PENDING so CFO can approve after a mistaken reject.
 * Rejection only changes status + notes; this does not touch fund remainingAmount or cashbook.
 *
 * Usage:
 *   npx ts-node scripts/reset-rejected-fund-disbursement-to-pending.ts
 *   npx ts-node scripts/reset-rejected-fund-disbursement-to-pending.ts <disbursementId>
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";

async function main() {
  const idArg = process.argv[2]?.trim();

  const fd = idArg
    ? await prisma.fundDisbursement.findUnique({ where: { id: idArg } })
    : await prisma.fundDisbursement.findFirst({
        where: { status: "REJECTED" },
        orderBy: { updatedAt: "desc" }
      });

  if (!fd) {
    console.log(idArg ? `No disbursement with id ${idArg}.` : "No REJECTED fund disbursement found.");
    process.exit(1);
  }

  if (fd.status !== "REJECTED") {
    console.error(
      `Disbursement ${fd.id} has status "${fd.status}" — only REJECTED can be reset with this script.`
    );
    process.exit(1);
  }

  await prisma.fundDisbursement.update({
    where: { id: fd.id },
    data: {
      status: "PENDING",
      updatedAt: new Date()
    }
  });

  console.log(`Reset disbursement ${fd.id} to PENDING (notes left unchanged for audit).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
