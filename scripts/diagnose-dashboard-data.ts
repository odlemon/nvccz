// @ts-nocheck
import { prisma } from '../src/utils/database';

async function diagnoseDashboard() {
  try {
    console.log('🔍 Diagnosing Dashboard Data\n');
    console.log('='.repeat(80));

    // Find ZimFund
    const fund: any = await prisma.$queryRawUnsafe(`
      SELECT id, name, totalAmount, remainingAmount, createdAt
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
    console.log(`   Total Amount: $${parseFloat(f.totalAmount?.toString() || '0').toLocaleString()}`);
    console.log(`   Remaining Amount: $${parseFloat(f.remainingAmount?.toString() || '0').toLocaleString()}`);
    console.log(`   Created: ${new Date(f.createdAt).toLocaleString()}`);

    // Check portfolio companies
    const companies: any = await prisma.$queryRawUnsafe(`
      SELECT id, name, fundId, status, startDate
      FROM portfolio_companies
      WHERE fundId = ?
    `, f.id);

    console.log(`\n📊 Portfolio Companies: ${companies.length}`);
    if (companies.length > 0) {
      companies.forEach((c: any, i: number) => {
        console.log(`   ${i + 1}. ${c.name} (${c.id})`);
        console.log(`      Status: ${c.status}`);
        console.log(`      Start Date: ${c.startDate ? new Date(c.startDate).toLocaleDateString() : 'N/A'}`);
      });
    } else {
      console.log('   ⚠️  No portfolio companies found for this fund');
    }

    // Check investment commitments
    const commitments: any = await prisma.$queryRawUnsafe(`
      SELECT id, amount, effectiveDate, status
      FROM investment_commitments
      WHERE fundId = ?
      ORDER BY effectiveDate ASC
    `, f.id);

    console.log(`\n💵 Investment Commitments: ${commitments.length}`);
    if (commitments.length > 0) {
      let totalCommitments = 0;
      commitments.forEach((c: any, i: number) => {
        const amount = parseFloat(c.amount?.toString() || '0');
        const year = c.effectiveDate ? new Date(c.effectiveDate).getFullYear() : 'N/A';
        totalCommitments += amount;
        console.log(`   ${i + 1}. $${amount.toLocaleString()} - ${year} (${c.status || 'N/A'})`);
      });
      console.log(`   Total: $${totalCommitments.toLocaleString()}`);
    } else {
      console.log('   ⚠️  No investment commitments found');
      console.log('   💡 This explains why J Curve shows 0 contributions');
      console.log('   💡 But paidIn shows 20M because fund.totalAmount is set');
    }

    // Check fund disbursements
    const disbursements: any = await prisma.$queryRawUnsafe(`
      SELECT ii.id, ii.totalCommittedAmount, 
             COUNT(fd.id) as disbursementCount,
             SUM(CASE WHEN fd.status = 'DISBURSED' THEN fd.amount ELSE 0 END) as totalDisbursed
      FROM investment_implementations ii
      LEFT JOIN fund_disbursements fd ON fd.investmentImplementationId = ii.id
      WHERE ii.portfolioCompanyId IN (
        SELECT id FROM portfolio_companies WHERE fundId = ?
      )
      GROUP BY ii.id
    `, f.id);

    console.log(`\n💸 Fund Disbursements: ${disbursements.length} investment implementations`);
    if (disbursements.length > 0) {
      let totalDisbursed = 0;
      disbursements.forEach((d: any, i: number) => {
        const disbursed = parseFloat(d.totalDisbursed?.toString() || '0');
        totalDisbursed += disbursed;
        console.log(`   ${i + 1}. $${disbursed.toLocaleString()} (${d.disbursementCount} disbursements)`);
      });
      console.log(`   Total Disbursed: $${totalDisbursed.toLocaleString()}`);
    } else {
      console.log('   ⚠️  No disbursements found');
    }

    // Check expenses
    const expenses: any = await prisma.$queryRawUnsafe(`
      SELECT coa.accountName, SUM(jel.debitAmount) as total
      FROM journal_entry_lines jel
      JOIN journal_entries je ON je.id = jel.journalEntryId
      JOIN chart_of_accounts coa ON coa.id = jel.chartOfAccountId
      WHERE je.status = 'POSTED'
        AND coa.accountType = 'EXPENSE'
      GROUP BY coa.id, coa.accountName
      ORDER BY total DESC
      LIMIT 10
    `);

    console.log(`\n📝 Expenses (from accounting):`);
    if (expenses.length > 0) {
      let totalExpenses = 0;
      expenses.forEach((e: any) => {
        const amount = parseFloat(e.total?.toString() || '0');
        totalExpenses += amount;
        console.log(`   - ${e.accountName}: $${amount.toLocaleString()}`);
      });
      console.log(`   Total: $${totalExpenses.toLocaleString()}`);
    } else {
      console.log('   No expenses found');
    }

    console.log('\n' + '='.repeat(80));
    console.log('\n📝 Analysis:');
    console.log('─'.repeat(80));
    
    if (companies.length === 0) {
      console.log('\n✅ Data is CORRECT:');
      console.log('   - No portfolio companies exist for this fund');
      console.log('   - portfolioSummary is empty (correct)');
      console.log('   - totalInvestment is 0 (correct - no investments made)');
    } else {
      console.log('\n⚠️  Potential Issues:');
      console.log('   - Portfolio companies exist but not showing in dashboard');
      console.log('   - Check if companies have fundId set correctly');
      console.log('   - Check if companies have investmentImplementation records');
    }

    if (commitments.length === 0) {
      console.log('\n⚠️  Data Inconsistency:');
      console.log('   - Fund has totalAmount of 20M (paidIn shows 20M)');
      console.log('   - But no investment commitments exist');
      console.log('   - J Curve shows 0 contributions (because it uses commitments)');
      console.log('   - This is a data setup issue, not a code bug');
    }

    console.log('\n💡 Recommendations:');
    console.log('   1. If fund has money but no commitments: Create investment commitments');
    console.log('   2. If portfolio companies exist: Verify fundId is set correctly');
    console.log('   3. If companies have no disbursements: Create investment implementations and disbursements');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

diagnoseDashboard();
