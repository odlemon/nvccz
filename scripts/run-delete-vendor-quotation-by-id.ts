/**
 * Delete a single vendor_quotations row (cascade removes line items).
 *
 *   npx ts-node scripts/run-delete-vendor-quotation-by-id.ts <quotationId>
 *   QUOTATION_ID=... npx ts-node scripts/run-delete-vendor-quotation-by-id.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const id =
    process.argv[2]?.trim() ||
    process.env.QUOTATION_ID?.trim() ||
    "";
  if (!id) {
    throw new Error("Pass quotation id as argv or set QUOTATION_ID.");
  }
  const q = await prisma.vendorQuotation.findUnique({
    where: { id },
    select: { id: true, quotationNumber: true, status: true },
  });
  if (!q) {
    console.log(`[skip] No vendor_quotation with id ${id}`);
    return;
  }
  await prisma.vendorQuotation.delete({ where: { id } });
  console.log(`[ok] Deleted quotation ${q.quotationNumber} (${id}) status=${q.status}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
