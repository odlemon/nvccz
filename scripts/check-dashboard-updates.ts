// @ts-nocheck
import { prisma } from '../src/utils/database';

async function checkDashboardUpdates() {
  try {
    console.log('🔍 Checking Dashboard Update Flow\n');
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
    const kpis = comp.financialKpis || {};
    const latestKpiValues = kpis.latestKpiValues || {};
    const latestValuation = kpis.latestValuation || {};

    console.log(`\n📊 Portfolio Company: ${comp.name}`);
    console.log('─'.repeat(80));

    console.log('\n📈 Latest KPI Values (used by dashboard):');
    console.log(`   PORTFOLIO_FAIR_VALUE: ${latestKpiValues.PORTFOLIO_FAIR_VALUE ?? '❌ Not set'}`);
    console.log(`   DIVIDEND_INCOME: ${latestKpiValues.DIVIDEND_INCOME ?? '❌ Not set'}`);
    console.log(`   TOTAL_REVENUE: ${latestKpiValues.TOTAL_REVENUE ?? '❌ Not set'}`);
    console.log(`   NET_PROFIT: ${latestKpiValues.NET_PROFIT ?? '❌ Not set'}`);
    console.log(`   CASH_FLOW_NET: ${latestKpiValues.CASH_FLOW_NET ?? '❌ Not set'}`);

    console.log('\n💰 Latest Valuation:');
    if (latestValuation.amount) {
      console.log(`   Amount: $${latestValuation.amount.toLocaleString()}`);
      console.log(`   Date: ${latestValuation.valuationDate}`);
      console.log(`   Difference: $${latestValuation.difference?.toLocaleString() ?? 'N/A'}`);
    } else {
      console.log('   ❌ No valuation recorded');
    }

    // Check approved reports
    const reports: any = await prisma.$queryRawUnsafe(`
      SELECT fr.id, fr.title, fr.periodStart, fr.periodEnd, fr.status, 
             fr.totalRevenue, fr.netProfit, fr.cashFlowNet,
             fr.reviewedAt, u.firstName, u.lastName
      FROM financial_reports fr
      LEFT JOIN users u ON u.id = fr.reviewerId
      WHERE fr.portfolioCompanyId = ?
        AND fr.status = 'ACCEPTED'
      ORDER BY fr.reviewedAt DESC
      LIMIT 5
    `, comp.id);

    console.log(`\n📋 Approved Reports (${reports.length} found):`);
    console.log('─'.repeat(80));
    
    reports.forEach((report: any, index: number) => {
      const periodEnd = new Date(report.periodEnd).toISOString().split('T')[0];
      console.log(`\n${index + 1}. ${report.title || 'Untitled'}`);
      console.log(`   Period End: ${periodEnd}`);
      console.log(`   Reviewed: ${report.reviewedAt ? new Date(report.reviewedAt).toLocaleString() : 'N/A'} by ${report.firstName || ''} ${report.lastName || ''}`);
      console.log(`   KPIs in report:`);
      console.log(`      TOTAL_REVENUE: ${report.totalRevenue ?? '❌ Not set'}`);
      console.log(`      NET_PROFIT: ${report.netProfit ?? '❌ Not set'}`);
      console.log(`      CASH_FLOW_NET: ${report.cashFlowNet ?? '❌ Not set'}`);
    });

    // Check period KPIs
    const periodKpis = kpis.kpiValues || {};
    const periods = Object.keys(periodKpis).sort().reverse();
    
    if (periods.length > 0) {
      console.log(`\n📅 Period-Specific KPIs:`);
      console.log('─'.repeat(80));
      periods.slice(0, 5).forEach(period => {
        const periodKpi = periodKpis[period];
        console.log(`\n   ${period}:`);
        if (periodKpi.TOTAL_REVENUE !== undefined) {
          console.log(`      TOTAL_REVENUE: ${periodKpi.TOTAL_REVENUE.toLocaleString()}`);
        }
        if (periodKpi.NET_PROFIT !== undefined) {
          console.log(`      NET_PROFIT: ${periodKpi.NET_PROFIT.toLocaleString()}`);
        }
        if (periodKpi.CASH_FLOW_NET !== undefined) {
          console.log(`      CASH_FLOW_NET: ${periodKpi.CASH_FLOW_NET.toLocaleString()}`);
        }
        if (periodKpi.PORTFOLIO_FAIR_VALUE !== undefined) {
          console.log(`      PORTFOLIO_FAIR_VALUE: ${periodKpi.PORTFOLIO_FAIR_VALUE.toLocaleString()}`);
        }
        if (periodKpi.DIVIDEND_INCOME !== undefined) {
          console.log(`      DIVIDEND_INCOME: ${periodKpi.DIVIDEND_INCOME.toLocaleString()}`);
        }
      });
    }

    // Check valuations
    const valuations: any = await prisma.$queryRawUnsafe(`
      SELECT id, previousAmount, newAmount, difference, valuationDate, journalEntryId
      FROM portfolio_company_valuations
      WHERE portfolioCompanyId = ?
      ORDER BY valuationDate DESC
      LIMIT 5
    `, comp.id);

    if (valuations.length > 0) {
      console.log(`\n💰 Valuation History:`);
      console.log('─'.repeat(80));
      valuations.forEach((val: any) => {
        console.log(`   ${val.valuationDate}: $${val.previousAmount.toLocaleString()} → $${val.newAmount.toLocaleString()} (diff: $${val.difference.toLocaleString()})`);
      });
    }

    // Check dividends
    const dividends: any = await prisma.$queryRawUnsafe(`
      SELECT id, amount, dividendDate, journalEntryId
      FROM portfolio_company_dividends
      WHERE portfolioCompanyId = ?
      ORDER BY dividendDate DESC
      LIMIT 5
    `, comp.id);

    if (dividends.length > 0) {
      console.log(`\n💵 Dividend History:`);
      console.log('─'.repeat(80));
      dividends.forEach((div: any) => {
        console.log(`   ${div.dividendDate}: $${div.amount.toLocaleString()}`);
      });
    }

    console.log('\n' + '='.repeat(80));
    console.log('\n📝 Summary:');
    console.log('─'.repeat(80));
    console.log('\n✅ Dashboard uses:');
    console.log('   - PORTFOLIO_FAIR_VALUE → for fairMarketValue');
    console.log('   - DIVIDEND_INCOME → for realized value');
    console.log('\n⚠️  Dashboard does NOT use:');
    console.log('   - TOTAL_REVENUE, NET_PROFIT, CASH_FLOW_NET from financial_reports table');
    console.log('   - These are stored in financial_reports but not synced to latestKpiValues');
    console.log('\n💡 To update dashboard:');
    console.log('   - Provide valuation mapping when approving → updates PORTFOLIO_FAIR_VALUE');
    console.log('   - Provide dividend mapping when approving → updates DIVIDEND_INCOME');
    console.log('   - Period KPIs (TOTAL_REVENUE, etc.) are saved separately via savePeriodKPIs endpoint');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

checkDashboardUpdates();
