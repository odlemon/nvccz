import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkImportData() {
  try {
    console.log('🔍 Checking data for CSV import...\n');
    
    // Get banks
    const banks = await prisma.bank.findMany({
      where: { isActive: true },
      select: { id: true, name: true, accountNumber: true },
      orderBy: { name: 'asc' }
    });
    
    console.log('📊 Banks:');
    banks.forEach(bank => {
      console.log(`   - ${bank.name} (${bank.accountNumber})`);
    });
    
    // Get customers
    const customers = await prisma.customer.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      take: 10
    });
    
    console.log('\n👥 Customers:');
    customers.forEach(customer => {
      console.log(`   - ${customer.name}`);
    });
    
    // Get vendors
    const vendors = await prisma.vendor.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      take: 10
    });
    
    console.log('\n🏢 Vendors:');
    vendors.forEach(vendor => {
      console.log(`   - ${vendor.name}`);
    });
    
    // Get GL accounts
    const glAccounts = await prisma.chartOfAccounts.findMany({
      where: { isActive: true },
      select: { id: true, accountNo: true, accountName: true },
      orderBy: { accountNo: 'asc' },
      take: 20
    });
    
    console.log('\n📋 GL Accounts:');
    glAccounts.forEach(account => {
      console.log(`   - ${account.accountNo} - ${account.accountName}`);
    });
    
    // Check for required accounts
    console.log('\n✅ Required Accounts Check:');
    const arAccount = await prisma.chartOfAccounts.findFirst({
      where: { accountNo: '1200', isActive: true }
    });
    console.log(`   - Accounts Receivable (1200): ${arAccount ? '✅ Found' : '❌ Not found'}`);
    
    const apAccount = await prisma.chartOfAccounts.findFirst({
      where: { accountNo: '2000', isActive: true }
    });
    console.log(`   - Accounts Payable (2000): ${apAccount ? '✅ Found' : '❌ Not found'}`);
    
    // Generate sample CSV
    if (banks.length > 0 && (customers.length > 0 || vendors.length > 0 || glAccounts.length > 0)) {
      console.log('\n📝 Sample CSV:');
      console.log('bankName,transactionDate,description,amount,reference,counterpartyType,customerName,vendorName,glAccountNo,vatCode,projectCode,discount');
      
      const today = new Date().toISOString().split('T')[0];
      
      if (customers.length > 0) {
        console.log(`${banks[0].name},${today},Customer Payment - Invoice #INV-001,1500.00,RCP-001,CUSTOMER,${customers[0].name},,,15%,PROJ-001,0`);
      }
      
      if (glAccounts.length > 0) {
        console.log(`${banks[0].name},${today},GL Receipt - Share Capital,5000.00,RCP-002,GL,,,${glAccounts[0].accountNo},15%,,0`);
      }
      
      if (vendors.length > 0) {
        console.log(`${banks[0].name},${today},Supplier Payment - Office Supplies,250.00,PAY-001,SUPPLIER,,${vendors[0].name},,15%,PROJ-002,0`);
      }
    }
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkImportData();

