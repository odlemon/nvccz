/**
 * Prints Postman-ready base URL + bodies using real DB IDs (no placeholders).
 * Run: npx ts-node --transpile-only scripts/print-postman-real-bodies.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function baseUrl(): string {
  const port = process.env.PORT || "3000";
  const host = process.env.NVCCZ_POSTMAN_HOST || "http://localhost";
  return `${host}:${port}`;
}

async function main() {
  const root = baseUrl();
  const out: Record<string, unknown> = {
    baseUrl: root,
    note: "Use Authorization: Bearer {{token}} after login for protected routes.",
  };

  out.login = {
    method: "POST",
    url: `${root}/api/auth/login`,
    headers: { "Content-Type": "application/json" },
    body: {
      email: process.env.NVCCZ_UAT_EMAIL || "admin@nts.com",
      password: process.env.NVCCZ_UAT_PASSWORD || "admin123",
    },
  };

  const batchWhere = {
    status: "POSTED" as const,
    paymentMethod: "CREDIT" as const,
    paymentStatus: { not: "PAID" as const },
    cashbookEntryId: null,
    journalEntryId: { not: null },
  };

  const candidates = await prisma.purchaseInvoice.findMany({
    where: batchWhere,
    select: {
      id: true,
      invoiceNumber: true,
      currencyId: true,
      outstandingAmount: true,
    },
    orderBy: { createdAt: "desc" },
    take: 80,
  });

  const withBal = candidates.filter((i) => Number(i.outstandingAmount) > 0.009);
  const byCur = new Map<string, typeof withBal>();
  for (const i of withBal) {
    const arr = byCur.get(i.currencyId) || [];
    arr.push(i);
    byCur.set(i.currencyId, arr);
  }

  let chosen: { currencyId: string; invoices: typeof withBal; bank: { id: string; name: string } } | null =
    null;

  for (const [currencyId, invoices] of byCur) {
    const bank = await prisma.bank.findFirst({
      where: { isActive: true, currencyId, glAccountId: { not: null } },
      select: { id: true, name: true },
    });
    if (bank && invoices.length > 0) {
      chosen = { currencyId, invoices, bank };
      break;
    }
  }

  if (chosen) {
    const slice = chosen.invoices.slice(0, 10);
    out.batchPayVendorBills = {
      method: "POST",
      url: `${root}/api/accounting/purchase-invoices/batch-pay`,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer <paste token from login>",
      },
      body: {
        invoiceIds: slice.map((x) => x.id),
        paymentMethod: "BANK",
        bankId: chosen.bank.id,
        paymentDate: new Date().toISOString(),
        paymentReference: `BATCH-POSTMAN-${Date.now()}`,
        notes: "Postman — real IDs from print-postman-real-bodies.ts",
      },
      meta: {
        invoiceNumbers: slice.map((x) => x.invoiceNumber),
        bankName: chosen.bank.name,
      },
    };
  } else {
    out.batchPayVendorBills = {
      error: "No eligible bills (POSTED CREDIT, outstanding, no cashbookEntryId) + bank in same currency.",
    };
  }

  const single = withBal[0];
  let singleBank: { id: string; name: string } | null = null;
  if (single) {
    singleBank = await prisma.bank.findFirst({
      where: { isActive: true, currencyId: single.currencyId, glAccountId: { not: null } },
      select: { id: true, name: true },
    });
  }

  if (single && singleBank) {
    out.paySingleVendorBill = {
      method: "POST",
      url: `${root}/api/accounting/purchase-invoices/${single.id}/pay`,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer <paste token from login>",
      },
      body: {
        paymentMethod: "BANK",
        bankId: singleBank.id,
        paymentDate: new Date().toISOString(),
        paymentReference: `PAY-SINGLE-${Date.now()}`,
        notes: "Postman single pay",
      },
      meta: { invoiceNumber: single.invoiceNumber, bankName: singleBank.name },
    };
  } else {
    out.paySingleVendorBill = { error: "No single-pay candidate + bank in currency." };
  }

  out.listVendorBills = {
    method: "GET",
    url: `${root}/api/accounting/purchase-invoices?page=1&limit=20&status=POSTED`,
    headers: { Authorization: "Bearer <paste token from login>" },
  };

  out.listBanksForVendorPay = {
    method: "GET",
    url: `${root}/api/accounting/purchase-invoices/banks`,
    headers: { Authorization: "Bearer <paste token from login>" },
  };

  const coaWithLines = await prisma.chartOfAccounts.findFirst({
    where: {
      isActive: true,
      journalEntryLines: { some: {} },
    },
    select: {
      id: true,
      accountNo: true,
      accountName: true,
      accountType: true,
      financialStatement: true,
    },
  });

  const coaNoLines = await prisma.chartOfAccounts.findFirst({
    where: {
      isActive: true,
      journalEntryLines: { none: {} },
    },
    select: {
      id: true,
      accountNo: true,
      accountName: true,
      accountType: true,
      financialStatement: true,
    },
  });

  if (coaWithLines) {
    const flipType =
      coaWithLines.accountType === "Income" || coaWithLines.accountType === "Revenue"
        ? "Current Asset"
        : "Income";
    out.chartOfAccounts_typeChangeShould409 = {
      method: "PUT",
      url: `${root}/api/accounting/chart-of-accounts/${coaWithLines.id}`,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer <admin token>",
      },
      body: {
        accountType: flipType,
      },
      meta: {
        expect: "409 if journal lines exist on this account",
        accountNo: coaWithLines.accountNo,
        currentType: coaWithLines.accountType,
      },
    };
  }

  if (coaNoLines) {
    const other =
      coaNoLines.accountType === "Expense"
        ? "Income"
        : coaNoLines.accountType === "Income" || coaNoLines.accountType === "Revenue"
          ? "Expense"
          : "Income";
    out.chartOfAccounts_typeChangeMaySucceedIfNumberMatches = {
      method: "PUT",
      url: `${root}/api/accounting/chart-of-accounts/${coaNoLines.id}`,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer <admin token>",
      },
      body: {
        accountType: other,
      },
      meta: {
        note: "May 400 if account number range conflicts with new type; use unused account.",
        accountNo: coaNoLines.accountNo,
        currentType: coaNoLines.accountType,
      },
    };
  }

  console.log(JSON.stringify(out, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
