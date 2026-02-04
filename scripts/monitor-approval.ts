// @ts-nocheck
import { prisma } from '../src/utils/database';

async function monitorApproval() {
  try {
    console.log('🔍 Monitoring Financial Report Approval\n');
    console.log('='.repeat(80));

    const reportId = process.argv[2];
    if (!reportId) {
      console.log('⚠️  Usage: npx ts-node scripts/monitor-approval.ts <reportId>');
      console.log('   Example: npx ts-node scripts/monitor-approval.ts bfb86185-dfc3-4cdb-8453-5ca544b4ffdd\n');
      
      // Get a pending report
      const pending: any = await prisma.$queryRawUnsafe(`
        SELECT id, title, status, periodEnd
        FROM financial_reports
        WHERE status = 'PENDING'
        ORDER BY createdAt DESC
        LIMIT 1
      `);
      
      if (pending && pending.length > 0) {
        console.log(`💡 Found pending report: ${pending[0].id}`);
        console.log(`   Title: ${pending[0].title}`);
        console.log(`   Period End: ${new Date(pending[0].periodEnd).toISOString().split('T')[0]}`);
      }
      
      await prisma.$disconnect();
      return;
    }

    console.log(`📋 Monitoring Report: ${reportId}\n`);

    // Get report before approval
    const reportBefore: any = await prisma.$queryRawUnsafe(`
      SELECT fr.*, pc.name as companyName, pc.id as portfolioCompanyId, pc.financialKpis
      FROM financial_reports fr
      JOIN portfolio_companies pc ON pc.id = fr.portfolioCompanyId
      WHERE fr.id = ?
      LIMIT 1
    `, reportId);

    if (!reportBefore || reportBefore.length === 0) {
      console.log('❌ Report not found');
      await prisma.$disconnect();
      return;
    }

    const report = reportBefore[0];
    const periodKey = new Date(report.periodEnd).toISOString().split('T')[0];
    const kpiValues = report.financialKpis?.kpiValues || {};
    const periodKPIs = kpiValues[periodKey] || {};

    console.log('📊 BEFORE APPROVAL:');
    console.log('─'.repeat(80));
    console.log(`Status: ${report.status}`);
    console.log(`Company: ${report.companyName}`);
    console.log(`Period: ${new Date(report.periodStart).toISOString().split('T')[0]} to ${periodKey}`);
    console.log(`\nPeriod KPIs:`);
    console.log(`  TOTAL_REVENUE: ${periodKPIs.TOTAL_REVENUE ?? 'null'}`);
    console.log(`  NET_PROFIT: ${periodKPIs.NET_PROFIT ?? 'null'}`);
    console.log(`  CASH_FLOW_NET: ${periodKPIs.CASH_FLOW_NET ?? 'null'}`);

    // Count journal entries before
    const journalEntriesBefore: any = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as count
      FROM journal_entries
      WHERE description LIKE ?
    `, `%${report.companyName}%`);

    const valuationsBefore: any = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as count
      FROM portfolio_company_valuations
      WHERE portfolioCompanyId = ?
    `, report.portfolioCompanyId);

    const dividendsBefore: any = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as count
      FROM portfolio_company_dividends
      WHERE portfolioCompanyId = ?
    `, report.portfolioCompanyId);

    console.log(`\n📝 Current Counts:`);
    console.log(`  Journal Entries: ${journalEntriesBefore[0]?.count || 0}`);
    console.log(`  Valuations: ${valuationsBefore[0]?.count || 0}`);
    console.log(`  Dividends: ${dividendsBefore[0]?.count || 0}`);

    console.log('\n' + '='.repeat(80));
    console.log('\n⏳ Waiting for approval...');
    console.log('   (Run the approval API call, then press Enter to check results)');
    console.log('   Or run: node -e "setTimeout(() => process.exit(0), 5000)" && npx ts-node scripts/monitor-approval.ts ' + reportId);
    
    // Wait a bit for user to approve
    await new Promise(resolve => setTimeout(resolve, 10000));

    console.log('\n📊 AFTER APPROVAL:');
    console.log('─'.repeat(80));

    // Get report after approval
    const reportAfter: any = await prisma.$queryRawUnsafe(`
      SELECT fr.*, pc.name as companyName, pc.financialKpis
      FROM financial_reports fr
      JOIN portfolio_companies pc ON pc.id = fr.portfolioCompanyId
      WHERE fr.id = ?
      LIMIT 1
    `, reportId);

    const reportAfterData = reportAfter[0];
    const kpiValuesAfter = reportAfterData.financialKpis?.kpiValues || {};
    const periodKPIsAfter = kpiValuesAfter[periodKey] || {};

    console.log(`Status: ${reportAfterData.status}`);
    console.log(`Reviewed At: ${reportAfterData.reviewedAt || 'null'}`);
    console.log(`Reviewer ID: ${reportAfterData.reviewerId || 'null'}`);

    console.log(`\nPeriod KPIs (should be unchanged):`);
    console.log(`  TOTAL_REVENUE: ${periodKPIsAfter.TOTAL_REVENUE ?? 'null'} ${periodKPIsAfter.TOTAL_REVENUE === periodKPIs.TOTAL_REVENUE ? '✅' : '⚠️'}`);
    console.log(`  NET_PROFIT: ${periodKPIsAfter.NET_PROFIT ?? 'null'} ${periodKPIsAfter.NET_PROFIT === periodKPIs.NET_PROFIT ? '✅' : '⚠️'}`);
    console.log(`  CASH_FLOW_NET: ${periodKPIsAfter.CASH_FLOW_NET ?? 'null'} ${periodKPIsAfter.CASH_FLOW_NET === periodKPIs.CASH_FLOW_NET ? '✅' : '⚠️'}`);

    // Count journal entries after
    const journalEntriesAfter: any = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as count
      FROM journal_entries
      WHERE description LIKE ?
    `, `%${report.companyName}%`);

    const valuationsAfter: any = await prisma.$queryRawUnsafe(`
      SELECT id, previousAmount, newAmount, difference, valuationDate, journalEntryId
      FROM portfolio_company_valuations
      WHERE portfolioCompanyId = ?
      ORDER BY valuationDate DESC
      LIMIT 5
    `, report.portfolioCompanyId);

    const dividendsAfter: any = await prisma.$queryRawUnsafe(`
      SELECT id, amount, dividendDate, journalEntryId
      FROM portfolio_company_dividends
      WHERE portfolioCompanyId = ?
      ORDER BY dividendDate DESC
      LIMIT 5
    `, report.portfolioCompanyId);

    const newJournalCount = (journalEntriesAfter[0]?.count || 0) - (journalEntriesBefore[0]?.count || 0);
    const newValuationCount = valuationsAfter.length - (valuationsBefore[0]?.count || 0);
    const newDividendCount = dividendsAfter.length - (dividendsBefore[0]?.count || 0);

    console.log(`\n📝 New Items Created:`);
    console.log(`  Journal Entries: +${newJournalCount} ${newJournalCount > 0 ? '✅' : '⚠️ (none - expected if no mapping provided)'}`);
    console.log(`  Valuations: +${newValuationCount} ${newValuationCount > 0 ? '✅' : '⚠️ (none - expected if no mapping.valuationAdjustment provided)'}`);
    console.log(`  Dividends: +${newDividendCount} ${newDividendCount > 0 ? '✅' : '⚠️ (none - expected if no mapping.dividends provided)'}`);

    if (valuationsAfter.length > 0) {
      console.log(`\n💰 New Valuations:`);
      valuationsAfter.slice(0, 3).forEach((val: any) => {
        console.log(`  - ${val.valuationDate}: ${val.previousAmount} → ${val.newAmount} (diff: ${val.difference})`);
        console.log(`    Journal Entry ID: ${val.journalEntryId || 'none'}`);
      });
    }

    if (dividendsAfter.length > 0) {
      console.log(`\n💵 New Dividends:`);
      dividendsAfter.slice(0, 3).forEach((div: any) => {
        console.log(`  - ${div.dividendDate}: $${div.amount}`);
        console.log(`    Journal Entry ID: ${div.journalEntryId || 'none'}`);
      });
    }

    // Get new journal entries
    if (newJournalCount > 0) {
      const newJournalEntries: any = await prisma.$queryRawUnsafe(`
        SELECT je.id, je.referenceNumber, je.description, je.status, je.createdAt,
               GROUP_CONCAT(CONCAT(jel.chartOfAccountId, ':', jel.debitAmount, ':', jel.creditAmount) SEPARATOR '|') as lines
        FROM journal_entries je
        LEFT JOIN journal_entry_lines jel ON jel.journalEntryId = je.id
        WHERE je.description LIKE ?
          AND je.createdAt >= DATE_SUB(NOW(), INTERVAL 1 MINUTE)
        GROUP BY je.id
        ORDER BY je.createdAt DESC
        LIMIT 5
      `, `%${report.companyName}%`);

      console.log(`\n📝 New Journal Entries:`);
      newJournalEntries.forEach((je: any) => {
        console.log(`  - ${je.referenceNumber}: ${je.description}`);
        console.log(`    Status: ${je.status}`);
        console.log(`    Created: ${je.createdAt}`);
        if (je.lines) {
          console.log(`    Lines: ${je.lines}`);
        }
      });
    }

    console.log('\n' + '='.repeat(80));
    console.log('\n✅ Monitoring complete!');
    console.log('\n📝 Summary:');
    console.log('   - Period KPIs remain unchanged (they are saved separately)');
    console.log('   - Accounting entries created ONLY if mapping provided');
    console.log('   - KPI values (totalRevenue, netProfit, cashFlowNet) do NOT create accounting entries');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

monitorApproval();
