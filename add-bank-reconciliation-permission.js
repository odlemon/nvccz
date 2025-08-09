const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function addBankReconciliationPermission() {
  try {
    console.log('🔧 Adding bank_reconciliation permission to admin role...');
    
    // Get the admin role
    const adminRole = await prisma.role.findUnique({
      where: { name: 'admin' },
      include: { permissions: true }
    });
    
    if (!adminRole) {
      console.log('❌ Admin role not found');
      return;
    }
    
    console.log('✅ Found admin role:', adminRole.name);
    console.log('Current permissions:', adminRole.permissions.length);
    
    // Check if bank_reconciliation permission already exists
    const hasPermission = adminRole.permissions.some(p => p.name === 'bank_reconciliation');
    
    if (hasPermission) {
      console.log('✅ bank_reconciliation permission already exists');
    } else {
      // Add the bank_reconciliation permission
      await prisma.role.update({
        where: { id: adminRole.id },
        data: {
          permissions: {
            push: {
              name: 'bank_reconciliation',
              value: true
            }
          }
        }
      });
      
      console.log('✅ Added bank_reconciliation permission to admin role');
    }
    
    console.log('🎉 Permission update completed!');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

addBankReconciliationPermission(); 