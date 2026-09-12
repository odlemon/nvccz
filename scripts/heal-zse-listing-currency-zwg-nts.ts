/**
 * Heal ZSE listing currency: demo seeds incorrectly used USD for ZSE names
 * (CBZ, ECO, DLTA, …). ZSE board currency is ZWG (Mansa default).
 * DEV DB only (`nts`).
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { assertDevDatabase } from "./lib/assert-dev-database";

const prisma = new PrismaClient();

async function main() {
  await assertDevDatabase(prisma, "heal-zse-zwg");

  const badSecs = await prisma.listedEquitySecurity.findMany({
    where: { exchangeCode: "ZSE", listingCurrencyCode: { not: "ZWG" } },
    select: { id: true, symbol: true, listingCurrencyCode: true },
    orderBy: { symbol: "asc" },
  });
  console.log(
    `[heal-zse-zwg] ZSE securities not ZWG: ${badSecs.length}`,
    badSecs.map((s) => `${s.symbol}=${s.listingCurrencyCode}`).join(", ") || "(none)"
  );

  if (badSecs.length) {
    const ids = badSecs.map((s) => s.id);
    const secResult = await prisma.listedEquitySecurity.updateMany({
      where: { id: { in: ids } },
      data: { listingCurrencyCode: "ZWG" },
    });
    console.log(`[heal-zse-zwg] securities updated=${secResult.count}`);

    const instResult = await prisma.investmentInstrument.updateMany({
      where: {
        OR: [
          { listedEquitySecurityId: { in: ids } },
          { exchangeCode: "ZSE", listingCurrencyCode: { not: "ZWG" } },
        ],
      },
      data: { listingCurrencyCode: "ZWG" },
    });
    console.log(`[heal-zse-zwg] instruments updated=${instResult.count}`);
  } else {
    const instResult = await prisma.investmentInstrument.updateMany({
      where: { exchangeCode: "ZSE", listingCurrencyCode: { not: "ZWG" } },
      data: { listingCurrencyCode: "ZWG" },
    });
    console.log(`[heal-zse-zwg] instruments updated=${instResult.count}`);
  }

  const cbz = await prisma.listedEquitySecurity.findFirst({
    where: { symbol: "CBZ", exchangeCode: "ZSE" },
    select: { symbol: true, exchangeCode: true, listingCurrencyCode: true },
  });
  const cbzInst = await prisma.investmentInstrument.findFirst({
    where: { ticker: "CBZ", exchangeCode: "ZSE" },
    select: { instrumentCode: true, listingCurrencyCode: true },
  });
  console.log("[heal-zse-zwg] CBZ security", cbz);
  console.log("[heal-zse-zwg] CBZ instrument", cbzInst);

  if (cbz?.listingCurrencyCode !== "ZWG") {
    throw new Error("CBZ security still not ZWG");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
