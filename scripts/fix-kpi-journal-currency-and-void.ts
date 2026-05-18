/**
 * Fixes legacy KPI journals that used currencyId "USD" (invalid FK) then voids them.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { JournalEntryService } from "../src/services/JournalEntryService";

const prisma = new PrismaClient();
const REFS = [
  "KPI-cmosvdnvs000qktdcxdwuuuci-1778126440362",
  "KPI-cmosvp3ug000wktdch2ecksh9-1778126459830",
  "KPI-cmosvr11a000yktdcd7dw0lnj-1778126474303",
];

async function main() {
  const currency =
    (await prisma.currency.findFirst({ where: { isDefault: true, isActive: true } })) ||
    (await prisma.currency.findFirst({ where: { code: "USD", isActive: true } }));
  if (!currency) throw new Error("No USD/default currency");

  const admin = await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!admin) throw new Error("No user");

  for (const ref of REFS) {
    const je = await prisma.journalEntry.findFirst({
      where: { referenceNumber: ref, status: "POSTED" },
      select: { id: true, currencyId: true },
    });
    if (!je) {
      console.log(`[skip] ${ref} not POSTED or missing`);
      continue;
    }
    const cur = await prisma.currency.findUnique({ where: { id: je.currencyId } });
    if (!cur) {
      await prisma.journalEntry.update({
        where: { id: je.id },
        data: { currencyId: currency.id },
      });
      console.log(`[fix] ${ref} currencyId -> ${currency.id}`);
    }
    await JournalEntryService.voidJournalEntry(je.id, admin.id);
    console.log(`[void] ${ref}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
