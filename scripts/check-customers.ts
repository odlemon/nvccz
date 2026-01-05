import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkCustomers() {
  try {
    console.log('🔍 Checking ALL customers in database...\n');
    
    // Check ALL customers (not just active)
    const allCustomers = await prisma.customer.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        createdAt: true
      },
      orderBy: { name: 'asc' }
    });
    
    console.log(`📊 Total customers found: ${allCustomers.length}\n`);
    
    if (allCustomers.length === 0) {
      console.log('❌ No customers found in database at all!');
    } else {
      const activeCustomers = allCustomers.filter(c => c.isActive);
      const inactiveCustomers = allCustomers.filter(c => !c.isActive);
      
      console.log(`✅ Active customers: ${activeCustomers.length}`);
      console.log(`⚠️  Inactive customers: ${inactiveCustomers.length}\n`);
      
      if (activeCustomers.length > 0) {
        console.log('📋 Active Customers:');
        activeCustomers.forEach((customer, idx) => {
          console.log(`  ${idx + 1}. ${customer.name} (${customer.email || 'no email'})`);
        });
      }
      
      if (inactiveCustomers.length > 0) {
        console.log('\n📋 Inactive Customers:');
        inactiveCustomers.forEach((customer, idx) => {
          console.log(`  ${idx + 1}. ${customer.name} (${customer.email || 'no email'}) - INACTIVE`);
        });
      }
    }
    
  } catch (error: any) {
    console.error('❌ Error checking customers:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

checkCustomers();

