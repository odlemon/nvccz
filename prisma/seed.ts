import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { DEPARTMENTS } from '../src/config/hardcodedRoles';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Step 1: Create hardcoded departments
  console.log('🏢 Creating hardcoded departments...');
  const departments = await createHardcodedDepartments();

  // Step 2: Create admin role with full permissions
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

  console.log('✅ Admin role created:', adminRole.name);

  // Step 3: Create admin user assigned to Operations department
  const hashedPassword = await bcrypt.hash('admin123', 10);
  
  // Find Operations department
  const operationsDept = departments.find(dept => dept.name === 'Operations');
  if (!operationsDept) {
    throw new Error('Operations department not found');
  }
  
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@nvccz.co.zw' },
    update: {},
    create: {
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@nvccz.co.zw',
      password: hashedPassword,
      roleId: adminRole.id,
      departmentId: operationsDept.id, // Assign to Operations department
    },
  });

  console.log('✅ Admin user created:', adminUser.email);
  console.log('🔑 Admin credentials:');
  console.log('   Email: admin@nvccz.co.zw');
  console.log('   Password: admin123');
  console.log('   Role: admin');
  console.log('   Department: Operations');
}

async function createHardcodedDepartments() {
  const departments = [];
  
  for (const departmentName of DEPARTMENTS) {
    const department = await prisma.department.upsert({
      where: { name: departmentName },
      update: {},
      create: {
        name: departmentName,
        description: `${departmentName} Department`,
        isActive: true
      }
    });
    
    departments.push(department);
    console.log(`✅ Created department: ${department.name}`);
  }
  
  console.log(`🏢 Created ${departments.length} hardcoded departments`);
  return departments;
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 