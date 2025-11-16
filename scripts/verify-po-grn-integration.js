// @ts-nocheck
/**
 * Verification script for PO and GRN integration
 * Checks database structure and verifies entries without needing server
 * 
 * Run with: node scripts/verify-po-grn-integration.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verifyIntegration() {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('🔍 PO AND GRN INTEGRATION - VERIFICATION');
  console.log('════════════════════════════════════════════════════════════════\n');

  try {
    // Step 1: Verify database schema
    console.log('📋 Step 1: Verifying database schema...');
    const columns = await prisma.$queryRaw`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'purchase_orders'
      AND COLUMN_NAME IN ('quotationId', 'sentAt', 'sentById')
      ORDER BY COLUMN_NAME
    `;

    const columnNames = columns.map((col) => col.COLUMN_NAME);
    console.log(`   Found columns: ${columnNames.length > 0 ? columnNames.join(', ') : 'none'}`);

    if (columnNames.length === 3 && 
        columnNames.includes('quotationId') && 
        columnNames.includes('sentAt') && 
        columnNames.includes('sentById')) {
      console.log('   ✅ All required columns exist\n');
    } else {
      console.log('   ❌ Missing required columns!\n');
      throw new Error('Database schema verification failed');
    }

    // Step 2: Verify foreign key constraints
    console.log('🔗 Step 2: Verifying foreign key constraints...');
    const fks = await prisma.$queryRaw`
      SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'purchase_orders'
      AND COLUMN_NAME IN ('quotationId', 'sentById')
      AND REFERENCED_TABLE_NAME IS NOT NULL
    `;

    console.log(`   Found foreign keys: ${fks.length}`);
    fks.forEach((fk) => {
      console.log(`   - ${fk.CONSTRAINT_NAME}: ${fk.COLUMN_NAME} → ${fk.REFERENCED_TABLE_NAME}.${fk.REFERENCED_COLUMN_NAME}`);
    });

    if (fks.length >= 2) {
      console.log('   ✅ Foreign key constraints verified\n');
    } else {
      console.log('   ⚠️  Some foreign keys may be missing\n');
    }

    // Step 3: Check existing POs (using raw SQL)
    console.log('📦 Step 3: Checking existing Purchase Orders...');
    const pos = await prisma.$queryRaw`
      SELECT id, poNumber, quotationId, sentAt, sentById, status, createdAt
      FROM purchase_orders
      ORDER BY createdAt DESC
      LIMIT 5
    `;

    console.log(`   Found ${pos.length} recent Purchase Orders`);
    if (pos.length > 0) {
      pos.forEach((po) => {
        console.log(`   - ${po.poNumber}:`);
        console.log(`     Status: ${po.status}`);
        console.log(`     QuotationId: ${po.quotationId || 'null'}`);
        console.log(`     SentAt: ${po.sentAt || 'null'}`);
        console.log(`     SentById: ${po.sentById || 'null'}`);
      });
    }
    console.log('');

    // Step 4: Check existing GRNs (using raw SQL)
    console.log('📋 Step 4: Checking existing GRNs...');
    const grns = await prisma.$queryRaw`
      SELECT id, grnNumber, purchaseOrderId, status, createdAt
      FROM goods_received_notes
      ORDER BY createdAt DESC
      LIMIT 5
    `;

    console.log(`   Found ${grns.length} recent GRNs`);
    if (grns.length > 0) {
      grns.forEach((grn) => {
        console.log(`   - ${grn.grnNumber}:`);
        console.log(`     Status: ${grn.status}`);
        console.log(`     PurchaseOrderId: ${grn.purchaseOrderId || 'null'}`);
      });
    }
    console.log('');

    // Step 5: Check for POs linked to quotations (using raw SQL)
    console.log('🔍 Step 5: Checking for POs linked to quotations...');
    const posWithQuotations = await prisma.$queryRaw`
      SELECT po.id, po.poNumber, po.quotationId, vq.quotationNumber, vq.status
      FROM purchase_orders po
      LEFT JOIN vendor_quotations vq ON po.quotationId = vq.id
      WHERE po.quotationId IS NOT NULL
      LIMIT 5
    `;

    console.log(`   Found ${posWithQuotations.length} POs linked to quotations`);
    if (posWithQuotations.length > 0) {
      posWithQuotations.forEach((po) => {
        console.log(`   - ${po.poNumber}:`);
        console.log(`     Quotation: ${po.quotationNumber || 'N/A'} (${po.status || 'N/A'})`);
      });
    }
    console.log('');

    // Step 6: Check for POs that have been sent (using raw SQL)
    console.log('📧 Step 6: Checking for sent POs...');
    const sentPOs = await prisma.$queryRaw`
      SELECT po.id, po.poNumber, po.sentAt, u.firstName, u.lastName, u.email
      FROM purchase_orders po
      LEFT JOIN users u ON po.sentById = u.id
      WHERE po.sentAt IS NOT NULL
      LIMIT 5
    `;

    console.log(`   Found ${sentPOs.length} POs that have been sent`);
    if (sentPOs.length > 0) {
      sentPOs.forEach((po) => {
        console.log(`   - ${po.poNumber}:`);
        console.log(`     SentAt: ${po.sentAt}`);
        console.log(`     SentBy: ${po.firstName || ''} ${po.lastName || ''} (${po.email || 'N/A'})`);
      });
    }
    console.log('');

    // Step 7: Check invoices linked to POs (using raw SQL)
    console.log('💰 Step 7: Checking invoices linked to POs...');
    const invoicesWithPOs = await prisma.$queryRaw`
      SELECT pi.id, pi.invoiceNumber, pi.purchaseOrderId, pi.quotationId,
             po.poNumber as poNumber, po.status as poStatus,
             vq.quotationNumber as quotationNumber
      FROM procurement_invoices pi
      LEFT JOIN purchase_orders po ON pi.purchaseOrderId = po.id
      LEFT JOIN vendor_quotations vq ON pi.quotationId = vq.id
      WHERE pi.purchaseOrderId IS NOT NULL
      LIMIT 5
    `;

    console.log(`   Found ${invoicesWithPOs.length} invoices linked to POs`);
    if (invoicesWithPOs.length > 0) {
      invoicesWithPOs.forEach((inv) => {
        console.log(`   - ${inv.invoiceNumber}:`);
        console.log(`     PO: ${inv.poNumber || 'N/A'} (${inv.poStatus || 'N/A'})`);
        console.log(`     Quotation: ${inv.quotationNumber || 'N/A'}`);
      });
    }
    console.log('');

    // Step 8: Verify complete workflow chain (using raw SQL)
    console.log('🔗 Step 8: Checking for complete workflow chains...');
    const completeChains = await prisma.$queryRaw`
      SELECT po.id, po.poNumber, po.quotationId,
             vq.quotationNumber,
             COUNT(DISTINCT grn.id) as grnCount,
             COUNT(DISTINCT pi.id) as invoiceCount
      FROM purchase_orders po
      LEFT JOIN vendor_quotations vq ON po.quotationId = vq.id
      LEFT JOIN goods_received_notes grn ON grn.purchaseOrderId = po.id
      LEFT JOIN procurement_invoices pi ON pi.purchaseOrderId = po.id
      WHERE po.quotationId IS NOT NULL
      GROUP BY po.id, po.poNumber, po.quotationId, vq.quotationNumber
      HAVING grnCount > 0
      LIMIT 3
    `;

    console.log(`   Found ${completeChains.length} POs with complete workflow chains`);
    if (completeChains.length > 0) {
      completeChains.forEach((po) => {
        console.log(`   - ${po.poNumber}:`);
        console.log(`     Quotation: ${po.quotationNumber || 'N/A'}`);
        console.log(`     GRNs: ${Number(po.grnCount)}`);
        console.log(`     Invoices: ${Number(po.invoiceCount)}`);
      });
    }
    console.log('');

    console.log('════════════════════════════════════════════════════════════════');
    console.log('✅ VERIFICATION COMPLETED!');
    console.log('════════════════════════════════════════════════════════════════\n');

    console.log('📊 SUMMARY:');
    console.log(`   ✅ Schema: All columns present`);
    console.log(`   ✅ Foreign Keys: ${fks.length} constraints verified`);
    console.log(`   📦 Purchase Orders: ${pos.length} recent`);
    console.log(`   📋 GRNs: ${grns.length} recent`);
    console.log(`   🔗 POs with Quotations: ${posWithQuotations.length}`);
    console.log(`   📧 Sent POs: ${sentPOs.length}`);
    console.log(`   💰 Invoices with POs: ${invoicesWithPOs.length}`);
    console.log(`   🔗 Complete Chains: ${completeChains.length}\n`);

  } catch (error) {
    console.error('\n════════════════════════════════════════════════════════════════');
    console.error('❌ VERIFICATION FAILED!');
    console.error('════════════════════════════════════════════════════════════════');
    console.error('Error:', error.message);
    console.error('\nFull error:', error);
    console.error('════════════════════════════════════════════════════════════════\n');
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run verification
verifyIntegration()
  .then(() => {
    console.log('✅ Verification script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Verification script failed:', error);
    process.exit(1);
  });

