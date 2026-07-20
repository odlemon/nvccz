/**
 * UAT — Stock Picker Cash R1 (accounts, position, reservation, settlement journal).
 * DEV nts only. Expects API on port 3009.
 *
 * npm run uat:stock-picker-cash:r1
 */
// @ts-nocheck
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { seedSunrise } from "./seed-stock-picker-cash-demo";
import {
  BASE,
  CURRENCY,
  api,
  assertApiHealthy,
  assertDevDatabase,
  dataOf,
  idem,
  log,
  loginChecker,
  loginMaker,
  moneyEq,
  summarizeFail,
} from "./lib/stock-picker-cash-uat-helpers";

const prisma = new PrismaClient();
const results: Array<{ step: string; ok: boolean; detail: string }> = [];

function record(step: string, ok: boolean, detail: string) {
  results.push({ step, ok, detail });
  log(step, ok, detail);
  if (!ok) {
    console.error(`\n[abort] assertion failed at ${step}`);
    summarizeFail(results);
  }
}

async function main() {
  await assertDevDatabase(prisma, "uat:stock-picker-cash:r1");
  await assertApiHealthy();
  console.log(`Stock Picker Cash R1 UAT — ${BASE}\n`);

  const seed = await seedSunrise(prisma);
  const { accountId, portfolioId } = seed;
  console.log(`accountId=${accountId} portfolioId=${portfolioId}\n`);

  const maker = await loginMaker();
  const checker = await loginChecker();

  // List accounts
  const list = await api("GET", "/investment-ops/client-cash-accounts", maker);
  const items = dataOf(list)?.items || dataOf(list) || [];
  const found = Array.isArray(items)
    ? items.some((a: any) => a.id === accountId || a.accountId === accountId)
    : false;
  record(
    "r1.list-accounts",
    list.status === 200 && found,
    `status=${list.status} found=${found}`
  );

  // Position → available 10000
  const posPath =
    `/investment-ops/portfolios/${portfolioId}/cash-position` +
    `?cashAccountId=${accountId}&currency=${CURRENCY}`;
  const pos0 = await api("GET", posPath, maker);
  const p0 = dataOf(pos0);
  const avail0 = p0?.orderEligibleAvailableCash ?? p0?.availableCash?.amount;
  record(
    "r1.cash-position-opening",
    pos0.status === 200 && moneyEq(avail0, 10000),
    `status=${pos0.status} available=${avail0} posted=${p0?.postedSettledCash}`
  );

  // Reservation 3000 autoActivate
  const resv = await api(
    "POST",
    "/investment-ops/cash-reservations",
    maker,
    {
      portfolioId,
      cashAccountId: accountId,
      currency: CURRENCY,
      amount: "3000.00",
      autoActivate: true,
      purpose: "BUY_ORDER",
      sourceEventId: idem("r1-resv"),
    },
    { "Idempotency-Key": idem("r1-resv-key") }
  );
  let reservation = dataOf(resv);
  let resvOk =
    [200, 201].includes(resv.status) &&
    (reservation?.status === "ACTIVE" || reservation?.status === "PENDING_APPROVAL");

  // Fallback: create + approve with checker
  if (reservation?.status === "PENDING_APPROVAL") {
    const appr = await api(
      "POST",
      `/investment-ops/cash-reservations/${reservation.id}/approve`,
      checker,
      { expectedVersion: reservation.version }
    );
    reservation = dataOf(appr);
    resvOk = appr.status === 200 && reservation?.status === "ACTIVE";
  }
  record(
    "r1.reservation-3000",
    resvOk && moneyEq(reservation?.originalAmount, 3000),
    `status=${resv.status} resvStatus=${reservation?.status} id=${reservation?.id}`
  );

  const pos1 = await api("GET", posPath, maker);
  const p1 = dataOf(pos1);
  const avail1 = p1?.orderEligibleAvailableCash;
  record(
    "r1.available-after-reserve",
    pos1.status === 200 && moneyEq(avail1, 7000),
    `available=${avail1} (expect 7000)`
  );

  // Explanation + overview
  const expl = await api(
    "GET",
    `/investment-ops/portfolios/${portfolioId}/cash-explanation?cashAccountId=${accountId}&currency=${CURRENCY}`,
    maker
  );
  record(
    "r1.cash-explanation",
    expl.status === 200 && Array.isArray(dataOf(expl)?.lineItems),
    `status=${expl.status} lines=${dataOf(expl)?.lineItems?.length}`
  );

  const overview = await api("GET", "/investment-ops/cash-overview", maker);
  record(
    "r1.cash-overview",
    overview.status === 200 && dataOf(overview)?.accountCount != null,
    `status=${overview.status} accounts=${dataOf(overview)?.accountCount}`
  );

  // Settlement journal 3005 (cash decrease)
  const today = new Date().toISOString().slice(0, 10);
  const jCreate = await api(
    "POST",
    "/investment-ops/cash-journals",
    maker,
    {
      sourceSystem: "UAT",
      sourceEventId: idem("r1-settle"),
      postingPurpose: "SETTLEMENT",
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
          credit: 3005,
          signedCashAmount: -3005,
          currency: CURRENCY,
          description: "Trade settlement outflow",
        },
        {
          ledgerAccountCode: "BROKER_CLEARING",
          debit: 3005,
          credit: 0,
          signedCashAmount: 0,
          currency: CURRENCY,
          description: "Broker clearing",
        },
      ],
    },
    { "Idempotency-Key": idem("r1-jnl") }
  );
  let journal = dataOf(jCreate);
  record(
    "r1.journal-create",
    [200, 201].includes(jCreate.status) && journal?.id,
    `status=${jCreate.status} id=${journal?.id}`
  );

  const jSubmit = await api(
    "POST",
    `/investment-ops/cash-journals/${journal.id}/submit`,
    maker,
    { expectedVersion: journal.version }
  );
  journal = dataOf(jSubmit) || journal;
  record(
    "r1.journal-submit",
    jSubmit.status === 200 && journal?.status === "PENDING_APPROVAL",
    `status=${jSubmit.status} jnl=${journal?.status}`
  );

  const jAppr = await api(
    "POST",
    `/investment-ops/cash-journals/${journal.id}/approve`,
    checker,
    { expectedVersion: journal.version }
  );
  journal = dataOf(jAppr) || journal;
  record(
    "r1.journal-approve-checker",
    jAppr.status === 200 && journal?.status === "POSTED",
    `status=${jAppr.status} jnl=${journal?.status}`
  );

  // Consume reservation
  const consume = await api(
    "POST",
    `/investment-ops/cash-reservations/${reservation.id}/consume`,
    maker,
    { amount: "3000.00", expectedVersion: reservation.version }
  );
  const consumed = dataOf(consume);
  record(
    "r1.consume-reservation",
    consume.status === 200 &&
      (consumed?.status === "CONSUMED" || moneyEq(consumed?.remainingAmount, 0)),
    `status=${consume.status} resv=${consumed?.status}`
  );

  // Assert posted 6995 / available 6995
  const pos2 = await api("GET", posPath, maker);
  const p2 = dataOf(pos2);
  record(
    "r1.posted-available-6995",
    pos2.status === 200 &&
      moneyEq(p2?.postedSettledCash, 6995) &&
      moneyEq(p2?.orderEligibleAvailableCash, 6995),
    `posted=${p2?.postedSettledCash} available=${p2?.orderEligibleAvailableCash}`
  );

  summarizeFail(results);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
