// @ts-nocheck
/**
 * Fix the user-company linkage for Wondergifts
 */

import { prisma } from '../src/utils/database';

async function fixWondergiftsLink() {
  try {
    const email = 'wondergiftsamazon@gmail.com';
    
    console.log('🔧 Fixing Wondergifts user-company linkage\n');

    const user = await prisma.user.findFirst({
      where: { email }
    });

    const portfolioCompany = await prisma.portfolioCompany.findFirst({
      where: { name: 'Wondergifts' }
    });

    if (!user) {
      console.log('❌ User not found');
      return;
    }

    if (!portfolioCompany) {
      console.log('❌ Portfolio company not found');
      return;
    }

    console.log(`Updating user ${user.id} to link to company ${portfolioCompany.id}...`);

    // Update user to link to portfolio company
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        portfolioCompanyId: portfolioCompany.id
      }
    });

    console.log('✅ User updated successfully!');
    console.log(`   User ID: ${updatedUser.id}`);
    console.log(`   Portfolio Company ID: ${updatedUser.portfolioCompanyId}`);
    console.log('');

    // Verify the link
    const verifyUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        portfolioCompany: true
      }
    });

    console.log('════════════════════════════════════════════════════════════════');
    console.log('✅ Verification:');
    console.log('════════════════════════════════════════════════════════════════');
    console.log(`User: ${verifyUser.firstName} ${verifyUser.lastName}`);
    console.log(`Email: ${verifyUser.email}`);
    console.log(`Linked to Company: ${verifyUser.portfolioCompany?.name || 'None'}`);
    console.log('');

    console.log('✅ Linkage fixed successfully!');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

fixWondergiftsLink()
  .then(() => {
    console.log('\n✅ Fix completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fix failed:', error);
    process.exit(1);
  });






