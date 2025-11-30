import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function findCurrency() {
  try {
    console.log('\n🔍 Finding USD currency...\n');

    // Get USD currency
    const currency = await prisma.currency.findFirst({
      where: {
        code: 'USD',
        isActive: true
      },
      select: {
        id: true,
        code: true,
        name: true,
        symbol: true,
        isActive: true
      }
    });

    if (!currency) {
      console.log('❌ USD currency not found in the database.\n');
      console.log('💡 The system will create it automatically when needed.\n');
      return;
    }

    console.log('✅ Found USD currency:\n');
    console.log(`   ID: ${currency.id}`);
    console.log(`   Code: ${currency.code}`);
    console.log(`   Name: ${currency.name}`);
    console.log(`   Symbol: ${currency.symbol}`);
    console.log(`   Active: ${currency.isActive}`);
    console.log(`\n📋 Use this currencyId in your expense request:\n`);
    console.log(`   "currencyId": "${currency.id}"\n`);

    // Also list all active currencies
    const allCurrencies = await prisma.currency.findMany({
      where: {
        isActive: true
      },
      select: {
        id: true,
        code: true,
        name: true,
        symbol: true
      },
      orderBy: {
        code: 'asc'
      }
    });

    if (allCurrencies.length > 1) {
      console.log(`\n📋 All active currencies (${allCurrencies.length}):\n`);
      allCurrencies.forEach((c, index) => {
        console.log(`   ${index + 1}. ${c.code} - ${c.name} (${c.symbol})`);
        console.log(`      ID: ${c.id}`);
        console.log(``);
      });
    }

  } catch (error: any) {
    console.error('❌ Error finding currency:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

findCurrency();

