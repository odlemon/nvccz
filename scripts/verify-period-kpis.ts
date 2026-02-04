// @ts-nocheck
import { prisma } from '../src/utils/database';

async function verifyPeriodKPIs() {
  try {
    console.log('🔍 Verifying period KPIs in portfolio companies...\n');

    // Get all portfolio companies with financial KPIs
    const companies = await prisma.portfolioCompany.findMany({
      where: {
        financialKpis: {
          not: null
        }
      },
      select: {
        id: true,
        name: true,
        financialKpis: true
      },
      take: 10
    });

    if (companies.length === 0) {
      console.log('⚠️  No portfolio companies with financial KPIs found');
      await prisma.$disconnect();
      return;
    }

    console.log(`📊 Found ${companies.length} portfolio company(ies) with financial KPIs:\n`);

    companies.forEach((company: any) => {
      const kpis = company.financialKpis || {};
      const kpiValues = kpis.kpiValues || {};
      const latestKpiValues = kpis.latestKpiValues || {};

      console.log(`🏢 ${company.name} (${company.id})`);
      console.log('─'.repeat(80));

      // Show period-specific KPIs
      const periods = Object.keys(kpiValues).sort().reverse().slice(0, 5); // Last 5 periods
      if (periods.length > 0) {
        console.log('\n📅 Period-specific KPIs:');
        periods.forEach(period => {
          const periodKpis = kpiValues[period];
          console.log(`   ${period}:`);
          if (periodKpis.TOTAL_REVENUE !== undefined) {
            console.log(`      TOTAL_REVENUE: ${periodKpis.TOTAL_REVENUE}`);
          }
          if (periodKpis.NET_PROFIT !== undefined) {
            console.log(`      NET_PROFIT: ${periodKpis.NET_PROFIT}`);
          }
          if (periodKpis.CASH_FLOW_NET !== undefined) {
            console.log(`      CASH_FLOW_NET: ${periodKpis.CASH_FLOW_NET}`);
          }
        });
      }

      // Show latest KPIs
      if (Object.keys(latestKpiValues).length > 0) {
        console.log('\n📊 Latest KPI Values:');
        if (latestKpiValues.TOTAL_REVENUE !== undefined) {
          console.log(`   TOTAL_REVENUE: ${latestKpiValues.TOTAL_REVENUE}`);
        }
        if (latestKpiValues.NET_PROFIT !== undefined) {
          console.log(`   NET_PROFIT: ${latestKpiValues.NET_PROFIT}`);
        }
        if (latestKpiValues.CASH_FLOW_NET !== undefined) {
          console.log(`   CASH_FLOW_NET: ${latestKpiValues.CASH_FLOW_NET}`);
        }
      }

      console.log('\n');
    });

    console.log('✅ Verification complete!');
  } catch (error: any) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

verifyPeriodKPIs();
