/**
 * Removes a fund-disbursement cashbook payment + its journal when approval failed after
 * createCashPayment (e.g. interactive tx timeout). Safe if no FundDisbursement row links this cashbook.
 *
 * Usage: npx ts-node scripts/rollback-orphan-fund-disbursement-cashbook.ts [cashbookEntryId]
 *
 * Default id: cmnvqxjcq0004un9kzx2pfd7p (from logs; override with argv)
 */
import "dotenv/config";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../src/utils/database";

const DEFAULT_CB = "cmnvqxjcq0004un9kzx2pfd7p";

async function main() {
  const cashbookId = (process.argv[2] || DEFAULT_CB).trim();

  const entry = await prisma.cashbookEntry.findUnique({
    where: { id: cashbookId },
    select: {
      id: true,
      description: true,
      type: true,
      journalEntryId: true,
      reference: true,
    },
  });

  if (!entry) {
    console.error(`Cashbook entry not found: ${cashbookId}`);
    process.exit(1);
  }

  if (entry.type !== "PAYMENT" || !String(entry.description).includes("Fund Disbursement")) {
    console.error(
      "Refusing: entry does not look like a fund disbursement cashbook payment (type PAYMENT + description contains 'Fund Disbursement')."
    );
    process.exit(1);
  }

  const linkedFd = await prisma.fundDisbursement.findFirst({
    where: { cashbookEntryId: cashbookId },
    include: { fund: true },
  });

  await prisma.$transaction(
    async (tx) => {
      if (linkedFd) {
        if (linkedFd.status === "APPROVED") {
          const deduct =
            linkedFd.amountCommitmentCurrency != null
              ? new Decimal(linkedFd.amountCommitmentCurrency)
              : new Decimal(linkedFd.amount);
          await tx.fund.update({
            where: { id: linkedFd.fundId },
            data: {
              remainingAmount: linkedFd.fund.remainingAmount.plus(deduct),
              updatedAt: new Date(),
            },
          });
        }
        await tx.fundDisbursement.update({
          where: { id: linkedFd.id },
          data: {
            status: "PENDING",
            approvedById: null,
            approvedAt: null,
            cashbookEntryId: null,
            updatedAt: new Date(),
          },
        });
        console.log(`Cleared fund_disbursements row ${linkedFd.id} → PENDING, restored fund cap if was APPROVED.`);
      }

      const jeId = entry.journalEntryId;
      await tx.cashbookEntry.update({
        where: { id: cashbookId },
        data: { journalEntryId: null },
      });
      if (jeId) {
        await tx.journalEntry.delete({ where: { id: jeId } });
        console.log(`Deleted journal entry ${jeId}`);
      }
      await tx.cashbookEntry.delete({ where: { id: cashbookId } });
      console.log(`Deleted cashbook entry ${cashbookId}`);
    },
    { maxWait: 15_000, timeout: 60_000 }
  );

  console.log("Rollback complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
