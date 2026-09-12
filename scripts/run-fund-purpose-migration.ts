/**
 * Fund purpose separation: PRIVATE_EQUITY vs LISTED_EQUITY.
 * Detaches listed-equity data from portfolio funds and creates/migrates to IO funds.
 *
 * Usage: npm run db:migrate:fund-purpose
 */
import "dotenv/config";
import { PrismaClient, Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

const prisma = new PrismaClient();

const LISTED_FUND_NAME = "Arcus Listed Portfolio";
const DEFAULT_COA_MAPPING = {
  listedSecuritiesAsset: "1501",
  bankClearing: "1100",
  realizedGain: "4010",
  realizedLoss: "5200",
};

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function indexExists(table: string, indexName: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    table,
    indexName
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function addColumnIfMissing() {
  if (await columnExists("funds", "fund_purpose")) {
    console.log("[skip] funds.fund_purpose");
    return;
  }
  await prisma.$executeRawUnsafe(
    `ALTER TABLE \`funds\` ADD COLUMN \`fund_purpose\` VARCHAR(32) NOT NULL DEFAULT 'PRIVATE_EQUITY'`
  );
  console.log("[ok] funds.fund_purpose");
}

async function addIndexIfMissing() {
  if (await indexExists("funds", "funds_fund_purpose_idx")) {
    console.log("[skip] funds_fund_purpose_idx");
    return;
  }
  await prisma.$executeRawUnsafe(`CREATE INDEX \`funds_fund_purpose_idx\` ON \`funds\` (\`fund_purpose\`)`);
  console.log("[ok] funds_fund_purpose_idx");
}

async function backfillPrivateEquity() {
  const r = await prisma.$executeRawUnsafe(
    `UPDATE \`funds\` SET \`fund_purpose\` = 'PRIVATE_EQUITY' WHERE \`fund_purpose\` IS NULL OR \`fund_purpose\` = ''`
  );
  console.log(`[ok] backfill PRIVATE_EQUITY (${r} rows)`);
}

async function findAdminUserId(): Promise<string> {
  const admin = await prisma.user.findFirst({
    where: { role: { name: { in: ["admin", "Admin", "System Administrator"] } } },
    select: { id: true },
  });
  if (admin) return admin.id;
  const any = await prisma.user.findFirst({ select: { id: true } });
  if (!any) throw new Error("No users in database — cannot create listed-equity fund");
  return any.id;
}

async function findTrustBankId(): Promise<string | null> {
  const bank = await prisma.bank.findFirst({ where: { isActive: true }, select: { id: true } });
  return bank?.id ?? null;
}

async function peFundsWithListedEquityActivity(): Promise<string[]> {
  const ids = new Set<string>();

  const configs = await prisma.listedEquityFundConfig.findMany({ select: { fundId: true } });
  for (const c of configs) ids.add(c.fundId);

  const tables: Array<{ name: string; query: () => Promise<Array<{ fundId: string }>> }> = [
    {
      name: "listed_equity_holdings",
      query: () => prisma.listedEquityHolding.findMany({ select: { fundId: true }, distinct: ["fundId"] }),
    },
    {
      name: "listed_equity_trades",
      query: () => prisma.listedEquityTrade.findMany({ select: { fundId: true }, distinct: ["fundId"] }),
    },
    {
      name: "investment_orders",
      query: () => prisma.investmentOrder.findMany({ select: { fundId: true }, distinct: ["fundId"] }),
    },
    {
      name: "investment_report_runs",
      query: () =>
        prisma.investmentReportRun.findMany({
          where: { fundId: { not: null } },
          select: { fundId: true },
          distinct: ["fundId"],
        }),
    },
  ];

  for (const t of tables) {
    const rows = await t.query();
    for (const r of rows) {
      if (r.fundId) ids.add(r.fundId);
    }
  }

  const peFunds = await prisma.fund.findMany({
    where: { id: { in: [...ids] }, fundPurpose: "PRIVATE_EQUITY" },
    select: { id: true, name: true },
  });
  return peFunds.map((f) => f.id);
}

async function rehomeFundId(table: string, column: string, fromId: string, toId: string): Promise<number> {
  const r = await prisma.$executeRawUnsafe(
    `UPDATE \`${table}\` SET \`${column}\` = ? WHERE \`${column}\` = ?`,
    toId,
    fromId
  );
  return Number(r);
}

async function migrateListedEquityData(sourceFundIds: string[], targetFundId: string) {
  const tables: Array<[string, string]> = [
    ["listed_equity_holdings", "fund_id"],
    ["listed_equity_trades", "fund_id"],
    ["listed_equity_valuation_snapshots", "fund_id"],
    ["investment_orders", "fund_id"],
    ["investment_valuation_runs", "fund_id"],
    ["investment_valuation_exceptions", "fund_id"],
    ["investment_reconciliation_batches", "fund_id"],
    ["investment_report_runs", "fund_id"],
    ["investment_documents", "fund_id"],
    ["investment_simulation_runs", "fund_id"],
    ["investment_compliance_rules", "fund_id"],
    ["investment_accounting_events", "fund_id"],
  ];

  for (const sourceId of sourceFundIds) {
    if (sourceId === targetFundId) continue;
    console.log(`\n[migrate] ${sourceId} → ${targetFundId}`);
    for (const [table, col] of tables) {
      try {
        const n = await rehomeFundId(table, col, sourceId, targetFundId);
        if (n > 0) console.log(`  ${table}: ${n} rows`);
      } catch (e: any) {
        if (!String(e.message).includes("doesn't exist")) console.warn(`  [skip] ${table}: ${e.message}`);
      }
    }

    const managers = await prisma.fundManager.findMany({ where: { fundId: sourceId, isActive: true } });
    for (const m of managers) {
      await prisma.fundManager.upsert({
        where: { fundId_userId: { fundId: targetFundId, userId: m.userId } },
        create: { fundId: targetFundId, userId: m.userId, role: m.role, isActive: true },
        update: { isActive: true },
      });
    }
  }
}

async function ensureListedEquityFund(adminUserId: string): Promise<string> {
  const existing = await prisma.fund.findFirst({
    where: { fundPurpose: "LISTED_EQUITY", listedEquityFundConfig: { isNot: null } },
    include: { listedEquityFundConfig: true },
  });
  if (existing) {
    console.log(`[ok] listed-equity fund exists: ${existing.id} (${existing.name})`);
    return existing.id;
  }

  const trustBankId = await findTrustBankId();
  const now = new Date();
  const farFuture = new Date("2099-12-31");

  const fund = await prisma.fund.create({
    data: {
      name: LISTED_FUND_NAME,
      description: "Listed equity / CIS trading mandate — Investment Operations module",
      totalAmount: new Decimal(0),
      remainingAmount: new Decimal(0),
      minInvestment: new Decimal(0),
      maxInvestment: new Decimal(0),
      focusIndustries: [],
      applicationStart: now,
      applicationEnd: farFuture,
      status: "OPEN",
      fundPurpose: "LISTED_EQUITY",
      createdById: adminUserId,
      listedEquityFundConfig: {
        create: {
          baseCurrencyCode: "USD",
          trustBankId,
          coaMappingJson: DEFAULT_COA_MAPPING,
        },
      },
      fundManagers: {
        create: { userId: adminUserId, role: "fund_manager", isActive: true },
      },
    },
  });
  console.log(`[ok] created listed-equity fund: ${fund.id} (${fund.name})`);
  return fund.id;
}

async function detachConfigsFromPrivateEquityFunds() {
  const peWithConfig = await prisma.fund.findMany({
    where: { fundPurpose: "PRIVATE_EQUITY", listedEquityFundConfig: { isNot: null } },
    select: { id: true, name: true },
  });
  for (const f of peWithConfig) {
    await prisma.listedEquityFundConfig.deleteMany({ where: { fundId: f.id } });
    console.log(`[ok] removed listed_equity_fund_config from PE fund ${f.name} (${f.id})`);
  }
}

async function promoteTargetFundConfig(sourceFundIds: string[], targetFundId: string) {
  if (!sourceFundIds.length) return;
  const sourceConfig = await prisma.listedEquityFundConfig.findFirst({
    where: { fundId: { in: sourceFundIds } },
  });
  if (!sourceConfig) return;

  const targetConfig = await prisma.listedEquityFundConfig.findUnique({ where: { fundId: targetFundId } });
  if (targetConfig && sourceConfig.coaMappingJson) {
    await prisma.listedEquityFundConfig.update({
      where: { fundId: targetFundId },
      data: {
        trustBankId: targetConfig.trustBankId ?? sourceConfig.trustBankId,
        brokerProfileId: targetConfig.brokerProfileId ?? sourceConfig.brokerProfileId,
        custodianProfileId: targetConfig.custodianProfileId ?? sourceConfig.custodianProfileId,
        coaMappingJson: (targetConfig.coaMappingJson as object) ?? (sourceConfig.coaMappingJson as object),
      },
    });
    console.log("[ok] merged config from source PE fund into listed-equity fund");
  }
}

async function main() {
  console.log("=== Fund purpose migration ===\n");

  await addColumnIfMissing();
  await addIndexIfMissing();
  await backfillPrivateEquity();

  const sourceIds = await peFundsWithListedEquityActivity();
  console.log(`\nPE funds with listed-equity activity: ${sourceIds.length}`);
  for (const id of sourceIds) {
    const f = await prisma.fund.findUnique({ where: { id }, select: { name: true } });
    console.log(`  - ${f?.name} (${id})`);
  }

  const adminUserId = await findAdminUserId();
  const targetFundId = await ensureListedEquityFund(adminUserId);

  if (sourceIds.length) {
    await promoteTargetFundConfig(sourceIds, targetFundId);
    await migrateListedEquityData(sourceIds, targetFundId);
  }

  await detachConfigsFromPrivateEquityFunds();

  await prisma.fund.update({
    where: { id: targetFundId },
    data: { fundPurpose: "LISTED_EQUITY" },
  });

  const summary = {
    listedEquityFunds: await prisma.fund.count({ where: { fundPurpose: "LISTED_EQUITY" } }),
    privateEquityFunds: await prisma.fund.count({ where: { fundPurpose: "PRIVATE_EQUITY" } }),
    targetFundId,
  };
  console.log("\n=== Done ===", summary);
}

main()
  .catch((e) => {
    console.error("[FAIL]", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
