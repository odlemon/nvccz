/**
 * Lists active banks and prints copy-paste API examples for reconciliation seed.
 * Run: node scripts/list-banks-for-recon-seed.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const banks = await prisma.bank.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      accountNumber: true,
    },
    orderBy: { name: 'asc' },
    take: 20,
  });

  if (banks.length === 0) {
    console.log('No active banks found.');
    return;
  }

  console.log('\n=== Active banks (use id in requests) ===\n');
  banks.forEach((b, i) => {
    console.log(`${i + 1}. ${b.name}`);
    console.log(`   id: ${b.id}`);
    if (b.accountNumber) console.log(`   account: ${b.accountNumber}`);
    console.log('');
  });

  const first = banks[0];
  const port = process.env.PORT || '3000';
  const base = `http://localhost:${port}`;

  console.log('=== Ready-to-paste (replace YOUR_TOKEN) ===\n');

  console.log('--- Seed 5 unreconciled lines ---');
  console.log(
    JSON.stringify(
      {
        method: 'POST',
        url: `${base}/api/cashbook/reconciliation/seed-five-unreconciled`,
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer YOUR_TOKEN',
        },
        body: { bankId: first.id },
      },
      null,
      2
    )
  );

  console.log('\n--- Verify unreconciled tab data ---');
  console.log(
    JSON.stringify(
      {
        method: 'GET',
        url: `${base}/api/cashbook/${first.id}/unreconciled`,
        headers: { Authorization: 'Bearer YOUR_TOKEN' },
      },
      null,
      2
    )
  );

  console.log('\n--- One-liner curl (bash-style; fix host if not localhost) ---');
  console.log(
    `curl -s -X POST "${base}/api/cashbook/reconciliation/seed-five-unreconciled" \\\n` +
      `  -H "Authorization: Bearer YOUR_TOKEN" \\\n` +
      `  -H "Content-Type: application/json" \\\n` +
      `  -d '${JSON.stringify({ bankId: first.id })}'`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
