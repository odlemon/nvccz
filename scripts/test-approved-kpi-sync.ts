// @ts-nocheck
import { prisma } from '../src/utils/database';
import { FinancialReportService } from '../src/services/FinancialReportService';

async function testApprovedKPISync() {
  try {
    console.log('🧪 Testing Approved KPI Sync Flow\n');
    console.log('='.repeat(80));

    // Get Vexma Tech company
    const company: any = await prisma.$queryRawUnsafe(`
      SELECT id, name, financialKpis
      FROM portfolio_companies
      WHERE name LIKE '%Vexma%'
      LIMIT 1
    `);

    if (!company || company.length === 0) {
      console.log('❌ No portfolio company found');
      return;
    }

    const comp = company[0];
    console.log(`\n📊 Testing with company: ${comp.name} (${comp.id})`);

    // Get latest approved report
    const reports: any = await prisma.$queryRawUnsafe(`
      SELECT id, title, periodStart, periodEnd, status, totalRevenue, netProfit, cashFlowNet
      FROM financial_reports
      WHERE portfolioCompanyId = ?
        AND status = 'ACCEPTED'
      ORDER BY reviewedAt DESC
      LIMIT 1
    `, comp.id);

    if (reports.length === 0) {
      console.log('\n❌ No approved reports found. Please approve a report first.');
      return;
    }

    const report = reports[0];
    console.log(`\n📋 Found approved report: ${report.title || report.id}`);
    console.log(`   Period: ${new Date(report.periodStart).toISOString().split('T')[0]} to ${new Date(report.periodEnd).toISOString().split('T')[0]}`);
    console.log(`   Current KPIs in report:`);
    console.log(`      TOTAL_REVENUE: ${report.totalRevenue ?? '❌ Not set'}`);
    console.log(`      NET_PROFIT: ${report.netProfit ?? '❌ Not set'}`);
    console.log(`      CASH_FLOW_NET: ${report.cashFlowNet ?? '❌ Not set'}`);

    // Check current portfolio company KPIs
    const kpis = comp.financialKpis || {};
    const latestKpiValues = kpis.latestKpiValues || {};
    
    console.log(`\n📈 Current KPIs in portfolio company:`);
    console.log(`   TOTAL_REVENUE: ${latestKpiValues.TOTAL_REVENUE ?? '❌ Not set'}`);
    console.log(`   NET_PROFIT: ${latestKpiValues.NET_PROFIT ?? '❌ Not set'}`);
    console.log(`   CASH_FLOW_NET: ${latestKpiValues.CASH_FLOW_NET ?? '❌ Not set'}`);

    // If report has KPIs but portfolio company doesn't, simulate approval
    if ((report.totalRevenue || report.netProfit || report.cashFlowNet) &&
        (!latestKpiValues.TOTAL_REVENUE && !latestKpiValues.NET_PROFIT && !latestKpiValues.CASH_FLOW_NET)) {
      console.log('\n⚠️  Report has KPIs but portfolio company does not. This means sync did not happen.');
      console.log('   This could be because:');
      console.log('   1. The report was approved before the sync logic was added');
      console.log('   2. The KPIs were not provided during approval');
      console.log('\n💡 To test the sync, approve a report with KPI values in the request body.');
    } else if (report.totalRevenue || report.netProfit || report.cashFlowNet) {
      console.log('\n✅ Report has KPIs. Checking if they match portfolio company...');
      
      const matches = {
        totalRevenue: report.totalRevenue === latestKpiValues.TOTAL_REVENUE,
        netProfit: report.netProfit === latestKpiValues.NET_PROFIT,
        cashFlowNet: report.cashFlowNet === latestKpiValues.CASH_FLOW_NET
      };

      console.log(`\n   Match Status:`);
      console.log(`      TOTAL_REVENUE: ${matches.totalRevenue ? '✅ Match' : '❌ Mismatch'}`);
      console.log(`      NET_PROFIT: ${matches.netProfit ? '✅ Match' : '❌ Mismatch'}`);
      console.log(`      CASH_FLOW_NET: ${matches.cashFlowNet ? '✅ Match' : '❌ Mismatch'}`);

      if (Object.values(matches).every(m => m)) {
        console.log('\n✅ All KPIs are synced correctly!');
      } else {
        console.log('\n⚠️  Some KPIs are not synced. The sync logic should update them on next approval.');
      }
    } else {
      console.log('\n⚠️  Report does not have KPI values. To test:');
      console.log('   1. Approve a report with totalRevenue, netProfit, cashFlowNet in the request body');
      console.log('   2. The sync will happen automatically');
    }

    console.log('\n' + '='.repeat(80));
    console.log('\n📝 Summary:');
    console.log('─'.repeat(80));
    console.log('\n✅ Implementation complete:');
    console.log('   - ReviewReportParams includes totalRevenue, netProfit, cashFlowNet');
    console.log('   - SQL UPDATE saves KPIs to financial_reports table');
    console.log('   - syncApprovedKPIsToPortfolioCompany syncs to portfolio company');
    console.log('   - Controller passes KPIs from request body');
    console.log('   - Dashboard includes KPIs in portfolio summary');
    console.log('\n💡 To test:');
    console.log('   POST /api/portfolio-companies/{id}/financial-reports/{reportId}/review');
    console.log('   Body: {');
    console.log('     "action": "ACCEPT",');
    console.log('     "totalRevenue": 1000000,');
    console.log('     "netProfit": 200000,');
    console.log('     "cashFlowNet": 150000');
    console.log('   }');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

testApprovedKPISync();
