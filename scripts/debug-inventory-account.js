const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debugInventoryAccount() {
  try {
    console.log('\nChecking Inventory account details...\n');
    
    const account = await prisma.chartOfAccounts.findFirst({ 
      where: { accountNo: '1500' } 
    });
    
    if (account) {
      console.log('Account Details:');
      console.log('  Account No:', account.accountNo);
      console.log('  Name:', account.accountName);
      console.log('  Type:', account.accountType);
      console.log('  Type (exact):', JSON.stringify(account.accountType));
      console.log('  Active:', account.isActive);
      console.log('');
      
      // Try the same query the service uses
      console.log('Testing service query...');
      const testQuery = await prisma.chartOfAccounts.findFirst({
        where: {
          OR: [
            { accountName: { contains: 'Inventory' } },
            { accountName: { contains: 'Stock' } },
            { accountName: { contains: 'inventory' } },
            { accountName: { contains: 'stock' } }
          ],
          accountType: 'Current Asset',
          isActive: true
        },
        orderBy: { accountNo: 'asc' }
      });
      
      if (testQuery) {
        console.log('✅ Service query FOUND the account!');
        console.log('  Account:', testQuery.accountNo, testQuery.accountName);
      } else {
        console.log('❌ Service query DID NOT find the account!');
        console.log('\nPossible issues:');
        console.log('  1. accountType might not be exactly "Current Asset"');
        console.log('  2. isActive might be false');
        console.log('  3. accountName might not contain "Inventory" or "Stock"');
      }
    } else {
      console.log('❌ Account 1500 not found!');
    }
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

debugInventoryAccount();

