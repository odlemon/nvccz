/**
 * Sets investment_implementations.commitment_currency_id where NULL.
 * Uses the same default as the API: active currency with isDefault, else code USD.
 *
 * Run: npm run db:backfill:implementation-commitment-currency
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function defaultCommitmentCurrencyId(): Promise<string> {
  const cur =
    (await prisma.currency.findFirst({ where: { isDefault: true, isActive: true } })) ||
    (await prisma.currency.findFirst({ where: { code: "USD", isActive: true } }));
  if (!cur) {
    throw new Error(
      "No default currency (isDefault) or USD in currencies. Add one before running this script."
    );
  }
  return cur.id;
}

async function main() {
  const currencyId = await defaultCommitmentCurrencyId();
  const cur = await prisma.currency.findUnique({ where: { id: currencyId }, select: { code: true } });

  const result = await prisma.investmentImplementation.updateMany({
    where: { commitmentCurrencyId: null },
    data: { commitmentCurrencyId: currencyId }
  });

  console.log(
    `[ok] Set commitment_currency_id to ${cur?.code ?? currencyId} on ${result.count} investment implementation(s).`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
