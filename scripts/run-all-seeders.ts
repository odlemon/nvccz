// @ts-nocheck
/**
 * Master Seeder Script
 * 
 * This script runs all seeders in the correct order.
 * Use this for a complete setup, or run individual seeders as needed.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function runAllSeeders() {
  console.log('🚀 RUNNING ALL SEEDERS IN ORDER');
  console.log('=' .repeat(60));
  console.log('This script will run all seeders step by step.');
  console.log('You can also run individual seeders if needed.');
  console.log('=' .repeat(60));

  try {
    // Step 1: Departments
    console.log('\n🏢 Step 1: Seeding Departments...');
    console.log('=' .repeat(40));
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    await execAsync('npx ts-node scripts/01-seed-departments.ts');
    console.log('✅ Departments completed');

    // Step 2: Roles
    console.log('\n👔 Step 2: Seeding Roles...');
    console.log('=' .repeat(40));
    await execAsync('npx ts-node scripts/02-seed-roles.ts');
    console.log('✅ Roles completed');

    // Step 3: Admin User
    console.log('\n👤 Step 3: Seeding Admin User...');
    console.log('=' .repeat(40));
    await execAsync('npx ts-node scripts/03-seed-admin.ts');
    console.log('✅ Admin user completed');

    // Step 4: Currencies
    console.log('\n💰 Step 4: Seeding Currencies...');
    console.log('=' .repeat(40));
    await execAsync('npx ts-node scripts/04-seed-currencies.ts');
    console.log('✅ Currencies completed');

    // Step 5: KPIs
    console.log('\n📈 Step 5: Seeding KPIs...');
    console.log('=' .repeat(40));
    await execAsync('npx ts-node scripts/05-seed-kpis.ts');
    console.log('✅ KPIs completed');

    // Step 6: Chart of Accounts
    console.log('\n📚 Step 6: Seeding Chart of Accounts...');
    console.log('=' .repeat(40));
    await execAsync('npx ts-node scripts/06-seed-chart-of-accounts.ts');
    console.log('✅ Chart of accounts completed');

    // Step 7: Vendors
    console.log('\n🏪 Step 7: Seeding Vendors...');
    console.log('=' .repeat(40));
    await execAsync('npx ts-node scripts/07-seed-vendors.ts');
    console.log('✅ Vendors completed');

    // Step 8: Customers
    console.log('\n👥 Step 8: Seeding Customers...');
    console.log('=' .repeat(40));
    await execAsync('npx ts-node scripts/08-seed-customers.ts');
    console.log('✅ Customers completed');

    // Step 9: Journal Entries
    console.log('\n📝 Step 9: Seeding Journal Entries...');
    console.log('=' .repeat(40));
    await execAsync('npx ts-node scripts/09-seed-journal-entries.ts');
    console.log('✅ Journal entries completed');

    console.log('\n🎉 ALL SEEDERS COMPLETED SUCCESSFULLY!');
    console.log('=' .repeat(60));
    console.log('Your system is now fully seeded and ready for use!');
    console.log('\n🔑 Admin Credentials:');
    console.log('   Email: admin@nvccz.co.zw');
    console.log('   Password: admin123');
    console.log('   Role: admin');
    console.log('   Department: Operations');
    console.log('\n📊 What was created:');
    console.log('   ✅ 8 departments with 40 roles');
    console.log('   ✅ 1 admin user with full permissions');
    console.log('   ✅ 2 currencies (USD, ZWL)');
    console.log('   ✅ 27 KPIs for performance tracking');
    console.log('   ✅ Complete chart of accounts');
    console.log('   ✅ 8 vendors and 8 customers');
    console.log('   ✅ 10 sample journal entries');
    console.log('\n🎯 System is ready for use!');

  } catch (error) {
    console.error('❌ Error running seeders:', error);
    console.log('\n💡 You can run individual seeders if needed:');
    console.log('   npx ts-node scripts/01-seed-departments.ts');
    console.log('   npx ts-node scripts/02-seed-roles.ts');
    console.log('   npx ts-node scripts/03-seed-admin.ts');
    console.log('   npx ts-node scripts/04-seed-currencies.ts');
    console.log('   npx ts-node scripts/05-seed-kpis.ts');
    console.log('   npx ts-node scripts/06-seed-chart-of-accounts.ts');
    console.log('   npx ts-node scripts/07-seed-vendors.ts');
    console.log('   npx ts-node scripts/08-seed-customers.ts');
    console.log('   npx ts-node scripts/09-seed-journal-entries.ts');
    throw error;
  }
}

async function main() {
  try {
    await runAllSeeders();
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
