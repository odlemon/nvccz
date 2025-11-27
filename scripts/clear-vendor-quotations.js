const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

(async () => {
  try {
    const resetPOs = await prisma.purchaseOrder.updateMany({
      where: { quotationId: { not: null } },
      data: { quotationId: null }
    });
    if (resetPOs.count > 0) {
      console.log(`Cleared ${resetPOs.count} purchase order(s) referencing vendor quotations.`);
    }

    const deleted = await prisma.vendorQuotation.deleteMany();
    console.log(`Deleted ${deleted.count} vendor quotation(s).`);
  } catch (error) {
    console.error('Failed to delete vendor quotations:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();

