/**
 * Walkthrough recon backend asks UAT (BA-R1, BA-R5, BA-R6, BA-R2 smoke).
 * Usage: npm run uat:investments-v2:recon-asks
 */
import "dotenv/config";
import { createHash } from "crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { assertDevDatabase } from "./lib/assert-dev-database";
import { api, BASE, idem, login, log } from "./lib/investments-v2-uat-helpers";

const prisma = new PrismaClient() as any;
const OPS = "/investment-ops";

const MAKER_EMAIL = process.env.SP_CASH_MAKER_EMAIL || "sp.cash.maker@example.com";
const MAKER_PASSWORD = process.env.SP_CASH_MAKER_PASSWORD || "Password123!";

type Row = { step: string; ok: boolean; detail: string };
const results: Row[] = [];

function record(step: string, ok: boolean, detail: string) {
  results.push({ step, ok, detail });
  log(step, ok, detail);
}

function hashFile(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

function dataOf(r: { json: any }) {
  return r.json?.data ?? r.json;
}

/** Non-admin maker so maker≠checker is enforced (admins bypass). */
async function ensureNonAdminMakerToken(): Promise<string> {
  let role = await prisma.role.findFirst({ where: { name: "SP Cash Maker" } });
  if (!role) {
    role = await prisma.role.create({
      data: {
        name: "SP Cash Maker",
        description: "Non-admin maker for recon UAT",
        permissions: [
          { name: "sp.cash.access", value: true },
          { name: "investments.write", value: true },
          { name: "investments.read", value: true },
          { name: "investments.*", value: true },
        ],
      },
    });
  }
  const hash = await bcrypt.hash(MAKER_PASSWORD, 10);
  let user = await prisma.user.findUnique({ where: { email: MAKER_EMAIL } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: MAKER_EMAIL,
        password: hash,
        firstName: "SP Cash",
        lastName: "Maker",
        roleId: role.id,
        roleCode: "analyst",
      },
    });
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { password: hash, roleId: role.id, roleCode: "analyst" },
    });
  }
  return login(MAKER_EMAIL, MAKER_PASSWORD);
}

async function main() {
  console.log(`\n=== Investments V2 walkthrough recon asks UAT ===`);
  console.log(`BASE=${BASE}\n`);

  await assertDevDatabase(prisma);
  const admin = await login();
  record("login admin", Boolean(admin), "admin@nts.com");

  // BA-R5 — OPEN / INVESTIGATING exceptions
  {
    const r = await api("GET", `${OPS}/reconciliation-exceptions?page=1&pageSize=20`, admin);
    const items: any[] = r.json?.data?.items ?? [];
    const openish = items.filter((x) =>
      ["OPEN", "ASSIGNED", "INVESTIGATING", "PENDING_APPROVAL", "INFO_REQUESTED"].includes(
        String(x.status || "").toUpperCase()
      )
    );
    record(
      "BA-R5 open reconciliation exceptions",
      r.status === 200 && openish.length >= 2,
      `total=${items.length} openish=${openish.length}`
    );
  }

  // BA-R6 — CBZ_CSV_V1 layout ACTIVE with documented columns
  const provider = await prisma.spCashProvider.findFirst({ where: { code: "CBZ_CUSTODY" } });
  const layout = provider
    ? await prisma.spCashFileLayout.findFirst({
        where: { providerId: provider.id, layoutCode: "CBZ_CSV_V1" },
      })
    : null;
  const cols = (layout?.dateMapJson as any)?.columns || [];
  record(
    "BA-R6 CBZ_CSV_V1 layout seeded ACTIVE",
    Boolean(provider && layout && layout.status === "ACTIVE" && cols.includes("value_date")),
    `provider=${provider?.id || "none"} layout=${layout?.id || "none"} cols=${cols.join("|")}`
  );

  const cash =
    (await prisma.spCashClientAccount.findFirst({
      where: { currency: "USD", status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
    })) ||
    (await prisma.spCashClientAccount.findFirst({ where: { currency: "USD" } }));
  if (!cash || !provider || !layout) {
    record("BA-R1/R6 import fixtures", false, "missing cash account / CBZ provider / layout — re-seed");
  } else {
    const uniq = idem("recon-r");
    const today = new Date().toISOString().slice(0, 10);

    // Happy-path CSV (canonical CBZ_CSV_V1 header)
    const happyCsv = [
      "value_date,trade_date,amount,debit_credit,reference,counterparty,description",
      `${today},${today},100.00,Credit,REF-HAPPY-${uniq},CBZ,Demo credit`,
      `${today},${today},40.00,Debit,REF-DEBIT-${uniq},CBZ,Demo debit`,
    ].join("\n");
    const happyHash = hashFile(happyCsv + uniq);
    const opening = 1000;
    const closing = 1060; // 1000 + 100 - 40

    const created = await api(
      "POST",
      `${OPS}/external-statements/imports`,
      admin,
      {
        providerId: provider.id,
        cashAccountId: cash.id,
        currency: "USD",
        fileName: `cbz-happy-${uniq}.csv`,
        fileHash: happyHash,
        layoutId: layout.id,
        controlOpening: opening,
        controlClosing: closing,
        rawContent: happyCsv,
      },
      { "Idempotency-Key": idem("recon-create-happy") }
    );
    const imp = dataOf(created);
    record(
      "BA-R1 import starts RECEIVED",
      [200, 201].includes(created.status) && String(imp?.status) === "RECEIVED",
      `status=${created.status} importStatus=${imp?.status} canValidate=${imp?.canValidate}`
    );

    // Gate: submit before validate must fail
    if (imp?.id) {
      const earlySubmit = await api(
        "POST",
        `${OPS}/external-statements/imports/${imp.id}/submit`,
        admin,
        {}
      );
      record(
        "BA-R1 submit blocked until VALIDATED",
        earlySubmit.status === 409,
        `status=${earlySubmit.status} code=${earlySubmit.json?.code || earlySubmit.json?.error}`
      );

      const validated = await api(
        "POST",
        `${OPS}/external-statements/imports/${imp.id}/validate`,
        admin,
        { controlOpening: opening, controlClosing: closing }
      );
      const v = dataOf(validated);
      const hasTotals = v?.controlTotals != null;
      record(
        "BA-R1/R6 validate returns controlTotals + VALIDATED",
        validated.status === 200 && v?.status === "VALIDATED" && v?.valid === true && hasTotals,
        `status=${validated.status} import=${v?.status} balanced=${v?.controlTotals?.balanced} errors=${(v?.errors || []).length}`
      );

      const submitted = await api(
        "POST",
        `${OPS}/external-statements/imports/${imp.id}/submit`,
        admin,
        {}
      );
      record(
        "BA-R1 submit → PENDING_APPROVAL",
        submitted.status === 200 && dataOf(submitted)?.status === "PENDING_APPROVAL",
        `status=${submitted.status} import=${dataOf(submitted)?.status}`
      );

      // Maker≠checker: non-admin maker cannot commit own import; admin checker can.
      const makerToken = await ensureNonAdminMakerToken();
      const conflictCsv = [
        "value_date,trade_date,amount,debit_credit,reference,counterparty,description",
        `${today},${today},10.00,Credit,REF-MC-${uniq},CBZ,Maker checker`,
      ].join("\n");
      const conflictHash = hashFile(conflictCsv + "mc" + uniq);
      const mcCreate = await api(
        "POST",
        `${OPS}/external-statements/imports`,
        makerToken,
        {
          providerId: provider.id,
          cashAccountId: cash.id,
          currency: "USD",
          fileName: `cbz-mc-${uniq}.csv`,
          fileHash: conflictHash,
          layoutId: layout.id,
          controlOpening: 0,
          controlClosing: 10,
          rawContent: conflictCsv,
        },
        { "Idempotency-Key": idem("recon-mc-create") }
      );
      const mcImp = dataOf(mcCreate);
      if (mcImp?.id) {
        await api(
          "POST",
          `${OPS}/external-statements/imports/${mcImp.id}/validate`,
          makerToken,
          { controlOpening: 0, controlClosing: 10 }
        );
        await api("POST", `${OPS}/external-statements/imports/${mcImp.id}/submit`, makerToken, {});
        const sameUserCommit = await api(
          "POST",
          `${OPS}/external-statements/imports/${mcImp.id}/commit`,
          makerToken,
          { controlOpening: 0, controlClosing: 10 }
        );
        const code = String(sameUserCommit.json?.code || "");
        record(
          "BA-R1 maker≠checker enforced",
          sameUserCommit.status === 409 && code.includes("MAKER_CHECKER"),
          `status=${sameUserCommit.status} code=${code}`
        );
        const adminCommitMc = await api(
          "POST",
          `${OPS}/external-statements/imports/${mcImp.id}/commit`,
          admin,
          { controlOpening: 0, controlClosing: 10 }
        );
        record(
          "BA-R1 checker(admin) can commit maker import",
          [200, 201].includes(adminCommitMc.status) &&
            dataOf(adminCommitMc)?.status === "COMMITTED",
          `status=${adminCommitMc.status} import=${dataOf(adminCommitMc)?.status}`
        );
      } else {
        record("BA-R1 maker≠checker setup", false, `create failed ${mcCreate.status}`);
      }

      // Happy path commit by admin (admin is maker — admin bypass for demo)
      const committed = await api(
        "POST",
        `${OPS}/external-statements/imports/${imp.id}/commit`,
        admin,
        { controlOpening: opening, controlClosing: closing }
      );
      record(
        "BA-R1 commit with control totals → COMMITTED",
        [200, 201].includes(committed.status) && dataOf(committed)?.status === "COMMITTED",
        `status=${committed.status} import=${dataOf(committed)?.status} statementId=${dataOf(committed)?.statementId}`
      );
    }

    // Validation-fail CSV (missing dates) + requireControlTotals
    const failCsv = [
      "value_date,trade_date,amount,debit_credit,reference,counterparty,description",
      `,,,Credit,REF-BAD-${uniq},CBZ,Missing dates`,
    ].join("\n");
    const failHash = hashFile(failCsv + "fail" + uniq);
    const failCreate = await api(
      "POST",
      `${OPS}/external-statements/imports`,
      admin,
      {
        providerId: provider.id,
        cashAccountId: cash.id,
        currency: "USD",
        fileName: `cbz-fail-${uniq}.csv`,
        fileHash: failHash,
        layoutId: layout.id,
        rawContent: failCsv,
      },
      { "Idempotency-Key": idem("recon-fail-create") }
    );
    const failImp = dataOf(failCreate);
    if (failImp?.id) {
      const failVal = await api(
        "POST",
        `${OPS}/external-statements/imports/${failImp.id}/validate`,
        admin,
        { requireControlTotals: true }
      );
      const fv = dataOf(failVal);
      const errs: any[] = fv?.errors || [];
      const hasLine = errs.some((e) => e.lineNumber != null && e.code);
      const hasControl = errs.some((e) => e.code === "CONTROL_TOTALS_REQUIRED");
      record(
        "BA-R6 validate returns lineNumber + code errors",
        failVal.status === 200 &&
          fv?.status === "VALIDATION_FAILED" &&
          hasLine &&
          hasControl,
        `status=${fv?.status} errors=${JSON.stringify(errs.slice(0, 4))}`
      );
    } else {
      record("BA-R6 validate fail fixture", false, `create ${failCreate.status}`);
    }

    // Duplicate hash after commit blocked
    const dup = await api(
      "POST",
      `${OPS}/external-statements/imports`,
      admin,
      {
        providerId: provider.id,
        cashAccountId: cash.id,
        currency: "USD",
        fileName: `cbz-dup-${uniq}.csv`,
        fileHash: happyHash,
        layoutId: layout.id,
        rawContent: happyCsv,
      },
      { "Idempotency-Key": idem("recon-dup") }
    );
    const dupCode = String(dup.json?.code || "");
    record(
      "BA-R6 duplicate file hash blocked",
      dup.status === 409 && dupCode.includes("DUPLICATE"),
      `status=${dup.status} code=${dupCode}`
    );
  }

  // BA-R2 — match suggestions expose scoreComponents + weights (best-effort)
  {
    const batches = await api("GET", `${OPS}/reconciliation-batches?page=1&pageSize=5`, admin);
    const items: any[] = batches.json?.data?.items ?? batches.json?.data ?? [];
    const batchId = items[0]?.id;
    if (!batchId) {
      record("BA-R2 scoreComponents on suggestions", true, "skip — no recon batch (ok)");
    } else {
      const ws = await api("GET", `${OPS}/reconciliation-batches/${batchId}/workspace`, admin);
      const suggestions: any[] =
        ws.json?.data?.suggestions || ws.json?.data?.workspace?.suggestions || [];
      const withComp = suggestions.find((s) => s.scoreComponents || s.scoreTotal != null);
      record(
        "BA-R2 scoreTotal/components available",
        ws.status === 200 && (suggestions.length === 0 || Boolean(withComp)),
        `suggestions=${suggestions.length} hasComponents=${Boolean(withComp?.scoreComponents)}`
      );
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== ${results.length - failed.length}/${results.length} PASS ===\n`);
  if (failed.length) {
    for (const f of failed) console.log(`  FAIL ${f.step}: ${f.detail}`);
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
