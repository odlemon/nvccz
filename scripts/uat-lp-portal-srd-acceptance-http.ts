/**
 * UAT — LP Portal SRD acceptance (IDOR, unfunded, ack≠PAID, min-balance, estimate, idempotency).
 * DEV nts only. Spawns db:seed:lp-portal-srd once at start.
 *
 * npm run uat:lp-portal:srd-acceptance
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
  console.log(`LP Portal SRD acceptance — ${BASE}\n`);
  await ensureSeed(prisma);
  await assertDevDatabase(prisma, "uat:lp-portal:srd-acceptance");

  const ids = await loadSeedIds(prisma);
  const token = await resolveSignatoryToken();
  console.log(`clientId=${ids.clientId} otherAlloc=${ids.otherCapitalCallAllocationId}\n`);

  // —— IDOR ——
  if (ids.otherCapitalCallAllocationId) {
    const idor = await api(
      "GET",
      `/lp-portal/capital-calls/${ids.otherCapitalCallAllocationId}`,
      token
    );
    record(
      "idor.other-client-call",
      idor.status === 403 || idor.status === 404,
      `status=${idor.status}`
    );
  } else {
    record("idor.other-client-call", false, "missing other allocation fixture");
  }

  // —— Unfunded via dashboard metrics ——
  const dash = await api("GET", `/lp-portal/dashboard?fundId=${ids.fundPcId}`, token);
  const unfunded = dash.json?.data?.kpis?.unfunded ?? dash.json?.data?.kpis?.unfundedCommitment;
  record(
    "metrics.unfunded",
    dash.status === 200 && unfunded != null && Number(unfunded) > 0,
    `unfunded=${unfunded}`
  );

  // —— Ack does not set PAID / amountPaid ——
  const callId = ids.capitalCallAllocationId;
  if (!callId) {
    record("ack.not-paid", false, "no capital call allocation");
  } else {
    await (prisma as any).lpCapitalCallPortalState.deleteMany({
      where: { capitalCallAllocationId: callId },
    });
    await prisma.capitalCallAllocation.update({
      where: { id: callId },
      data: { amountPaid: 0, status: "PENDING" },
    });

    const key = idem("srd-ack");
    const ack1 = await api(
      "POST",
      `/lp-portal/capital-calls/${callId}/acknowledge`,
      token,
      {},
      { "Idempotency-Key": key }
    );
    record("ack.success", ack1.status === 200, `status=${ack1.status}`);

    const row = await prisma.capitalCallAllocation.findUnique({ where: { id: callId } });
    const paid = Number(row?.amountPaid ?? -1);
    const status = String(row?.status || "");
    record(
      "ack.not-paid",
      paid === 0 && status !== "PAID",
      `amountPaid=${paid} status=${status}`
    );

    // —— Idempotency replay ——
    const ack2 = await api(
      "POST",
      `/lp-portal/capital-calls/${callId}/acknowledge`,
      token,
      {},
      { "Idempotency-Key": key }
    );
    record(
      "idempotency.replay",
      ack2.status === 200 && ack2.json?.success !== false,
      `status=${ack2.status}`
    );

    // Same key + different payload → 409 (body changed)
    const conflict = await api(
      "POST",
      `/lp-portal/capital-calls/${callId}/acknowledge`,
      token,
      { note: "different" },
      { "Idempotency-Key": key }
    );
    record(
      "idempotency.conflict-or-replay",
      conflict.status === 409 || conflict.status === 200 || conflict.status === 400,
      `status=${conflict.status} code=${conflict.json?.error?.code || "n/a"}`
    );
  }

  // —— Estimate flag ——
  const est = await api("POST", "/lp-portal/dealing/subscriptions/estimate", token, {
    fundId: ids.fundOeId,
    shareClass: "Class A",
    amount: 25000,
  });
  record(
    "estimate.isEstimate",
    est.status === 200 && est.json?.data?.isEstimate === true,
    `isEstimate=${est.json?.data?.isEstimate}`
  );

  // —— Min balance ——
  const breach = await api("POST", "/lp-portal/dealing/redemptions/estimate", token, {
    fundId: ids.fundOeId,
    shareClass: "Class A",
    mode: "amount",
    amount: 24_000_000,
  });
  record(
    "min-balance.breach",
    breach.status === 422 &&
      (breach.json?.error?.code === "LP_MIN_BALANCE_BREACH" ||
        /minimum/i.test(String(breach.json?.message || ""))),
    `status=${breach.status} code=${breach.json?.error?.code}`
  );

  // —— FULL redeem path allowed ——
  const dealingDate = new Date();
  dealingDate.setDate(dealingDate.getDate() + 45);
  const fullEst = await api("POST", "/lp-portal/dealing/redemptions/estimate", token, {
    fundId: ids.fundOeId,
    shareClass: "Class A",
    full: true,
    mode: "FULL",
    earliestDealingDate: dealingDate.toISOString().slice(0, 10),
  });
  record(
    "redeem.full.estimate-ok",
    fullEst.status === 200 && fullEst.json?.data?.isEstimate === true,
    `status=${fullEst.status}`
  );

  summarizeFail(results);
  console.log("\nSRD acceptance passed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
