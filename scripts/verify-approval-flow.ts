// @ts-nocheck
import { prisma } from '../src/utils/database';

async function verifyApprovalFlow() {
  try {
    console.log('🔍 Verifying Financial Report Approval Flow\n');
    console.log('='.repeat(80));

    // Get a pending report
    const pendingReport: any = await prisma.$queryRawUnsafe(`
      SELECT fr.*, pc.name as companyName, pc.id as portfolioCompanyId
      FROM financial_reports fr
      JOIN portfolio_companies pc ON pc.id = fr.portfolioCompanyId
      WHERE fr.status = 'PENDING'
      ORDER BY fr.createdAt DESC
      LIMIT 1
    `);

    if (!pendingReport || pendingReport.length === 0) {
      console.log('⚠️  No pending reports found. Please submit a report first.');
      await prisma.$disconnect();
      return;
    }

    const report = pendingReport[0];
    const periodStartKey = new Date(report.periodStart).toISOString().split('T')[0];
    const periodEndKey = new Date(report.periodEnd).toISOString().split('T')[0];
    
    console.log(`\n📋 Found Pending Report:`);
    console.log(`   ID: ${report.id}`);
    console.log(`   Company: ${report.companyName}`);
    console.log(`   Period: ${periodStartKey} to ${periodEndKey}`);
    console.log(`   Type: ${report.reportType}`);
    console.log(`   Status: ${report.status}`);

    // Check period KPIs
    const periodKey = periodEndKey; // Use periodEnd as the key
    const company = await prisma.portfolioCompany.findUnique({
      where: { id: report.portfolioCompanyId },
      select: { financialKpis: true }
    });

    const kpiValues = company?.financialKpis?.kpiValues || {};
    const periodKPIs = kpiValues[periodKey] || {};

    console.log(`\n📊 Period KPIs for ${periodKey} (periodEnd):`);
    if (Object.keys(periodKPIs).length === 0) {
      console.log('   ⚠️  NO PERIOD KPIs FOUND for this period!');
      console.log('   ⚠️  You need to save period KPIs first using:');
      console.log(`   POST /api/applicant/financial-reports/period-kpis`);
      console.log(`   Body: {`);
      console.log(`     "periodStart": "${periodStartKey}",`);
      console.log(`     "periodEnd": "${periodEndKey}",`);
      console.log(`     "totalRevenue": 500000,`);
      console.log(`     "netProfit": 125000,`);
      console.log(`     "cashFlowNet": 150000`);
      console.log(`   }`);
      console.log(`\n   📋 Available period KPIs in database:`);
      const availablePeriods = Object.keys(kpiValues).sort().reverse().slice(0, 5);
      if (availablePeriods.length > 0) {
        availablePeriods.forEach(p => {
          const kpis = kpiValues[p];
          console.log(`   - ${p}:`);
          if (kpis.TOTAL_REVENUE) console.log(`     TOTAL_REVENUE: ${kpis.TOTAL_REVENUE}`);
          if (kpis.NET_PROFIT) console.log(`     NET_PROFIT: ${kpis.NET_PROFIT}`);
          if (kpis.CASH_FLOW_NET) console.log(`     CASH_FLOW_NET: ${kpis.CASH_FLOW_NET}`);
        });
      } else {
        console.log('     (none)');
      }
    } else {
      console.log(`   ✅ TOTAL_REVENUE: ${periodKPIs.TOTAL_REVENUE ?? 'null'}`);
      console.log(`   ✅ NET_PROFIT: ${periodKPIs.NET_PROFIT ?? 'null'}`);
      console.log(`   ✅ CASH_FLOW_NET: ${periodKPIs.CASH_FLOW_NET ?? 'null'}`);
    }

    // Check what will happen on approval
    console.log(`\n🔮 What Will Happen on Approval:`);
    console.log('─'.repeat(80));
    console.log('1. ✅ Report status will change: PENDING → ACCEPTED');
    console.log('2. ✅ Period KPIs are already saved (shown above) - they remain unchanged');
    console.log('3. ⚠️  Accounting entries will be created ONLY if mapping is provided:');
    console.log('   - Valuation adjustments (if mapping.valuationAdjustment provided)');
    console.log('     → Creates journal entry:');
    console.log('       • If gain: Debit Investment Asset (1502), Credit Unrealized Gain (4050)');
    console.log('       • If loss: Debit Unrealized Loss (6050), Credit Investment Asset (1502)');
    console.log('   - Dividend income (if mapping.dividends provided)');
    console.log('     → Creates journal entry:');
    console.log('       • Debit Cash (1000), Credit Dividend Income (4100)');
    console.log('4. ❌ NO accounting entries are created from totalRevenue/netProfit/cashFlowNet');
    console.log('   (These are just performance metrics, NOT accounting transactions)');
    console.log('   (They are stored in portfolioCompany.financialKpis for dashboards)');

    // Check if there are any existing journal entries for this company
    const journalEntries: any = await prisma.$queryRawUnsafe(`
      SELECT je.id, je.referenceNumber, je.description, je.status, je.createdAt
      FROM journal_entries je
      WHERE je.description LIKE ?
      ORDER BY je.createdAt DESC
      LIMIT 5
    `, `%${report.companyName}%`);

    console.log(`\n📝 Recent Journal Entries for ${report.companyName}:`);
    if (journalEntries.length === 0) {
      console.log('   No journal entries found');
    } else {
      journalEntries.forEach((je: any) => {
        console.log(`   - ${je.referenceNumber}: ${je.description} (${je.status})`);
      });
    }

    // Check portfolio company valuations
    const valuations: any = await prisma.$queryRawUnsafe(`
      SELECT id, previousAmount, newAmount, difference, valuationDate, journalEntryId
      FROM portfolio_company_valuations
      WHERE portfolioCompanyId = ?
      ORDER BY valuationDate DESC
      LIMIT 3
    `, report.portfolioCompanyId);

    console.log(`\n💰 Recent Valuations:`);
    if (valuations.length === 0) {
      console.log('   No valuations found');
    } else {
      valuations.forEach((val: any) => {
        console.log(`   - ${val.valuationDate}: ${val.previousAmount} → ${val.newAmount} (diff: ${val.difference})`);
        console.log(`     Journal Entry: ${val.journalEntryId || 'none'}`);
      });
    }

    // Check dividends
    const dividends: any = await prisma.$queryRawUnsafe(`
      SELECT id, amount, dividendDate, journalEntryId
      FROM portfolio_company_dividends
      WHERE portfolioCompanyId = ?
      ORDER BY dividendDate DESC
      LIMIT 3
    `, report.portfolioCompanyId);

    console.log(`\n💵 Recent Dividends:`);
    if (dividends.length === 0) {
      console.log('   No dividends found');
    } else {
      dividends.forEach((div: any) => {
        console.log(`   - ${div.dividendDate}: $${div.amount} (Journal Entry: ${div.journalEntryId || 'none'})`);
      });
    }

    console.log('\n' + '='.repeat(80));
    console.log('\n✅ Verification complete!');
    console.log('\n📝 Summary:');
    console.log('   - Period KPIs should be saved BEFORE approval');
    console.log('   - Approval only creates accounting entries if mapping provided');
    console.log('   - KPIs (totalRevenue, netProfit, cashFlowNet) are metrics, not accounting entries');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

verifyApprovalFlow();
