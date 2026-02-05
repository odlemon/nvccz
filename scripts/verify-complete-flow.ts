// @ts-nocheck
import { prisma } from '../src/utils/database';
import { PortfolioDashboardService } from '../src/services/PortfolioDashboardService';

async function verifyCompleteFlow() {
  try {
    console.log('🔍 Verifying Complete Flow\n');
    console.log('='.repeat(80));

    // 1. Check ZimFund and its portfolio companies
    console.log('\n📊 Step 1: Checking Fund and Portfolio Companies');
    console.log('─'.repeat(80));
    
    const fund: any = await prisma.$queryRawUnsafe(`
      SELECT id, name, totalAmount, remainingAmount
      FROM funds
      WHERE name LIKE '%ZimFund%' OR name LIKE '%zim%'
      LIMIT 1
    `);

    if (!fund || fund.length === 0) {
      console.log('❌ ZimFund not found');
      return;
    }

    const f = fund[0];
    console.log(`✅ Fund: ${f.name} (${f.id})`);
    console.log(`   Total Amount: $${parseFloat(f.totalAmount?.toString() || '0').toLocaleString()}`);
    console.log(`   Remaining: $${parseFloat(f.remainingAmount?.toString() || '0').toLocaleString()}`);

    // Get portfolio companies via Prisma relation (like dashboard does)
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

    const companies = companiesViaRelation?.portfolioCompanies || [];
    console.log(`\n📊 Portfolio Companies: ${companies.length}`);
    
    if (companies.length === 0) {
      console.log('   ⚠️  No portfolio companies found');
    } else {
      companies.forEach((c: any, i: number) => {
        console.log(`\n   ${i + 1}. ${c.name} (${c.id})`);
        console.log(`      fundId: ${c.fundId || '❌ NULL'}`);
        console.log(`      Status: ${c.status || 'N/A'}`);
        
        const disbursements = c.investmentImplementation?.fundDisbursements || [];
        const totalDisbursed = disbursements
          .filter((d: any) => d.status === 'DISBURSED')
          .reduce((sum: number, d: any) => {
            const amount = d.amount || 0;
            return sum + parseFloat(amount.toString());
          }, 0);
        
        console.log(`      Total Disbursed: $${totalDisbursed.toLocaleString()}`);
        
        // Check KPIs
        const kpis = c.financialKpis || {};
        const latestKpis = kpis.latestKpiValues || {};
        console.log(`      Latest KPIs:`);
        console.log(`         TOTAL_REVENUE: ${latestKpis.TOTAL_REVENUE ?? '❌ Not set'}`);
        console.log(`         NET_PROFIT: ${latestKpis.NET_PROFIT ?? '❌ Not set'}`);
        console.log(`         CASH_FLOW_NET: ${latestKpis.CASH_FLOW_NET ?? '❌ Not set'}`);
        console.log(`         PORTFOLIO_FAIR_VALUE: ${latestKpis.PORTFOLIO_FAIR_VALUE ?? '❌ Not set'}`);
      });
    }

    // 2. Test Dashboard Service
    console.log('\n\n📈 Step 2: Testing Dashboard Service');
    console.log('─'.repeat(80));
    
    try {
      const dashboardData = await PortfolioDashboardService.getDashboardData({
        fundId: f.id
      });

      console.log(`✅ Dashboard generated successfully`);
      console.log(`\n📊 Dashboard Metrics:`);
      console.log(`   totalInvested: $${dashboardData.metrics.totalInvested.toLocaleString()}`);
      console.log(`   availableForDrawdown: $${dashboardData.metrics.availableForDrawdown.toLocaleString()}`);
      console.log(`   tvpi: ${dashboardData.metrics.tvpi}`);
      
      console.log(`\n📋 Portfolio Summary: ${dashboardData.portfolioSummary.length} companies`);
      if (dashboardData.portfolioSummary.length > 0) {
        dashboardData.portfolioSummary.forEach((company: any, i: number) => {
          console.log(`\n   ${i + 1}. ${company.name}`);
          console.log(`      totalInvestmentCost: $${company.totalInvestmentCost.toLocaleString()}`);
          console.log(`      fairMarketValue: $${company.fairMarketValue.toLocaleString()}`);
          console.log(`      totalValue: $${company.totalValue.toLocaleString()}`);
          console.log(`      KPIs:`);
          console.log(`         totalRevenue: ${company.totalRevenue !== null ? '$' + company.totalRevenue.toLocaleString() : 'null'}`);
          console.log(`         netProfit: ${company.netProfit !== null ? '$' + company.netProfit.toLocaleString() : 'null'}`);
          console.log(`         cashFlowNet: ${company.cashFlowNet !== null ? '$' + company.cashFlowNet.toLocaleString() : 'null'}`);
        });
      } else {
        console.log('   ⚠️  No companies in portfolio summary');
      }

      console.log(`\n💰 Performance Overview:`);
      console.log(`   paidIn: $${dashboardData.performanceOverview.paidIn.toLocaleString()}`);
      console.log(`   totalInvestment: $${dashboardData.performanceOverview.totalInvestment.toLocaleString()}`);
      console.log(`   fmvUnrealizedPortfolio: $${dashboardData.performanceOverview.fmvUnrealizedPortfolio.toLocaleString()}`);

    } catch (error: any) {
      console.log(`❌ Dashboard error: ${error.message}`);
      console.error(error.stack);
    }

    // 3. Check Disbursement Logic
    console.log('\n\n💸 Step 3: Checking Disbursement Logic');
    console.log('─'.repeat(80));
    
    const disbursements: any = await prisma.$queryRawUnsafe(`
      SELECT fd.id, fd.status, fd.amount, fd.fundId,
             pc.id as companyId, pc.name as companyName, pc.fundId as companyFundId
      FROM fund_disbursements fd
      JOIN investment_implementations ii ON ii.id = fd.investmentImplementationId
      JOIN portfolio_companies pc ON pc.id = ii.portfolioCompanyId
      WHERE fd.fundId = ?
      ORDER BY fd.createdAt DESC
      LIMIT 5
    `, f.id);

    console.log(`📋 Recent Disbursements: ${disbursements.length}`);
    if (disbursements.length > 0) {
      let allLinked = true;
      disbursements.forEach((d: any, i: number) => {
        const linked = d.companyFundId === d.fundId;
        if (!linked) allLinked = false;
        console.log(`\n   ${i + 1}. ${d.companyName}`);
        console.log(`      Amount: $${parseFloat(d.amount?.toString() || '0').toLocaleString()}`);
        console.log(`      Status: ${d.status}`);
        console.log(`      Disbursement fundId: ${d.fundId}`);
        console.log(`      Company fundId: ${d.companyFundId || '❌ NULL'}`);
        console.log(`      Linked: ${linked ? '✅' : '❌ MISMATCH'}`);
      });
      
      if (allLinked) {
        console.log(`\n✅ All disbursements have correctly linked companies`);
      } else {
        console.log(`\n⚠️  Some companies are not linked correctly`);
      }
    } else {
      console.log('   ⚠️  No disbursements found');
    }

    // 4. Check Financial Reports
    console.log('\n\n📄 Step 4: Checking Financial Reports');
    console.log('─'.repeat(80));
    
    const reports: any = await prisma.$queryRawUnsafe(`
      SELECT fr.id, fr.title, fr.status, fr.periodEnd,
             fr.totalRevenue, fr.netProfit, fr.cashFlowNet,
             pc.id as companyId, pc.name as companyName
      FROM financial_reports fr
      JOIN portfolio_companies pc ON pc.id = fr.portfolioCompanyId
      WHERE pc.fundId = ?
        AND fr.status = 'ACCEPTED'
      ORDER BY fr.reviewedAt DESC
      LIMIT 5
    `, f.id);

    console.log(`📋 Approved Reports: ${reports.length}`);
    if (reports.length > 0) {
      reports.forEach((r: any, i: number) => {
        console.log(`\n   ${i + 1}. ${r.title || 'Untitled'} (${r.companyName})`);
        console.log(`      Period End: ${new Date(r.periodEnd).toISOString().split('T')[0]}`);
        console.log(`      KPIs in report:`);
        console.log(`         totalRevenue: ${r.totalRevenue ?? '❌ Not set'}`);
        console.log(`         netProfit: ${r.netProfit ?? '❌ Not set'}`);
        console.log(`         cashFlowNet: ${r.cashFlowNet ?? '❌ Not set'}`);
      });
    } else {
      console.log('   ⚠️  No approved reports found');
    }

    console.log('\n' + '='.repeat(80));
    console.log('\n✅ Flow Verification Summary:');
    console.log('─'.repeat(80));
    
    const checks = {
      fundExists: fund && fund.length > 0,
      companiesFound: companies.length > 0,
      allCompaniesLinked: companies.every((c: any) => c.fundId === f.id),
      dashboardWorks: false,
      disbursementsLinked: disbursements.length === 0 || disbursements.every((d: any) => d.companyFundId === d.fundId)
    };

    try {
      const testDashboard = await PortfolioDashboardService.getDashboardData({ fundId: f.id });
      checks.dashboardWorks = true;
    } catch (e) {
      checks.dashboardWorks = false;
    }

    console.log(`\n✅ Checks:`);
    console.log(`   Fund exists: ${checks.fundExists ? '✅' : '❌'}`);
    console.log(`   Companies found: ${checks.companiesFound ? '✅' : '⚠️'}`);
    console.log(`   All companies linked: ${checks.allCompaniesLinked ? '✅' : '❌'}`);
    console.log(`   Dashboard works: ${checks.dashboardWorks ? '✅' : '❌'}`);
    console.log(`   Disbursements linked: ${checks.disbursementsLinked ? '✅' : '❌'}`);

    const allGood = Object.values(checks).every(v => v);
    
    if (allGood) {
      console.log(`\n🎉 All checks passed! The flow is working correctly.`);
    } else {
      console.log(`\n⚠️  Some checks failed. Review the issues above.`);
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

verifyCompleteFlow();
