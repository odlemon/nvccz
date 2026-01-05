import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function findAllCustomers() {
  try {
    console.log('🔍 Searching for customers in ALL possible ways...\n');
    
    // Try 1: All customers (no filter)
    const all1 = await prisma.customer.findMany({
      select: { id: true, name: true, isActive: true }
    });
    console.log(`1. All customers (no filter): ${all1.length}`);
    all1.forEach(c => console.log(`   - ${c.name} (active: ${c.isActive})`));
    
    // Try 2: Check if there's a different table
    const portfolioCompanies = await prisma.portfolioCompany.findMany({
      select: { id: true, name: true },
      take: 5
    });
    console.log(`\n2. Portfolio Companies: ${portfolioCompanies.length}`);
    portfolioCompanies.forEach(c => console.log(`   - ${c.name}`));
    
    const clients = await prisma.client.findMany({
      select: { id: true, name: true },
      take: 5
    });
    console.log(`\n3. Clients: ${clients.length}`);
    clients.forEach(c => console.log(`   - ${c.name}`));
    
    // Try 3: Check cashbook entries to see what customer names were used
    const cashbookEntries = await prisma.cashbookEntry.findMany({
      where: { customerId: { not: null } },
      include: { customer: { select: { name: true } } },
      take: 10
    });
    console.log(`\n4. Cashbook entries with customers: ${cashbookEntries.length}`);
    cashbookEntries.forEach(e => {
      if (e.customer) {
        console.log(`   - ${e.customer.name}`);
      }
    });
    
    // Try 4: Check invoices to see customer references
    const invoices = await prisma.invoice.findMany({
      where: { customerId: { not: null } },
      include: { customer: { select: { name: true } } },
      take: 10
    });
    console.log(`\n5. Invoices with customers: ${invoices.length}`);
    invoices.forEach(i => {
      if (i.customer) {
        console.log(`   - ${i.customer.name}`);
      }
    });
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

findAllCustomers();

