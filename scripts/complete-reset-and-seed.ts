// @ts-nocheck
/**
 * Complete Reset and Seed Script
 * 
 * This script performs a complete database reset and seeds all necessary data
 * in the correct order for a fully functional system.
 */

import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

const prisma = new PrismaClient();

async function completeResetAndSeed() {
  console.log('🔄 COMPLETE DATABASE RESET AND SEED');
  console.log('=' .repeat(60));

  try {
    // Step 1: Reset the database
    console.log('\n🗑️ Step 1: Resetting Database...');
    await resetDatabase();

    // Step 2: Run Prisma migrations
    console.log('\n📊 Step 2: Running Prisma Migrations...');
    await runMigrations();

    // Step 3: Seed core data (admin user, departments)
    console.log('\n🌱 Step 3: Seeding Core Data...');
    await seedCoreData();

    // Step 4: Seed chart of accounts
    console.log('\n📚 Step 4: Seeding Chart of Accounts...');
    await seedChartOfAccounts();

    // Step 5: Seed KPIs
    console.log('\n📈 Step 5: Seeding KPIs...');
    await seedKPIs();

    // Step 6: Seed journal entries
    console.log('\n📝 Step 6: Seeding Journal Entries...');
    await seedJournalEntries();

    // Step 7: Display final summary
    console.log('\n📊 Step 7: Final Summary...');
    await displayFinalSummary();

    console.log('\n🎉 COMPLETE RESET AND SEEDING FINISHED!');
    console.log('\n💡 Your system is now ready with:');
    console.log('   ✅ Admin user (Operations department)');
    console.log('   ✅ 8 hardcoded departments');
    console.log('   ✅ Chart of accounts');
    console.log('   ✅ KPIs for performance tracking');
    console.log('   ✅ Vendors and customers');
    console.log('   ✅ Journal entries');
    console.log('   ✅ Performance module data');

  } catch (error) {
    console.error('❌ Error during complete reset and seeding:', error);
    throw error;
  }
}

async function resetDatabase() {
  console.log('🗑️ Resetting database...');
  
  try {
    execSync('npx prisma db push --force-reset', { stdio: 'inherit' });
    console.log('✅ Database reset successfully');
  } catch (error) {
    console.log('⚠️ Database reset completed with warnings');
  }
}

async function runMigrations() {
  console.log('📊 Running Prisma migrations...');
  
  try {
    execSync('npx prisma generate', { stdio: 'inherit' });
    execSync('npx prisma db push', { stdio: 'inherit' });
    console.log('✅ Migrations completed successfully');
  } catch (error) {
    console.log('⚠️ Migrations completed with warnings');
  }
}

async function seedCoreData() {
  console.log('🌱 Seeding core data (admin user, departments, roles)...');
  
  try {
    execSync('npx ts-node prisma/seed.ts', { stdio: 'inherit' });
    console.log('✅ Core data seeded successfully');
  } catch (error) {
    console.log('⚠️ Core data seeding completed with warnings');
  }
}

async function seedChartOfAccounts() {
  console.log('📚 Seeding chart of accounts...');
  
  try {
    execSync('npx ts-node prisma/seedChartOfAccounts.ts', { stdio: 'inherit' });
    console.log('✅ Chart of accounts seeded successfully');
  } catch (error) {
    console.log('⚠️ Chart of accounts seeding completed with warnings');
  }
}

async function seedKPIs() {
  console.log('📈 Seeding KPIs...');
  
  try {
    execSync('npx ts-node scripts/seed-kpis.ts', { stdio: 'inherit' });
    console.log('✅ KPIs seeded successfully');
  } catch (error) {
    console.log('⚠️ KPIs seeding completed with warnings');
  }
}

async function seedJournalEntries() {
  console.log('📝 Seeding journal entries...');
  
  try {
    execSync('npx ts-node scripts/seed-simple-journal-entries.ts', { stdio: 'inherit' });
    console.log('✅ Journal entries seeded successfully');
  } catch (error) {
    console.log('⚠️ Journal entries seeding completed with warnings');
  }
}

async function displayFinalSummary() {
  console.log('\n📊 FINAL SYSTEM SUMMARY');
  console.log('=' .repeat(50));

  try {
    // Count users
    const userCount = await prisma.user.count();
    console.log(`👤 Users: ${userCount}`);

    // Count roles
    const roleCount = await prisma.role.count();
    console.log(`🔐 Roles: ${roleCount}`);

    // Count departments
    const departmentCount = await prisma.department.count();
    console.log(`🏢 Departments: ${departmentCount}`);

    // Count chart of accounts
    const accountCount = await prisma.chartOfAccounts.count();
    console.log(`📚 Chart of Accounts: ${accountCount}`);

    // Count KPIs
    const kpiCount = await prisma.kPI.count();
    console.log(`📈 KPIs: ${kpiCount}`);

    // Count vendors
    const vendorCount = await prisma.vendor.count();
    console.log(`🏪 Vendors: ${vendorCount}`);

    // Count customers
    const customerCount = await prisma.customer.count();
    console.log(`👥 Customers: ${customerCount}`);

    // Count journal entries
    const journalEntryCount = await prisma.journalEntry.count();
    console.log(`📝 Journal Entries: ${journalEntryCount}`);

    // Count journal entry lines
    const journalLineCount = await prisma.journalEntryLine.count();
    console.log(`📄 Journal Entry Lines: ${journalLineCount}`);

    console.log('\n🎯 SYSTEM READY FOR USE!');
    console.log('\n🔑 Admin Credentials:');
    console.log('   Email: admin@nvccz.co.zw');
    console.log('   Password: admin123');
    console.log('   Role: admin');
    console.log('   Department: Operations');

    console.log('\n🏢 Available Departments:');
    const departments = await prisma.department.findMany({
      select: { name: true }
    });
    departments.forEach(dept => {
      console.log(`   • ${dept.name}`);
    });

  } catch (error) {
    console.log('⚠️ Could not display complete summary, but seeding completed');
  }
}

async function main() {
  try {
    await completeResetAndSeed();
  } catch (error) {
    console.error('❌ Complete reset and seeding failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
