#!/usr/bin/env ts-node
/**
 * HARD DELETE: all Bank rows and dependent cashbook / statement / reconciliation data.
 * Also removes JournalEntry rows that were only linked from those cashbook entries.
 *
 * DESTRUCTIVE. Run only when you intend to wipe bank operational data.
 *
 * Usage: npx ts-node scripts/hard-delete-all-banks.ts
 */

import { PrismaClient, type Prisma } from "@prisma/client";

const prisma = new PrismaClient();

async function countJournalRefs(tx: Prisma.TransactionClient, jid: string) {
  const [
    ce,
    exp,
    rev,
    inv,
    pproc,
    piJ,
    piPay,
    cn,
    fgl,
    bt,
  ] = await Promise.all([
    tx.cashbookEntry.count({ where: { journalEntryId: jid } }),
    tx.expense.count({ where: { journalEntryId: jid } }),
    tx.revenue.count({ where: { journalEntryId: jid } }),
    tx.invoice.count({ where: { journalEntryId: jid } }),
    tx.procurementInvoice.count({ where: { journalEntryId: jid } }),
    tx.purchaseInvoice.count({ where: { journalEntryId: jid } }),
    tx.purchaseInvoice.count({ where: { paymentJournalEntryId: jid } }),
    tx.creditNote.count({ where: { journalEntryId: jid } }),
    tx.forexGainLoss.count({ where: { journalEntryId: jid } }),
    tx.bankTransaction.count({ where: { matchedJournalEntryId: jid } }),
  ]);
  return ce + exp + rev + inv + pproc + piJ + piPay + cn + fgl + bt;
}

async function main() {
  console.log("Starting hard delete of all banks and linked cashbook data…");

  const result = await prisma.$transaction(
    async (tx) => {
      const banks = await tx.bank.findMany({ select: { id: true, name: true } });
      const bankIds = banks.map((b) => b.id);
      console.log(`Banks to remove: ${bankIds.length}`);

      if (bankIds.length === 0) {
        return { banksDeleted: 0, entriesDeleted: 0, journalsDeleted: 0 };
      }

      const entries = await tx.cashbookEntry.findMany({
        where: { bankId: { in: bankIds } },
        select: { id: true, journalEntryId: true },
      });
      const entryIds = entries.map((e) => e.id);
      const journalIdSet = new Set(
        entries.map((e) => e.journalEntryId).filter((x): x is string => Boolean(x)),
      );

      if (entryIds.length > 0) {
        await tx.purchaseInvoice.updateMany({
          where: { cashbookEntryId: { in: entryIds } },
          data: { cashbookEntryId: null },
        });
        await tx.procurementInvoice.updateMany({
          where: { cashbookEntryId: { in: entryIds } },
          data: { cashbookEntryId: null },
        });
        await tx.fundDisbursement.updateMany({
          where: { cashbookEntryId: { in: entryIds } },
          data: { cashbookEntryId: null },
        });

        await tx.paymentAllocation.deleteMany({
          where: { cashbookEntryId: { in: entryIds } },
        });
        await tx.contraEntry.deleteMany({
          where: { cashbookEntryId: { in: entryIds } },
        });

        await tx.reconciliationMismatch.deleteMany({
          where: { transactionId: { in: entryIds } },
        });

        await tx.bankStatementItem.updateMany({
          where: { matchedTransactionId: { in: entryIds } },
          data: { matchedTransactionId: null },
        });

        await tx.cashbookEntry.updateMany({
          where: { originalTransactionId: { in: entryIds } },
          data: { originalTransactionId: null },
        });
        await tx.cashbookEntry.updateMany({
          where: { id: { in: entryIds } },
          data: { originalTransactionId: null, transferId: null },
        });

        const transferIds = (
          await tx.cashbookTransfer.findMany({
            where: {
              OR: [{ fromBankId: { in: bankIds } }, { toBankId: { in: bankIds } }],
            },
            select: { id: true },
          })
        ).map((t) => t.id);

        if (transferIds.length > 0) {
          await tx.cashbookEntry.updateMany({
            where: { transferId: { in: transferIds } },
            data: { transferId: null },
          });
          await tx.cashbookTransfer.deleteMany({
            where: { id: { in: transferIds } },
          });
        }

        await tx.cashbookEntry.deleteMany({
          where: { id: { in: entryIds } },
        });
      } else {
        await tx.cashbookTransfer.deleteMany({
          where: {
            OR: [{ fromBankId: { in: bankIds } }, { toBankId: { in: bankIds } }],
          },
        });
      }

      const stmtIds = (
        await tx.bankStatement.findMany({
          where: { bankId: { in: bankIds } },
          select: { id: true },
        })
      ).map((s) => s.id);

      if (stmtIds.length > 0) {
        await tx.reconciliationMismatch.deleteMany({
          where: { statementId: { in: stmtIds } },
        });
        await tx.bankStatementItem.deleteMany({
          where: { statementId: { in: stmtIds } },
        });
        await tx.bankStatement.deleteMany({
          where: { id: { in: stmtIds } },
        });
      }

      await tx.bankReconciliation.deleteMany({
        where: { bankId: { in: bankIds } },
      });

      let journalsDeleted = 0;
      const journalIds = [...journalIdSet];
      if (journalIds.length > 0) {
        await tx.bankTransaction.updateMany({
          where: { matchedJournalEntryId: { in: journalIds } },
          data: { matchedJournalEntryId: null },
        });
        for (const jid of journalIds) {
          const refs = await countJournalRefs(tx, jid);
          if (refs === 0) {
            await tx.journalEntry.delete({ where: { id: jid } });
            journalsDeleted += 1;
          } else {
            console.warn(`Skipping journal ${jid}: still referenced (${refs} ref(s))`);
          }
        }
      }

      const delBank = await tx.bank.deleteMany({
        where: { id: { in: bankIds } },
      });

      return {
        banksDeleted: delBank.count,
        entriesDeleted: entryIds.length,
        journalsDeleted,
      };
    },
    { timeout: 300_000 },
  );

  console.log("Done:", result);
  const remaining = await prisma.bank.count();
  console.log(`Remaining banks in DB: ${remaining}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
