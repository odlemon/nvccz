// @ts-nocheck
/**
 * Script to check if user and company profile exist for an applicant email
 */

import { prisma } from '../src/utils/database';

async function checkUserAndCompany(email: string) {
  try {
    console.log(`🔍 Checking user and company profile for: ${email}\n`);

    // Check application
    const application = await prisma.application.findFirst({
      where: {
        applicantEmail: email
      }
    });

    if (!application) {
      console.log('❌ No application found for this email\n');
      return;
    }

    console.log('════════════════════════════════════════════════════════════════');
    console.log('📋 Application Details');
    console.log('════════════════════════════════════════════════════════════════');
    console.log(`Business Name: ${application.businessName}`);
    console.log(`Applicant Name: ${application.applicantName}`);
    console.log(`Email: ${application.applicantEmail}`);
    console.log(`Current Stage: ${application.currentStage}`);
    console.log(`Application ID: ${application.id}`);
    console.log(`Portfolio Company ID: ${application.portfolioCompanyId || 'None'}`);
    console.log('');

    // Check user
    const user = await prisma.user.findFirst({
      where: {
        email: email
      },
      include: {
        role: true,
        portfolioCompany: true
      }
    });

    console.log('════════════════════════════════════════════════════════════════');
    console.log('👤 User Details');
    console.log('════════════════════════════════════════════════════════════════');
    
    if (!user) {
      console.log('❌ USER NOT FOUND - User was not created\n');
    } else {
      console.log(`✅ User exists!`);
      console.log(`User ID: ${user.id}`);
      console.log(`Name: ${user.firstName} ${user.lastName}`);
      console.log(`Email: ${user.email}`);
      console.log(`Role: ${user.role?.name || 'No role'}`);
      console.log(`Created At: ${user.createdAt}`);
      console.log(`Portfolio Company ID: ${user.portfolioCompanyId || 'None'}`);
      console.log('');
    }

    // Check portfolio company
    let portfolioCompany = null;
    
    if (application.portfolioCompanyId) {
      portfolioCompany = await prisma.portfolioCompany.findUnique({
        where: { id: application.portfolioCompanyId },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });
    } else if (user?.portfolioCompanyId) {
      portfolioCompany = await prisma.portfolioCompany.findUnique({
        where: { id: user.portfolioCompanyId },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });
    } else {
      // Try to find by business name
      portfolioCompany = await prisma.portfolioCompany.findFirst({
        where: {
          name: application.businessName
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });
    }

    console.log('════════════════════════════════════════════════════════════════');
    console.log('🏢 Portfolio Company Details');
    console.log('════════════════════════════════════════════════════════════════');
    
    if (!portfolioCompany) {
      console.log('❌ PORTFOLIO COMPANY NOT FOUND - Company was not created\n');
    } else {
      console.log(`✅ Portfolio Company exists!`);
      console.log(`Company ID: ${portfolioCompany.id}`);
      console.log(`Name: ${portfolioCompany.name}`);
      console.log(`Status: ${portfolioCompany.status}`);
      console.log(`Created At: ${portfolioCompany.createdAt}`);
      if (portfolioCompany.user) {
        console.log(`\n   Linked User: ${portfolioCompany.user.firstName} ${portfolioCompany.user.lastName} (${portfolioCompany.user.email})`);
      } else {
        console.log(`\n   No user linked to this company`);
      }
      console.log('');
    }

    // Check due diligence status
    const dueDiligence = await prisma.dueDiligenceReview.findUnique({
      where: { applicationId: application.id }
    });

    console.log('════════════════════════════════════════════════════════════════');
    console.log('📊 Due Diligence Status');
    console.log('════════════════════════════════════════════════════════════════');
    
    if (dueDiligence) {
      console.log(`Status: ${dueDiligence.status}`);
      console.log(`Completed At: ${dueDiligence.completedAt || 'Not completed'}`);
      console.log(`Recommendation: ${dueDiligence.recommendation || 'None'}`);
    } else {
      console.log('No due diligence record found');
    }
    console.log('');

    // Summary
    console.log('════════════════════════════════════════════════════════════════');
    console.log('📝 Summary');
    console.log('════════════════════════════════════════════════════════════════');
    
    const issues = [];
    if (!user) {
      issues.push('❌ User was not created');
    }
    if (!portfolioCompany) {
      issues.push('❌ Portfolio Company was not created');
    }
    if (user && !user.portfolioCompanyId) {
      issues.push('⚠️  User exists but not linked to portfolio company');
    }
    if (portfolioCompany && user && user.portfolioCompanyId !== portfolioCompany.id) {
      issues.push('⚠️  User and Portfolio Company IDs do not match');
    }
    if (application.currentStage === 'UNDER_DUE_DILIGENCE' && dueDiligence?.status === 'COMPLETED') {
      issues.push('⚠️  Due diligence is completed but application stage is still UNDER_DUE_DILIGENCE');
    }

    if (issues.length === 0) {
      console.log('✅ Everything looks good! User and company exist and are properly linked.');
    } else {
      console.log('⚠️  Issues found:');
      issues.forEach(issue => console.log(`   ${issue}`));
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Get email from command line or use default
const email = process.argv[2] || 'wondergiftsamazon@gmail.com';

// Run the check
checkUserAndCompany(email)
  .then(() => {
    console.log('\n✅ Check completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Check failed:', error);
    process.exit(1);
  });

