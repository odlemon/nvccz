// Manual Database Update Script
// Updates all PENDING status to APPROVED in portfolio_companies table
// Run this script manually: node update-portfolio-company-status.js

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function updatePortfolioCompanyStatus() {
  console.log('🔄 Starting database update: Portfolio Company Status PENDING → APPROVED');
  console.log('================================================\n');

  try {
    // Check current PENDING portfolio companies
    const pendingCompanies = await prisma.portfolioCompany.findMany({
      where: {
        status: 'PENDING'
      },
      select: {
        id: true,
        name: true,
        registrationNumber: true,
        status: true,
        industry: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            email: true,
            firstName: true,
            lastName: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    console.log(`📊 Found ${pendingCompanies.length} portfolio companies with PENDING status\n`);

    if (pendingCompanies.length === 0) {
      console.log('✅ No portfolio companies to update. All companies are already approved or have a different status.');
      
      // Show all companies and their statuses for reference
      const allCompanies = await prisma.portfolioCompany.findMany({
        select: {
          id: true,
          name: true,
          status: true,
          createdAt: true
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      if (allCompanies.length > 0) {
        console.log('\n📋 Current status of all portfolio companies:');
        console.log('---------------------------------------------');
        const statusCounts = {};
        allCompanies.forEach((company) => {
          statusCounts[company.status] = (statusCounts[company.status] || 0) + 1;
          console.log(`  ${company.name} - Status: ${company.status}`);
        });
        console.log('\n📊 Status Summary:');
        Object.entries(statusCounts).forEach(([status, count]) => {
          console.log(`  ${status}: ${count}`);
        });
      }
      
      return;
    }

    // Display companies that will be updated
    console.log('Portfolio Companies to be updated:');
    console.log('-----------------------------------');
    pendingCompanies.forEach((company, index) => {
      console.log(`${index + 1}. ${company.name}`);
      console.log(`   ID: ${company.id}`);
      console.log(`   Registration Number: ${company.registrationNumber}`);
      console.log(`   Industry: ${company.industry}`);
      console.log(`   User: ${company.user?.firstName || ''} ${company.user?.lastName || ''} (${company.user?.email || 'N/A'})`);
      console.log(`   Current Status: ${company.status}`);
      console.log(`   Created: ${company.createdAt.toISOString()}\n`);
    });

    // Update all PENDING to APPROVED
    console.log('🔄 Updating portfolio companies...\n');

    const updateResult = await prisma.portfolioCompany.updateMany({
      where: {
        status: 'PENDING'
      },
      data: {
        status: 'APPROVED',
        updatedAt: new Date()
      }
    });

    console.log(`✅ Successfully updated ${updateResult.count} portfolio company/companies!\n`);

    // Verify the update
    console.log('🔍 Verifying updates...\n');
    const updatedCompanies = await prisma.portfolioCompany.findMany({
      where: {
        status: 'APPROVED',
        updatedAt: {
          gte: new Date(Date.now() - 60000) // Updated in the last minute
        }
      },
      select: {
        id: true,
        name: true,
        status: true,
        updatedAt: true
      }
    });

    console.log(`✅ Verified: ${updatedCompanies.length} companies now have APPROVED status\n`);

    // Show final status summary
    const allCompaniesAfter = await prisma.portfolioCompany.findMany({
      select: {
        status: true
      }
    });

    const finalStatusCounts = {};
    allCompaniesAfter.forEach((company) => {
      finalStatusCounts[company.status] = (finalStatusCounts[company.status] || 0) + 1;
    });

    console.log('📊 Final Status Summary:');
    console.log('------------------------');
    Object.entries(finalStatusCounts).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`);
    });

    console.log('\n✅ Update completed successfully!');

  } catch (error) {
    console.error('\n❌ Error updating portfolio companies:');
    console.error(error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the update
updatePortfolioCompanyStatus()
  .then(() => {
    console.log('\n✅ Script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

