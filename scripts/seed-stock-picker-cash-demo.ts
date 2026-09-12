/**
 * Seed Sunrise Stock Picker Cash fixtures on DEV `nts` only.
 * Idempotent upserts by provider code / portfolio / client vehicle markers.
 *
 * Usage: npm run db:seed:stock-picker-cash
 *
 * Exports seedSunrise() so UAT scripts can call it in-process.
 */
// @ts-nocheck
import "dotenv/config";
import { createHash, createCipheriv, randomBytes } from "crypto";
import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { assertDevDatabase } from "./lib/assert-dev-database";
import {
  CHECKER_EMAIL,
  CLIENT_A,
  CLIENT_B,
  CURRENCY,
  LEGAL_ENTITY_ID,
  MAKER_EMAIL,
  OPENING_SOURCE_EVENT_ID,
  PORTFOLIO_ID,
  TENANT_ID,
  findOrCreateCheckerUser,
  fingerprint,
} from "./lib/stock-picker-cash-uat-helpers";

const defaultPrisma = new PrismaClient() as any;
let prisma = defaultPrisma;

const PROVIDER_CODE = "CBZ_CUSTODY";
const TOLERANCE_CODE = "SP-CASH-USD-DEFAULT";
const MATCH_WEIGHT_CODE = "SP-CASH-DEFAULT-WEIGHTS";
const OPENING_AMOUNT = "10000.00";
const EXTERNAL_SUNRISE = "ZAM-001-001";
const EXTERNAL_SUSPENSE = "ZAM-SUSP-001";
const EXTERNAL_CLIENT_B = "ZAM-B-001";
const MASKED_SUNRISE = "ZAM-001-001";

function logId(label: string, id: string | null | undefined, extra = "") {
  console.log(`  ${label}=${id || "(none)"}${extra ? ` ${extra}` : ""}`);
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

async function ensureProvider() {
  let p = await prisma.spCashProvider.findUnique({ where: { code: PROVIDER_CODE } });
  if (!p) {
    p = await prisma.spCashProvider.create({
      data: {
        tenantId: TENANT_ID,
        code: PROVIDER_CODE,
        displayName: "CBZ Custody / CBZ Bank",
        providerType: "CUSTODIAN",
        status: "ACTIVE",
        version: 1,
      },
    });
    console.log(`[ok] created provider ${PROVIDER_CODE}`);
  } else if (p.status !== "ACTIVE") {
    p = await prisma.spCashProvider.update({
      where: { id: p.id },
      data: { status: "ACTIVE", displayName: "CBZ Custody / CBZ Bank" },
    });
    console.log(`[ok] activated provider ${PROVIDER_CODE}`);
  } else {
    console.log(`[ok] reused provider ${PROVIDER_CODE}`);
  }
  return p;
}

async function ensureFileLayout(providerId: string) {
  let layout = await prisma.spCashFileLayout.findFirst({
    where: { providerId, layoutCode: "CBZ_CSV_V1" },
  });
  if (!layout) {
    layout = await prisma.spCashFileLayout.create({
      data: {
        providerId,
        layoutCode: "CBZ_CSV_V1",
        versionNo: 1,
        signMapJson: { Debit: "NEGATIVE", Credit: "POSITIVE" },
        dateMapJson: { valueDate: "value_date", tradeDate: "trade_date" },
        status: "ACTIVE",
        effectiveFrom: new Date("2020-01-01"),
      },
    });
    console.log("[ok] created file layout CBZ_CSV_V1");
  } else if (layout.status !== "ACTIVE") {
    layout = await prisma.spCashFileLayout.update({
      where: { id: layout.id },
      data: { status: "ACTIVE" },
    });
  }
  return layout;
}

async function ensureTolerancePolicy() {
  let row = await prisma.spCashTolerancePolicy.findUnique({ where: { code: TOLERANCE_CODE } });
  if (!row) {
    row = await prisma.spCashTolerancePolicy.create({
      data: {
        code: TOLERANCE_CODE,
        currency: CURRENCY,
        amountTolerance: new Decimal("0.01"),
        dateToleranceDays: 2,
        status: "ACTIVE",
        version: 1,
        effectiveFrom: new Date("2020-01-01"),
        configJson: { seed: "stock-picker-cash" },
      },
    });
    console.log(`[ok] created tolerance policy ${TOLERANCE_CODE}`);
  } else if (row.status !== "ACTIVE") {
    row = await prisma.spCashTolerancePolicy.update({
      where: { id: row.id },
      data: { status: "ACTIVE" },
    });
    console.log(`[ok] activated tolerance policy ${TOLERANCE_CODE}`);
  } else {
    console.log(`[ok] reused tolerance policy ${TOLERANCE_CODE}`);
  }
  return row;
}

async function ensureMatchWeightPolicy() {
  let row = await prisma.spCashMatchWeightPolicy.findUnique({ where: { code: MATCH_WEIGHT_CODE } });
  if (!row) {
    row = await prisma.spCashMatchWeightPolicy.create({
      data: {
        code: MATCH_WEIGHT_CODE,
        amountWeight: new Decimal("0.50"),
        dateWeight: new Decimal("0.20"),
        referenceWeight: new Decimal("0.20"),
        counterpartyWeight: new Decimal("0.10"),
        autoMatchThreshold: new Decimal("0.95"),
        suggestThreshold: new Decimal("0.70"),
        weakThreshold: new Decimal("0.50"),
        status: "ACTIVE",
        version: 1,
        effectiveFrom: new Date("2020-01-01"),
      },
    });
    console.log(`[ok] created match-weight policy ${MATCH_WEIGHT_CODE}`);
  } else if (row.status !== "ACTIVE") {
    row = await prisma.spCashMatchWeightPolicy.update({
      where: { id: row.id },
      data: { status: "ACTIVE" },
    });
    console.log(`[ok] activated match-weight policy ${MATCH_WEIGHT_CODE}`);
  } else {
    console.log(`[ok] reused match-weight policy ${MATCH_WEIGHT_CODE}`);
  }
  return row;
}

async function ensureClientAccount(opts: {
  providerId: string;
  tolerancePolicyId: string;
  clientOrVehicleId: string;
  portfolioId: string;
  accountType: string;
  ownerModel: string;
  externalId: string;
  masked: string;
  clientName: string;
  moneyClass?: string;
  createdById?: string;
  approvedById?: string;
}) {
  const fp = fingerprint([opts.providerId, opts.externalId, CURRENCY]);
  let acct = await prisma.spCashClientAccount.findFirst({
    where: {
      OR: [
        { providerId: opts.providerId, externalFingerprint: fp, currency: CURRENCY },
        {
          portfolioId: opts.portfolioId,
          clientOrVehicleId: opts.clientOrVehicleId,
          accountType: opts.accountType,
          currency: CURRENCY,
        },
      ],
    },
  });

  const base = {
    tenantId: TENANT_ID,
    legalEntityId: LEGAL_ENTITY_ID,
    clientOrVehicleId: opts.clientOrVehicleId,
    portfolioId: opts.portfolioId,
    ownerModel: opts.ownerModel,
    moneyClass: opts.moneyClass || "CLIENT_CASH",
    accountType: opts.accountType,
    providerId: opts.providerId,
    externalIdentifierEncrypted: encryptExternalId(opts.externalId),
    externalFingerprint: fp,
    maskedIdentifier: opts.masked,
    accountNumberMasked: opts.masked,
    currency: CURRENCY,
    status: "ACTIVE",
    effectiveFrom: new Date("2020-01-01"),
    tolerancePolicyId: opts.tolerancePolicyId,
    clientName: opts.clientName,
    createdById: opts.createdById || null,
    approvedById: opts.approvedById || null,
  };

  if (!acct) {
    acct = await prisma.spCashClientAccount.create({ data: { ...base, version: 1 } });
    console.log(`[ok] created account ${opts.clientName} (${opts.accountType})`);
  } else {
    acct = await prisma.spCashClientAccount.update({
      where: { id: acct.id },
      data: {
        ...base,
        status: "ACTIVE",
      },
    });
    console.log(`[ok] upserted account ${opts.clientName} (${opts.accountType})`);
  }
  return acct;
}

async function releaseOpenReservations(cashAccountId: string) {
  const open = await prisma.spCashReservation.updateMany({
    where: {
      cashAccountId,
      status: { in: ["ACTIVE", "PARTIALLY_CONSUMED", "PENDING_APPROVAL", "OPEN"] },
    },
    data: {
      status: "RELEASED",
      remainingAmount: new Decimal(0),
      releasedAmount: new Decimal(0),
    },
  });
  if (open.count) console.log(`[ok] released ${open.count} open reservation(s)`);
}

async function ensureOpeningJournal(opts: {
  cashAccountId: string;
  portfolioId: string;
  makerId: string;
  checkerId: string;
}) {
  let journal = await prisma.spCashJournal.findFirst({
    where: {
      sourceEventId: OPENING_SOURCE_EVENT_ID,
      postingPurpose: "OPENING",
      status: "POSTED",
      cashAccountId: opts.cashAccountId,
    },
    include: { lines: true },
  });

  const valueDate = new Date("2024-01-01");
  if (!journal) {
    journal = await prisma.spCashJournal.create({
      data: {
        sourceSystem: "SEED",
        sourceEventId: OPENING_SOURCE_EVENT_ID,
        postingPurpose: "OPENING",
        idempotencyKey: `seed:${OPENING_SOURCE_EVENT_ID}:OPENING`,
        valueDate,
        settlementDate: valueDate,
        postingBusinessDate: valueDate,
        currency: CURRENCY,
        status: "POSTED",
        makerId: opts.makerId,
        checkerId: opts.checkerId,
        cashAccountId: opts.cashAccountId,
        portfolioId: opts.portfolioId,
        postedAt: new Date(),
        version: 1,
        lines: {
          create: [
            {
              ledgerAccountCode: "CASH",
              cashAccountId: opts.cashAccountId,
              debit: new Decimal(OPENING_AMOUNT),
              credit: new Decimal(0),
              signedCashAmount: new Decimal(OPENING_AMOUNT),
              currency: CURRENCY,
              description: "Opening cash — Sunrise / Zambezi",
              matchStatus: "UNMATCHED",
            },
            {
              ledgerAccountCode: "OPENING_EQUITY",
              cashAccountId: null,
              debit: new Decimal(0),
              credit: new Decimal(OPENING_AMOUNT),
              signedCashAmount: new Decimal(0),
              currency: CURRENCY,
              description: "Opening equity balancing line",
              matchStatus: null,
            },
          ],
        },
      },
      include: { lines: true },
    });
    console.log(`[ok] posted opening journal ${OPENING_SOURCE_EVENT_ID} USD ${OPENING_AMOUNT}`);
  } else {
    // Ensure maker/checker differ when possible
    if (opts.makerId && opts.checkerId && opts.makerId !== opts.checkerId) {
      await prisma.spCashJournal.update({
        where: { id: journal.id },
        data: { makerId: opts.makerId, checkerId: opts.checkerId },
      });
    }
    console.log(`[ok] reused opening journal ${journal.id}`);
  }
  return journal;
}

/** Bring posted cash back to 10000 by posting a balancing adjustment when needed. */
async function rebalanceToOpening(cashAccountId: string, portfolioId: string, makerId: string, checkerId: string) {
  const journals = await prisma.spCashJournal.findMany({
    where: {
      status: "POSTED",
      currency: CURRENCY,
      OR: [{ cashAccountId }, { lines: { some: { cashAccountId } } }],
    },
    include: { lines: true },
  });
  let posted = new Decimal(0);
  for (const j of journals) {
    for (const line of j.lines) {
      if (line.cashAccountId && line.cashAccountId !== cashAccountId) continue;
      if (!line.cashAccountId && j.cashAccountId !== cashAccountId) continue;
      posted = posted.plus(new Decimal(String(line.signedCashAmount || 0)));
    }
  }
  const target = new Decimal(OPENING_AMOUNT);
  const delta = target.minus(posted);
  if (delta.abs().lt(new Decimal("0.005"))) {
    console.log(`[ok] posted cash already ${OPENING_AMOUNT}`);
    return;
  }

  const key = `seed:rebalance:${cashAccountId}:${Date.now()}`;
  const abs = delta.abs();
  const isInflow = delta.gt(0);
  await prisma.spCashJournal.create({
    data: {
      sourceSystem: "SEED",
      sourceEventId: `REBALANCE-${cashAccountId.slice(0, 8)}`,
      postingPurpose: "REBALANCE",
      idempotencyKey: key,
      valueDate: new Date(),
      settlementDate: new Date(),
      postingBusinessDate: new Date(),
      currency: CURRENCY,
      status: "POSTED",
      makerId,
      checkerId: checkerId !== makerId ? checkerId : makerId,
      cashAccountId,
      portfolioId,
      postedAt: new Date(),
      version: 1,
      lines: {
        create: [
          {
            ledgerAccountCode: "CASH",
            cashAccountId,
            debit: isInflow ? abs : new Decimal(0),
            credit: isInflow ? new Decimal(0) : abs,
            signedCashAmount: isInflow ? abs : abs.negated(),
            currency: CURRENCY,
            description: `Seed rebalance to ${OPENING_AMOUNT}`,
            matchStatus: "UNMATCHED",
          },
          {
            ledgerAccountCode: isInflow ? "OPENING_EQUITY" : "SETTLEMENT",
            cashAccountId: null,
            debit: isInflow ? new Decimal(0) : abs,
            credit: isInflow ? abs : new Decimal(0),
            signedCashAmount: new Decimal(0),
            currency: CURRENCY,
            description: "Seed rebalance balancing line",
            matchStatus: null,
          },
        ],
      },
    },
  });
  console.log(`[ok] rebalanced posted cash by ${delta.toFixed(2)} → ${OPENING_AMOUNT}`);
}

export type SunriseSeedResult = {
  providerId: string;
  layoutId: string;
  tolerancePolicyId: string;
  matchWeightPolicyId: string;
  accountId: string;
  portfolioId: string;
  suspenseAccountId: string;
  clientBAccountId: string;
  openingJournalId: string;
  makerId: string;
  checkerId: string;
  legalEntityId: string;
  tenantId: string;
  clientOrVehicleId: string;
  clientBOrVehicleId: string;
  currency: string;
};

export async function seedSunrise(client?: PrismaClient): Promise<SunriseSeedResult> {
  prisma = (client as any) || defaultPrisma;

  await assertDevDatabase(prisma, "seed:stock-picker-cash");

  const maker =
    (await prisma.user.findUnique({ where: { email: MAKER_EMAIL } })) ||
    (await prisma.user.findFirst({ orderBy: { createdAt: "asc" } }));
  if (!maker) throw new Error(`No maker user found (expected ${MAKER_EMAIL})`);

  const checker = await findOrCreateCheckerUser(prisma);
  const makerId = maker.id;
  const checkerId = checker.id !== maker.id ? checker.id : maker.id;
  if (checkerId === makerId) {
    console.warn("[warn] maker and checker are the same user — maker-checker UATs may fail");
  }

  console.log("\n=== Stock Picker Cash — Sunrise seed ===\n");

  const provider = await ensureProvider();
  const layout = await ensureFileLayout(provider.id);
  const tolerance = await ensureTolerancePolicy();
  const matchWeights = await ensureMatchWeightPolicy();

  const sunrise = await ensureClientAccount({
    providerId: provider.id,
    tolerancePolicyId: tolerance.id,
    clientOrVehicleId: CLIENT_A,
    portfolioId: PORTFOLIO_ID,
    accountType: "CUSTODY_CASH",
    ownerModel: "SEGREGATED",
    externalId: EXTERNAL_SUNRISE,
    masked: MASKED_SUNRISE,
    clientName: "Sunrise Asset / Zambezi",
    createdById: makerId,
    approvedById: checkerId,
  });

  const suspense = await ensureClientAccount({
    providerId: provider.id,
    tolerancePolicyId: tolerance.id,
    clientOrVehicleId: CLIENT_A,
    portfolioId: PORTFOLIO_ID,
    accountType: "SUSPENSE",
    ownerModel: "SEGREGATED",
    externalId: EXTERNAL_SUSPENSE,
    masked: "ZAM-SUS***001",
    clientName: "Sunrise Suspense (AT-08)",
    moneyClass: "SUSPENSE",
    createdById: makerId,
    approvedById: checkerId,
  });

  const clientB = await ensureClientAccount({
    providerId: provider.id,
    tolerancePolicyId: tolerance.id,
    clientOrVehicleId: CLIENT_B,
    portfolioId: "SPF-ZSE-002",
    accountType: "CUSTODY_CASH",
    ownerModel: "SEGREGATED",
    externalId: EXTERNAL_CLIENT_B,
    masked: "ZAM-B***001",
    clientName: "Client B (AT-15)",
    createdById: makerId,
    approvedById: checkerId,
  });

  await releaseOpenReservations(sunrise.id);
  const opening = await ensureOpeningJournal({
    cashAccountId: sunrise.id,
    portfolioId: PORTFOLIO_ID,
    makerId,
    checkerId,
  });
  await rebalanceToOpening(sunrise.id, PORTFOLIO_ID, makerId, checkerId);

  // Optional: small suspense posting so AT-08 has balance that must not inflate available
  const suspenseOpen = await prisma.spCashJournal.findFirst({
    where: {
      sourceEventId: "OPENING-SUSPENSE-v1",
      postingPurpose: "OPENING",
      status: "POSTED",
      cashAccountId: suspense.id,
    },
  });
  if (!suspenseOpen) {
    await prisma.spCashJournal.create({
      data: {
        sourceSystem: "SEED",
        sourceEventId: "OPENING-SUSPENSE-v1",
        postingPurpose: "OPENING",
        idempotencyKey: "seed:OPENING-SUSPENSE-v1:OPENING",
        valueDate: new Date("2024-01-01"),
        settlementDate: new Date("2024-01-01"),
        currency: CURRENCY,
        status: "POSTED",
        makerId,
        checkerId,
        cashAccountId: suspense.id,
        portfolioId: PORTFOLIO_ID,
        postedAt: new Date(),
        version: 1,
        lines: {
          create: [
            {
              ledgerAccountCode: "CASH",
              cashAccountId: suspense.id,
              debit: new Decimal("500.00"),
              credit: new Decimal(0),
              signedCashAmount: new Decimal("500.00"),
              currency: CURRENCY,
              description: "Suspense opening (excluded from available)",
            },
            {
              ledgerAccountCode: "OPENING_EQUITY",
              debit: new Decimal(0),
              credit: new Decimal("500.00"),
              signedCashAmount: new Decimal(0),
              currency: CURRENCY,
              description: "Suspense equity",
            },
          ],
        },
      },
    });
    console.log("[ok] posted suspense opening USD 500");
  }

  console.log("\n── Account IDs ──");
  logId("providerId", provider.id, PROVIDER_CODE);
  logId("layoutId", layout.id);
  logId("tolerancePolicyId", tolerance.id);
  logId("matchWeightPolicyId", matchWeights.id);
  logId("sunriseAccountId", sunrise.id, `portfolio=${PORTFOLIO_ID} masked=${MASKED_SUNRISE}`);
  logId("suspenseAccountId", suspense.id, "AT-08");
  logId("clientBAccountId", clientB.id, `client=${CLIENT_B}`);
  logId("openingJournalId", opening.id);
  logId("makerId", makerId, MAKER_EMAIL);
  logId("checkerId", checkerId, CHECKER_EMAIL);
  console.log("");

  return {
    providerId: provider.id,
    layoutId: layout.id,
    tolerancePolicyId: tolerance.id,
    matchWeightPolicyId: matchWeights.id,
    accountId: sunrise.id,
    portfolioId: PORTFOLIO_ID,
    suspenseAccountId: suspense.id,
    clientBAccountId: clientB.id,
    openingJournalId: opening.id,
    makerId,
    checkerId,
    legalEntityId: LEGAL_ENTITY_ID,
    tenantId: TENANT_ID,
    clientOrVehicleId: CLIENT_A,
    clientBOrVehicleId: CLIENT_B,
    currency: CURRENCY,
  };
}

async function main() {
  try {
    await seedSunrise(defaultPrisma);
    console.log("[done] seed-stock-picker-cash-demo");
  } finally {
    await defaultPrisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
