/**
 * UAT — LP Portal Phase 2 (dealing overview/rules/estimate/subscribe/redeem).
 * DEV nts only.
 *
 * npm run uat:lp-portal:phase2
 */
// @ts-nocheck
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  BASE,
  api,
  assertDevDatabase,
  ensureSeed,
  idem,
  loadSeedIds,
  log,
  resolveSignatoryToken,
  summarizeFail,
} from "./lib/lp-portal-uat-helpers";

const prisma = new PrismaClient();
const results: Array<{ step: string; ok: boolean; detail: string }> = [];

function record(step: string, ok: boolean, detail: string) {
  results.push({ step, ok, detail });
  log(step, ok, detail);
}

async function main() {
  await assertDevDatabase(prisma, "uat:lp-portal:phase2");
  await ensureSeed(prisma);
  console.log(`LP Portal Phase 2 UAT — ${BASE}\n`);

  const ids = await loadSeedIds(prisma);
  const token = await resolveSignatoryToken();
  const fundId = ids.fundOeId;
  console.log(`fundOeId=${fundId}\n`);

  const overview = await api("GET", `/lp-portal/dealing/overview?fundId=${fundId}`, token);
  record(
    "dealing.overview",
    overview.status === 200 && overview.json?.success !== false,
    `status=${overview.status}`
  );

  const rules = await api("GET", `/lp-portal/dealing/rules?fundId=${fundId}`, token);
  record(
    "dealing.rules",
    rules.status === 200 && rules.json?.success !== false,
    `status=${rules.status} min=${rules.json?.data?.minBalanceAmount}`
  );

  const estSub = await api("POST", "/lp-portal/dealing/subscriptions/estimate", token, {
    fundId,
    shareClass: "Class A",
    amount: 100000,
    currency: "USD",
  });
  record(
    "dealing.sub.estimate",
    estSub.status === 200 && estSub.json?.data?.isEstimate === true,
    `status=${estSub.status} isEstimate=${estSub.json?.data?.isEstimate}`
  );

  const sub = await api(
    "POST",
    "/lp-portal/dealing/subscriptions",
    token,
    {
      fundId,
      shareClass: "Class A",
      amount: 50000,
      currency: "USD",
      sourceBankAccountId: ids.bankAccountId,
      estimateSnapshotId: estSub.json?.data?.estimateSnapshotId,
    },
    { "Idempotency-Key": idem("p2-sub") }
  );
  record(
    "dealing.sub.create",
    [200, 201].includes(sub.status) && sub.json?.success !== false,
    `status=${sub.status} id=${sub.json?.data?.id || "?"}`
  );

  // Partial redeem that breaches min balance (~$1M) — redeem most of ~$24.68M leaving <$1M
  const breach = await api("POST", "/lp-portal/dealing/redemptions/estimate", token, {
    fundId,
    shareClass: "Class A",
    mode: "AMOUNT",
    amount: 24_000_000,
  });
  record(
    "dealing.redeem.min-balance-fail",
    breach.status === 422 &&
      (breach.json?.error?.code === "LP_MIN_BALANCE_BREACH" ||
        String(breach.json?.message || "").toLowerCase().includes("minimum")),
    `status=${breach.status} code=${breach.json?.error?.code || breach.json?.message}`
  );

  const dealingDate = new Date();
  dealingDate.setDate(dealingDate.getDate() + 45);
  const earliest = dealingDate.toISOString().slice(0, 10);

  const estFull = await api("POST", "/lp-portal/dealing/redemptions/estimate", token, {
    fundId,
    shareClass: "Class A",
    mode: "FULL",
    full: true,
    earliestDealingDate: earliest,
  });
  record(
    "dealing.redeem.full.estimate",
    estFull.status === 200 && estFull.json?.data?.isEstimate === true,
    `status=${estFull.status} isEstimate=${estFull.json?.data?.isEstimate}`
  );

  const full = await api(
    "POST",
    "/lp-portal/dealing/redemptions",
    token,
    {
      fundId,
      shareClass: "Class A",
      mode: "FULL",
      full: true,
      earliestDealingDate: earliest,
      bankAccountId: ids.bankAccountId,
      estimateSnapshotId: estFull.json?.data?.estimateSnapshotId,
    },
    { "Idempotency-Key": idem("p2-redeem-full") }
  );
  record(
    "dealing.redeem.full.create",
    [200, 201].includes(full.status) && full.json?.success !== false,
    `status=${full.status} id=${full.json?.data?.id || "?"}`
  );

  const banks = await api("GET", `/lp-portal/dealing/bank-accounts?fundId=${fundId}`, token);
  record(
    "dealing.bank-accounts",
    banks.status === 200 && (banks.json?.data?.length > 0 || banks.json?.data?.items?.length > 0),
    `status=${banks.status}`
  );

  const reqs = await api("GET", `/lp-portal/dealing/requests?fundId=${fundId}`, token);
  record(
    "dealing.requests",
    reqs.status === 200 && reqs.json?.success !== false,
    `status=${reqs.status}`
  );

  summarizeFail(results);
  console.log("\nPhase 2 passed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
