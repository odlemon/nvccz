/**
 * Sets commitment currency to USD on the most recently created investment implementation
 * (and aligns its fund_disbursements commitment_currency_id when null).
 *
 * Picks `currencies` row: code USD (case-insensitive), else isDefault, else first active.
 *
 * Run: npm run db:fix:latest-implementation-usd-currency
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function resolveUsdCurrencyId(): Promise<{ id: string; code: string }> {
  const all = await prisma.currency.findMany({
    where: { isActive: true },
    select: { id: true, code: true, isDefault: true }
  });
  const usd = all.find((c) => c.code.toUpperCase() === "USD");
  if (usd) {
    return { id: usd.id, code: usd.code };
  }
  const def = all.find((c) => c.isDefault);
  if (def) {
    console.warn("[warn] No USD currency; using isDefault:", def.code);
    return { id: def.id, code: def.code };
  }
  const any = all[0];
  if (any) {
    console.warn("[warn] No USD or default; using first active currency:", any.code);
    return { id: any.id, code: any.code };
  }
  throw new Error("No active currencies in database. Seed currencies first.");
}

async function main() {
  const latest = await prisma.investmentImplementation.findFirst({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      applicationId: true,
      commitmentCurrencyId: true,
      createdAt: true
    }
  });

  if (!latest) {
    console.log("[skip] No investment implementations found.");
    return;
  }

  const { id: usdId, code } = await resolveUsdCurrencyId();

  await prisma.investmentImplementation.update({
    where: { id: latest.id },
    data: { commitmentCurrencyId: usdId }
  });

  const disb = await prisma.fundDisbursement.updateMany({
    where: {
      investmentImplementationId: latest.id,
      OR: [{ commitmentCurrencyId: null }, { commitmentCurrencyId: { not: usdId } }]
    },
    data: {
      commitmentCurrencyId: usdId
    }
  });

  console.log(
    `[ok] Latest implementation ${latest.id} (application ${latest.applicationId}, created ${latest.createdAt.toISOString()})`
  );
  console.log(
    `     commitment_currency_id -> ${code} (${usdId})  [was: ${latest.commitmentCurrencyId ?? "null"}]`
  );
  console.log(`     fund_disbursements updated (commitment currency aligned): ${disb.count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
