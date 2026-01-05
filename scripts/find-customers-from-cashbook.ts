import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function findCustomersFromCashbook() {
  try {
    console.log('🔍 Checking cashbook entries for customer references...\n');
    
    // Check cashbook entries with customers
    const entriesWithCustomers = await prisma.cashbookEntry.findMany({
      where: { 
        customerId: { not: null },
        counterpartyType: 'CUSTOMER'
      },
      include: { 
        customer: { 
          select: { 
            id: true,
            name: true,
            isActive: true 
          } 
        } 
      },
      take: 20
    });
    
    console.log(`📊 Cashbook entries with customers: ${entriesWithCustomers.length}\n`);
    
    if (entriesWithCustomers.length > 0) {
      const uniqueCustomers = new Map();
      entriesWithCustomers.forEach(e => {
        if (e.customer) {
          uniqueCustomers.set(e.customer.id, e.customer);
        }
      });
      
      console.log(`✅ Found ${uniqueCustomers.size} unique customers referenced in cashbook:\n`);
      Array.from(uniqueCustomers.values()).forEach((customer, idx) => {
        console.log(`  ${idx + 1}. ${customer.name} (ID: ${customer.id}, Active: ${customer.isActive})`);
      });
    } else {
      console.log('❌ No cashbook entries found with customer references');
    }
    
    // Also check all customers one more time with raw query
    const allCustomersRaw = await prisma.$queryRaw`
      SELECT id, name, "isActive" FROM customers LIMIT 20
    `;
    console.log(`\n📊 Raw query - customers in database: ${Array.isArray(allCustomersRaw) ? allCustomersRaw.length : 0}`);
    if (Array.isArray(allCustomersRaw) && allCustomersRaw.length > 0) {
      allCustomersRaw.forEach((c: any) => {
        console.log(`  - ${c.name} (Active: ${c.isActive})`);
      });
    }
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

findCustomersFromCashbook();

