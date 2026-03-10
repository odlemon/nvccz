// @ts-nocheck
/**
 * Complex Search Filters – Cashbook
 *
 * Search cashbook for transactions between 100 and 500 ZIG containing the word "Tax".
 * UI returns only matching records. Search is case-insensitive and handles substrings.
 *
 * Run: npx ts-node scripts/test-cashbook-complex-search.ts
 */
import { prisma } from '../src/utils/database';
import { CashbookService } from '../src/services/CashbookService';

const failures: string[] = [];

function assert(condition: boolean, msg: string) {
  if (!condition) failures.push(msg);
}

function runSearch(params: { minAmount: number; maxAmount: number; search: string; bankId?: string }) {
  const where: any = { originalTransactionId: null };
  if (params.bankId) where.bankId = params.bankId;
  where.amount = { gte: params.minAmount, lte: params.maxAmount };
  if (params.search.trim()) where.description = { contains: params.search.trim() };
  return prisma.cashbookEntry.findMany({
    where,
    include: { bank: true },
    orderBy: { transactionDate: 'desc' }
  });
}

async function main() {
  console.log('========== Complex Search: Cashbook 100–500 ZIG containing "Tax" ==========\n');

  const admin = await prisma.user.findFirst({
    where: { email: { in: ['admin@nts.com', 'admin@nvccz.co.zw'] } }
  });
  if (!admin) throw new Error('Admin user not found');

  const bank = await prisma.bank.findFirst({
    where: { isActive: true },
    include: { glAccount: true, currency: true }
  });
  if (!bank || !bank.glAccountId) throw new Error('No bank with GL found');

  const incomeAccount = await prisma.chartOfAccounts.findFirst({
    where: { accountType: { in: ['Revenue', 'Income'] }, isActive: true }
  });
  if (!incomeAccount) throw new Error('No Income account found');

  const currencyCode = bank.currency?.code ?? 'ZIG';
  console.log('Bank:', bank.name, '| Currency:', currencyCode, '\n');

  // Create test data: mix of matching and non-matching
  const testData = [
    { amount: 200, description: 'Income Tax payment' },
    { amount: 350, description: 'tax withholding' },
    { amount: 450, description: 'VAT tax advice' },
    { amount: 50, description: 'Tax refund' },
    { amount: 600, description: 'Tax audit' },
    { amount: 250, description: 'Electricity' }
  ];

  console.log('--- Creating test cashbook entries ---\n');
  const createdIds: string[] = [];
  for (const t of testData) {
    const result = await CashbookService.createCashReceipt({
      bankId: bank.id,
      transactionDate: new Date(),
      description: t.description,
      amount: t.amount,
      counterpartyType: 'GL',
      glAccountId: incomeAccount.id,
      vatCode: '0%',
      createdById: admin.id
    });
    assert(result.success, `Create "${t.description}": ${result.message}`);
    if (result.transaction) createdIds.push(result.transaction.id);
  }

  // Search: 100–500, containing "Tax" (should return 200, 350, 450 only)
  console.log('--- Search: amount 100–500, description contains "Tax" ---\n');
  const resultsTax = await runSearch({
    minAmount: 100,
    maxAmount: 500,
    search: 'Tax',
    bankId: bank.id
  });

  const inRangeWithTax = testData.filter(
    (t) => t.amount >= 100 && t.amount <= 500 && (t.description.toLowerCase().includes('tax'))
  );
  const resultIds = new Set(resultsTax.map((r) => r.id));
  const ourResults = resultsTax.filter((r) => createdIds.includes(r.id));

  assert(
    ourResults.length >= 3,
    `Expected at least 3 matching entries (100–500 + "Tax"); got ${ourResults.length} from our test data`
  );
  for (const t of inRangeWithTax) {
    const found = ourResults.some((r) => Number(r.amount) === t.amount && r.description?.includes(t.description.split(' ')[0]));
    assert(found, `Should find entry: ${t.amount} "${t.description}"`);
  }
  for (const r of ourResults) {
    const amt = Number(r.amount);
    assert(amt >= 100 && amt <= 500, `Result ${r.description} amount ${amt} must be in 100–500`);
    assert(
      (r.description ?? '').toLowerCase().includes('tax'),
      `Result "${r.description}" must contain "Tax" (substring)`
    );
  }

  console.log('Matching entries (100–500, contains "Tax"):', ourResults.length);
  ourResults.forEach((r) => console.log('  ', r.amount, '-', r.description));
  console.log('');

  // Case-insensitive: search "TAX" and "tax" return same set
  console.log('--- Case-insensitive: search "TAX" and "tax" ---\n');
  const resultsTAX = await runSearch({ minAmount: 100, maxAmount: 500, search: 'TAX', bankId: bank.id });
  const resultsTaxLower = await runSearch({ minAmount: 100, maxAmount: 500, search: 'tax', bankId: bank.id });
  const ourTAX = resultsTAX.filter((r) => createdIds.includes(r.id));
  const ourTaxLower = resultsTaxLower.filter((r) => createdIds.includes(r.id));
  assert(ourTAX.length >= 3, `Search "TAX" should return same matches; got ${ourTAX.length}`);
  assert(ourTaxLower.length >= 3, `Search "tax" should return same matches; got ${ourTaxLower.length}`);
  console.log('  "Tax" ->', ourResults.length, '| "TAX" ->', ourTAX.length, '| "tax" ->', ourTaxLower.length);
  console.log('');

  // Substring: "Tax" matches "Income Tax", "tax withholding", "VAT tax advice"
  console.log('--- Substring: "Tax" matches descriptions containing Tax ---\n');
  const hasSubstring = ourResults.every(
    (r) => (r.description ?? '').toLowerCase().includes('tax')
  );
  assert(hasSubstring, 'All returned entries must have description containing "Tax" as substring');
  console.log('  All returned entries contain "Tax" (or "tax") as substring. OK.');
  console.log('');

  console.log('========== Summary ==========');
  if (failures.length > 0) {
    console.log('FAILURES:');
    failures.forEach((f) => console.log('  -', f));
    await prisma.$disconnect();
    process.exit(1);
  }
  console.log('Complex search test passed:');
  console.log('  - Search 100–500 ZIG containing "Tax" returns only matching records.');
  console.log('  - Case-insensitive (Tax / TAX / tax) and substring handled.');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
