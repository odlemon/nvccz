// @ts-nocheck
// VAT Codes Seeder
// Creates VAT codes for cashbook module

import { PrismaClient, Decimal } from '@prisma/client';

const prisma = new PrismaClient();

async function seedVATCodes() {
  try {
    console.log('🧾 Seeding VAT Codes for Cashbook Module...\n');
    
    // Check if VAT codes already exist
    const existingVATCodes = await prisma.vATCode.findMany({
      take: 1
    });
    
    if (existingVATCodes.length > 0) {
      console.log('✅ VAT codes already exist, skipping...');
      return;
    }
    
    console.log('📊 Creating VAT Codes:');
    
    // Create VAT codes
    const vatCodes = [
      {
        code: '15%',
        description: 'Standard Rate - Zimbabwe',
        rate: new Decimal(0.15),
        isActive: true
      },
      {
        code: '0%',
        description: 'Zero Rate - Exempt',
        rate: new Decimal(0.00),
        isActive: true
      },
      {
        code: 'EXEMPT',
        description: 'Exempt from VAT',
        rate: new Decimal(0.00),
        isActive: true
      }
    ];
    
    for (const vatCode of vatCodes) {
      const created = await prisma.vATCode.create({
        data: vatCode
      });
      
      console.log(`   ✅ Created: ${created.code} - ${created.description} (${created.rate.toFixed(4)})`);
    }
    
    console.log('\n🎉 VAT Codes Seeded Successfully!');
    console.log('\n📋 VAT Codes Summary:');
    console.log('   15% - Standard Rate (Zimbabwe) - 15.00%');
    console.log('   0% - Zero Rate (Exempt) - 0.00%');
    console.log('   EXEMPT - Exempt from VAT - 0.00%');
    
    console.log('\n💡 Usage in Cashbook:');
    console.log('   ✅ Receipts: VAT Output (2100) credited');
    console.log('   ✅ Payments: VAT Input (2110) debited');
    console.log('   ✅ Automatic calculation based on VAT code');
    console.log('   ✅ ZIMRA compliance ready');
    
  } catch (error: any) {
    console.error('❌ Error seeding VAT codes:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

seedVATCodes();


