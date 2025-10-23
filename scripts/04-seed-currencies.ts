// @ts-nocheck
/**
 * Step 4: Seed Currencies
 * 
 * This script creates USD and ZWL currencies.
 * Run this after admin user is created.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedCurrencies() {
  console.log('💰 Step 4: Seeding Currencies...');
  console.log('=' .repeat(50));

  try {
    // Check if currencies already exist
    const existingCurrencies = await prisma.currency.findMany({
      where: {
        code: {
          in: ['USD', 'ZWL']
        }
      }
    });

    if (existingCurrencies.length > 0) {
      console.log('✅ Currencies already exist, skipping...');
      console.log(`Found ${existingCurrencies.length} existing currencies:`);
      existingCurrencies.forEach(currency => {
        console.log(`   • ${currency.code} - ${currency.name}`);
      });
      return;
    }

    console.log('📊 Creating USD and ZWL currencies...');
    
    // Create USD currency
    const usdCurrency = await prisma.currency.create({
      data: {
        code: 'USD',
        name: 'US Dollar',
        symbol: '$',
        isActive: true
      }
    });
    console.log(`✅ Created currency: ${usdCurrency.code} - ${usdCurrency.name}`);

    // Create ZWL currency
    const zwlCurrency = await prisma.currency.create({
      data: {
        code: 'ZWL',
        name: 'Zimbabwean Dollar',
        symbol: 'Z$',
        isActive: true
      }
    });
    console.log(`✅ Created currency: ${zwlCurrency.code} - ${zwlCurrency.name}`);

    console.log('\n🎉 Currencies seeded successfully!');
    console.log('\n📊 Summary:');
    console.log('- Created 2 currencies: USD and ZWL');
    console.log('- Both currencies are active and ready for use');
    console.log('- USD: US Dollar ($)');
    console.log('- ZWL: Zimbabwean Dollar (Z$)');

  } catch (error) {
    console.error('❌ Error seeding currencies:', error);
    throw error;
  }
}

async function main() {
  try {
    await seedCurrencies();
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
