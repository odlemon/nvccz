const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const targetEmail = 'finance.manager@testnvccz.com';

(async () => {
  try {
    const user = await prisma.user.findUnique({
      where: { email: targetEmail },
      select: { id: true, firstName: true, lastName: true }
    });

    if (!user) {
      console.log(`No user found with email ${targetEmail}`);
      return;
    }

    const requisitions = await prisma.purchaseRequisition.findMany({
      where: { requestedById: user.id },
      include: {
        items: true
      },
      orderBy: { createdAt: 'desc' }
    });

    if (requisitions.length === 0) {
      console.log(`No requisitions found for ${targetEmail}`);
      return;
    }

    requisitions.forEach(req => {
      console.log(`Requisition ID: ${req.id}`);
      console.log(`  Number: ${req.requisitionNumber}`);
      console.log(`  Status: ${req.status}`);
      console.log(`  Items: ${req.items.length}`);
      console.log('---');
    });
  } catch (error) {
    console.error('Failed to list requisitions:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();

