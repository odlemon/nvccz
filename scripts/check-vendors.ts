import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkVendors() {
  try {
    console.log('🔍 Checking available vendors...\n');
    
    const vendors = await prisma.vendor.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true
      }
    });

    if (vendors.length === 0) {
      console.log('❌ No vendors found in database');
      console.log('💡 You may need to create vendors first');
    } else {
      console.log('✅ Available Vendors:');
      vendors.forEach((vendor, index) => {
        console.log(`${index + 1}. ID: ${vendor.id}`);
        console.log(`   Name: ${vendor.name}`);
        console.log(`   Email: ${vendor.email}`);
        console.log(`   Active: ${vendor.isActive}`);
        console.log('');
      });
    }

    // Also check customers for reference
    console.log('🔍 Checking available customers...\n');
    const customers = await prisma.customer.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true
      }
    });

    if (customers.length > 0) {
      console.log('✅ Available Customers:');
      customers.slice(0, 3).forEach((customer, index) => {
        console.log(`${index + 1}. ID: ${customer.id}`);
        console.log(`   Name: ${customer.name}`);
        console.log(`   Email: ${customer.email}`);
        console.log(`   Active: ${customer.isActive}`);
        console.log('');
      });
    }

  } catch (error) {
    console.error('❌ Error checking vendors:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkVendors();

