import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addVATAccounts() {
  try {
    console.log('🧾 Adding VAT Accounts for Cashbook Module...\n');
    
    // Check if VAT accounts already exist
    const existingVATAccounts = await prisma.chartOfAccounts.findMany({
      where: {
        accountNo: { in: ['2100', '2110'] }
      }
    });
    
    if (existingVATAccounts.length > 0) {
      console.log('✅ VAT accounts already exist:');
      existingVATAccounts.forEach(acc => {
        console.log(`   ${acc.accountNo} - ${acc.accountName}`);
      });
      return;
    }
    
    console.log('📊 Creating VAT Accounts:');
    
    // Create VAT Output Account (2100)
    const vatOutput = await prisma.chartOfAccounts.create({
      data: {
        accountNo: "2100",
        accountName: "VAT Output",
        accountType: "Current Liability",
        financialStatement: "Balance Sheet",
        notes: "VAT collected on sales and receipts - Zimbabwe 15.5% standard rate"
      }
    });
    
    console.log(`   ✅ Created: ${vatOutput.accountNo} - ${vatOutput.accountName}`);
    console.log(`      Type: ${vatOutput.accountType}`);
    console.log(`      Statement: ${vatOutput.financialStatement}`);
    
    // Create VAT Input Account (2110)
    const vatInput = await prisma.chartOfAccounts.create({
      data: {
        accountNo: "2110",
        accountName: "VAT Input",
        accountType: "Current Asset",
        financialStatement: "Balance Sheet",
        notes: "VAT paid on purchases and payments - Zimbabwe 15.5% standard rate"
      }
    });
    
    console.log(`   ✅ Created: ${vatInput.accountNo} - ${vatInput.accountName}`);
    console.log(`      Type: ${vatInput.accountType}`);
    console.log(`      Statement: ${vatInput.financialStatement}`);
    
    console.log('\n🎉 VAT Accounts Added Successfully!');
    console.log('\n📋 VAT Account Details:');
    console.log('   VAT Output (2100):');
    console.log('     - Type: Current Liability');
    console.log('     - Purpose: VAT collected on sales and receipts');
    console.log('     - Rate: 15.5% (Zimbabwe standard)');
    console.log('     - Usage: Credited when recording receipts');
    
    console.log('\n   VAT Input (2110):');
    console.log('     - Type: Current Asset');
    console.log('     - Purpose: VAT paid on purchases and payments');
    console.log('     - Rate: 15.5% (Zimbabwe standard)');
    console.log('     - Usage: Debited when recording payments');
    
    console.log('\n💡 Cashbook Integration:');
    console.log('   ✅ Receipts: Dr. Bank, Cr. Revenue, Cr. VAT Output (2100)');
    console.log('   ✅ Payments: Dr. Expense, Dr. VAT Input (2110), Cr. Bank');
    console.log('   ✅ VAT Calculation: Automatic 15.5% calculation');
    console.log('   ✅ ZIMRA Compliance: Ready for VAT returns');
    
  } catch (error: any) {
    console.error('❌ Error adding VAT accounts:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

addVATAccounts();


