/**
 * Prints a ready-to-paste Postman JSON body using real IDs from the connected DB.
 * Run: npx ts-node --transpile-only scripts/print-batch-pay-postman-body.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const where = {
    status: "POSTED" as const,
    paymentMethod: "CREDIT" as const,
    paymentStatus: { not: "PAID" as const },
    cashbookEntryId: null,
    journalEntryId: { not: null },
  };

  const candidates = await prisma.purchaseInvoice.findMany({
    where,
    select: {
      id: true,
      invoiceNumber: true,
      currencyId: true,
      outstandingAmount: true,
    },
    orderBy: { createdAt: "desc" },
    take: 80,
  });

  const withBal = candidates.filter((i) => Number(i.outstandingAmount) > 0.009);
  const byCur = new Map<string, typeof withBal>();
  for (const i of withBal) {
    const arr = byCur.get(i.currencyId) || [];
    arr.push(i);
    byCur.set(i.currencyId, arr);
  }

  let chosen: { currencyId: string; invoices: typeof withBal; bank: { id: string; name: string } } | null =
    null;

  for (const [currencyId, invoices] of byCur) {
    const bank = await prisma.bank.findFirst({
      where: { isActive: true, currencyId, glAccountId: { not: null } },
      select: { id: true, name: true },
    });
    if (bank && invoices.length > 0) {
      chosen = { currencyId, invoices, bank };
      break;
    }
  }

  if (!chosen) {
    console.log(
      JSON.stringify(
        {
          error:
            "No batch-ready vendor bills (POSTED + CREDIT + outstanding + no cashbookEntryId) with an active bank in the same currency.",
          hint: "Run UAT to create bills: npm run test:uat:vendor-batch-pay — or submit CREDIT bills and ensure a bank exists for that currency.",
        },
        null,
        2
      )
    );
    return;
  }

  const slice = chosen.invoices.slice(0, 10);
  const body = {
    invoiceIds: slice.map((x) => x.id),
    paymentMethod: "BANK" as const,
    bankId: chosen.bank.id,
    paymentDate: new Date().toISOString(),
    paymentReference: `BATCH-POSTMAN-${Date.now()}`,
    notes: "IDs from print-batch-pay-postman-body.ts",
  };

  console.log(
    JSON.stringify(
      {
        _comment: "Paste `postmanBody` into Postman raw JSON. Requires Authorization: Bearer <token>.",
        meta: {
          currencyId: chosen.currencyId,
          bankId: chosen.bank.id,
          bankName: chosen.bank.name,
          billsUsed: slice.length,
          invoiceNumbers: slice.map((x) => x.invoiceNumber),
        },
        postmanBody: body,
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
