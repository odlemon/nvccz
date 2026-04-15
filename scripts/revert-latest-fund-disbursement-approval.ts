/**
 * Reverts the latest CFO-approved fund disbursement for retesting:
 * PENDING + restore fund cap, delete cashbook + journal, and when no DISBURSED
 * tranches remain on the implementation, roll application back to INVESTMENT_IMPLEMENTATION
 * and implementation to IN_PROGRESS.
 *
 * Usage: npx ts-node scripts/revert-latest-fund-disbursement-approval.ts
 */
import "dotenv/config";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../src/utils/database";

async function main() {
  const fd = await prisma.fundDisbursement.findFirst({
    where: {
      status: { in: ["APPROVED", "DISBURSED"] },
      cashbookEntryId: { not: null }
    },
    orderBy: { updatedAt: "desc" },
    include: { fund: true }
  });

  if (!fd) {
    console.log("No APPROVED/DISBURSED fund disbursement with cashbook link found.");
    return;
  }

  const cashbookId = fd.cashbookEntryId!;
  const entry = await prisma.cashbookEntry.findUnique({
    where: { id: cashbookId },
    select: { id: true, journalEntryId: true, description: true, type: true }
  });

  const implementationId = fd.investmentImplementationId;

  if (!entry) {
    console.error(`Cashbook ${cashbookId} missing; clearing FD link only.`);
    await prisma.fundDisbursement.update({
      where: { id: fd.id },
      data: {
        status: "PENDING",
        approvedById: null,
        approvedAt: null,
        disbursedById: null,
        disbursedAt: null,
        transactionReference: null,
        cashbookEntryId: null,
        updatedAt: new Date()
      }
    });
    return;
  }

  const deduct =
    fd.amountCommitmentCurrency != null
      ? new Decimal(fd.amountCommitmentCurrency)
      : new Decimal(fd.amount);

  await prisma.$transaction(
    async (tx) => {
      await tx.fund.update({
        where: { id: fd.fundId },
        data: {
          remainingAmount: fd.fund.remainingAmount.plus(deduct),
          updatedAt: new Date()
        }
      });
      await tx.fundDisbursement.update({
        where: { id: fd.id },
        data: {
          status: "PENDING",
          approvedById: null,
          approvedAt: null,
          disbursedById: null,
          disbursedAt: null,
          transactionReference: null,
          cashbookEntryId: null,
          updatedAt: new Date()
        }
      });
      const jeId = entry.journalEntryId;
      await tx.cashbookEntry.update({
        where: { id: cashbookId },
        data: { journalEntryId: null }
      });
      if (jeId) {
        await tx.journalEntry.delete({ where: { id: jeId } });
      }
      await tx.cashbookEntry.delete({ where: { id: cashbookId } });

      const stillDisbursed = await tx.fundDisbursement.count({
        where: {
          investmentImplementationId: implementationId,
          status: "DISBURSED"
        }
      });
      if (stillDisbursed === 0) {
        await tx.investmentImplementation.update({
          where: { id: implementationId },
          data: {
            fundsDisbursed: false,
            status: "IN_PROGRESS",
            completedAt: null,
            updatedAt: new Date()
          }
        });
        const impl = await tx.investmentImplementation.findUnique({
          where: { id: implementationId },
          select: { applicationId: true }
        });
        if (impl?.applicationId) {
          await tx.application.update({
            where: { id: impl.applicationId },
            data: {
              currentStage: "INVESTMENT_IMPLEMENTATION",
              updatedAt: new Date()
            }
          });
        }
      }
    },
    { maxWait: 15_000, timeout: 60_000 }
  );

  console.log(`Reverted disbursement ${fd.id}; deleted cashbook ${cashbookId}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
