// @ts-nocheck
import { prisma } from '../src/utils/database';

async function checkAllData() {
  try {
    console.log('🔍 Checking All Financial Report Data\n');
    console.log('='.repeat(80));

    // Get all reports for Vexma Tech
    const reports: any = await prisma.$queryRawUnsafe(`
      SELECT fr.*, pc.name as companyName, u.firstName, u.lastName
      FROM financial_reports fr
      JOIN portfolio_companies pc ON pc.id = fr.portfolioCompanyId
      LEFT JOIN users u ON u.id = fr.reviewerId
      WHERE fr.portfolioCompanyId = (
        SELECT id FROM portfolio_companies WHERE name LIKE '%Vexma%' LIMIT 1
      )
      ORDER BY fr.createdAt DESC
      LIMIT 10
    `);

    console.log(`\n📋 Financial Reports (${reports.length} found):`);
    console.log('─'.repeat(80));
    
    reports.forEach((report: any, index: number) => {
      const periodStart = new Date(report.periodStart).toISOString().split('T')[0];
      const periodEnd = new Date(report.periodEnd).toISOString().split('T')[0];
      console.log(`\n${index + 1}. ${report.title || 'Untitled Report'}`);
      console.log(`   ID: ${report.id}`);
      console.log(`   Type: ${report.reportType}`);
      console.log(`   Period: ${periodStart} to ${periodEnd}`);
      console.log(`   Status: ${report.status}`);
      console.log(`   Created: ${new Date(report.createdAt).toLocaleString()}`);
      if (report.reviewedAt) {
        console.log(`   Reviewed: ${new Date(report.reviewedAt).toLocaleString()} by ${report.firstName || ''} ${report.lastName || ''}`);
      }
      console.log(`   File: ${report.reportUrl ? '✅' : '❌'}`);
    });

    // Get portfolio company KPIs
    const company: any = await prisma.$queryRawUnsafe(`
      SELECT id, name, financialKpis
      FROM portfolio_companies
      WHERE name LIKE '%Vexma%'
      LIMIT 1
    `);

    if (company && company.length > 0) {
      const comp = company[0];
      const kpis = comp.financialKpis || {};
      const kpiValues = kpis.kpiValues || {};
      const latestKpiValues = kpis.latestKpiValues || {};

      console.log(`\n📊 Portfolio Company KPIs (${comp.name}):`);
      console.log('─'.repeat(80));
      
      const periods = Object.keys(kpiValues).sort().reverse();
      if (periods.length > 0) {
        console.log('\n📅 Period-Specific KPIs:');
        periods.forEach(period => {
          const periodKpis = kpiValues[period];
          console.log(`\n   ${period}:`);
          if (periodKpis.TOTAL_REVENUE !== undefined) {
            console.log(`      TOTAL_REVENUE: ${periodKpis.TOTAL_REVENUE.toLocaleString()}`);
          }
          if (periodKpis.NET_PROFIT !== undefined) {
            console.log(`      NET_PROFIT: ${periodKpis.NET_PROFIT.toLocaleString()}`);
          }
          if (periodKpis.CASH_FLOW_NET !== undefined) {
            console.log(`      CASH_FLOW_NET: ${periodKpis.CASH_FLOW_NET.toLocaleString()}`);
          }
        });
      }

      if (Object.keys(latestKpiValues).length > 0) {
        console.log('\n📊 Latest KPI Values:');
        if (latestKpiValues.TOTAL_REVENUE !== undefined) {
          console.log(`   TOTAL_REVENUE: ${latestKpiValues.TOTAL_REVENUE.toLocaleString()}`);
        }
        if (latestKpiValues.NET_PROFIT !== undefined) {
          console.log(`   NET_PROFIT: ${latestKpiValues.NET_PROFIT.toLocaleString()}`);
        }
        if (latestKpiValues.CASH_FLOW_NET !== undefined) {
          console.log(`   CASH_FLOW_NET: ${latestKpiValues.CASH_FLOW_NET.toLocaleString()}`);
        }
      }
    }

    // Check accounting entries
    console.log(`\n📝 Accounting Entries:`);
    console.log('─'.repeat(80));
    
    const journalEntries: any = await prisma.$queryRawUnsafe(`
      SELECT je.id, je.referenceNumber, je.description, je.status, je.createdAt,
             COUNT(jel.id) as lineCount
      FROM journal_entries je
      LEFT JOIN journal_entry_lines jel ON jel.journalEntryId = je.id
      WHERE je.description LIKE '%Vexma%'
      GROUP BY je.id
      ORDER BY je.createdAt DESC
      LIMIT 10
    `);

    if (journalEntries.length > 0) {
      journalEntries.forEach((je: any) => {
        console.log(`   - ${je.referenceNumber}: ${je.description}`);
        console.log(`     Status: ${je.status}, Lines: ${je.lineCount}, Created: ${new Date(je.createdAt).toLocaleString()}`);
      });
    } else {
      console.log('   No journal entries found for this company');
    }

    // Check valuations
    const valuations: any = await prisma.$queryRawUnsafe(`
      SELECT id, previousAmount, newAmount, difference, valuationDate, journalEntryId
      FROM portfolio_company_valuations
      WHERE portfolioCompanyId = (
        SELECT id FROM portfolio_companies WHERE name LIKE '%Vexma%' LIMIT 1
      )
      ORDER BY valuationDate DESC
      LIMIT 5
    `);

    if (valuations.length > 0) {
      console.log(`\n💰 Valuations:`);
      console.log('─'.repeat(80));
      valuations.forEach((val: any) => {
        console.log(`   - ${val.valuationDate}: ${val.previousAmount} → ${val.newAmount} (diff: ${val.difference})`);
        console.log(`     Journal Entry: ${val.journalEntryId || 'none'}`);
      });
    }

    // Check dividends
    const dividends: any = await prisma.$queryRawUnsafe(`
      SELECT id, amount, dividendDate, journalEntryId
      FROM portfolio_company_dividends
      WHERE portfolioCompanyId = (
        SELECT id FROM portfolio_companies WHERE name LIKE '%Vexma%' LIMIT 1
      )
      ORDER BY dividendDate DESC
      LIMIT 5
    `);

    if (dividends.length > 0) {
      console.log(`\n💵 Dividends:`);
      console.log('─'.repeat(80));
      dividends.forEach((div: any) => {
        console.log(`   - ${div.dividendDate}: $${div.amount.toLocaleString()}`);
        console.log(`     Journal Entry: ${div.journalEntryId || 'none'}`);
      });
    }

    console.log('\n' + '='.repeat(80));
    console.log('\n✅ Data check complete!');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

checkAllData();
