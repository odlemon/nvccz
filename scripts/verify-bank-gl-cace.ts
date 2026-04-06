/**
 * Read-only: bank rows vs resolved Cash and Cash Equivalents.
 *
 * Run: npx ts-node scripts/verify-bank-gl-cace.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { resolveCashAndCashEquivalentsCoa } from '../src/config/cashAndCashEquivalents';

const prisma = new PrismaClient();

async function main() {
  const target = await resolveCashAndCashEquivalentsCoa(prisma);
  console.log('Resolved Cash and Cash Equivalents:', {
    id: target.id,
    accountNo: target.accountNo,
    accountName: target.accountName,
  });

  const wrong = await prisma.bank.findMany({
    where: { OR: [{ glAccountId: null }, { glAccountId: { not: target.id } }] },
    include: { glAccount: { select: { accountNo: true, accountName: true } } },
  });

  console.log('\nBanks not on CACE (null or different CoA):', wrong.length);
  wrong.slice(0, 30).forEach((b) =>
    console.log(
      `  - ${b.name} | ${b.accountNumber} | gl=${b.glAccount?.accountNo ?? 'null'} ${b.glAccount?.accountName ?? ''}`
    )
  );
  if (wrong.length > 30) console.log(`  ... and ${wrong.length - 30} more`);

  const distinctBankGls = await prisma.bank.findMany({
    where: { glAccountId: { not: null } },
    select: { glAccountId: true },
    distinct: ['glAccountId'],
  });
  console.log('\nDistinct non-null bank.glAccountId count:', distinctBankGls.length);
  if (distinctBankGls.length === 1 && distinctBankGls[0].glAccountId === target.id) {
    console.log('OK: all linked banks share the single CACE id.');
  }

  console.log('\nDone (read-only verify).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
