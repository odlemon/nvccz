// Delete all purchase requisitions and purchase orders
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function deleteAllRequisitionsAndPOs() {
  console.log("\n╔════════════════════════════════════════════════════════════════╗");
  console.log("║  DELETE ALL REQUISITIONS AND PURCHASE ORDERS                   ║");
  console.log("║  Date: 2025-10-14                                              ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  try {
    console.log("🔍 Counting existing records...\n");

    // Count existing records
    const requisitionCount = await prisma.purchaseRequisition.count();
    const poCount = await prisma.purchaseOrder.count();
    const grnCount = await prisma.goodsReceivedNote.count();
    const invoiceCount = await prisma.procurementInvoice.count();

    console.log(`📊 Current counts:`);
    console.log(`   - Purchase Requisitions: ${requisitionCount}`);
    console.log(`   - Purchase Orders: ${poCount}`);
    console.log(`   - Goods Received Notes: ${grnCount}`);
    console.log(`   - Procurement Invoices: ${invoiceCount}`);

    if (requisitionCount === 0 && poCount === 0 && grnCount === 0 && invoiceCount === 0) {
      console.log("\n✅ No records to delete. Database is already clean.");
      return;
    }

    console.log("\n⚠️  WARNING: This will delete ALL procurement records!");
    console.log("   This action cannot be undone.\n");

    console.log("🗑️  Starting deletion...\n");

    // Delete in correct order (respecting foreign keys)
    
    // 1. Delete procurement invoice items first
    console.log("1️⃣  Deleting procurement invoice items...");
    const deletedInvoiceItems = await prisma.procurementInvoiceItem.deleteMany({});
    console.log(`   ✅ Deleted ${deletedInvoiceItems.count} invoice items`);

    // 2. Delete procurement invoices
    console.log("2️⃣  Deleting procurement invoices...");
    const deletedInvoices = await prisma.procurementInvoice.deleteMany({});
    console.log(`   ✅ Deleted ${deletedInvoices.count} invoices`);

    // 3. Delete goods received note items
    console.log("3️⃣  Deleting goods received note items...");
    const deletedGRNItems = await prisma.goodsReceivedNoteItem.deleteMany({});
    console.log(`   ✅ Deleted ${deletedGRNItems.count} GRN items`);

    // 4. Delete goods received notes
    console.log("4️⃣  Deleting goods received notes...");
    const deletedGRNs = await prisma.goodsReceivedNote.deleteMany({});
    console.log(`   ✅ Deleted ${deletedGRNs.count} GRNs`);

    // 5. Delete purchase order items
    console.log("5️⃣  Deleting purchase order items...");
    const deletedPOItems = await prisma.purchaseOrderItem.deleteMany({});
    console.log(`   ✅ Deleted ${deletedPOItems.count} PO items`);

    // 6. Delete purchase orders
    console.log("6️⃣  Deleting purchase orders...");
    const deletedPOs = await prisma.purchaseOrder.deleteMany({});
    console.log(`   ✅ Deleted ${deletedPOs.count} purchase orders`);

    // 7. Delete purchase requisition items
    console.log("7️⃣  Deleting purchase requisition items...");
    const deletedReqItems = await prisma.purchaseRequisitionItem.deleteMany({});
    console.log(`   ✅ Deleted ${deletedReqItems.count} requisition items`);

    // 8. Delete purchase requisitions
    console.log("8️⃣  Deleting purchase requisitions...");
    const deletedRequisitions = await prisma.purchaseRequisition.deleteMany({});
    console.log(`   ✅ Deleted ${deletedRequisitions.count} requisitions`);

    console.log("\n════════════════════════════════════════════════════════════════");
    console.log("✅ DELETION COMPLETE!");
    console.log("════════════════════════════════════════════════════════════════");
    console.log("Summary:");
    console.log(`   - Requisitions deleted: ${deletedRequisitions.count}`);
    console.log(`   - Requisition items deleted: ${deletedReqItems.count}`);
    console.log(`   - Purchase orders deleted: ${deletedPOs.count}`);
    console.log(`   - PO items deleted: ${deletedPOItems.count}`);
    console.log(`   - GRNs deleted: ${deletedGRNs.count}`);
    console.log(`   - GRN items deleted: ${deletedGRNItems.count}`);
    console.log(`   - Invoices deleted: ${deletedInvoices.count}`);
    console.log(`   - Invoice items deleted: ${deletedInvoiceItems.count}`);
    console.log("\n✅ Database is now clean and ready for migration!");
    console.log("════════════════════════════════════════════════════════════════\n");

  } catch (error) {
    console.error("\n❌ ERROR:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the deletion
deleteAllRequisitionsAndPOs()
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });


