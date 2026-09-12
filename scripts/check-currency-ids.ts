// @ts-nocheck
import { prisma } from '../src/utils/database';

async function checkCurrencyIds() {
  try {
    const currencies = await prisma.currency.findMany({
      select: {
        id: true,
        code: true,
        name: true
      }
    });

    console.log('💱 Available Currencies:\n');
    currencies.forEach(c => {
      console.log(`   Code: ${c.code} | Name: ${c.name} | ID: ${c.id}`);
    });

    // Check payroll runs
    const payrollRuns = await prisma.payrollRun.findMany({
      where: { status: 'COMPLETED' },
      select: {
        id: true,
        name: true,
        currencyId: true,
        currency: {
          select: {
            code: true,
            name: true
          }
        }
      },
      take: 5
    });

    console.log('\n\n📊 Payroll Runs Currency Info:\n');
    payrollRuns.forEach((run, i) => {
      console.log(`${i + 1}. ${run.name || 'Unnamed'}`);
      console.log(`   Currency ID: ${run.currencyId || 'NULL'}`);
      console.log(`   Currency Code: ${run.currency?.code || 'NULL'}`);
      console.log(`   Currency Name: ${run.currency?.name || 'NULL'}`);
      console.log('');
    });

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkCurrencyIds();
