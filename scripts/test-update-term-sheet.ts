// @ts-nocheck
/**
 * Test script to update a term sheet
 */

import { prisma } from '../src/utils/database';

async function testUpdateTermSheet() {
  try {
    console.log('🧪 Testing Term Sheet Update\n');

    // Find an existing term sheet
    const termSheet = await prisma.termSheet.findFirst({
      where: {
        applicationId: 'cmihbwtck0000jp04iip7p447' // Rug Tufting application
      },
      include: {
        application: {
          select: {
            id: true,
            businessName: true
          }
        }
      }
    });

    if (!termSheet) {
      console.log('❌ Term sheet not found for application cmihbwtck0000jp04iip7p447');
      console.log('   Trying to find any term sheet...\n');
      
      const anyTermSheet = await prisma.termSheet.findFirst({
        include: {
          application: {
            select: {
              id: true,
              businessName: true
            }
          }
        }
      });

      if (!anyTermSheet) {
        console.log('❌ No term sheets found in database');
        return;
      }

      console.log(`✅ Found term sheet: ${anyTermSheet.id}`);
      console.log(`   Application: ${anyTermSheet.application.businessName}`);
      console.log(`   Title: ${anyTermSheet.title}`);
      console.log(`   Status: ${termSheet.status}`);
      console.log(`   Investment Amount: ${termSheet.investmentAmount}`);
      console.log(`   Equity Percentage: ${termSheet.equityPercentage}`);
      console.log(`   Valuation: ${termSheet.valuation}\n`);

      // Test update
      console.log('📝 Testing update with new values...');
      const updateData = {
        title: termSheet.title + ' (Updated)',
        investmentAmount: Number(termSheet.investmentAmount) + 1000,
        equityPercentage: Number(termSheet.equityPercentage) + 0.5,
        valuation: Number(termSheet.valuation) + 5000
      };

      console.log('   Update data:', updateData);

      const updated = await prisma.termSheet.update({
        where: { id: anyTermSheet.id },
        data: {
          title: updateData.title,
          investmentAmount: updateData.investmentAmount,
          equityPercentage: updateData.equityPercentage,
          valuation: updateData.valuation
        }
      });

      console.log('\n✅ Update successful!');
      console.log('   Updated Title:', updated.title);
      console.log('   Updated Investment Amount:', updated.investmentAmount);
      console.log('   Updated Equity Percentage:', updated.equityPercentage);
      console.log('   Updated Valuation:', updated.valuation);

      // Revert back
      console.log('\n🔄 Reverting changes...');
      await prisma.termSheet.update({
        where: { id: anyTermSheet.id },
        data: {
          title: termSheet.title,
          investmentAmount: termSheet.investmentAmount,
          equityPercentage: termSheet.equityPercentage,
          valuation: termSheet.valuation
        }
      });
      console.log('✅ Reverted successfully');

    } else {
      console.log(`✅ Found term sheet: ${termSheet.id}`);
      console.log(`   Application: ${termSheet.application.businessName}`);
      console.log(`   Title: ${termSheet.title}`);
      console.log(`   Status: ${termSheet.status}`);
      console.log(`   Investment Amount: ${termSheet.investmentAmount}`);
      console.log(`   Equity Percentage: ${termSheet.equityPercentage}`);
      console.log(`   Valuation: ${termSheet.valuation}\n`);

      // Test update
      console.log('📝 Testing update with new values...');
      const updateData = {
        title: termSheet.title + ' (Updated)',
        investmentAmount: Number(termSheet.investmentAmount) + 1000,
        equityPercentage: Number(termSheet.equityPercentage) + 0.5,
        valuation: Number(termSheet.valuation) + 5000
      };

      console.log('   Update data:', updateData);

      const updated = await prisma.termSheet.update({
        where: { id: termSheet.id },
        data: {
          title: updateData.title,
          investmentAmount: updateData.investmentAmount,
          equityPercentage: updateData.equityPercentage,
          valuation: updateData.valuation
        }
      });

      console.log('\n✅ Update successful!');
      console.log('   Updated Title:', updated.title);
      console.log('   Updated Investment Amount:', updated.investmentAmount);
      console.log('   Updated Equity Percentage:', updated.equityPercentage);
      console.log('   Updated Valuation:', updated.valuation);

      // Revert back
      console.log('\n🔄 Reverting changes...');
      await prisma.termSheet.update({
        where: { id: termSheet.id },
        data: {
          title: termSheet.title,
          investmentAmount: termSheet.investmentAmount,
          equityPercentage: termSheet.equityPercentage,
          valuation: termSheet.valuation
        }
      });
      console.log('✅ Reverted successfully');
    }

    console.log('\n✅ Test completed successfully!');

  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

testUpdateTermSheet()
  .then(() => {
    console.log('\n✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

