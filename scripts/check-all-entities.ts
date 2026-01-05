import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkAllEntities() {
  try {
    console.log('🔍 Checking ALL entities that could be customers...\n');
    
    // Portfolio Companies
    const portfolioCompanies = await prisma.portfolioCompany.findMany({
      select: { id: true, name: true },
      take: 10
    });
    console.log(`📊 Portfolio Companies: ${portfolioCompanies.length}`);
    portfolioCompanies.forEach(pc => console.log(`   - ${pc.name}`));
    
    // Applicants
    const applicants = await prisma.applicant.findMany({
      select: { id: true, companyName: true },
      take: 10
    });
    console.log(`\n📊 Applicants: ${applicants.length}`);
    applicants.forEach(a => console.log(`   - ${a.companyName}`));
    
    // Check what the cashbook import validation is actually looking for
    console.log(`\n💡 The cashbook import looks for customers in the 'customers' table`);
    console.log(`   Current count: 0 customers`);
    console.log(`\n   If you have portfolio companies or applicants, they need to be`);
    console.log(`   created as customers in the customers table first.`);
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkAllEntities();

