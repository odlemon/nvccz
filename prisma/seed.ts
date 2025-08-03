import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

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
        { name: "manage_firm_settings", value: true }
      ]
    },
  });

  console.log('✅ Admin role created:', adminRole.name);

  // Create admin user
  const hashedPassword = await bcrypt.hash('admin123', 10);
  
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@nvccz.co.zw' },
    update: {},
    create: {
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@nvccz.co.zw',
      password: hashedPassword,
      roleId: adminRole.id,
    },
  });

  console.log('✅ Admin user created:', adminUser.email);
  console.log('🔑 Admin credentials:');
  console.log('   Email: admin@nvccz.co.zw');
  console.log('   Password: admin123');
  console.log('   Role: admin');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 