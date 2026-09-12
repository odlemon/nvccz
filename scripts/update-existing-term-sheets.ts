// @ts-nocheck
import { prisma } from '../src/utils/database';
import { Decimal } from '@prisma/client/runtime/library';

async function updateExistingTermSheets() {
  try {
    console.log('🔍 Checking existing term sheets...\n');

    // Get all existing term sheets
    const termSheets = await prisma.termSheet.findMany({
      select: {
        id: true,
        applicationId: true,
        title: true,
        investmentAmount: true,
        equityAmount: true,
        valuation: true,
        equityPercentage: true,
      },
    });

    console.log(`Found ${termSheets.length} term sheet(s)\n`);

    if (termSheets.length === 0) {
      console.log('✅ No term sheets to update');
      await prisma.$disconnect();
      return;
    }

    let updatedCount = 0;

    for (const termSheet of termSheets) {
      const investmentAmount = termSheet.investmentAmount ? Number(termSheet.investmentAmount) : 0;
      const valuation = termSheet.valuation ? Number(termSheet.valuation) : 0;
      const equityPercentage = termSheet.equityPercentage ? Number(termSheet.equityPercentage) : null;
      const currentEquityAmount = termSheet.equityAmount ? Number(termSheet.equityAmount) : 0;

      // Calculate equityAmount if not set or is 0
      let equityAmount = currentEquityAmount;
      
      if (equityAmount === 0) {
        // If we have equityPercentage, calculate from valuation
        if (equityPercentage && valuation > 0) {
          equityAmount = (valuation * equityPercentage) / 100;
          console.log(`📊 Calculated equityAmount from percentage: ${equityAmount}`);
        } 
        // Otherwise, use investmentAmount as equityAmount (common case)
        else if (investmentAmount > 0) {
          equityAmount = investmentAmount;
          console.log(`💰 Using investmentAmount as equityAmount: ${equityAmount}`);
        }
      }

      // Ensure valuation is set (use investmentAmount * 10 as default if not set, or calculate from equityPercentage)
      let newValuation = valuation;
      if (newValuation === 0) {
        if (equityPercentage && investmentAmount > 0) {
          newValuation = (investmentAmount * 100) / equityPercentage;
          console.log(`📈 Calculated valuation from equityPercentage: ${newValuation}`);
        } else if (investmentAmount > 0) {
          // Default: assume 20% equity, so valuation = investmentAmount * 5
          newValuation = investmentAmount * 5;
          console.log(`📈 Using default valuation calculation: ${newValuation}`);
        }
      }

      // Update if needed
      if (currentEquityAmount === 0 || newValuation !== valuation) {
        await prisma.termSheet.update({
          where: { id: termSheet.id },
          data: {
            equityAmount: new Decimal(equityAmount),
            valuation: new Decimal(newValuation),
          },
        });

        console.log(`✅ Updated term sheet ${termSheet.id}:`);
        console.log(`   - equityAmount: ${equityAmount}`);
        console.log(`   - valuation: ${newValuation}\n`);
        updatedCount++;
      } else {
        console.log(`⏭️  Term sheet ${termSheet.id} already has values, skipping\n`);
      }
    }

    console.log(`\n✅ Update complete! Updated ${updatedCount} out of ${termSheets.length} term sheet(s)`);
  } catch (error: any) {
    console.error('❌ Error updating term sheets:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

updateExistingTermSheets();

