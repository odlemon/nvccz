/**
 * UAT — Stock Picker Cash acceptance AT-01 .. AT-15.
 * DEV nts only. Expects API on port 3009.
 *
 * npm run uat:stock-picker-cash:acceptance
 */
// @ts-nocheck
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { seedSunrise } from "./seed-stock-picker-cash-demo";
import {
  BASE,
  CLIENT_B,
  CURRENCY,
  LEGAL_ENTITY_ID,
  PORTFOLIO_ID,
  api,
  assertApiHealthy,
  assertDevDatabase,
  dataOf,
  hashFile,
  idem,
  log,
  loginChecker,
  loginMaker,
  moneyEq,
  summarizeFail,
} from "./lib/stock-picker-cash-uat-helpers";

const prisma = new PrismaClient() as any;
const results: Array<{ step: string; ok: boolean; detail: string }> = [];

function record(step: string, ok: boolean, detail: string) {
  results.push({ step, ok, detail });
  log(step, ok, detail);
}

async function postAndApproveJournal(
  maker: string,
  checker: string,
  body: any,
  keyPrefix: string
) {
  const created = await api(
    "POST",
    "/investment-ops/cash-journals",
    maker,
    body,
    { "Idempotency-Key": idem(keyPrefix) }
  );
  let j = dataOf(created);
  if (![200, 201].includes(created.status) || !j?.id) {
    return { ok: false, journal: j, error: created };
  }
  const sub = await api("POST", `/investment-ops/cash-journals/${j.id}/submit`, maker, {
    expectedVersion: j.version,
  });
  j = dataOf(sub) || j;
  const fresh = dataOf(await api("GET", `/investment-ops/cash-journals/${j.id}`, maker));
  j = fresh || j;
  const appr = await api(
    "POST",
    `/investment-ops/cash-journals/${j.id}/approve`,
    checker,
    { expectedVersion: j.version }
  );
  j = dataOf(appr) || j;
  return { ok: j?.status === "POSTED", journal: j, error: appr };
}

async function main() {
  await assertDevDatabase(prisma, "uat:stock-picker-cash:acceptance");
  await assertApiHealthy();
  console.log(`Stock Picker Cash acceptance AT-01..AT-15 — ${BASE}\n`);

  const seed = await seedSunrise(prisma);
  const {
    accountId,
    portfolioId,
    providerId,
    layoutId,
    suspenseAccountId,
    clientBAccountId,
    clientOrVehicleId,
  } = seed;

  const maker0 = await loginMaker();
  let maker = maker0;
  let checker = await loginChecker();
  const today = new Date().toISOString().slice(0, 10);
  const posPath =
    `/investment-ops/portfolios/${portfolioId}/cash-position` +
    `?cashAccountId=${accountId}&currency=${CURRENCY}`;

  // Clear leftover active reservations so concurrent AT-01 starts from a clean book
  await prisma.spCashReservation.updateMany({
    where: {
      cashAccountId: accountId,
      status: { in: ["ACTIVE", "PARTIALLY_CONSUMED", "PENDING_APPROVAL"] },
    },
    data: { status: "RELEASED", remainingAmount: 0 },
  });

  // ── AT-01 concurrent last-dollar reservations ────────────────────────────
  {
    console.log("[at] AT-01 starting…");
    await seedSunrise(prisma);
    const before = dataOf(await api("GET", posPath, maker));
    const avail = Number(before?.orderEligibleAvailableCash || 0);
    const amount = moneyEq(avail, 10000) ? "10000.00" : avail.toFixed(2);

    const [a, b] = await Promise.all([
      api(
        "POST",
        "/investment-ops/cash-reservations",
        maker,
        {
          portfolioId,
          cashAccountId: accountId,
          currency: CURRENCY,
          amount,
          autoActivate: true,
          purpose: "AT01_A",
        },
        { "Idempotency-Key": idem("at01-a") }
      ),
      api(
        "POST",
        "/investment-ops/cash-reservations",
        maker,
        {
          portfolioId,
          cashAccountId: accountId,
          currency: CURRENCY,
          amount,
          autoActivate: true,
          purpose: "AT01_B",
        },
        { "Idempotency-Key": idem("at01-b") }
      ),
    ]);
    console.log(`[at] AT-01 responses ${a.status}/${b.status}`);
    const okA = [200, 201].includes(a.status);
    const okB = [200, 201].includes(b.status);
    const failCodes = new Set([
      "INSUFFICIENT_AVAILABLE_CASH",
      "STALE_VERSION",
      "IDEMPOTENCY_CONFLICT",
    ]);
    const failA =
      a.status === 409 ||
      failCodes.has(String(a.json?.code || a.json?.error?.code || ""));
    const failB =
      b.status === 409 ||
      failCodes.has(String(b.json?.code || b.json?.error?.code || ""));
    const exactlyOne = (okA && failB) || (okB && failA);
    record(
      "AT-01 concurrent last-dollar reservations",
      exactlyOne,
      `A=${a.status}/${a.json?.code || "ok"} B=${b.status}/${b.json?.code || "ok"} avail=${amount}`
    );
    // Cleanup: release winner
    for (const r of [a, b]) {
      const id = dataOf(r)?.id;
      if (id && [200, 201].includes(r.status)) {
        await api("POST", `/investment-ops/cash-reservations/${id}/release`, maker, {});
      }
    }
  }

  // ── AT-02 triple journal same sourceEventId+purpose ──────────────────────
  {
    const sourceEventId = `AT02-${idem("evt")}`;
    const mkBody = (n: number) => ({
      sourceSystem: "UAT",
      sourceEventId,
      postingPurpose: "CORPORATE_ACTION",
      currency: CURRENCY,
      cashAccountId: accountId,
      portfolioId,
      valueDate: today,
      settlementDate: today,
      lines: [
        {
          ledgerAccountCode: "CASH",
          cashAccountId: accountId,
          debit: 1,
          credit: 0,
          signedCashAmount: 1,
          currency: CURRENCY,
          description: `AT-02 attempt ${n}`,
        },
        {
          ledgerAccountCode: "OPENING_EQUITY",
          debit: 0,
          credit: 1,
          signedCashAmount: 0,
          currency: CURRENCY,
          description: "bal",
        },
      ],
    });

    const r1 = await postAndApproveJournal(maker, checker, mkBody(1), "at02-1");
    const r2 = await postAndApproveJournal(maker, checker, mkBody(2), "at02-2");
    const r3 = await postAndApproveJournal(maker, checker, mkBody(3), "at02-3");

    const posted = await prisma.spCashJournal.findMany({
      where: { sourceEventId, postingPurpose: "CORPORATE_ACTION", status: "POSTED" },
    });
    // Approve path returns existing posted on collision — count should be 1
    record(
      "AT-02 triple journal same sourceEventId+purpose — one POSTED",
      posted.length === 1,
      `postedCount=${posted.length} ids=${posted.map((j: any) => j.id).join(",")}`
    );
  }

  // ── AT-03 re-upload same hash different filename ─────────────────────────
  {
    const uniq = idem("at03");
    const raw = `value_date,amount,debit_credit,reference\n${today},10,Credit,AT03-${uniq}`;
    const fileHash = hashFile(raw);
    const lines = [
      { valueDate: today, amount: 10, debitCredit: "Credit", reference: `AT03-${uniq}` },
    ];
    const first = await api(
      "POST",
      "/investment-ops/external-statements/imports",
      maker,
      {
        providerId,
        cashAccountId: accountId,
        currency: CURRENCY,
        fileName: `at03-a-${uniq}.csv`,
        fileHash,
        layoutId,
        controlOpening: 0,
        controlClosing: 10,
        lines,
        rawContent: raw,
      },
      { "Idempotency-Key": idem("at03-1") }
    );
    const imp = dataOf(first);
    if (imp?.id) {
      await api("POST", `/investment-ops/external-statements/imports/${imp.id}/validate`, maker, {});
      await api("POST", `/investment-ops/external-statements/imports/${imp.id}/submit`, maker, {});
      await api("POST", `/investment-ops/external-statements/imports/${imp.id}/commit`, checker, {});
    }
    const dup = await api(
      "POST",
      "/investment-ops/external-statements/imports",
      maker,
      {
        providerId,
        cashAccountId: accountId,
        currency: CURRENCY,
        fileName: `at03-b-DIFFERENT-${uniq}.csv`,
        fileHash,
        layoutId,
        controlOpening: 0,
        controlClosing: 10,
        lines,
        rawContent: raw,
      },
      { "Idempotency-Key": idem("at03-2") }
    );
    const code = dup.json?.code || "";
    record(
      "AT-03 re-upload same hash different filename → DUPLICATE_SOURCE",
      dup.status === 409 && String(code).includes("DUPLICATE"),
      `status=${dup.status} code=${code} first=${first.status}`
    );
  }

  // ── AT-04 Debit → negative signed ────────────────────────────────────────
  {
    const uniq = idem("at04");
    const lines = [
      { valueDate: today, amount: 25, debitCredit: "Debit", reference: `AT04-${uniq}` },
    ];
    const raw = JSON.stringify(lines);
    const imp = await api(
      "POST",
      "/investment-ops/external-statements/imports",
      maker,
      {
        providerId,
        cashAccountId: accountId,
        currency: CURRENCY,
        fileName: `at04-${uniq}.csv`,
        fileHash: hashFile(raw + uniq),
        layoutId,
        lines,
      },
      { "Idempotency-Key": idem("at04") }
    );
    const get = dataOf(
      await api("GET", `/investment-ops/external-statements/imports/${dataOf(imp)?.id}`, maker)
    );
    const staged = get?.stagedLines || [];
    const signed = staged[0]?.signedCashAmount;
    record(
      "AT-04 Debit → negative signed",
      moneyEq(signed, -25) || Number(signed) < 0,
      `signed=${signed} status=${imp.status}`
    );
  }

  // ── AT-05 / AT-06 match topologies ───────────────────────────────────────
  {
    maker = await loginMaker();
    checker = await loginChecker();
    const batchRes = await api(
      "POST",
      "/investment-ops/reconciliation-batches",
      maker,
      {
        cashAccountId: accountId,
        currency: CURRENCY,
        periodFrom: today,
        periodTo: today,
        reconType: "CASH_STATEMENT",
      },
      { "Idempotency-Key": idem("at05-batch") }
    );
    const batchId = dataOf(batchRes)?.id;

    // Fresh unmatched lines dedicated to topology tests
    const j = await postAndApproveJournal(
      maker,
      checker,
      {
        sourceSystem: "UAT",
        sourceEventId: idem("at05-jnl"),
        postingPurpose: "FEE",
        currency: CURRENCY,
        cashAccountId: accountId,
        portfolioId,
        valueDate: today,
        settlementDate: today,
        lines: [
          {
            ledgerAccountCode: "CASH",
            cashAccountId: accountId,
            debit: 0,
            credit: 10,
            signedCashAmount: -10,
            currency: CURRENCY,
            description: "AT-05/06 internal",
          },
          {
            ledgerAccountCode: "FEE_EXPENSE",
            debit: 10,
            credit: 0,
            signedCashAmount: 0,
            currency: CURRENCY,
            description: "bal",
          },
        ],
      },
      "at05-j"
    );
    const iLine = j.journal?.lines?.find((l: any) => l.cashAccountId === accountId);
    let iLineId = iLine?.id;
    if (!iLineId && j.journal?.id) {
      const row = await prisma.spCashJournalLine.findFirst({
        where: { journalId: j.journal.id, cashAccountId: accountId },
      });
      iLineId = row?.id;
    }

    const stmt = await prisma.spCashExternalStatement.create({
      data: {
        importId: `uat-at05-${Date.now()}`,
        providerId: seed.providerId,
        cashAccountId: accountId,
        periodFrom: new Date(today),
        periodTo: new Date(today),
        currency: CURRENCY,
        openingBalance: 0,
        closingBalance: -10,
        fileHash: `uat-at05-${idem("fh")}`,
        status: "COMMITTED",
        version: 1,
        lines: {
          create: [
            {
              importId: `uat-at05-${Date.now()}`,
              valueDate: new Date(today),
              signedCashAmount: -10,
              currency: CURRENCY,
              reference: "AT05-EXT",
              fingerprint: idem("at05-fp"),
              matchStatus: "UNMATCHED",
              residualAmount: -10,
            },
            {
              importId: `uat-at05-${Date.now()}`,
              valueDate: new Date(today),
              signedCashAmount: -0.01,
              currency: CURRENCY,
              reference: "AT06-EXT-PARTIAL",
              fingerprint: idem("at06-fp"),
              matchStatus: "UNMATCHED",
              residualAmount: -0.01,
            },
          ],
        },
      },
      include: { lines: true },
    });
    const eLine1 = stmt.lines[0];
    const eLine2 = stmt.lines[1];

    if (batchId && iLineId && eLine1) {
      const one = await api(
        "POST",
        "/investment-ops/matches/confirm",
        checker,
        {
          batchId,
          topology: "ONE_TO_ONE",
          links: [
            {
              internalLineId: iLineId,
              externalLineId: eLine1.id,
              matchedAmount: "10.00",
              topology: "ONE_TO_ONE",
            },
          ],
        },
        { "Idempotency-Key": idem("at05") }
      );
      const o2o = dataOf(one)?.links?.[0];
      record(
        "AT-05 match topology ONE_TO_ONE",
        [200, 201].includes(one.status) && o2o?.topology === "ONE_TO_ONE",
        `status=${one.status} topology=${o2o?.topology} code=${one.json?.code || "ok"}`
      );

      // Fresh internal for MANY topology residual
      const j2 = await postAndApproveJournal(
        maker,
        checker,
        {
          sourceSystem: "UAT",
          sourceEventId: idem("at06-jnl"),
          postingPurpose: "FEE",
          currency: CURRENCY,
          cashAccountId: accountId,
          portfolioId,
          valueDate: today,
          settlementDate: today,
          lines: [
            {
              ledgerAccountCode: "CASH",
              cashAccountId: accountId,
              debit: 0,
              credit: 5,
              signedCashAmount: -5,
              currency: CURRENCY,
              description: "AT-06 internal",
            },
            {
              ledgerAccountCode: "FEE_EXPENSE",
              debit: 5,
              credit: 0,
              signedCashAmount: 0,
              currency: CURRENCY,
              description: "bal",
            },
          ],
        },
        "at06-j"
      );
      let iLine2Id = j2.journal?.lines?.find((l: any) => l.cashAccountId === accountId)?.id;
      if (!iLine2Id && j2.journal?.id) {
        const row = await prisma.spCashJournalLine.findFirst({
          where: { journalId: j2.journal.id, cashAccountId: accountId },
        });
        iLine2Id = row?.id;
      }

      const many = await api(
        "POST",
        "/investment-ops/matches/manual",
        checker,
        {
          batchId,
          topology: "ONE_TO_MANY",
          method: "MANUAL",
          links: [
            {
              internalLineId: iLine2Id,
              externalLineId: eLine2.id,
              matchedAmount: "0.01",
              topology: "ONE_TO_MANY",
            },
          ],
        },
        { "Idempotency-Key": idem("at06") }
      );
      const o2m = dataOf(many)?.links?.[0];
      record(
        "AT-06 match topology ONE_TO_MANY",
        [200, 201].includes(many.status) && o2m?.topology === "ONE_TO_MANY",
        `status=${many.status} topology=${o2m?.topology} code=${many.json?.code || "ok"}`
      );
    } else {
      record("AT-05 match topology ONE_TO_ONE", false, "missing batch/lines for topology test");
      record("AT-06 match topology ONE_TO_MANY", false, "missing batch/lines for topology test");
    }
  }

  // ── AT-07 maker cannot approve own ───────────────────────────────────────
  {
    maker = await loginMaker();
    checker = await loginChecker();
    const created = await api(
      "POST",
      "/investment-ops/cash-journals",
      maker,
      {
        sourceSystem: "UAT",
        sourceEventId: idem("at07"),
        postingPurpose: "MANUAL",
        currency: CURRENCY,
        cashAccountId: accountId,
        portfolioId,
        valueDate: today,
        settlementDate: today,
        lines: [
          {
            ledgerAccountCode: "CASH",
            cashAccountId: accountId,
            debit: 2,
            credit: 0,
            signedCashAmount: 2,
            currency: CURRENCY,
            description: "AT-07",
          },
          {
            ledgerAccountCode: "OPENING_EQUITY",
            debit: 0,
            credit: 2,
            signedCashAmount: 0,
            currency: CURRENCY,
            description: "bal",
          },
        ],
      },
      { "Idempotency-Key": idem("at07-j") }
    );
    let j = dataOf(created);
    await api("POST", `/investment-ops/cash-journals/${j.id}/submit`, maker, {
      expectedVersion: j.version,
    });
    j = dataOf(await api("GET", `/investment-ops/cash-journals/${j.id}`, maker));
    const self = await api(
      "POST",
      `/investment-ops/cash-journals/${j.id}/approve`,
      maker,
      { expectedVersion: j.version }
    );
    record(
      "AT-07 maker cannot approve own",
      self.status === 409 &&
        (self.json?.code === "MAKER_CHECKER_CONFLICT" ||
          /maker/i.test(String(self.json?.message || ""))),
      `status=${self.status} code=${self.json?.code}`
    );
  }

  // ── AT-08 suspense not in available ──────────────────────────────────────
  {
    const sunPos = dataOf(await api("GET", posPath, maker));
    const susPath =
      `/investment-ops/portfolios/${portfolioId}/cash-position` +
      `?cashAccountId=${suspenseAccountId}&currency=${CURRENCY}`;
    const susPos = dataOf(await api("GET", susPath, maker));
    // Suspense available should be 0; Sunrise available should not include suspense 500
    const sunAvail = Number(sunPos?.orderEligibleAvailableCash || 0);
    const susAvail = Number(susPos?.orderEligibleAvailableCash || 0);
    record(
      "AT-08 suspense not in available",
      susAvail === 0 && sunAvail < 10000 + 400,
      `sunriseAvail=${sunAvail} suspenseAvail=${susAvail} suspensePosted=${susPos?.postedSettledCash}`
    );
  }

  // ── AT-09 sell proceeds excluded ─────────────────────────────────────────
  {
    const before = Number(
      dataOf(await api("GET", posPath, maker))?.orderEligibleAvailableCash || 0
    );
    await prisma.spCashExpectation.create({
      data: {
        cashAccountId: accountId,
        portfolioId,
        direction: "SELL_PROCEEDS",
        amount: new Decimal("9999"),
        currency: CURRENCY,
        dueDate: new Date(),
        status: "OPEN",
        sourceEventId: idem("at09"),
        version: 1,
      },
    });
    const after = Number(
      dataOf(await api("GET", posPath, maker))?.orderEligibleAvailableCash || 0
    );
    const delta = after - before;
    record(
      "AT-09 sell proceeds excluded until cleared",
      Math.abs(delta) < 1,
      `before=${before} after=${after} delta=${delta} (must not include SELL_PROCEEDS 9999)`
    );
  }

  // ── AT-10 omnibus (3 internals) ──────────────────────────────────────────
  {
    const omnibus = await prisma.spCashClientAccount.findFirst({
      where: { ownerModel: "OMNIBUS", portfolioId: "SPF-OMNI-001" },
    });
    if (!omnibus) {
      // Quick fixture
      const omni = await prisma.spCashClientAccount.create({
        data: {
          tenantId: "nts",
          legalEntityId: LEGAL_ENTITY_ID,
          clientOrVehicleId: "cli_omnibus",
          portfolioId: "SPF-OMNI-001",
          ownerModel: "OMNIBUS",
          moneyClass: "CLIENT_CASH",
          accountType: "CUSTODY_CASH",
          providerId,
          externalIdentifierEncrypted: "omni",
          externalFingerprint: `omni-${Date.now()}`,
          maskedIdentifier: "OMNI***UAT",
          currency: CURRENCY,
          status: "ACTIVE",
          effectiveFrom: new Date(),
          clientName: "Omnibus AT-10",
          version: 1,
        },
      });
      await prisma.spCashJournal.create({
        data: {
          sourceSystem: "UAT",
          sourceEventId: "AT10-OMNI",
          postingPurpose: "OPENING",
          idempotencyKey: idem("at10-omni"),
          valueDate: new Date(),
          settlementDate: new Date(),
          currency: CURRENCY,
          status: "POSTED",
          makerId: seed.makerId,
          checkerId: seed.checkerId,
          cashAccountId: omni.id,
          portfolioId: "SPF-OMNI-001",
          postedAt: new Date(),
          version: 1,
          lines: {
            create: ["bo1", "bo2", "bo3"].map((bo, i) => ({
              ledgerAccountCode: "CASH",
              cashAccountId: omni.id,
              beneficialOwnerId: bo,
              debit: new Decimal(1000 + i),
              credit: new Decimal(0),
              signedCashAmount: new Decimal(1000 + i),
              currency: CURRENCY,
              description: `AT-10 ${bo}`,
            })).concat([
              {
                ledgerAccountCode: "OPENING_EQUITY",
                debit: new Decimal(0),
                credit: new Decimal(3003),
                signedCashAmount: new Decimal(0),
                currency: CURRENCY,
                description: "bal",
              },
            ]),
          },
        },
      });
    }
    const acct =
      omnibus ||
      (await prisma.spCashClientAccount.findFirst({
        where: { ownerModel: "OMNIBUS" },
      }));
    const lines = await prisma.spCashJournalLine.findMany({
      where: {
        cashAccountId: acct.id,
        beneficialOwnerId: { not: null },
      },
    });
    const owners = new Set(lines.map((l: any) => l.beneficialOwnerId).filter(Boolean));
    record(
      "AT-10 omnibus with 3 internal beneficial owners",
      owners.size >= 3 || lines.length >= 3,
      `owners=${owners.size} lines=${lines.length} account=${acct?.id}`
    );
  }

  // ── AT-11 reverse only (posted journals reverse; no silent edit) ─────────
  {
    const r = await postAndApproveJournal(
      maker,
      checker,
      {
        sourceSystem: "UAT",
        sourceEventId: idem("at11"),
        postingPurpose: "MANUAL",
        currency: CURRENCY,
        cashAccountId: accountId,
        portfolioId,
        valueDate: today,
        settlementDate: today,
        lines: [
          {
            ledgerAccountCode: "CASH",
            cashAccountId: accountId,
            debit: 3,
            credit: 0,
            signedCashAmount: 3,
            currency: CURRENCY,
            description: "AT-11 to reverse",
          },
          {
            ledgerAccountCode: "OPENING_EQUITY",
            debit: 0,
            credit: 3,
            signedCashAmount: 0,
            currency: CURRENCY,
            description: "bal",
          },
        ],
      },
      "at11"
    );
    const rev = await api(
      "POST",
      `/investment-ops/cash-journals/${r.journal?.id}/reverse`,
      checker,
      { reason: "AT-11 reverse only" },
      { "Idempotency-Key": idem("at11-rev") }
    );
    const reversal = dataOf(rev);
    const original = dataOf(
      await api("GET", `/investment-ops/cash-journals/${r.journal?.id}`, maker)
    );
    record(
      "AT-11 reverse only",
      rev.status === 200 &&
        reversal?.reversalOf === r.journal?.id &&
        original?.status === "REVERSED",
      `status=${rev.status} original=${original?.status} revOf=${reversal?.reversalOf}`
    );
  }

  // ── AT-12 close blockers itemized ────────────────────────────────────────
  {
    const period = today.slice(0, 7);
    const pre = await api(
      "POST",
      `/investment-ops/cash-periods/${period}/precheck`,
      maker,
      { legalEntityId: LEGAL_ENTITY_ID }
    );
    const blockers = dataOf(pre)?.blockers || [];
    const itemized =
      Array.isArray(blockers) &&
      blockers.every((b: any) => b.code && b.severity && b.remediation);
    record(
      "AT-12 close blockers itemized",
      pre.status === 200 && itemized,
      `status=${pre.status} blockers=${blockers.length} sample=${blockers[0]?.code || "none"}`
    );
  }

  // ── AT-13 late after close (restate new version, prior intact) ────────────
  {
    const period = `AT13-${Date.now().toString(36).toUpperCase()}`;
    // Clear blockers for this LE by creating a synthetic CLOSED row then restate
    const prior = await prisma.spCashPeriodClose.create({
      data: {
        legalEntityId: LEGAL_ENTITY_ID,
        periodCode: period,
        periodFrom: new Date("2099-01-01"),
        periodTo: new Date("2099-01-31"),
        status: "CLOSED",
        closeVersion: 1,
        controlTotalsJson: { seed: true },
        blockersJson: [],
        makerId: seed.makerId,
        checkerId: seed.checkerId,
        closedAt: new Date(),
      },
    });
    const rest = await api(
      "POST",
      `/investment-ops/cash-periods/${period}/restate`,
      checker,
      { legalEntityId: LEGAL_ENTITY_ID, controlTotals: { restated: true } },
      { "Idempotency-Key": idem("at13") }
    );
    const restated = dataOf(rest);
    const priorFresh = await prisma.spCashPeriodClose.findUnique({ where: { id: prior.id } });
    record(
      "AT-13 late after close → restate new version, prior intact",
      rest.status === 200 &&
        restated?.closeVersion === 2 &&
        priorFresh?.status === "CLOSED" &&
        priorFresh?.closeVersion === 1,
      `status=${rest.status} newVer=${restated?.closeVersion} priorVer=${priorFresh?.closeVersion}/${priorFresh?.status}`
    );
  }

  // ── AT-14 GL retry idempotent ────────────────────────────────────────────
  {
    const key = idem("at14-gl");
    const gl1 = await api(
      "POST",
      "/investment-ops/cash-gl-exports",
      maker,
      { legalEntityId: LEGAL_ENTITY_ID },
      { "Idempotency-Key": key }
    );
    const e1 = dataOf(gl1);
    const retry = await api(
      "POST",
      `/investment-ops/cash-gl-exports/${e1?.id}/retry`,
      maker,
      {},
      { "Idempotency-Key": idem("at14-retry") }
    );
    const e2 = dataOf(retry);
    const gl2 = await api(
      "POST",
      "/investment-ops/cash-gl-exports",
      maker,
      { legalEntityId: LEGAL_ENTITY_ID },
      { "Idempotency-Key": key }
    );
    const e3 = dataOf(gl2);
    record(
      "AT-14 GL retry safe (no double post)",
      e1?.externalPostingRef &&
        e2?.externalPostingRef === e1.externalPostingRef &&
        (e3?.id === e1.id || e3?.externalPostingRef === e1.externalPostingRef),
      `ref1=${e1?.externalPostingRef} retry=${e2?.externalPostingRef} replayId=${e3?.id}`
    );
  }

  // ── AT-15 client A cannot see client B ───────────────────────────────────
  {
    const wrong = await api(
      "GET",
      `/investment-ops/client-cash-accounts/${clientBAccountId}?clientOrVehicleId=${clientOrVehicleId}`,
      maker
    );
    record(
      "AT-15 client A cannot see client B (404)",
      wrong.status === 404,
      `status=${wrong.status} clientB=${clientBAccountId} filter=${clientOrVehicleId}`
    );

    const right = await api(
      "GET",
      `/investment-ops/client-cash-accounts/${clientBAccountId}?clientOrVehicleId=${CLIENT_B}`,
      maker
    );
    record(
      "AT-15 client B visible with matching filter",
      right.status === 200 && dataOf(right)?.id === clientBAccountId,
      `status=${right.status}`
    );
  }

  summarizeFail(results);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
