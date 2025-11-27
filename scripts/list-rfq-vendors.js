const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

(async () => {
  try {
    const vendors = await prisma.vendor.findMany({
      where: {
        email: {
          in: ['logixvine@gmail.com', 'veximagames@gmail.com']
        }
      }
    });

    if (vendors.length === 0) {
      console.log('No matching vendors found.');
      return;
    }

    vendors.forEach(vendor => {
      console.log(`${vendor.id}: ${vendor.name} <${vendor.email}>`);
    });
  } catch (error) {
    console.error('Failed to list RFQ vendors:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();

