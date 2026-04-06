import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedBankAccounts() {
  try {
    console.log('🏦 Seeding Bank Accounts for Cashbook Module...\n');

    const existingBanks = await prisma.bank.findMany({
      take: 1,
    });

    if (existingBanks.length > 0) {
      console.log('✅ Bank accounts already exist, skipping...');
      return;
    }

    const usdCurrency = await prisma.currency.findFirst({
      where: { code: 'USD' },
    });

    if (!usdCurrency) {
      console.error('❌ USD currency not found. Please run currency seeder first.');
      return;
    }

    // Single Cash and Cash Equivalents line for all banks (client standard).
    let cace = await prisma.chartOfAccounts.findFirst({
      where: {
        OR: [
          { accountNo: '1000' },
          { accountName: { contains: 'Cash and Cash Equivalent' } },
        ],
        isActive: true,
      },
      orderBy: { accountNo: 'asc' },
    });

    if (!cace) {
      cace = await prisma.chartOfAccounts.create({
        data: {
          accountNo: '1000',
          accountName: 'Cash and Cash Equivalents',
          accountType: 'Current Asset',
          financialStatement: 'Balance Sheet',
          isActive: true,
        },
      });
      console.log('📊 Created GL 1000 — Cash and Cash Equivalents');
    }

    console.log('📊 Creating Bank Accounts (all share GL ' + cace.accountNo + '):');

    const bankDefs = [
      {
        name: 'Main Bank Account - USD',
        accountNumber: 'USD-001-123456',
        description: 'Primary operating bank',
      },
      {
        name: 'Savings Account - USD',
        accountNumber: 'USD-002-789012',
        description: 'Savings',
      },
      {
        name: 'Petty Cash',
        accountNumber: 'CASH-002',
        description: 'Petty cash',
      },
      {
        name: 'Bank (legacy label)',
        accountNumber: 'BANK-MAIN',
        description: 'Additional operating account',
      },
    ];

    const createdBanks = [];

    for (const bankData of bankDefs) {
      try {
        const bank = await prisma.bank.create({
          data: {
            name: bankData.name,
            accountNumber: bankData.accountNumber,
            currencyId: usdCurrency.id,
            glAccountId: cace.id,
            isActive: true,
          },
        });

        createdBanks.push(bank);
        console.log(`   ✅ Created: ${bank.name} (${bank.accountNumber})`);
      } catch (error: any) {
        console.error(`   ❌ Error creating ${bankData.name}:`, error.message);
      }
    }

    console.log('\n🎉 Bank Account Seeding Complete!');
    console.log(`📊 Created ${createdBanks.length} bank accounts on CoA ${cace.accountNo}`);
  } catch (error: any) {
    console.error('❌ Error seeding bank accounts:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

seedBankAccounts();
