// @ts-nocheck
import { prisma } from '../src/utils/database';

async function verifyDashboardFix() {
  try {
    console.log('✅ Verifying Dashboard Fix\n');
    console.log('='.repeat(80));

    // Get ZimFund
    const fund: any = await prisma.$queryRawUnsafe(`
      SELECT id, name
      FROM funds
      WHERE name LIKE '%ZimFund%' OR name LIKE '%zim%'
      LIMIT 1
    `);

    if (!fund || fund.length === 0) {
      console.log('❌ ZimFund not found');
      return;
    }

    const f = fund[0];
    console.log(`\n💰 Fund: ${f.name} (${f.id})`);

    // Check portfolio companies (using Prisma relation)
    const companiesViaRelation: any = await prisma.fund.findUnique({
      where: { id: f.id },
      include: {
        portfolioCompanies: {
          include: {
            investmentImplementation: {
              include: {
                fundDisbursements: true
              }
            }
          }
        }
      }
    });

    console.log(`\n📊 Portfolio Companies (via fund relation): ${companiesViaRelation?.portfolioCompanies?.length || 0}`);
    if (companiesViaRelation?.portfolioCompanies?.length > 0) {
      companiesViaRelation.portfolioCompanies.forEach((c: any, i: number) => {
        const disbursements = c.investmentImplementation?.fundDisbursements || [];
        const totalDisbursed = disbursements
          .filter((d: any) => d.status === 'DISBURSED')
          .reduce((sum: number, d: any) => {
            const amount = d.amount || 0;
            return sum + parseFloat(amount.toString());
          }, 0);
        
        console.log(`   ${i + 1}. ${c.name}`);
        console.log(`      Total Disbursed: $${totalDisbursed.toLocaleString()}`);
      });
    }

    // Also check direct query
    const companiesDirect: any = await prisma.$queryRawUnsafe(`
      SELECT id, name, fundId
      FROM portfolio_companies
      WHERE fundId = ?
    `, f.id);

    console.log(`\n📊 Portfolio Companies (direct query): ${companiesDirect.length}`);
    companiesDirect.forEach((c: any, i: number) => {
      console.log(`   ${i + 1}. ${c.name} (${c.id})`);
    });

    // Calculate total investment
    const totalInvestment: any = await prisma.$queryRawUnsafe(`
      SELECT SUM(fd.amount) as total
      FROM fund_disbursements fd
      JOIN investment_implementations ii ON ii.id = fd.investmentImplementationId
      JOIN portfolio_companies pc ON pc.id = ii.portfolioCompanyId
      WHERE pc.fundId = ? AND fd.status = 'DISBURSED'
    `, f.id);

    const total = parseFloat(totalInvestment[0]?.total?.toString() || '0');
    console.log(`\n💸 Total Investment (should show in dashboard): $${total.toLocaleString()}`);

    console.log('\n' + '='.repeat(80));
    console.log('\n✅ Expected Dashboard Values:');
    console.log('─'.repeat(80));
    console.log(`   portfolioSummary.length: ${companiesDirect.length} (should be > 0)`);
    console.log(`   totalInvestment: $${total.toLocaleString()} (should be $10,000)`);
    console.log(`   metrics.totalInvested: $${total.toLocaleString()} (should be $10,000)`);
    
    if (companiesDirect.length > 0 && total > 0) {
      console.log('\n✅ Dashboard should now show Vexma Tech correctly!');
    } else {
      console.log('\n⚠️  Still issues - check the data');
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

verifyDashboardFix();
