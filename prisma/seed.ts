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
        { name: "view_pricing", value: true },
        { name: "manage_pricing", value: true },
        { name: "view_billing_settings", value: true },
        { name: "manage_billing_settings", value: true },
        { name: "manage_users", value: true },
        { name: "manage_roles", value: true },
        { name: "view_billing", value: true },
        { name: "manage_billing", value: true },
        { name: "create_worklog", value: true },
        { name: "edit_worklog", value: true },
        { name: "delete_worklog", value: true },
        { name: "view_worklog", value: true },
        { name: "view_payments", value: true },
        { name: "manage_payments", value: true },
        { name: "view_invoices", value: true },
        { name: "create_invoice", value: true },
        { name: "edit_invoice", value: true },
        { name: "delete_invoice", value: true },
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