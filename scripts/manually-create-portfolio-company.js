// Script to manually create portfolio company for blessingmwalein@gmail.com
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

async function createPortfolioCompany() {
  const email = 'blessingmwalein@gmail.com';
  const applicationId = 'cmhlohjv60000l7044g2u0kxb';
  
  try {
    console.log('🔧 Manually creating portfolio company...\n');
    
    // Get application
    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        fund: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    if (!application) {
      console.error('❌ Application not found!');
      return;
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { email: email }
    });

    if (!user) {
      console.error('❌ User not found!');
      return;
    }

    // Check if portfolio company already exists
    const existingCompany = await prisma.portfolioCompany.findUnique({
      where: { userId: user.id }
    });

    if (existingCompany) {
      console.log('✅ Portfolio company already exists!');
      console.log(`Company ID: ${existingCompany.id}`);
      console.log(`Company Name: ${existingCompany.name}`);
      return;
    }

    // Create portfolio company
    console.log('Creating portfolio company...');
    const portfolioCompany = await prisma.portfolioCompany.create({
      data: {
        userId: user.id,
        name: application.businessName,
        registrationNumber: `REG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        industry: application.industry || 'Technology',
        foundingDate: application.foundingDate || new Date(),
        address: application.applicantAddress || 'Address not provided',
        website: null,
        description: application.businessDescription,
        logoUrl: null,
        status: "PENDING",
        companySize: application.businessStage === 'STARTUP' ? 'SMALL' : 
                    application.businessStage === 'OPERATIONAL' ? 'MEDIUM' : 'SMALL',
        employeeCount: null,
        annualRevenue: null,
        fundingStage: "SEED",
        contactPerson: application.applicantName,
        contactPhone: application.applicantPhone,
        contactEmail: application.applicantEmail,
        socialMedia: {},
        fundId: application.fundId || null
      }
    });

    console.log('\n✅ Portfolio Company Created Successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Company ID: ${portfolioCompany.id}`);
    console.log(`Company Name: ${portfolioCompany.name}`);
    console.log(`User ID: ${portfolioCompany.userId}`);
    console.log(`Registration Number: ${portfolioCompany.registrationNumber}`);
    console.log(`Industry: ${portfolioCompany.industry}`);
    console.log(`Status: ${portfolioCompany.status}`);
    console.log(`Fund ID: ${portfolioCompany.fundId || 'None'}`);
    
    // Check if there's an investment implementation
    const investmentImpl = await prisma.investmentImplementation.findFirst({
      where: {
        applicationId: applicationId
      }
    });

    if (investmentImpl) {
      console.log('\n📋 Investment Implementation Found:');
      console.log(`Implementation ID: ${investmentImpl.id}`);
      console.log(`Status: ${investmentImpl.status}`);
      
      // Update investment implementation to link to portfolio company
      await prisma.investmentImplementation.update({
        where: { id: investmentImpl.id },
        data: {
          portfolioCompanyId: portfolioCompany.id
        }
      });
      
      console.log('\n✅ Linked Investment Implementation to Portfolio Company');
    }

    console.log('\n✅ All done! Portfolio company is now created and linked.');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

createPortfolioCompany();

