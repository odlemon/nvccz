// @ts-nocheck
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function cleanupOldData() {
  console.log("🧹 Cleaning up old expense and journal entry data...");

  try {
    console.log("📊 Deleting journal entry lines...");
    const deletedLines = await prisma.journalEntryLine.deleteMany({});
    console.log(`   Deleted ${deletedLines.count} journal entry lines`);

    console.log("📊 Deleting journal entries...");
    const deletedEntries = await prisma.journalEntry.deleteMany({});
    console.log(`   Deleted ${deletedEntries.count} journal entries`);

    console.log("📊 Deleting expenses...");
    const deletedExpenses = await prisma.expense.deleteMany({});
    console.log(`   Deleted ${deletedExpenses.count} expenses`);

    console.log("📊 Deleting invoices...");
    const deletedInvoices = await prisma.invoice.deleteMany({});
    console.log(`   Deleted ${deletedInvoices.count} invoices`);

    console.log("📊 Deleting customers...");
    const deletedCustomers = await prisma.customer.deleteMany({});
    console.log(`   Deleted ${deletedCustomers.count} customers`);

    console.log("📊 Deleting invoice categories...");
    const deletedCategories = await prisma.invoiceCategory.deleteMany({});
    console.log(`   Deleted ${deletedCategories.count} invoice categories`);

    console.log("✅ Cleanup completed successfully!");
    console.log("");
    console.log("🗑️  Deleted data:");
    console.log("- All journal entry lines");
    console.log("- All journal entries");
    console.log("- All expenses");
    console.log("- All invoices");
    console.log("- All customers");
    console.log("- All invoice categories");
    console.log("");
    console.log("💡 The Chart of Accounts data remains intact and ready for new transactions.");

  } catch (error) {
    console.error("❌ Error during cleanup:", error);
    throw error;
  }
}

async function main() {
  try {
    await cleanupOldData();
  } catch (error) {
    console.error("❌ Cleanup failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main(); 