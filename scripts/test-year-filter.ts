// @ts-nocheck
import { prisma } from '../src/utils/database';

async function testYearFilter() {
  try {
    const year = 2025;
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);

    console.log('🔍 Testing Year Filter\n');
    console.log('='.repeat(80));
    console.log(`\nYear: ${year}`);
    console.log(`Year Start: ${yearStart.toISOString()}`);
    console.log(`Year End: ${yearEnd.toISOString()}`);

    // Get all completed runs
    const allRuns = await prisma.payrollRun.findMany({
      where: { status: 'COMPLETED' },
      select: {
        id: true,
        name: true,
        updatedAt: true,
        endDate: true
      },
      orderBy: { updatedAt: 'desc' }
    });

    console.log(`\n📊 All Completed Runs: ${allRuns.length}`);
    allRuns.forEach((run, i) => {
      const updatedAt = new Date(run.updatedAt);
      const isInYear = updatedAt >= yearStart && updatedAt <= yearEnd;
      console.log(`\n${i + 1}. ${run.name || 'Unnamed'}`);
      console.log(`   Updated At: ${updatedAt.toISOString()}`);
      console.log(`   End Date: ${new Date(run.endDate).toISOString()}`);
      console.log(`   In ${year}?: ${isInYear ? '✅ YES' : '❌ NO'}`);
    });

    // Test the query that should be used
    const filteredRuns = await prisma.payrollRun.findMany({
      where: {
        status: 'COMPLETED',
        updatedAt: {
          gte: yearStart,
          lte: yearEnd
        }
      },
      select: {
        id: true,
        name: true,
        updatedAt: true
      }
    });

    console.log(`\n\n✅ Filtered Runs (year=${year}): ${filteredRuns.length}`);
    filteredRuns.forEach((run, i) => {
      console.log(`\n${i + 1}. ${run.name || 'Unnamed'}`);
      console.log(`   Updated At: ${new Date(run.updatedAt).toISOString()}`);
    });

    // Check with currency filter
    const currencyRuns = await prisma.payrollRun.findMany({
      where: {
        status: 'COMPLETED',
        updatedAt: {
          gte: yearStart,
          lte: yearEnd
        },
        currencyId: 'USD'
      },
      select: {
        id: true,
        name: true,
        updatedAt: true,
        currencyId: true
      }
    });

    console.log(`\n\n💰 Filtered Runs (year=${year}, currency=USD): ${currencyRuns.length}`);
    currencyRuns.forEach((run, i) => {
      console.log(`\n${i + 1}. ${run.name || 'Unnamed'}`);
      console.log(`   Updated At: ${new Date(run.updatedAt).toISOString()}`);
      console.log(`   Currency: ${run.currencyId || 'NULL'}`);
    });

    // Check what currencies exist
    const allCurrencies = await prisma.payrollRun.findMany({
      where: { status: 'COMPLETED' },
      select: { currencyId: true },
      distinct: ['currencyId']
    });

    console.log(`\n\n💱 Available Currencies in Completed Runs:`);
    allCurrencies.forEach(c => {
      console.log(`   - ${c.currencyId || 'NULL'}`);
    });

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

testYearFilter();
