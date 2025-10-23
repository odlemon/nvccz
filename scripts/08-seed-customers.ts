// @ts-nocheck
/**
 * Step 8: Seed Customers
 * 
 * This script creates sample customers for the system.
 * Run this after vendors are created.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedCustomers() {
  console.log('👥 Step 8: Seeding Customers...');
  console.log('=' .repeat(50));

  try {
    // Check if customers already exist
    const existingCustomers = await prisma.customer.findMany({
      take: 1
    });

    if (existingCustomers.length > 0) {
      console.log('✅ Customers already exist, skipping...');
      console.log(`Found ${existingCustomers.length} existing customers`);
      return;
    }

    console.log('📊 Creating sample customers...');
    
    // Create sample customers
    const customers = [
      {
        name: "ABC Investment Fund",
        taxNumber: "TAX001234",
        contactPerson: "James Wilson",
        email: "james@abcinvestment.co.zw",
        phone: "+263 4 111 2222",
        address: "123 Investment Street, Harare",
        paymentTerms: "Net 30",
        isActive: true
      },
      {
        name: "XYZ Capital Partners",
        taxNumber: "TAX005678",
        contactPerson: "Maria Garcia",
        email: "maria@xyzcapital.co.zw",
        phone: "+263 4 333 4444",
        address: "456 Capital Avenue, Harare",
        paymentTerms: "Net 30",
        isActive: true
      },
      {
        name: "Global Ventures Ltd",
        taxNumber: "TAX009012",
        contactPerson: "Peter Anderson",
        email: "peter@globalventures.co.zw",
        phone: "+263 4 555 6666",
        address: "789 Venture Plaza, Harare",
        paymentTerms: "Net 15",
        isActive: true
      },
      {
        name: "Tech Startup Inc",
        taxNumber: "TAX003456",
        contactPerson: "Sarah Johnson",
        email: "sarah@techstartup.co.zw",
        phone: "+263 4 777 8888",
        address: "321 Startup Hub, Harare",
        paymentTerms: "Net 30",
        isActive: true
      },
      {
        name: "Manufacturing Co",
        taxNumber: "TAX007890",
        contactPerson: "David Brown",
        email: "david@manufacturing.co.zw",
        phone: "+263 4 999 0000",
        address: "654 Industrial Zone, Harare",
        paymentTerms: "Net 30",
        isActive: true
      },
      {
        name: "Retail Chain Stores",
        taxNumber: "TAX001234",
        contactPerson: "Lisa Davis",
        email: "lisa@retailchain.co.zw",
        phone: "+263 4 111 3333",
        address: "987 Retail District, Harare",
        paymentTerms: "Net 15",
        isActive: true
      },
      {
        name: "Healthcare Group",
        taxNumber: "TAX005432",
        contactPerson: "Michael Taylor",
        email: "michael@healthcare.co.zw",
        phone: "+263 4 222 4444",
        address: "147 Medical Center, Harare",
        paymentTerms: "Net 30",
        isActive: true
      },
      {
        name: "Education Foundation",
        taxNumber: "TAX009876",
        contactPerson: "Emma Thompson",
        email: "emma@education.co.zw",
        phone: "+263 4 333 5555",
        address: "258 Education Campus, Harare",
        paymentTerms: "Net 30",
        isActive: true
      }
    ];

    for (const customerData of customers) {
      const customer = await prisma.customer.create({
        data: customerData
      });
      console.log(`✅ Created customer: ${customer.name}`);
    }

    console.log('\n🎉 Customers seeded successfully!');
    console.log('\n📊 Summary:');
    console.log(`- Created ${customers.length} sample customers`);
    console.log('- All customers are active and ready for use');
    console.log('- Customers include: Investment Funds, Capital Partners, Startups, Manufacturing, Retail, Healthcare, Education');
    console.log('- Payment terms: Net 15 and Net 30');
    console.log('- Contact information and tax numbers included');

  } catch (error) {
    console.error('❌ Error seeding customers:', error);
    throw error;
  }
}

async function main() {
  try {
    await seedCustomers();
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
