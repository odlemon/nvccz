// @ts-nocheck
import { prisma } from '../src/utils/database';
import { TermSheetService } from '../src/services/TermSheetService';

async function testTermSheetsResponse() {
  try {
    console.log('🧪 Testing Term Sheets Response Format...\n');

    // Fetch all term sheets using the service
    console.log('📋 Fetching all term sheets...');
    const result = await TermSheetService.getAllTermSheets(1, 10);

    console.log('✅ Data retrieved!\n');
    console.log(`📊 Found ${result.termSheets.length} term sheet(s)\n`);

    if (result.termSheets.length === 0) {
      console.log('ℹ️  No term sheets found in database');
      await prisma.$disconnect();
      return;
    }

    // Test the formatTermSheetResponse function by simulating controller response
    const { TermSheetController } = require('../src/controllers/TermSheetController');
    
    console.log('🔍 Verifying response format for first term sheet:\n');
    const firstTermSheet = result.termSheets[0];
    
    // Format using the controller's format function
    const formatted = TermSheetController.formatTermSheetResponse(firstTermSheet);

    console.log('📝 Formatted Response:');
    console.log(JSON.stringify(formatted, null, 2));

    // Verify required fields
    console.log('\n✅ Required Fields Check:');
    const requiredFields = [
      'id',
      'applicationId',
      'title',
      'investmentAmount',
      'equityAmount',
      'valuation',
      'status',
      'isDraft',
      'isFinal',
      'isSigned',
      'createdAt',
      'updatedAt'
    ];

    let allPresent = true;
    requiredFields.forEach(field => {
      const hasField = formatted.hasOwnProperty(field);
      const value = formatted[field];
      const status = hasField && value !== null && value !== undefined ? '✅' : '❌';
      console.log(`  ${status} ${field}: ${JSON.stringify(value)}`);
      if (!hasField || value === null || value === undefined) {
        allPresent = false;
      }
    });

    // Check new required fields specifically
    console.log('\n💰 New Required Fields:');
    console.log(`  equityAmount: ${formatted.equityAmount} ${formatted.equityAmount ? '✅' : '❌ MISSING'}`);
    console.log(`  valuation: ${formatted.valuation} ${formatted.valuation ? '✅' : '❌ MISSING'}`);

    // Check related data
    console.log('\n📋 Related Data:');
    if (formatted.application) {
      console.log('  ✅ application object present');
      console.log(`     - businessName: ${formatted.application.businessName}`);
    } else {
      console.log('  ⚠️  application object missing');
    }

    if (formatted.createdBy) {
      console.log('  ✅ createdBy object present');
      console.log(`     - name: ${formatted.createdBy.firstName} ${formatted.createdBy.lastName}`);
    } else {
      console.log('  ⚠️  createdBy object missing');
    }

    // Test all term sheets
    console.log('\n📊 Testing all term sheets:');
    result.termSheets.forEach((ts: any, index: number) => {
      const formatted = TermSheetController.formatTermSheetResponse(ts);
      const hasEquityAmount = formatted.equityAmount !== null && formatted.equityAmount !== undefined;
      const hasValuation = formatted.valuation !== null && formatted.valuation !== undefined;
      const status = hasEquityAmount && hasValuation ? '✅' : '⚠️';
      console.log(`  ${status} Term Sheet ${index + 1}: equityAmount=${formatted.equityAmount}, valuation=${formatted.valuation}`);
    });

    if (allPresent) {
      console.log('\n✅ All required fields are present in the response!');
    } else {
      console.log('\n⚠️  Some required fields are missing!');
    }

    console.log('\n✅ Test completed successfully!');

  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

testTermSheetsResponse();

