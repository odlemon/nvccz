// @ts-nocheck
import { prisma } from '../src/utils/database';

async function fixApplicationFundId() {
  try {
    console.log('🔍 Finding applications with approved/disbursed disbursements but null fundId...\n');

    // Find applications that have approved or disbursed disbursements but fundId is null
    const applications: any = await prisma.$queryRawUnsafe(`
      SELECT DISTINCT
        a.id as applicationId,
        a.businessName,
        a.fundId as applicationFundId,
        fd.fundId as disbursementFundId,
        fd.status as disbursementStatus,
        ii.id as implementationId
      FROM applications a
      JOIN investment_implementations ii ON ii.applicationId = a.id
      JOIN fund_disbursements fd ON fd.investmentImplementationId = ii.id
      WHERE a.fundId IS NULL
        AND fd.status IN ('APPROVED', 'DISBURSED')
        AND fd.fundId IS NOT NULL
      ORDER BY a.businessName
    `);

    console.log(`📊 Found ${applications.length} application(s) that need fundId update:\n`);

    if (applications.length === 0) {
      console.log('✅ All applications have fundId set correctly!\n');
      await prisma.$disconnect();
      return;
    }

    // Group by application ID to get unique applications
    const applicationMap = new Map();
    applications.forEach((app: any) => {
      if (!applicationMap.has(app.applicationId)) {
        applicationMap.set(app.applicationId, {
          applicationId: app.applicationId,
          businessName: app.businessName,
          fundId: app.disbursementFundId,
          statuses: new Set()
        });
      }
      applicationMap.get(app.applicationId).statuses.add(app.disbursementStatus);
    });

    const uniqueApplications = Array.from(applicationMap.values());

    // Display applications that need fixing
    uniqueApplications.forEach((app: any, i: number) => {
      console.log(`   ${i + 1}. ${app.businessName}`);
      console.log(`      Application ID: ${app.applicationId}`);
      console.log(`      Current fundId: ${app.applicationFundId || '❌ NULL'}`);
      console.log(`      Should be fundId: ${app.fundId}`);
      console.log(`      Disbursement Statuses: ${Array.from(app.statuses).join(', ')}`);
      console.log('');
    });

    console.log('🔧 Fixing applications...\n');

    // Update each application
    for (const app of uniqueApplications) {
      await prisma.application.update({
        where: { id: app.applicationId },
        data: {
          fundId: app.fundId,
          updatedAt: new Date()
        }
      });
      console.log(`   ✅ Fixed ${app.businessName}: fundId = ${app.fundId}`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('\n✅ Summary:');
    console.log('─'.repeat(80));
    console.log(`   Fixed ${uniqueApplications.length} application(s)`);
    console.log('\n💡 Going forward:');
    console.log('   - When a disbursement is approved, application fundId will be set automatically');
    console.log('   - This ensures applications are always linked to their fund');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

fixApplicationFundId();
