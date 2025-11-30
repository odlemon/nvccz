import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function findVendor() {
  try {
    console.log('\n🔍 Finding vendors...\n');

    // Get first active vendor
    const vendor = await prisma.vendor.findFirst({
      where: {
        isActive: true
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        contactPerson: true
      }
    });

    if (!vendor) {
      console.log('❌ No active vendors found in the database.\n');
      console.log('💡 You need to create a vendor first.\n');
      return;
    }

    console.log('✅ Found vendor:\n');
    console.log(`   ID: ${vendor.id}`);
    console.log(`   Name: ${vendor.name}`);
    console.log(`   Contact Person: ${vendor.contactPerson || 'N/A'}`);
    console.log(`   Email: ${vendor.email || 'N/A'}`);
    console.log(`   Phone: ${vendor.phone || 'N/A'}`);
    console.log(`\n📋 Use this vendorId in your expense request:\n`);
    console.log(`   "vendorId": "${vendor.id}"\n`);

    // Also list all active vendors
    const allVendors = await prisma.vendor.findMany({
      where: {
        isActive: true
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true
      },
      take: 10,
      orderBy: {
        name: 'asc'
      }
    });

    if (allVendors.length > 1) {
      console.log(`\n📋 All active vendors (${allVendors.length}):\n`);
      allVendors.forEach((v, index) => {
        console.log(`   ${index + 1}. ${v.name}`);
        console.log(`      ID: ${v.id}`);
        if (v.email) console.log(`      Email: ${v.email}`);
        console.log(``);
      });
    }

  } catch (error: any) {
    console.error('❌ Error finding vendor:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

findVendor();

