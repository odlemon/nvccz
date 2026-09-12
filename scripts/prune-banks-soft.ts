#!/usr/bin/env ts-node
/**
 * Soft-deactivates banks so only two remain active.
 * Always deactivates the bank linked to FORBIDDEN_GL_ACCOUNT_ID (historical rows stay valid via FK).
 *
 * Usage: npx ts-node scripts/prune-banks-soft.ts
 */

import { PrismaClient } from "@prisma/client";

const FORBIDDEN_GL_ACCOUNT_ID = "cmh3c1fdt0001unxkqzzihy55";
const KEEP_ACTIVE_COUNT = 2;

const prisma = new PrismaClient();

async function main() {
  const all = await prisma.bank.findMany({
    orderBy: { createdAt: "asc" },
    include: { currency: true, glAccount: { select: { id: true, accountNo: true, accountName: true } } },
  });

  console.log(`Found ${all.length} bank row(s).`);

  const forbidden = all.filter((b) => b.glAccountId === FORBIDDEN_GL_ACCOUNT_ID);
  for (const b of forbidden) {
    console.log(
      `Bank to remove from active use (matches forbidden GL): ${b.id} — ${b.name} — GL ${b.glAccountId}`,
    );
  }

  const eligible = all.filter((b) => b.glAccountId !== FORBIDDEN_GL_ACCOUNT_ID);
  const keepIds = new Set(eligible.slice(0, KEEP_ACTIVE_COUNT).map((b) => b.id));

  if (eligible.length < KEEP_ACTIVE_COUNT) {
    console.warn(
      `⚠ Only ${eligible.length} bank(s) are eligible (not using forbidden GL). Fewer than ${KEEP_ACTIVE_COUNT} will stay active.`,
    );
  }

  const toDeactivate = all.filter((b) => !keepIds.has(b.id));

  console.log("Banks that will stay ACTIVE:");
  for (const b of all.filter((b) => keepIds.has(b.id))) {
    console.log(`  ✓ ${b.id} | ${b.name} | ${b.accountNumber} | GL ${b.glAccountId ?? "null"}`);
  }

  console.log(`Banks to set isActive=false (${toDeactivate.length}):`);
  for (const b of toDeactivate) {
    console.log(`  ✗ ${b.id} | ${b.name} | GL ${b.glAccountId ?? "null"}`);
  }

  const result = await prisma.bank.updateMany({
    where: { id: { in: toDeactivate.map((b) => b.id) } },
    data: { isActive: false },
  });

  console.log(`\nDone. Updated ${result.count} bank row(s) to inactive.`);

  const activeNow = await prisma.bank.findMany({ where: { isActive: true } });
  console.log(`Active banks now: ${activeNow.length}`);
  for (const b of activeNow) {
    console.log(`  • ${b.id} | ${b.name}`);
  }

  const forbiddenStillActive = activeNow.find((b) => b.glAccountId === FORBIDDEN_GL_ACCOUNT_ID);
  if (forbiddenStillActive) {
    console.error("ERROR: Forbidden GL bank is still active — abort logic bug.");
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
