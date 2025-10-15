const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkInventoryAccount() {
  try {
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║          CHECKING INVENTORY ACCOUNTS                      ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    // Search for inventory-related accounts
    const inventoryAccounts = await prisma.chartOfAccounts.findMany({
      where: {
        OR: [
          { accountName: { contains: 'Inventory' } },
          { accountName: { contains: 'Stock' } },
          { accountName: { contains: 'inventory' } },
          { accountName: { contains: 'stock' } }
        ],
        isActive: true
      },
      orderBy: { accountNo: 'asc' }
    });

    console.log('Found', inventoryAccounts.length, 'inventory-related accounts:\n');

    if (inventoryAccounts.length > 0) {
      inventoryAccounts.forEach(account => {
        console.log(`  ${account.accountNo} - ${account.accountName}`);
        console.log(`    Type: ${account.accountType}`);
        console.log(`    Financial Statement: ${account.financialStatement}`);
        console.log(`    Active: ${account.isActive}`);
        console.log('');
      });
    } else {
      console.log('  ❌ No inventory accounts found!\n');
      console.log('─────────────────────────────────────────────────────────');
      console.log('Creating "Inventory" account...\n');

      // Create the Inventory account
      const newAccount = await prisma.chartOfAccounts.create({
        data: {
          accountNo: '1020',
          accountName: 'Inventory',
          accountType: 'Current Asset',
          financialStatement: 'Balance Sheet',
          isActive: true,
          description: 'Inventory of goods available for sale'
        }
      });

      console.log('✅ Created Inventory account:');
      console.log(`  ${newAccount.accountNo} - ${newAccount.accountName}`);
      console.log(`  Type: ${newAccount.accountType}`);
      console.log(`  ID: ${newAccount.id}`);
    }

    console.log('\n✅ Inventory account check complete!');
    console.log('You can now create inventory items.\n');

    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkInventoryAccount();

