// @ts-nocheck
import { prisma } from '../src/utils/database';

async function fixVexmaFundLink() {
  try {
    console.log('🔧 Fixing Vexma Tech Fund Link\n');
    console.log('='.repeat(80));

    // Get ZimFund
    const zimFund: any = await prisma.$queryRawUnsafe(`
      SELECT id, name
      FROM funds
      WHERE name LIKE '%ZimFund%' OR name LIKE '%zim%'
      LIMIT 1
    `);

    if (!zimFund || zimFund.length === 0) {
      console.log('❌ ZimFund not found');
      return;
    }

    const zf = zimFund[0];
    console.log(`\n💰 Found Fund: ${zf.name} (${zf.id})`);

    // Get Vexma Tech
    const vexma: any = await prisma.$queryRawUnsafe(`
      SELECT id, name, fundId
      FROM portfolio_companies
      WHERE name LIKE '%Vexma%' OR name LIKE '%Vexim%'
      LIMIT 1
    `);

    if (!vexma || vexma.length === 0) {
      console.log('❌ Vexma Tech not found');
      return;
    }

    const v = vexma[0];
    console.log(`\n📊 Found Company: ${v.name} (${v.id})`);
    console.log(`   Current fundId: ${v.fundId || 'null'}`);

    if (v.fundId === zf.id) {
      console.log('\n✅ Already linked correctly!');
      return;
    }

    // Update fundId
    await prisma.$executeRawUnsafe(
      `UPDATE portfolio_companies SET fundId = ? WHERE id = ?`,
      zf.id,
      v.id
    );

    console.log(`\n✅ Fixed: Vexma Tech now linked to ${zf.name}`);
    console.log(`   fundId updated from ${v.fundId || 'null'} to ${zf.id}`);

    // Verify
    const verify: any = await prisma.$queryRawUnsafe(`
      SELECT id, name, fundId
      FROM portfolio_companies
      WHERE id = ?
    `, v.id);

    if (verify && verify.length > 0) {
      console.log(`\n✅ Verification: fundId = ${verify[0].fundId}`);
    }

    // Check disbursements
    const disbursements: any = await prisma.$queryRawUnsafe(`
      SELECT SUM(fd.amount) as total
      FROM fund_disbursements fd
      JOIN investment_implementations ii ON ii.id = fd.investmentImplementationId
      WHERE ii.portfolioCompanyId = ? AND fd.status = 'DISBURSED'
    `, v.id);

    const totalDisbursed = parseFloat(disbursements[0]?.total?.toString() || '0');
    console.log(`\n💸 Total Disbursed: $${totalDisbursed.toLocaleString()}`);
    console.log(`   This should now show in dashboard as totalInvestment`);

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

fixVexmaFundLink();
