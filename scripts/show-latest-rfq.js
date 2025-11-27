const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    const entry = await prisma.auditLog.findFirst({
      where: { entityType: 'RFQ' },
      orderBy: { createdAt: 'desc' }
    });

    if (!entry) {
      console.log('No RFQ audit log found.');
      return;
    }

    console.log('Latest RFQ:', entry.entityId);
    console.log('Logged at:', entry.createdAt);
    console.log('New values snapshot:', entry.newValues);
  } catch (error) {
    console.error('Failed to read RFQ logs:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();

