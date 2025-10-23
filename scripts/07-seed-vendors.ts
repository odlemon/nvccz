// @ts-nocheck
/**
 * Step 7: Seed Vendors
 * 
 * This script creates sample vendors for the system.
 * Run this after chart of accounts is created.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedVendors() {
  console.log('🏪 Step 7: Seeding Vendors...');
  console.log('=' .repeat(50));

  try {
    // Check if vendors already exist
    const existingVendors = await prisma.vendor.findMany({
      take: 1
    });

    if (existingVendors.length > 0) {
      console.log('✅ Vendors already exist, skipping...');
      console.log(`Found ${existingVendors.length} existing vendors`);
      return;
    }

    console.log('📊 Creating sample vendors...');
    
    // Create sample vendors
    const vendors = [
      {
        name: "Office Supplies Ltd",
        taxNumber: "TAX001234",
        contactPerson: "John Smith",
        email: "john@officesupplies.co.zw",
        phone: "+263 4 123 4567",
        address: "123 Business Park, Harare",
        paymentTerms: "Net 30",
        isActive: true
      },
      {
        name: "Tech Solutions Zimbabwe",
        taxNumber: "TAX005678",
        contactPerson: "Sarah Johnson",
        email: "sarah@techsolutions.co.zw",
        phone: "+263 4 234 5678",
        address: "456 Tech Hub, Harare",
        paymentTerms: "Net 15",
        isActive: true
      },
      {
        name: "Legal Associates",
        taxNumber: "TAX009012",
        contactPerson: "Michael Brown",
        email: "michael@legalassociates.co.zw",
        phone: "+263 4 345 6789",
        address: "789 Legal District, Harare",
        paymentTerms: "Net 30",
        isActive: true
      },
      {
        name: "Marketing Pro",
        taxNumber: "TAX003456",
        contactPerson: "Lisa Davis",
        email: "lisa@marketingpro.co.zw",
        phone: "+263 4 456 7890",
        address: "321 Marketing Street, Harare",
        paymentTerms: "Net 30",
        isActive: true
      },
      {
        name: "Travel Services Co",
        taxNumber: "TAX007890",
        contactPerson: "David Wilson",
        email: "david@travelservices.co.zw",
        phone: "+263 4 567 8901",
        address: "654 Travel Plaza, Harare",
        paymentTerms: "Net 15",
        isActive: true
      },
      {
        name: "Insurance Partners",
        taxNumber: "TAX001234",
        contactPerson: "Emma Thompson",
        email: "emma@insurancepartners.co.zw",
        phone: "+263 4 678 9012",
        address: "987 Insurance Tower, Harare",
        paymentTerms: "Net 30",
        isActive: true
      },
      {
        name: "Utilities Provider",
        taxNumber: "TAX005432",
        contactPerson: "Robert Taylor",
        email: "robert@utilities.co.zw",
        phone: "+263 4 789 0123",
        address: "147 Utility Complex, Harare",
        paymentTerms: "Net 15",
        isActive: true
      },
      {
        name: "Professional Services Inc",
        taxNumber: "TAX009876",
        contactPerson: "Jennifer Lee",
        email: "jennifer@profservices.co.zw",
        phone: "+263 4 890 1234",
        address: "258 Professional Center, Harare",
        paymentTerms: "Net 30",
        isActive: true
      }
    ];

    for (const vendorData of vendors) {
      const vendor = await prisma.vendor.create({
        data: vendorData
      });
      console.log(`✅ Created vendor: ${vendor.name}`);
    }

    console.log('\n🎉 Vendors seeded successfully!');
    console.log('\n📊 Summary:');
    console.log(`- Created ${vendors.length} sample vendors`);
    console.log('- All vendors are active and ready for use');
    console.log('- Vendors include: Office Supplies, Tech Solutions, Legal, Marketing, Travel, Insurance, Utilities, Professional Services');
    console.log('- Payment terms: Net 15 and Net 30');
    console.log('- Contact information and tax numbers included');

  } catch (error) {
    console.error('❌ Error seeding vendors:', error);
    throw error;
  }
}

async function main() {
  try {
    await seedVendors();
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
