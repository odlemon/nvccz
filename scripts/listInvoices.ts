import { prisma } from '../src/utils/database';

async function listInvoices() {
  const invoices = await prisma.invoice.findMany({
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      amount: true,
      vatAmount: true,
      totalAmount: true,
      outstandingAmount: true,
      createdAt: true
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  console.log(JSON.stringify(invoices, null, 2));
}

listInvoices()
  .catch((error) => {
    console.error('Failed to list invoices', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

