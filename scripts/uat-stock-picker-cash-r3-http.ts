/**
 * UAT — Stock Picker Cash R3 (period close, GL export, broker-custodian, statements, setup, omnibus).
 * DEV nts only. Expects API on port 3009.
 *
 * npm run uat:stock-picker-cash:r3
 */
// @ts-nocheck
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { seedSunrise } from "./seed-stock-picker-cash-demo";
import {
  BASE,
  CURRENCY,
  LEGAL_ENTITY_ID,
  TENANT_ID,
  api,
  assertApiHealthy,
  assertDevDatabase,
  dataOf,
  fingerprint,
  idem,
  log,
  loginChecker,
  loginMaker,
  summarizeFail,
} from "./lib/stock-picker-cash-uat-helpers";

const prisma = new PrismaClient() as any;
const results: Array<{ step: string; ok: boolean; detail: string }> = [];

function record(step: string, ok: boolean, detail: string) {
  results.push({ step, ok, detail });
  log(step, ok, detail);
}

async function main() {
  await assertDevDatabase(prisma, "uat:stock-picker-cash:r3");
  await assertApiHealthy();
  console.log(`Stock Picker Cash R3 UAT — ${BASE}\n`);

  const seed = await seedSunrise(prisma);
  const { accountId, portfolioId, providerId, clientOrVehicleId } = seed;
  const maker = await loginMaker();
  const checker = await loginChecker();

  const period = new Date().toISOString().slice(0, 7); // YYYY-MM

  // Period precheck (itemized blockers)
  const pre = await api(
    "POST",
    `/investment-ops/cash-periods/${period}/precheck`,
    maker,
    {
      legalEntityId: LEGAL_ENTITY_ID,
      periodFrom: `${period}-01`,
    }
  );
  const preData = dataOf(pre);
  const blockers = preData?.blockers || [];
  record(
    "r3.period-precheck",
    pre.status === 200 && Array.isArray(blockers),
    `status=${pre.status} canClose=${preData?.canClose} blockers=${blockers.length}`
  );
  if (blockers.length) {
    console.log(
      "  blockers:",
      blockers
        .slice(0, 5)
        .map((b: any) => b.code)
        .join(", ")
    );
  }

  // Attempt close — may be blocked (that is still a success path for blocker coverage)
  const close = await api(
    "POST",
    `/investment-ops/cash-periods/${period}/close`,
    checker,
    { legalEntityId: LEGAL_ENTITY_ID, periodFrom: `${period}-01` },
    { "Idempotency-Key": idem("r3-close") }
  );
  const closeBlocked =
    close.status === 409 &&
    (close.json?.code === "CLOSE_BLOCKED" ||
      String(close.json?.message || "").includes("blocked"));
  record(
    "r3.period-close-or-blockers",
    close.status === 200 || closeBlocked,
    `status=${close.status} code=${close.json?.code || "ok"}`
  );

  // GL export + retry safe
  const glKey = idem("r3-gl");
  const gl = await api(
    "POST",
    "/investment-ops/cash-gl-exports",
    maker,
    { legalEntityId: LEGAL_ENTITY_ID, controlTotals: { uat: true } },
    { "Idempotency-Key": glKey }
  );
  const exportRow = dataOf(gl);
  record(
    "r3.gl-export",
    [200, 201].includes(gl.status) && exportRow?.id,
    `status=${gl.status} id=${exportRow?.id} ext=${exportRow?.externalPostingRef}`
  );

  if (exportRow?.id) {
    const retry = await api(
      "POST",
      `/investment-ops/cash-gl-exports/${exportRow.id}/retry`,
      maker,
      {},
      { "Idempotency-Key": idem("r3-gl-retry") }
    );
    const retried = dataOf(retry);
    record(
      "r3.gl-retry-safe",
      retry.status === 200 &&
        retried?.externalPostingRef === exportRow.externalPostingRef,
      `status=${retry.status} ref=${retried?.externalPostingRef} attempts=${retried?.attemptCount}`
    );
  }

  // Broker-custodian workspace — seed one item if empty
  let bcItem = await prisma.spCashBrokerCustodianItem.findFirst({
    where: { portfolioId },
  });
  if (!bcItem) {
    bcItem = await prisma.spCashBrokerCustodianItem.create({
      data: {
        portfolioId,
        instrumentIsin: "ZW000901RFT6",
        instrumentName: "Delta Corporation",
        symbol: "DLTA",
        quantity: new Decimal("100"),
        price: new Decimal("18.75"),
        tradeDate: new Date(),
        settleDate: new Date(),
        internalStatus: "MATCHED",
        brokerStatus: "MATCHED",
        custodianStatus: "PENDING",
        overallStatus: "POTENTIAL",
        differenceAmount: new Decimal("0"),
        currency: CURRENCY,
        version: 1,
      },
    });
  }
  const bc = await api(
    "GET",
    `/investment-ops/broker-custodian/workspace?portfolioId=${portfolioId}`,
    maker
  );
  record(
    "r3.broker-custodian-workspace",
    bc.status === 200 && dataOf(bc)?.counts != null,
    `status=${bc.status} total=${dataOf(bc)?.counts?.total}`
  );

  // Client statement generate / approve / email
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${period}-01`;
  const stmtGen = await api(
    "POST",
    "/investment-ops/client-statements/generate",
    maker,
    {
      cashAccountId: accountId,
      clientOrVehicleId: clientOrVehicleId,
      currency: CURRENCY,
      periodFrom: monthStart,
      periodTo: today,
      statementType: "PERIODIC",
    },
    { "Idempotency-Key": idem("r3-stmt") }
  );
  const stmt = dataOf(stmtGen);
  record(
    "r3.statement-generate",
    [200, 201].includes(stmtGen.status) && stmt?.id,
    `status=${stmtGen.status} id=${stmt?.id}`
  );

  if (stmt?.id) {
    const appr = await api(
      "POST",
      `/investment-ops/client-statements/${stmt.id}/approve`,
      checker,
      { expectedVersion: stmt.version }
    );
    record(
      "r3.statement-approve",
      appr.status === 200,
      `status=${appr.status} stmt=${dataOf(appr)?.status}`
    );

    const email = await api(
      "POST",
      `/investment-ops/client-statements/${stmt.id}/email`,
      maker,
      { to: "client.statements@example.com" }
    );
    record(
      "r3.statement-email",
      email.status === 200 || email.status === 201 || email.status === 202,
      `status=${email.status}`
    );
  }

  // Setup providers activate
  const provList = await api("GET", "/investment-ops/setup/providers", maker);
  record(
    "r3.setup-providers-list",
    provList.status === 200,
    `status=${provList.status}`
  );

  const draftCode = `UAT_PROV_${Date.now().toString(36).toUpperCase()}`;
  const newProv = await api(
    "POST",
    "/investment-ops/setup/providers",
    maker,
    {
      tenantId: TENANT_ID,
      code: draftCode,
      displayName: "UAT Broker Draft",
      providerType: "BROKER",
    },
    { "Idempotency-Key": idem("r3-prov") }
  );
  const prov = dataOf(newProv);
  record(
    "r3.setup-provider-create",
    [200, 201].includes(newProv.status) && prov?.id,
    `status=${newProv.status} id=${prov?.id}`
  );

  if (prov?.id) {
    const act = await api(
      "POST",
      `/investment-ops/setup/providers/${prov.id}/activate`,
      checker,
      { expectedVersion: prov.version }
    );
    record(
      "r3.setup-provider-activate",
      act.status === 200 && dataOf(act)?.status === "ACTIVE",
      `status=${act.status} prov=${dataOf(act)?.status}`
    );
  }

  // Omnibus variance fixture (3 beneficial owners)
  const omnibusFp = fingerprint([providerId, "OMNI-UAT-001", CURRENCY]);
  let omnibus = await prisma.spCashClientAccount.findFirst({
    where: { portfolioId: "SPF-OMNI-001", ownerModel: "OMNIBUS" },
  });
  if (!omnibus) {
    omnibus = await prisma.spCashClientAccount.create({
      data: {
        tenantId: TENANT_ID,
        legalEntityId: LEGAL_ENTITY_ID,
        clientOrVehicleId: "cli_omnibus",
        portfolioId: "SPF-OMNI-001",
        ownerModel: "OMNIBUS",
        moneyClass: "CLIENT_CASH",
        accountType: "CUSTODY_CASH",
        providerId,
        externalIdentifierEncrypted: "omnibus-uat",
        externalFingerprint: omnibusFp,
        maskedIdentifier: "OMNI***001",
        accountNumberMasked: "OMNI***001",
        currency: CURRENCY,
        status: "ACTIVE",
        effectiveFrom: new Date("2020-01-01"),
        clientName: "Omnibus Pool UAT",
        version: 1,
      },
    });
  }

  const owners = ["bo_alpha", "bo_beta", "bo_gamma"];
  const amounts = [3000, 4000, 3000];
  let existingOmniJnl = await prisma.spCashJournal.findFirst({
    where: {
      sourceEventId: "OMNI-SPLIT-v1",
      cashAccountId: omnibus.id,
      status: "POSTED",
    },
  });
  if (!existingOmniJnl) {
    await prisma.spCashJournal.create({
      data: {
        sourceSystem: "SEED",
        sourceEventId: "OMNI-SPLIT-v1",
        postingPurpose: "OPENING",
        idempotencyKey: "seed:OMNI-SPLIT-v1:OPENING",
        valueDate: new Date("2024-06-01"),
        settlementDate: new Date("2024-06-01"),
        currency: CURRENCY,
        status: "POSTED",
        makerId: seed.makerId,
        checkerId: seed.checkerId,
        cashAccountId: omnibus.id,
        portfolioId: "SPF-OMNI-001",
        postedAt: new Date(),
        version: 1,
        lines: {
          create: [
            ...owners.map((bo, i) => ({
              ledgerAccountCode: "CASH",
              cashAccountId: omnibus.id,
              beneficialOwnerId: bo,
              debit: new Decimal(amounts[i]),
              credit: new Decimal(0),
              signedCashAmount: new Decimal(amounts[i]),
              currency: CURRENCY,
              description: `Omnibus slice ${bo}`,
            })),
            {
              ledgerAccountCode: "OPENING_EQUITY",
              debit: new Decimal(0),
              credit: new Decimal(10000),
              signedCashAmount: new Decimal(0),
              currency: CURRENCY,
              description: "Omnibus equity",
            },
          ],
        },
      },
    });
  }

  const omniPos = await api(
    "GET",
    `/investment-ops/portfolios/SPF-OMNI-001/cash-position?cashAccountId=${omnibus.id}&currency=${CURRENCY}`,
    maker
  );
  const omniData = dataOf(omniPos);
  record(
    "r3.omnibus-position",
    omniPos.status === 200 && Number(omniData?.postedSettledCash || 0) >= 0,
    `status=${omniPos.status} posted=${omniData?.postedSettledCash} account=${omnibus.id}`
  );

  const fundSummary = await api(
    "GET",
    `/investment-ops/fund-cash-summary?fundId=SPF-OMNI-001&cashAccountId=${omnibus.id}`,
    maker
  );
  record(
    "r3.omnibus-fund-summary",
    fundSummary.status === 200,
    `status=${fundSummary.status}`
  );

  summarizeFail(results);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
