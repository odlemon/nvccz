// @ts-nocheck
import { prisma } from '../src/utils/database';

async function checkVexmaFund() {
  try {
    console.log('🔍 Checking Vexma Tech Fund Association\n');
    console.log('='.repeat(80));

    // Find Vexma Tech
    const company: any = await prisma.$queryRawUnsafe(`
      SELECT id, name, fundId, status, startDate
      FROM portfolio_companies
      WHERE name LIKE '%Vexma%' OR name LIKE '%Vexim%'
      LIMIT 1
    `);

    if (!company || company.length === 0) {
      console.log('❌ Vexma Tech not found');
      return;
    }

    const comp = company[0];
    console.log(`\n📊 Company: ${comp.name} (${comp.id})`);
    console.log(`   Fund ID: ${comp.fundId || '❌ NOT SET'}`);
    console.log(`   Status: ${comp.status}`);
    console.log(`   Start Date: ${comp.startDate ? new Date(comp.startDate).toLocaleDateString() : 'N/A'}`);

    // Check fund
    if (comp.fundId) {
      const fund: any = await prisma.$queryRawUnsafe(`
        SELECT id, name, totalAmount, remainingAmount
        FROM funds
        WHERE id = ?
      `, comp.fundId);

      if (fund && fund.length > 0) {
        const f = fund[0];
        console.log(`\n💰 Fund: ${f.name} (${f.id})`);
        console.log(`   Total Amount: $${parseFloat(f.totalAmount?.toString() || '0').toLocaleString()}`);
      } else {
        console.log(`\n⚠️  Fund ${comp.fundId} not found`);
      }
    }

    // Check investment implementation
    const impl: any = await prisma.$queryRawUnsafe(`
      SELECT ii.id, ii.totalCommittedAmount, ii.status
      FROM investment_implementations ii
      WHERE ii.portfolioCompanyId = ?
      LIMIT 1
    `, comp.id);

    console.log(`\n💼 Investment Implementation: ${impl.length > 0 ? 'Found' : '❌ Not found'}`);
    if (impl.length > 0) {
      const i = impl[0];
      console.log(`   ID: ${i.id}`);
      console.log(`   Committed Amount: $${parseFloat(i.totalCommittedAmount?.toString() || '0').toLocaleString()}`);
      console.log(`   Status: ${i.status || 'N/A'}`);
    }

    // Check disbursements
    const disbursements: any = await prisma.$queryRawUnsafe(`
      SELECT fd.id, fd.amount, fd.status, fd.disbursementDate, fd.investmentImplementationId
      FROM fund_disbursements fd
      JOIN investment_implementations ii ON ii.id = fd.investmentImplementationId
      WHERE ii.portfolioCompanyId = ?
      ORDER BY fd.disbursementDate DESC
    `, comp.id);

    console.log(`\n💸 Fund Disbursements: ${disbursements.length}`);
    if (disbursements.length > 0) {
      let totalDisbursed = 0;
      disbursements.forEach((d: any, i: number) => {
        const amount = parseFloat(d.amount?.toString() || '0');
        totalDisbursed += amount;
        console.log(`   ${i + 1}. $${amount.toLocaleString()} - ${d.status} - ${d.disbursementDate ? new Date(d.disbursementDate).toLocaleDateString() : 'N/A'}`);
      });
      console.log(`   Total Disbursed: $${totalDisbursed.toLocaleString()}`);
    } else {
      console.log('   ⚠️  No disbursements found');
    }

    // Check if ZimFund exists
    const zimFund: any = await prisma.$queryRawUnsafe(`
      SELECT id, name
      FROM funds
      WHERE name LIKE '%ZimFund%' OR name LIKE '%zim%'
      LIMIT 1
    `);

    if (zimFund && zimFund.length > 0) {
      const zf = zimFund[0];
      console.log(`\n🔗 ZimFund: ${zf.name} (${zf.id})`);
      
      if (comp.fundId !== zf.id) {
        console.log(`\n❌ BUG FOUND: Vexma Tech fundId (${comp.fundId || 'null'}) does not match ZimFund (${zf.id})`);
        console.log(`   This is why Vexma Tech doesn't show in the dashboard!`);
      } else {
        console.log(`   ✅ Vexma Tech is correctly linked to ZimFund`);
      }
    }

    console.log('\n' + '='.repeat(80));

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

checkVexmaFund();
