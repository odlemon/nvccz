import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedBankAccounts() {
  try {
    console.log('🏦 Seeding Bank Accounts for Cashbook Module...\n');
    
    // Check if banks already exist
    const existingBanks = await prisma.bank.findMany({
      take: 1
    });
    
    if (existingBanks.length > 0) {
      console.log('✅ Bank accounts already exist, skipping...');
      return;
    }
    
    // Get USD currency
    const usdCurrency = await prisma.currency.findFirst({
      where: { code: 'USD' }
    });
    
    if (!usdCurrency) {
      console.error('❌ USD currency not found. Please run currency seeder first.');
      return;
    }
    
    // Get GL accounts for bank linking
    const glAccounts = await prisma.chartOfAccounts.findMany({
      where: {
        accountNo: { in: ['1000', '1010', '1020', '1030'] }
      }
    });
    
    const glAccountMap = glAccounts.reduce((acc, account) => {
      acc[account.accountNo] = account.id;
      return acc;
    }, {} as Record<string, string>);
    
    console.log('📊 Creating Bank Accounts:');
    
    // Create bank accounts linked to GL accounts
    const banks = [
      {
        name: "Cash and Cash Equivalents",
        accountNumber: "CASH-001",
        currencyId: usdCurrency.id,
        glAccountId: glAccountMap['1000'],
        description: "General cash and cash equivalents account"
      },
      {
        name: "Main Bank Account - USD",
        accountNumber: "USD-001-123456",
        currencyId: usdCurrency.id,
        glAccountId: glAccountMap['1010'],
        description: "Primary operating bank account in USD"
      },
      {
        name: "Savings Account - USD", 
        accountNumber: "USD-002-789012",
        currencyId: usdCurrency.id,
        glAccountId: glAccountMap['1020'],
        description: "Interest-bearing savings account in USD"
      },
      {
        name: "Petty Cash",
        accountNumber: "CASH-002",
        currencyId: usdCurrency.id,
        glAccountId: glAccountMap['1030'],
        description: "Petty cash for small transactions"
      }
    ];
    
    const createdBanks = [];
    
    for (const bankData of banks) {
      try {
        const bank = await prisma.bank.create({
          data: {
            name: bankData.name,
            accountNumber: bankData.accountNumber,
            currencyId: bankData.currencyId,
            glAccountId: bankData.glAccountId,
            isActive: true
          }
        });
        
        createdBanks.push(bank);
        console.log(`   ✅ Created: ${bank.name} (${bank.accountNumber})`);
        console.log(`      GL Account: ${bank.glAccountId ? 'Linked' : 'Not linked'}`);
        console.log(`      Currency: ${usdCurrency.code}`);
        
      } catch (error: any) {
        console.error(`   ❌ Error creating ${bankData.name}:`, error.message);
      }
    }
    
    console.log('\n🎉 Bank Account Seeding Complete!');
    console.log(`📊 Created ${createdBanks.length} bank accounts`);
    
    console.log('\n🏦 Bank Account Summary:');
    createdBanks.forEach(bank => {
      console.log(`   ${bank.name}:`);
      console.log(`     Account Number: ${bank.accountNumber}`);
      console.log(`     GL Account ID: ${bank.glAccountId}`);
      console.log(`     Currency: USD`);
      console.log(`     Status: ${bank.isActive ? 'Active' : 'Inactive'}`);
    });
    
    console.log('\n💡 Next Steps:');
    console.log('   1. Run VAT accounts seeder if not done');
    console.log('   2. Test cashbook functionality');
    console.log('   3. Create sample cashbook transactions');
    
  } catch (error: any) {
    console.error('❌ Error seeding bank accounts:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

seedBankAccounts();


