/**
 * One-by-one HTTP tests for cashbook bank reconciliation session APIs.
 *
 * Run (API must be up): npx ts-node scripts/test-cashbook-reconciliation-sessions-http.ts
 *
 * Env: API_BASE_URL or PORT (default 3009), TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD,
 *      AUTO_SEED_UNRECONCILED=true (default) — POSTs seed-five if no unreconciled POSTED lines exist.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.API_BASE_URL || `http://127.0.0.1:${process.env.PORT || "3009"}`;
const EMAIL = process.env.TEST_ADMIN_EMAIL || "admin@nts.com";
const PASSWORD = process.env.TEST_ADMIN_PASSWORD || "admin123";
const AUTO_SEED = process.env.AUTO_SEED_UNRECONCILED !== "false" && process.env.AUTO_SEED_UNRECONCILED !== "0";

const prisma = new PrismaClient();

async function req(
  method: string,
  path: string,
  opts: { token?: string; body?: object } = {}
): Promise<{ status: number; json: any; text: string }> {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const r = await fetch(url, {
    method,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await r.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text };
  }
  return { status: r.status, json, text };
}

function fail(step: string, detail: string): never {
  console.error(`\nFAIL [${step}]:`, detail);
  process.exit(1);
  throw new Error("unreachable");
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function reconciledBalance(
  opening: number,
  entries: Array<{ type: string; amount: { toString(): string } | number | string }>
): number {
  let received = 0;
  let paid = 0;
  for (const e of entries) {
    const a = parseFloat(String(e.amount));
    if (e.type === "RECEIPT") received += a;
    else if (e.type === "PAYMENT") paid += a;
  }
  return round2(opening + received - paid);
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function main() {
  console.log("BASE:", BASE);
  console.log("AUTO_SEED_UNRECONCILED:", AUTO_SEED);

  const login = await req("POST", "/api/auth/login", {
    body: { email: EMAIL, password: PASSWORD },
  });
  if (login.status !== 200 || !login.json?.token) {
    fail("login", `expected 200 + token, got ${login.status} ${login.text.slice(0, 400)}`);
  }
  const token = login.json.token as string;
  console.log("OK login user:", login.json.user?.id);

  let bank = await prisma.bank.findFirst({
    where: {
      isActive: true,
      cashbookEntries: {
        some: { status: "POSTED", isReconciled: false },
      },
    },
    select: { id: true, name: true, accountNumber: true },
  });

  if (!bank) {
    const anyBank = await prisma.bank.findFirst({
      where: { isActive: true },
      select: { id: true, name: true, accountNumber: true },
    });
    if (!anyBank) fail("prisma", "No active banks in database.");
    if (!AUTO_SEED) {
      fail(
        "prisma",
        "No bank with unreconciled POSTED entries. Set AUTO_SEED_UNRECONCILED=true or seed manually."
      );
    }
    const seedBank = anyBank;
    console.log("\nNo unreconciled POSTED lines; seeding 5 demo lines for bank:", seedBank.id, seedBank.name);
    const seed = await req("POST", "/api/cashbook/reconciliation/seed-five-unreconciled", {
      token,
      body: { bankId: seedBank.id },
    });
    if (seed.status !== 200) {
      fail("seed-five-unreconciled", `${seed.status} ${JSON.stringify(seed.json).slice(0, 600)}`);
    }
    console.log("OK seed:", seed.json?.message || seed.json);
    bank = seedBank;
  }

  const entryRows = await prisma.cashbookEntry.findMany({
    where: {
      bankId: bank!.id,
      status: "POSTED",
      isReconciled: false,
    },
    select: {
      id: true,
      type: true,
      amount: true,
      transactionDate: true,
      reference: true,
      description: true,
    },
    orderBy: { transactionDate: "asc" },
    take: 8,
  });

  if (entryRows.length === 0) {
    fail("entries", "Still no unreconciled POSTED entries after seed; check GL accounts / seed errors.");
  }

  const selected = entryRows.slice(0, Math.min(5, entryRows.length));
  const selectedIds = selected.map((e) => e.id);
  const maxDate = new Date(
    Math.max(...selected.map((e) => new Date(e.transactionDate).getTime()))
  );
  const asOf = ymd(maxDate);
  const statementDate = maxDate;
  const OPENING = 0;
  const statementEndBalance = reconciledBalance(OPENING, selected);

  console.log("\n=== Resolved test data (copy for Postman) ===");
  console.log(JSON.stringify({ bankId: bank!.id, bankName: bank!.name, accountNumber: bank!.accountNumber }, null, 2));
  console.log(
    JSON.stringify(
      {
        selectedCashbookEntryIds: selectedIds,
        entriesPreview: selected.map((e) => ({
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
  console.log(
    JSON.stringify(
      {
        asOf,
        openingBalance: OPENING,
        statementEndBalance,
        note: "statementEndBalance = opening + sum(RECEIPT) - sum(PAYMENT) for selected lines",
      },
      null,
      2
    )
  );

  // 1) GET entries
  console.log("\n--- 1) GET /api/cashbook/reconciliation/banks/:bankId/entries?asOf=... ---");
  const q1 = `/api/cashbook/reconciliation/banks/${bank!.id}/entries?asOf=${encodeURIComponent(asOf)}`;
  console.log("URL:", q1);
  const g1 = await req("GET", q1, { token });
  if (g1.status !== 200 || !Array.isArray(g1.json?.data)) {
    fail("GET entries", `${g1.status} ${g1.text.slice(0, 500)}`);
  }
  console.log("OK count (unreconciled default):", g1.json.data.length);

  const q1b = `/api/cashbook/reconciliation/banks/${bank!.id}/entries?asOf=${encodeURIComponent(asOf)}&includeReconciled=true`;
  const g1b = await req("GET", q1b, { token });
  if (g1b.status !== 200 || !Array.isArray(g1b.json?.data)) {
    fail("GET entries includeReconciled", `${g1b.status}`);
  }
  console.log("OK count (includeReconciled=true):", g1b.json.data.length);

  // 2) GET sessions (before create)
  console.log("\n--- 2) GET /api/cashbook/reconciliation/banks/:bankId/sessions ---");
  const g2 = await req("GET", `/api/cashbook/reconciliation/banks/${bank!.id}/sessions`, { token });
  if (g2.status !== 200 || !Array.isArray(g2.json?.data)) {
    fail("GET sessions", `${g2.status} ${g2.text.slice(0, 400)}`);
  }
  console.log("OK sessions count:", g2.json.data.length);
  if (g2.json.data.length > 0) {
    const last = g2.json.data[g2.json.data.length - 1];
    console.log("OK last row has openingBalance key:", "openingBalance" in last, "value:", last.openingBalance);
  }

  // 3) POST create draft
  console.log("\n--- 3) POST /api/cashbook/reconciliation/banks/:bankId/sessions ---");
  const createBody = {
    statementDate: statementDate.toISOString(),
    statementEndBalance,
    reference: `HTTP recon test ${Date.now()}`,
    openingBalance: OPENING,
    selectedEntryIds: selectedIds,
  };
  console.log("Body:", JSON.stringify(createBody, null, 2));
  const p3 = await req("POST", `/api/cashbook/reconciliation/banks/${bank!.id}/sessions`, {
    token,
    body: createBody,
  });
  if (p3.status !== 201 && p3.status !== 200) {
    fail("POST create draft", `${p3.status} ${JSON.stringify(p3.json).slice(0, 800)}`);
  }
  const sessionId = p3.json?.data?.id;
  if (!sessionId) fail("POST create draft", "missing data.id");
  console.log("OK session id:", sessionId);

  // 4) GET session by id
  console.log("\n--- 4) GET /api/cashbook/reconciliation/sessions/:sessionId ---");
  const g4 = await req("GET", `/api/cashbook/reconciliation/sessions/${sessionId}`, { token });
  if (g4.status !== 200 || !g4.json?.data?.id) {
    fail("GET session", `${g4.status} ${JSON.stringify(g4.json).slice(0, 500)}`);
  }
  console.log(
    "OK lines:",
    g4.json.data.lines?.length,
    "priorClosingBalanceFromLastFinalized:",
    g4.json.data.priorClosingBalanceFromLastFinalized
  );

  // 5) PATCH draft (reference + same line selection)
  console.log("\n--- 5) PATCH /api/cashbook/reconciliation/sessions/:sessionId ---");
  const linesPayload = selectedIds.map((id) => ({ cashbookEntryId: id, selected: true }));
  const patchBody = {
    reference: `${createBody.reference} (patched)`,
    lines: linesPayload,
  };
  console.log("Body (abbrev):", JSON.stringify({ ...patchBody, lines: `[${linesPayload.length} lines]` }));
  const p5 = await req("PATCH", `/api/cashbook/reconciliation/sessions/${sessionId}`, {
    token,
    body: patchBody,
  });
  if (p5.status !== 200) {
    fail("PATCH session", `${p5.status} ${JSON.stringify(p5.json).slice(0, 600)}`);
  }
  console.log("OK patched reference:", p5.json?.data?.reference);

  // 6) POST finish
  console.log("\n--- 6) POST /api/cashbook/reconciliation/sessions/:sessionId/finish ---");
  const p6 = await req("POST", `/api/cashbook/reconciliation/sessions/${sessionId}/finish`, { token });
  if (p6.status !== 200) {
    fail("POST finish", `${p6.status} ${JSON.stringify(p6.json).slice(0, 800)}`);
  }
  console.log("OK status:", p6.json?.data?.status, "closingBalance:", p6.json?.data?.closingBalance);

  // 7) POST discard (separate empty draft)
  console.log("\n--- 7) POST /api/cashbook/reconciliation/sessions/:sessionId/discard ---");
  const discardDraftBody = {
    statementDate: new Date().toISOString(),
    statementEndBalance: 0,
    reference: `discard-only ${Date.now()}`,
    openingBalance: 0,
    selectedEntryIds: [],
  };
  const p7a = await req("POST", `/api/cashbook/reconciliation/banks/${bank!.id}/sessions`, {
    token,
    body: discardDraftBody,
  });
  if (p7a.status !== 201 && p7a.status !== 200) {
    fail("POST draft for discard", `${p7a.status} ${JSON.stringify(p7a.json).slice(0, 500)}`);
  }
  const discardId = p7a.json?.data?.id;
  const p7 = await req("POST", `/api/cashbook/reconciliation/sessions/${discardId}/discard`, { token });
  if (p7.status !== 200) {
    fail("POST discard", `${p7.status} ${JSON.stringify(p7.json).slice(0, 500)}`);
  }
  console.log("OK discarded:", p7.json?.data);

  // 8) GET sessions again (finalized visible, cancelled excluded)
  console.log("\n--- 8) GET sessions list again ---");
  const g8 = await req("GET", `/api/cashbook/reconciliation/banks/${bank!.id}/sessions`, { token });
  if (g8.status !== 200 || !Array.isArray(g8.json?.data)) fail("GET sessions 2", `${g8.status}`);
  const finalized = g8.json.data.filter((s: any) => s.status === "FINALIZED");
  console.log("OK total:", g8.json.data.length, "FINALIZED:", finalized.length);

  console.log("\n=== All bank reconciliation session endpoint checks passed. ===\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
