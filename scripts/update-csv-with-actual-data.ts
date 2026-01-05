import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function updateCSVWithActualData() {
  try {
    console.log('🔍 Fetching actual data from database...\n');
    
    // Get all active banks
    const banks = await prisma.bank.findMany({
      where: { isActive: true },
      select: { name: true },
      orderBy: { name: 'asc' }
    });
    
    // Get ALL customers (active and inactive) - user says they exist
    const customers = await prisma.customer.findMany({
      // Remove isActive filter to check ALL customers
      select: { name: true, isActive: true },
      orderBy: { name: 'asc' }
    });
    
    console.log(`\n🔍 Checking customers (including inactive):`);
    customers.forEach(c => {
      console.log(`   - ${c.name} (${c.isActive ? 'ACTIVE' : 'INACTIVE'})`);
    });
    
    // Get all active vendors
    const vendors = await prisma.vendor.findMany({
      where: { isActive: true },
      select: { name: true },
      orderBy: { name: 'asc' }
    });
    
    // Get all active GL accounts
    const glAccounts = await prisma.chartOfAccounts.findMany({
      where: { isActive: true },
      select: { accountNo: true, accountName: true },
      orderBy: { accountNo: 'asc' }
    });
    
    console.log(`✅ Found ${banks.length} banks`);
    console.log(`✅ Found ${customers.length} customers`);
    console.log(`✅ Found ${vendors.length} vendors`);
    console.log(`✅ Found ${glAccounts.length} GL accounts\n`);
    
    if (banks.length === 0) {
      console.error('❌ No banks found! Please create at least one bank account first.');
      return;
    }
    
    // Use actual data for examples
    const exampleBank = banks[0]?.name || '';
    const exampleCustomer = customers[0]?.name || '';
    const exampleVendor = vendors[0]?.name || '';
    const exampleGLAccount = glAccounts[0]?.accountNo || '';
    
    const today = new Date().toISOString().split('T')[0];
    
    // Build CSV content with actual data
    let csvContent = `bankName,transactionDate,description,amount,reference,counterpartyType,customerName,vendorName,glAccountNo,vatCode,projectCode,discount\n`;
    
    // Add example rows only if we have the required data
    if (exampleCustomer) {
      csvContent += `${exampleBank},${today},Customer Payment - Invoice #INV-001,1500.00,RCP-001,CUSTOMER,${exampleCustomer},,,15%,PROJ-001,0\n`;
    }
    
    if (exampleGLAccount) {
      csvContent += `${exampleBank},${today},GL Receipt - Share Capital,5000.00,RCP-002,GL,,,${exampleGLAccount},15%,,0\n`;
    }
    
    if (exampleVendor) {
      csvContent += `${exampleBank},${today},Supplier Payment - Office Supplies,250.00,PAY-001,SUPPLIER,,${exampleVendor},,15%,PROJ-002,0\n`;
    }
    
    // Add more examples if we have multiple customers/vendors
    if (customers.length > 1) {
      csvContent += `${exampleBank},${today},Customer Payment - Invoice #INV-002,2200.00,RCP-003,CUSTOMER,${customers[1].name},,,15%,PROJ-001,0\n`;
    }
    
    if (customers.length > 2) {
      csvContent += `${exampleBank},${today},Customer Payment - Invoice #INV-003,8500.75,RCP-004,CUSTOMER,${customers[2].name},,,15%,PROJ-003,0\n`;
    }
    
    if (vendors.length > 1) {
      csvContent += `${exampleBank},${today},Supplier Payment - Utilities,450.50,PAY-003,SUPPLIER,,${vendors[1].name},,15%,PROJ-002,0\n`;
    }
    
    if (glAccounts.length > 1) {
      csvContent += `${exampleBank},${today},GL Payment - Rent,1200.00,PAY-002,GL,,,${glAccounts[1].accountNo},15%,,0\n`;
    }
    
    // Write to CSV file
    const csvPath = path.join(process.cwd(), 'sample-cashbook-transactions.csv');
    fs.writeFileSync(csvPath, csvContent, 'utf-8');
    
    console.log(`✅ Updated CSV file: ${csvPath}\n`);
    console.log('📋 CSV now contains:');
    console.log(`   - Bank: ${exampleBank}`);
    if (exampleCustomer) {
      console.log(`   - Customer: ${exampleCustomer}`);
    }
    if (exampleVendor) {
      console.log(`   - Vendor: ${exampleVendor}`);
    }
    if (exampleGLAccount) {
      console.log(`   - GL Account: ${exampleGLAccount}`);
    }
    console.log('\n💡 All names/account numbers in the CSV now match your actual database!');
    
  } catch (error: any) {
    console.error('❌ Error updating CSV:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

updateCSVWithActualData();

