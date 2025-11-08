import { prisma } from '../src/utils/database';

async function main() {
  const note = process.argv[2];
  if (!note) {
    console.error('Usage: npx ts-node scripts/delete-valuation-by-notes.ts <noteContains>');
    process.exit(1);
  }

  const deleted = await prisma.$executeRawUnsafe(
    `DELETE FROM portfolio_company_valuations WHERE notes = ?`,
    note
  );

  console.log(`Deleted rows: ${deleted}`);
}

main()
  .catch(error => {
    console.error('❌ Failed to delete valuations', error);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
