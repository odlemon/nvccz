const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    await prisma.purchaseRequisition.update({
      where: { id: 'cmig0b7ui0001la04ubop13gm' },
      data: {
        status: 'DRAFT',
        approvedById: null,
        approvedAt: null
      }
    });
    console.log('Requisition status reset to DRAFT');
  } catch (error) {
    console.error('Failed to reset requisition status:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();

