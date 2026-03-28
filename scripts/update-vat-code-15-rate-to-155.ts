/**
 * One-off: set VAT code "15%" rate to 0.155 (15.5%) to match VATService.
 * Idempotent. Run: npx ts-node scripts/update-vat-code-15-rate-to-155.ts
 */
import { PrismaClient, Decimal } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const row = await prisma.vATCode.findFirst({ where: { code: '15%' } });
  if (!row) {
    console.log('No VAT code "15%" found — run scripts/seed-vat-codes.ts if needed');
    return;
  }
  const next = new Decimal(0.155);
  if (row.rate.equals(next)) {
    console.log('VAT code 15% already at 0.155 — skipping');
    return;
  }
  await prisma.vATCode.update({
    where: { id: row.id },
    data: {
      rate: next,
      description: 'Standard Rate - Zimbabwe (15.5%)',
    },
  });
  console.log('Updated VAT code 15% rate to 0.155 (15.5%)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
