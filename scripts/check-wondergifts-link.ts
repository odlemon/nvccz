// @ts-nocheck
/**
 * Detailed check for Wondergifts user and company linkage
 */

import { prisma } from '../src/utils/database';

async function checkWondergiftsLink() {
  try {
    const email = 'wondergiftsamazon@gmail.com';
    
    console.log('🔍 Detailed check for Wondergifts linkage\n');

    const user = await prisma.user.findFirst({
      where: { email }
    });

    const portfolioCompany = await prisma.portfolioCompany.findFirst({
      where: { name: 'Wondergifts' },
      include: {
        user: true
      }
    });

    console.log('════════════════════════════════════════════════════════════════');
    console.log('User Details:');
    console.log('════════════════════════════════════════════════════════════════');
    console.log(`User ID: ${user?.id}`);
    console.log(`User portfolioCompanyId: ${user?.portfolioCompanyId || 'NULL'}`);
    console.log('');

    console.log('════════════════════════════════════════════════════════════════');
    console.log('Portfolio Company Details:');
    console.log('════════════════════════════════════════════════════════════════');
    console.log(`Company ID: ${portfolioCompany?.id}`);
    console.log(`Company userId: ${portfolioCompany?.userId || 'NULL'}`);
    console.log(`Company linked user ID: ${portfolioCompany?.user?.id || 'NULL'}`);
    console.log(`Company linked user email: ${portfolioCompany?.user?.email || 'NULL'}`);
    console.log('');

    if (user && portfolioCompany) {
      console.log('════════════════════════════════════════════════════════════════');
      console.log('Linkage Analysis:');
      console.log('════════════════════════════════════════════════════════════════');
      
      const userIdMatches = portfolioCompany.userId === user.id;
      const companyIdMatches = user.portfolioCompanyId === portfolioCompany.id;
      
      console.log(`Portfolio Company userId matches User id: ${userIdMatches ? '✅ YES' : '❌ NO'}`);
      console.log(`User portfolioCompanyId matches Company id: ${companyIdMatches ? '✅ YES' : '❌ NO'}`);
      console.log('');

      if (!companyIdMatches && userIdMatches) {
        console.log('⚠️  ISSUE FOUND: Portfolio company is linked to user, but user is not linked back to company');
        console.log(`   Fix: Update user.portfolioCompanyId to: ${portfolioCompany.id}`);
        console.log('');
        
        // Offer to fix
        console.log('Would you like to fix this? (This will update the user to link to the company)');
        // For now, just show what needs to be done
      }
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

checkWondergiftsLink()
  .then(() => {
    console.log('\n✅ Check completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Check failed:', error);
    process.exit(1);
  });




