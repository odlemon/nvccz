// @ts-nocheck
/**
 * Ensures each Bank has its own GL account (Chart of Accounts) instead of sharing one "Cash & Cash Equivalents" account.
 *
 * Safety:
 * - Requires env `ALLOW_BANK_GL_REPAIR=1`
 *
 * Notes:
 * - This does NOT rewrite historical journals. It only fixes the `banks.glAccountId` pointer for future postings.
 * - Idempotent: re-running will not create duplicate accounts for already-unique banks.
 *
 * Run:
 *   ALLOW_BANK_GL_REPAIR=1 npx ts-node scripts/ensure-banks-have-unique-gl-accounts.ts
 *   ALLOW_BANK_GL_REPAIR=1 npm run db:ensure:bank-gl-unique
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function requireFlag(name: string) {
  const v = (process.env[name] ?? "").trim();
  if (v !== "1") {
    throw new Error(`Refusing to run: set ${name}=1 to proceed.`);
  }
}

function normalizeName(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

async function nextBankAccountNo(startFrom: number): Promise<number> {
  const rows = await prisma.chartOfAccounts.findMany({
    where: { accountNo: { startsWith: "11" } },
    select: { accountNo: true },
  });
  const used = new Set<number>();
  for (const r of rows) {
    const n = parseInt(String(r.accountNo), 10);
    if (Number.isFinite(n)) used.add(n);
  }
  let n = startFrom;
  while (used.has(n)) n += 1;
  return n;
}

async function main() {
  requireFlag("ALLOW_BANK_GL_REPAIR");

  const cace = await prisma.chartOfAccounts.findUnique({
    where: { accountNo: "1000" },
    select: { id: true, accountNo: true, accountName: true },
  });

  const banks = await prisma.bank.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      accountNumber: true,
      currencyId: true,
      glAccountId: true,
      createdAt: true,
    },
  });

  if (banks.length === 0) {
    console.log("No banks found. Nothing to do.");
    return;
  }

  const byGl = new Map<string, Array<(typeof banks)[number]>>();
  const noGl: Array<(typeof banks)[number]> = [];
  for (const b of banks) {
    if (!b.glAccountId) noGl.push(b);
    else {
      if (!byGl.has(b.glAccountId)) byGl.set(b.glAccountId, []);
      byGl.get(b.glAccountId)!.push(b);
    }
  }

  const shared = [...byGl.entries()].filter(([, arr]) => arr.length > 1);
  console.log(`Banks total: ${banks.length}`);
  console.log(`Banks missing glAccountId: ${noGl.length}`);
  console.log(`Shared glAccountId groups: ${shared.length}`);

  let created = 0;
  let updated = 0;
  let nextNo = await nextBankAccountNo(1110);

  // If any bank still points to CoA 1000 (Cash & Cash Equivalents bucket), force a dedicated GL account.
  if (cace?.id) {
    const caceBanks = banks.filter((b) => b.glAccountId === cace.id);
    if (caceBanks.length > 0) {
      console.log(`\nBanks linked to CoA 1000 (${cace.accountName}) must be re-linked to unique GL accounts: ${caceBanks.length}`);
      for (const b of caceBanks) {
        const acctNo = String(nextNo);
        nextNo += 1;
        const accountName = `Bank - ${normalizeName(b.name)}`;
        const coa = await prisma.chartOfAccounts.create({
          data: {
            accountNo: acctNo,
            accountName,
            accountType: "Current Asset",
            naturalBalance: "DEBIT",
            financialStatement: "Balance Sheet",
            isActive: true,
            notes: `Auto-created bank GL account (replacing 1000) for bankId=${b.id}, accountNumber=${b.accountNumber}`,
          },
          select: { id: true, accountNo: true, accountName: true },
        });
        await prisma.bank.update({
          where: { id: b.id },
          data: { glAccountId: coa.id },
        });
        created += 1;
        updated += 1;
        console.log(`  updated ${b.name} -> GL ${coa.accountNo} ${coa.accountName}`);
      }
    }
  }

  // For each shared group, keep the first bank as-is; give every other bank a new unique GL.
  for (const [, group] of shared) {
    const keep = group[0];
    const toFix = group.slice(1);
    console.log(`\nShared GL detected. Keeping first bank as-is: ${keep.name} (${keep.id})`);

    for (const b of toFix) {
      const acctNo = String(nextNo);
      nextNo += 1;

      const accountName = `Bank - ${normalizeName(b.name)}`;
      const coa = await prisma.chartOfAccounts.create({
        data: {
          accountNo: acctNo,
          accountName,
          accountType: "Current Asset",
          naturalBalance: "DEBIT",
          financialStatement: "Balance Sheet",
          isActive: true,
          notes: `Auto-created bank GL account for bankId=${b.id}, accountNumber=${b.accountNumber}`,
        },
        select: { id: true, accountNo: true, accountName: true },
      });

      await prisma.bank.update({
        where: { id: b.id },
        data: { glAccountId: coa.id },
      });

      created += 1;
      updated += 1;
      console.log(`  updated ${b.name} -> GL ${coa.accountNo} ${coa.accountName}`);
    }
  }

  // For banks with null glAccountId, always create one.
  if (noGl.length > 0) {
    console.log("\nBanks with no GL account linked:");
    for (const b of noGl) {
      const acctNo = String(nextNo);
      nextNo += 1;
      const accountName = `Bank - ${normalizeName(b.name)}`;
      const coa = await prisma.chartOfAccounts.create({
        data: {
          accountNo: acctNo,
          accountName,
          accountType: "Current Asset",
          naturalBalance: "DEBIT",
          financialStatement: "Balance Sheet",
          isActive: true,
          notes: `Auto-created bank GL account for bankId=${b.id}, accountNumber=${b.accountNumber}`,
        },
        select: { id: true, accountNo: true, accountName: true },
      });
      await prisma.bank.update({
        where: { id: b.id },
        data: { glAccountId: coa.id },
      });
      created += 1;
      updated += 1;
      console.log(`  updated ${b.name} -> GL ${coa.accountNo} ${coa.accountName}`);
    }
  }

  console.log("\nSummary:");
  console.log(`  GL accounts created: ${created}`);
  console.log(`  Banks updated: ${updated}`);
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

