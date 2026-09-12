/**
 * Investments V2 T0 UAT seed (DEV nts only).
 * Runs investment-ops presentation fixtures + Stock Picker Cash Sunrise masters,
 * then ensures a cash account on the primary Arcus listed fund id (orders fundId).
 *
 * Usage: npm run db:seed:investments-v2-t0
 */
import "dotenv/config";
import { createCipheriv, createHash, randomBytes } from "crypto";
import { spawnSync } from "child_process";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { assertDevDatabase } from "./lib/assert-dev-database";
import { seedSunrise } from "./seed-stock-picker-cash-demo";
import {
  CURRENCY,
  LEGAL_ENTITY_ID,
  TENANT_ID,
  fingerprint,
} from "./lib/stock-picker-cash-uat-helpers";

const prisma = new PrismaClient() as any;
const ROOT = path.resolve(__dirname, "..");

function runNpmScript(script: string, attempts = 2) {
  let lastStatus = 1;
  for (let i = 1; i <= attempts; i++) {
    console.log(`\n>>> npm run ${script}${attempts > 1 ? ` (attempt ${i}/${attempts})` : ""}\n`);
    const r = spawnSync("npm", ["run", script], {
      cwd: ROOT,
      stdio: "inherit",
      shell: true,
      env: { ...process.env },
    });
    lastStatus = r.status ?? 1;
    if (lastStatus === 0) return;
    if (i < attempts) {
      console.warn(`[warn] ${script} exit ${lastStatus}; retrying once (transient remote MySQL)…`);
    }
  }
  throw new Error(`${script} failed with exit ${lastStatus}`);
}

function encryptExternalId(plain: string): string {
  const secret =
    process.env.SP_CASH_ENCRYPTION_KEY ||
    process.env.VENDOR_ARTIFACTS_ENCRYPTION_KEY ||
    process.env.JWT_SECRET ||
    "dev-only-sp-cash-key";
  const key = createHash("sha256").update(String(secret)).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

async function main() {
  await assertDevDatabase(prisma, "seed:investments-v2-t0");

  runNpmScript("db:seed:investment-ops-demo");
  await seedSunrise(prisma);

  const primary = await prisma.fund.findFirst({
    where: { name: "Arcus Listed Portfolio", fundPurpose: "LISTED_EQUITY" },
  });
  if (!primary) throw new Error("Arcus Listed Portfolio missing after investment-ops seed");

  const instrument = await prisma.investmentInstrument.findFirst({
    where: { status: "ACTIVE", listedEquitySecurityId: { not: null }, ticker: "DLTA" },
  });
  const tick = instrument?.listedEquitySecurityId
    ? await prisma.listedEquityPriceTick.findFirst({
        where: {
          securityId: instrument.listedEquitySecurityId,
          validationStatus: { in: ["APPROVED", "API_CONFIRMED"] },
        },
        orderBy: { pricedAt: "desc" },
      })
    : null;

  const provider = await prisma.spCashProvider.findFirst({ where: { code: "CBZ_CUSTODY" } });
  const layout = provider
    ? await prisma.spCashFileLayout.findFirst({ where: { providerId: provider.id } })
    : null;
  const tolerance = await prisma.spCashTolerancePolicy.findFirst({
    where: { code: "SP-CASH-USD-DEFAULT" },
  });

  let cashOnFund = null as any;
  if (provider) {
    const externalId = `ARCS-LISTED-${primary.id}`;
    const fp = fingerprint([provider.id, externalId, CURRENCY]);
    cashOnFund = await prisma.spCashClientAccount.findFirst({
      where: {
        OR: [
          { providerId: provider.id, externalFingerprint: fp, currency: CURRENCY },
          { portfolioId: primary.id, currency: CURRENCY, accountType: "CUSTODY_CASH" },
        ],
      },
    });
    const base = {
      tenantId: TENANT_ID,
      legalEntityId: LEGAL_ENTITY_ID,
      clientOrVehicleId: `vehicle:${primary.id}`,
      portfolioId: primary.id,
      ownerModel: "SEGREGATED",
      moneyClass: "CLIENT_CASH",
      accountType: "CUSTODY_CASH",
      providerId: provider.id,
      externalIdentifierEncrypted: encryptExternalId(externalId),
      externalFingerprint: fp,
      maskedIdentifier: "****ARCS",
      accountNumberMasked: "****ARCS",
      currency: CURRENCY,
      status: "ACTIVE",
      effectiveFrom: new Date("2020-01-01"),
      tolerancePolicyId: tolerance?.id || null,
      clientName: primary.name,
    };
    if (!cashOnFund) {
      cashOnFund = await prisma.spCashClientAccount.create({ data: { ...base, version: 1 } });
      console.log(`[ok] created fund-linked cash account ${cashOnFund.id}`);
    } else {
      cashOnFund = await prisma.spCashClientAccount.update({
        where: { id: cashOnFund.id },
        data: { ...base, status: "ACTIVE" },
      });
      console.log(`[ok] upserted fund-linked cash account ${cashOnFund.id}`);
    }
  }

  const broker = await prisma.listedEquityStakeholderProfile.findFirst({
    where: { profileType: "BROKER", isActive: true },
  });
  const custodian = await prisma.listedEquityStakeholderProfile.findFirst({
    where: { profileType: "CUSTODIAN", isActive: true },
  });
  const portfolios = await prisma.fund.count({
    where: { fundPurpose: "LISTED_EQUITY", listedEquityFundConfig: { isNot: null } },
  });
  const cashCount = await prisma.spCashClientAccount.count({ where: { status: "ACTIVE" } });

  console.log("\n=== Investments V2 T0 seed summary (nts) ===");
  console.log(`listedEquityPortfolios: ${portfolios}`);
  console.log(`portfolioId (orders fundId): ${primary.id}  name=${primary.name}`);
  console.log(`instrumentId (DLTA ACTIVE): ${instrument?.id ?? "MISSING"}`);
  console.log(`listedEquitySecurityId: ${instrument?.listedEquitySecurityId ?? "MISSING"}`);
  console.log(`approvedPriceTickId: ${tick?.id ?? "MISSING"}  price=${tick?.price ?? "—"}`);
  console.log(`activeCashAccounts: ${cashCount}`);
  console.log(`cashAccountId (fund-linked): ${cashOnFund?.id ?? "MISSING"}`);
  console.log(`providerId: ${provider?.id ?? "MISSING"}`);
  console.log(`fileLayoutId: ${layout?.id ?? "MISSING"}`);
  console.log(`brokerProfileId: ${broker?.id ?? "MISSING"}  ${broker?.name ?? ""}`);
  console.log(`custodianProfileId: ${custodian?.id ?? "MISSING"}  ${custodian?.name ?? ""}`);
  console.log("\nUAT path APPROVED→trade: POST /orders/:id/execute (auto send-to-broker if needed)");
  console.log("  Headers: Idempotency-Key + expectedVersion / If-Match");
  console.log("\nNext: Remove-Item Env:DATABASE_URL; restart API; run T0 checklist.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
