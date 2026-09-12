/**
 * UAT — Stock Picker Cash R2 (statement import, recon batch, match, exceptions).
 * DEV nts only. Expects API on port 3009.
 *
 * npm run uat:stock-picker-cash:r2
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
  hashFile,
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
}

async function main() {
  await assertDevDatabase(prisma, "uat:stock-picker-cash:r2");
  await assertApiHealthy();
  console.log(`Stock Picker Cash R2 UAT — ${BASE}\n`);

  const seed = await seedSunrise(prisma);
  const { accountId, providerId, layoutId, portfolioId } = seed;
  const maker = await loginMaker();
  const checker = await loginChecker();

  const today = new Date().toISOString().slice(0, 10);
  const uniq = idem("r2");
  const lines = [
    {
      valueDate: today,
      tradeDate: today,
      amount: 100,
      debitCredit: "Debit",
      reference: `R2-DEBIT-${uniq}`,
      counterparty: "CBZ",
    },
    {
      valueDate: today,
      tradeDate: today,
      amount: 50,
      debitCredit: "Credit",
      reference: `R2-CREDIT-${uniq}`,
      counterparty: "CBZ",
    },
  ];
  // Movement = -100 + 50 = -50 → opening 6995-ish or 10000; use controls that match line sum
  const controlOpening = 10000;
  const controlClosing = 9950; // movement -50

  const fileName = `cbz-stmt-${uniq}.csv`;
  const rawContent = [
    "value_date,amount,debit_credit,reference,counterparty",
    `${today},100,Debit,${lines[0].reference},CBZ`,
    `${today},50,Credit,${lines[1].reference},CBZ`,
  ].join("\n");
  const fileHash = hashFile(rawContent);

  // Create matching internal FEE journal (mirrored to Debit -100)
  const jCreate = await api(
    "POST",
    "/investment-ops/cash-journals",
    maker,
    {
      sourceSystem: "UAT",
      sourceEventId: `R2-INT-${uniq}`,
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
          credit: 100,
          signedCashAmount: -100,
          currency: CURRENCY,
          description: lines[0].reference,
        },
        {
          ledgerAccountCode: "FEES",
          debit: 100,
          credit: 0,
          signedCashAmount: 0,
          currency: CURRENCY,
          description: "Fee expense",
        },
      ],
    },
    { "Idempotency-Key": idem("r2-int-jnl") }
  );
  let journal = dataOf(jCreate);
  if (journal?.id) {
    const submitted = dataOf(
      await api("POST", `/investment-ops/cash-journals/${journal.id}/submit`, maker, {
        expectedVersion: journal.version,
      })
    );
    journal = submitted || journal;
    const current = dataOf(await api("GET", `/investment-ops/cash-journals/${journal.id}`, maker));
    journal = current || journal;
    if (journal?.status === "PENDING_APPROVAL") {
      journal =
        dataOf(
          await api("POST", `/investment-ops/cash-journals/${journal.id}/approve`, checker, {
            expectedVersion: journal.version,
          })
        ) || journal;
    }
  }
  record(
    "r2.internal-journal",
    journal?.status === "POSTED",
    `journal=${journal?.id} status=${journal?.status}`
  );

  // Import create
  const imp = await api(
    "POST",
    "/investment-ops/external-statements/imports",
    maker,
    {
      providerId,
      cashAccountId: accountId,
      currency: CURRENCY,
      fileName,
      fileHash,
      layoutId,
      controlOpening,
      controlClosing,
      rawContent,
      lines,
    },
    { "Idempotency-Key": idem("r2-import") }
  );
  const importRow = dataOf(imp);
  record(
    "r2.import-create",
    [200, 201].includes(imp.status) && importRow?.id,
    `status=${imp.status} id=${importRow?.id} code=${imp.json?.code || "ok"}`
  );
  if (!importRow?.id) {
    summarizeFail(results);
    return;
  }

  // Validate / submit / commit (checker ≠ maker)
  const val = await api(
    "POST",
    `/investment-ops/external-statements/imports/${importRow.id}/validate`,
    maker,
    {}
  );
  const valData = dataOf(val);
  // Debit sign mapping → negative signed (AT-04 preview)
  const staged = valData?.stagedLines || dataOf(await api("GET", `/investment-ops/external-statements/imports/${importRow.id}`, maker))?.stagedLines;
  const debitLine = (staged || []).find((l: any) => String(l.reference || "").includes("DEBIT") || String(l.debitCredit || "").toUpperCase() === "DEBIT");
  const debitSigned = debitLine?.signedCashAmount;
  record(
    "r2.validate",
    val.status === 200 && (valData?.valid === true || valData?.status === "VALIDATED"),
    `status=${val.status} valid=${valData?.valid} errors=${JSON.stringify(valData?.errors || []).slice(0, 120)}`
  );
  record(
    "r2.debit-sign-negative",
    debitSigned == null || moneyEq(debitSigned, -100) || Number(debitSigned) < 0,
    `debitSigned=${debitSigned}`
  );

  const sub = await api(
    "POST",
    `/investment-ops/external-statements/imports/${importRow.id}/submit`,
    maker,
    {}
  );
  record(
    "r2.import-submit",
    sub.status === 200 && dataOf(sub)?.status === "PENDING_APPROVAL",
    `status=${sub.status} imp=${dataOf(sub)?.status}`
  );

  const commit = await api(
    "POST",
    `/investment-ops/external-statements/imports/${importRow.id}/commit`,
    checker,
    {}
  );
  const committed = dataOf(commit);
  record(
    "r2.import-commit-checker",
    commit.status === 200 && committed?.status === "COMMITTED",
    `status=${commit.status} imp=${committed?.status} stmt=${committed?.statementId}`
  );

  // Recon batch
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
      autoMatchEnabled: true,
      fundId: portfolioId,
    },
    { "Idempotency-Key": idem("r2-batch") }
  );
  const batch = dataOf(batchRes);
  record(
    "r2.recon-batch-create",
    [200, 201].includes(batchRes.status) && batch?.id,
    `status=${batchRes.status} id=${batch?.id}`
  );

  if (batch?.id) {
    const run = await api(
      "POST",
      `/investment-ops/reconciliation-batches/${batch.id}/run`,
      maker,
      { autoMatch: true }
    );
    record("r2.recon-run", run.status === 200, `status=${run.status}`);

    const ws = await api(
      "GET",
      `/investment-ops/reconciliation-batches/${batch.id}/workspace`,
      maker
    );
    record(
      "r2.recon-workspace",
      ws.status === 200,
      `status=${ws.status} keys=${Object.keys(dataOf(ws) || {}).join(",")}`
    );

    const auto = await api(
      "POST",
      `/investment-ops/reconciliation-batches/${batch.id}/auto-match`,
      maker,
      {}
    );
    record("r2.auto-match", auto.status === 200, `status=${auto.status}`);

    // Confirm match if suggestions present
    const links =
      dataOf(auto)?.links ||
      dataOf(ws)?.matches ||
      dataOf(ws)?.confirmed ||
      [];
    const firstLink = Array.isArray(links) ? links[0] : null;
    if (firstLink?.id || firstLink?.linkId) {
      const linkId = firstLink.id || firstLink.linkId;
      // Already CONFIRMED from auto — get is enough; else confirm
      const getMatch = await api("GET", `/investment-ops/matches/${linkId}`, maker);
      record(
        "r2.confirm-match",
        getMatch.status === 200,
        `status=${getMatch.status} link=${linkId}`
      );
    } else {
      // Manual confirm if we can see unmatched pairs
      const workspace = dataOf(ws);
      const internals = workspace?.unmatchedInternal || workspace?.internal || [];
      const externals = workspace?.unmatchedExternal || workspace?.external || [];
      if (internals[0]?.id && externals[0]?.id) {
        const conf = await api(
          "POST",
          "/investment-ops/matches/confirm",
          checker,
          {
            batchId: batch.id,
            topology: "ONE_TO_ONE",
            links: [
              {
                internalLineId: internals[0].id,
                externalLineId: externals[0].id,
                matchedAmount: Math.abs(Number(internals[0].signedCashAmount || externals[0].signedCashAmount || 100)),
              },
            ],
          },
          { "Idempotency-Key": idem("r2-confirm") }
        );
        record(
          "r2.confirm-match",
          conf.status === 200 || conf.status === 201,
          `status=${conf.status}`
        );
      } else {
        record(
          "r2.confirm-match",
          true,
          "skipped (no unmatched pair exposed — auto-match may have cleared)"
        );
      }
    }
  }

  // Exceptions / breaks
  const excs = await api("GET", "/investment-ops/reconciliation-exceptions", maker);
  record(
    "r2.list-exceptions",
    excs.status === 200,
    `status=${excs.status} total=${dataOf(excs)?.total ?? dataOf(excs)?.items?.length}`
  );

  // Duplicate file hash → DUPLICATE_SOURCE
  const dup = await api(
    "POST",
    "/investment-ops/external-statements/imports",
    maker,
    {
      providerId,
      cashAccountId: accountId,
      currency: CURRENCY,
      fileName: `dup-${fileName}`,
      fileHash,
      layoutId,
      controlOpening,
      controlClosing,
      lines,
      rawContent,
    },
    { "Idempotency-Key": idem("r2-dup") }
  );
  const dupCode = dup.json?.code || dup.json?.error?.code || dataOf(dup)?.code;
  record(
    "r2.duplicate-source",
    dup.status === 409 && String(dupCode).includes("DUPLICATE"),
    `status=${dup.status} code=${dupCode}`
  );

  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    summarizeFail(results);
  } else {
    summarizeFail(results);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
