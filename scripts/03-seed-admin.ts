// @ts-nocheck
/**
 * Step 3: Seed Admin User
 * 
 * This script creates the admin user and assigns to Operations department.
 * Run this after departments and roles are created.
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function seedAdmin() {
  console.log('👤 Step 3: Seeding Admin User...');
  console.log('=' .repeat(50));

  try {
    // Check if admin user already exists
    const existingAdmin = await prisma.user.findFirst({
      where: { email: 'admin@nvccz.co.zw' }
    });

    if (existingAdmin) {
      console.log('✅ Admin user already exists, skipping...');
      console.log(`Found admin user: ${existingAdmin.firstName} ${existingAdmin.lastName} (${existingAdmin.email})`);
      return;
    }

    // Get Operations department
    const operationsDept = await prisma.department.findFirst({
      where: { name: 'Operations' }
    });

    if (!operationsDept) {
      throw new Error('Operations department not found. Please run departments seeder first.');
    }

    // Create admin role with full permissions
    const adminRole = await prisma.role.upsert({
      where: { name: 'admin' },
      update: {},
      create: {
        name: 'admin',
        description: 'Full access to all features',
        permissions: [
          { name: "view_dashboard", value: true },
          { name: "view_reports", value: true },
          { name: "view_structure", value: true },
          { name: "manage_structure", value: true },
          { name: "view_accounting", value: true },
          { name: "manage_accounting", value: true },
          { name: "view_financial_reports", value: true },
          { name: "manage_financial_reports", value: true },
          { name: "view_ledger", value: true },
          { name: "manage_ledger", value: true },
          { name: "manage_users", value: true },
          { name: "manage_roles", value: true },
          { name: "create_worklog", value: true },
          { name: "edit_worklog", value: true },
          { name: "delete_worklog", value: true },
          { name: "view_worklog", value: true },
          { name: "view_business_operations", value: true },
          { name: "manage_business_operations", value: true },
          { name: "view_company_data", value: true },
          { name: "manage_company_data", value: true },
          { name: "view_erp_reports", value: true },
          { name: "manage_erp_reports", value: true },
          { name: "view_subscription", value: true },
          { name: "manage_subscription", value: true },
          { name: "manage_firm_settings", value: true },
          { name: "bank_reconciliation", value: true }
        ]
      },
    });

    console.log('✅ Admin role created/updated');

    // Create admin user
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    const adminUser = await prisma.user.create({
      data: {
        firstName: 'Admin',
        lastName: 'User',
        email: 'admin@nvccz.co.zw',
        password: hashedPassword,
        roleId: adminRole.id,
        departmentId: operationsDept.id, // Assign to Operations department
      },
    });

    console.log('✅ Admin user created successfully!');
    console.log('\n🔑 Admin Credentials:');
    console.log('   Email: admin@nvccz.co.zw');
    console.log('   Password: admin123');
    console.log('   Role: admin');
    console.log('   Department: Operations');
    console.log('   Permissions: Full system access');

  } catch (error) {
    console.error('❌ Error seeding admin user:', error);
    throw error;
  }
}

async function main() {
  try {
    await seedAdmin();
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
