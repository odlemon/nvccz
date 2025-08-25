const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function updateInvestmentImplementationFund() {
  try {
    console.log('🔍 Finding investment implementation to update...');
    
    // Find the investment implementation by portfolio company ID
    const implementation = await prisma.investmentImplementation.findUnique({
      where: { 
        portfolioCompanyId: 'cmeqjrfny0003unwk7jtou48s' 
      },
      include: {
        portfolioCompany: true,
        application: true
      }
    });

    if (!implementation) {
      console.log('❌ Investment implementation not found for portfolio company ID: cmeqjrfny0003unwk7jtou48s');
      return;
    }

    console.log('📋 Found investment implementation:');
    console.log(`   ID: ${implementation.id}`);
    console.log(`   Portfolio Company: ${implementation.portfolioCompany.name}`);
    console.log(`   Application: ${implementation.application.businessName}`);
    console.log(`   Current Fund ID: ${implementation.fundId || 'NULL'}`);

    // Update the investment implementation with the fund ID
    const updatedImplementation = await prisma.investmentImplementation.update({
      where: { 
        portfolioCompanyId: 'cmeqjrfny0003unwk7jtou48s' 
      },
      data: {
        fundId: 'cmeqtac630001une4wqqx0v8p'
      },
      include: {
        portfolioCompany: true,
        application: true,
        fund: true
      }
    });

    console.log('✅ Investment implementation updated successfully!');
    console.log(`   New Fund ID: ${updatedImplementation.fundId}`);
    console.log(`   Fund Name: ${updatedImplementation.fund?.name || 'N/A'}`);
    console.log(`   Portfolio Company: ${updatedImplementation.portfolioCompany.name}`);
    console.log(`   Application: ${updatedImplementation.application.businessName}`);

  } catch (error) {
    console.error('❌ Error updating investment implementation:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
updateInvestmentImplementationFund();
