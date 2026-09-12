/**
 * Recon breaks mark-reviewed + match confirm/reverse UAT.
 * Usage: npm run uat:investments-v2:recon-breaks-match
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { assertDevDatabase } from "./lib/assert-dev-database";
import { api, idem, login, log } from "./lib/investments-v2-uat-helpers";

const prisma = new PrismaClient() as any;
const OPS = "/investment-ops";

function dataOf(r: { json: any }) {
  return r.json?.data ?? r.json;
}

async function main() {
  await assertDevDatabase(prisma);
  const token = await login();
  let failed = 0;

  // Prefer exception whose cash account has both journal + external lines (for match UAT).
  const candidates = await prisma.spCashReconciliationException.findMany({
    where: { status: { in: ["OPEN", "INVESTIGATING"] } },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });
  let exc = null as any;
  for (const c of candidates) {
    const [hasInt, hasExt] = await Promise.all([
      prisma.spCashJournalLine.findFirst({
        where: { cashAccountId: c.cashAccountId, journal: { status: "POSTED" } },
        select: { id: true },
      }),
      prisma.spCashExternalStatementLine.findFirst({
        where: { statement: { cashAccountId: c.cashAccountId } },
        select: { id: true },
      }),
    ]);
    if (hasInt && hasExt) {
      exc = c;
      break;
    }
  }
  if (!exc) {
    exc =
      candidates[0] ||
      (await prisma.spCashReconciliationException.findFirst({
        where: { status: { in: ["OPEN", "INVESTIGATING"] } },
        orderBy: { updatedAt: "desc" },
      }));
  }
  if (!exc) {
    log("setup exception", false, "no OPEN/INVESTIGATING exception on nts");
    process.exit(1);
  }

  // 1) Mark reviewed using EXCEPTION id (FE footgun)
  const markViaExc = await api(
    "POST",
    `${OPS}/reconciliation-breaks/${exc.id}/mark-reviewed`,
    token,
    { notes: "UAT mark-reviewed via exception id" }
  );
  const markData = dataOf(markViaExc);
  const markOk =
    markViaExc.status === 200 &&
    markData?.status === "REVIEWED" &&
    (markData?.breakId || markData?.id);
  log(
    "mark-reviewed via exceptionId",
    markOk,
    `status=${markViaExc.status} break=${markData?.breakId || markData?.id} code=${markViaExc.json?.code}`
  );
  if (!markOk) failed++;

  const breakId = markData?.breakId || markData?.id;
  if (breakId) {
    // Idempotent re-mark via break id (already REVIEWED from prior step)
    const markViaBreak = await api(
      "POST",
      `${OPS}/reconciliation-breaks/${breakId}/mark-reviewed`,
      token,
      { notes: "UAT mark-reviewed via break id (idempotent)" }
    );
    const ok2 = markViaBreak.status === 200 && dataOf(markViaBreak)?.status === "REVIEWED";
    log("mark-reviewed via breakId (idempotent)", ok2, `status=${markViaBreak.status}`);
    if (!ok2) failed++;
  }

  // 2) Manual confirm + reverse (only when real lines exist)
  const accountId = exc.cashAccountId;
  const batch = exc.batchId
    ? await prisma.spCashReconciliationBatch.findUnique({ where: { id: exc.batchId } })
    : await prisma.spCashReconciliationBatch.findFirst({
        where: { cashAccountId: accountId },
        orderBy: { updatedAt: "desc" },
      });

  const internal = await prisma.spCashJournalLine.findFirst({
    where: {
      cashAccountId: accountId,
      journal: { status: "POSTED" },
      OR: [{ matchStatus: { not: "MATCHED" } }, { matchStatus: null }],
    },
    orderBy: { createdAt: "desc" },
  });
  const external = await prisma.spCashExternalStatementLine.findFirst({
    where: {
      OR: [{ matchStatus: { not: "MATCHED" } }, { matchStatus: null }],
      statement: { cashAccountId: accountId },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!internal || !external) {
    log(
      "manual match confirm",
      true,
      `SKIPPED — no unmatched internal/external lines for account ${accountId}`
    );
    log("unmatch reverse", true, "SKIPPED — no match fixture");
  } else {
    const amount = String(
      Math.min(Number(internal.signedCashAmount || 100), Number(external.signedCashAmount || 100)).toFixed(2)
    );
    const confirm = await api(
      "POST",
      `${OPS}/matches/manual`,
      token,
      {
        batchId: batch?.id,
        cashAccountId: accountId,
        internalLineId: internal.id,
        externalLineId: external.id,
        matchedAmount: amount,
      },
      { "Idempotency-Key": idem("match-manual") }
    );
    const confirmData = dataOf(confirm);
    const linkId = confirmData?.links?.[0]?.id || confirmData?.links?.[0]?.matchId;
    const confirmOk = (confirm.status === 200 || confirm.status === 201) && linkId;
    log(
      "manual match confirm",
      Boolean(confirmOk),
      `status=${confirm.status} linkId=${linkId} code=${confirm.json?.code} msg=${confirm.json?.message}`
    );
    if (!confirmOk) failed++;

    if (linkId) {
      const rev = await api(
        "POST",
        `${OPS}/matches/${linkId}/unmatch`,
        token,
        { reason: "UAT reverse" }
      );
      const revOk =
        rev.status === 200 && String(dataOf(rev)?.status || "").toUpperCase() === "REVERSED";
      log("unmatch reverse", revOk, `status=${rev.status} linkStatus=${dataOf(rev)?.status}`);
      if (!revOk) failed++;

      const confirm2 = await api(
        "POST",
        `${OPS}/matches/confirm`,
        token,
        {
          cashAccountId: accountId,
          internalLineId: internal.id,
          externalLineId: external.id,
          matchedAmount: amount,
        },
        { "Idempotency-Key": idem("match-confirm2") }
      );
      const link2 = dataOf(confirm2)?.links?.[0]?.id;
      if (link2) {
        const rev2 = await api("POST", `${OPS}/matches/unmatch`, token, { linkId: link2 });
        const ok = rev2.status === 200;
        log("unmatch via body linkId", ok, `status=${rev2.status}`);
        if (!ok) failed++;
      }
    }
  }

  // Unknown id → clean 404, not Prisma RESOURCE_NOT_FOUND dump
  const missing = await api(
    "POST",
    `${OPS}/reconciliation-breaks/does-not-exist-break-id/mark-reviewed`,
    token,
    {}
  );
  const clean404 =
    missing.status === 404 &&
    String(missing.json?.code || "").includes("NOT_FOUND") &&
    !String(missing.json?.message || "").includes("prisma.");
  log("mark-reviewed missing → 404", clean404, `status=${missing.status} code=${missing.json?.code}`);
  if (!clean404) failed++;

  console.log(failed ? `\nFAILED ${failed} check(s)` : "\nAll recon break/match checks passed");
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
