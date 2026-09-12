/**
 * Prints copy-paste API examples with REAL bank/entry IDs from the connected DB.
 * Run: npx ts-node scripts/print-cashbook-recon-api-payloads.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

async function main() {
  const bank =
    (await prisma.bank.findFirst({
      where: { isActive: true, name: { contains: "CBZ" } },
      select: { id: true, name: true, accountNumber: true },
    })) ||
    (await prisma.bank.findFirst({
      where: { isActive: true },
      select: { id: true, name: true, accountNumber: true },
      orderBy: { name: "asc" },
    }));

  if (!bank) {
    console.log("No active bank found.");
    process.exit(1);
  }

  const entries = await prisma.cashbookEntry.findMany({
    where: {
      bankId: bank.id,
      status: "POSTED",
      isReconciled: false,
    },
    select: { id: true, type: true, amount: true, transactionDate: true, reference: true },
    orderBy: { transactionDate: "asc" },
    take: 5,
  });

  const BASE = process.env.API_BASE_URL || `http://127.0.0.1:${process.env.PORT || "3009"}`;
  const bankId = bank.id;

  let selectedIds: string[] = entries.map((e) => e.id);
  let selected = entries;
  let opening = 0;
  let statementEndBalance = 0;

  if (selected.length > 0) {
    let received = 0;
    let paid = 0;
    for (const e of selected) {
      const a = parseFloat(e.amount.toString());
      if (e.type === "RECEIPT") received += a;
      else paid += a;
    }
    statementEndBalance = round2(opening + received - paid);
  }

  const maxDate =
    selected.length > 0
      ? new Date(Math.max(...selected.map((e) => new Date(e.transactionDate).getTime())))
      : new Date();
  const asOf = ymd(maxDate);
  const statementDateIso = maxDate.toISOString();

  console.log("--- Bank (use this bankId everywhere below) ---\n");
  console.log(JSON.stringify(bank, null, 2));

  if (selected.length === 0) {
    console.log(
      "\nNo unreconciled POSTED cashbook lines for this bank. Seed first:\nPOST /api/cashbook/reconciliation/seed-five-unreconciled\nBody:",
      JSON.stringify({ bankId }, null, 2)
    );
    await prisma.$disconnect();
    return;
  }

  console.log("\n--- Selected entry IDs (real) + computed statementEndBalance ---\n");
  console.log(
    JSON.stringify(
      {
        selectedCashbookEntryIds: selectedIds,
        openingBalance: opening,
        statementEndBalance,
        asOf,
        statementDate: statementDateIso,
        entries: selected.map((e) => ({
          id: e.id,
          type: e.type,
          amount: e.amount.toString(),
          transactionDate: e.transactionDate.toISOString(),
          reference: e.reference,
        })),
      },
      null,
      2
    )
  );

  const createBody = {
    statementDate: statementDateIso,
    statementEndBalance,
    reference: `Manual recon test ${Date.now()}`,
    openingBalance: opening,
    selectedEntryIds: selectedIds,
  };

  const linesPayload = selectedIds.map((id) => ({ cashbookEntryId: id, selected: true }));

  console.log("\n========== ENDPOINTS (replace YOUR_JWT after login) ==========");
  console.log("BASE:", BASE);
  console.log("\n1) Login\nPOST /api/auth/login");
  console.log(JSON.stringify({ email: "admin@nts.com", password: "admin123" }, null, 2));

  console.log(
    `\n2) GET candidate lines\nGET ${BASE}/api/cashbook/reconciliation/banks/${bankId}/entries?asOf=${encodeURIComponent(asOf)}`
  );
  console.log(
    `   (optional) GET ${BASE}/api/cashbook/reconciliation/banks/${bankId}/entries?asOf=${encodeURIComponent(asOf)}&includeReconciled=true`
  );

  console.log(`\n3) GET sessions for bank\nGET ${BASE}/api/cashbook/reconciliation/banks/${bankId}/sessions`);

  console.log(`\n4) POST create draft\nPOST ${BASE}/api/cashbook/reconciliation/banks/${bankId}/sessions`);
  console.log(JSON.stringify(createBody, null, 2));

  console.log(
    "\n5) GET session (replace SESSION_ID with id from step 4 response data.id)\nGET " +
      `${BASE}/api/cashbook/reconciliation/sessions/SESSION_ID`
  );

  console.log(
    "\n6) PATCH draft (replace SESSION_ID)\nPATCH " +
      `${BASE}/api/cashbook/reconciliation/sessions/SESSION_ID`
  );
  console.log(
    JSON.stringify(
      {
        reference: `${createBody.reference} (patched)`,
        lines: linesPayload,
      },
      null,
      2
    )
  );

  console.log(
    "\n7) POST finish (replace SESSION_ID — same draft; balances must match create body)\nPOST " +
      `${BASE}/api/cashbook/reconciliation/sessions/SESSION_ID/finish`
  );
  console.log("(no body)");

  console.log(
    "\n8) POST discard — create another empty draft first, then:\nPOST " +
      `${BASE}/api/cashbook/reconciliation/sessions/OTHER_SESSION_ID/discard`
  );
  console.log(
    "Empty draft body example:\n" +
      JSON.stringify(
        {
          statementDate: new Date().toISOString(),
          statementEndBalance: 0,
          reference: "discard-me",
          openingBalance: 0,
          selectedEntryIds: [],
        },
        null,
        2
      )
  );

  console.log("\n--- Done ---");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
