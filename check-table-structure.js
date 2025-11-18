const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkTable() {
  try {
    const result = await prisma.$queryRawUnsafe('DESCRIBE purchase_invoices');
    console.log('Table structure:');
    console.log(JSON.stringify(result, null, 2));
    
    // Check if invoice_number exists
    const hasInvoiceNumber = result.some(col => col.Field === 'invoice_number');
    console.log('\nHas invoice_number column:', hasInvoiceNumber);
    
    if (!hasInvoiceNumber) {
      console.log('\n⚠️  Column name mismatch detected. The table uses snake_case but Prisma expects camelCase.');
      console.log('This should be handled by Prisma automatically via @@map, but let me verify the schema...');
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkTable();

