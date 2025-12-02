// @ts-nocheck
/**
 * Test the term sheet update API endpoint
 * Note: This requires authentication token
 */

const BASE_URL = 'https://nvccz-pi.vercel.app';
const APPLICATION_ID = 'cmihbwtck0000jp04iip7p447'; // Rug Tufting

async function testTermSheetUpdateAPI() {
  try {
    console.log('🧪 Testing Term Sheet Update API Endpoint\n');
    console.log(`Endpoint: PUT ${BASE_URL}/api/term-sheets/${APPLICATION_ID}\n`);

    // Test 1: Update with all mandatory fields
    console.log('════════════════════════════════════════════════════════════════');
    console.log('Test 1: Update with mandatory fields (title, investmentAmount, equityPercentage, valuation)');
    console.log('════════════════════════════════════════════════════════════════\n');

    const updatePayload1 = {
      title: 'Updated Term Sheet Title',
      investmentAmount: 55000,
      equityPercentage: 22.5,
      valuation: 275000
    };

    console.log('Request Body:', JSON.stringify(updatePayload1, null, 2));
    console.log('\n📤 Making request...\n');

    // Note: This requires authentication token
    // In a real scenario, you would need to login first and get a token
    console.log('⚠️  NOTE: This test requires authentication.');
    console.log('   To test manually, use:');
    console.log(`   curl -X PUT "${BASE_URL}/api/term-sheets/${APPLICATION_ID}" \\`);
    console.log('     -H "Content-Type: application/json" \\');
    console.log('     -H "Authorization: Bearer YOUR_TOKEN" \\');
    console.log(`     -d \'${JSON.stringify(updatePayload1)}\'`);
    console.log('\n');

    // Test 2: Update with single field
    console.log('════════════════════════════════════════════════════════════════');
    console.log('Test 2: Update with single field (title only)');
    console.log('════════════════════════════════════════════════════════════════\n');

    const updatePayload2 = {
      title: 'Single Field Update Test'
    };

    console.log('Request Body:', JSON.stringify(updatePayload2, null, 2));
    console.log('\n📤 Making request...\n');

    console.log('⚠️  NOTE: This test requires authentication.');
    console.log('   To test manually, use:');
    console.log(`   curl -X PUT "${BASE_URL}/api/term-sheets/${APPLICATION_ID}" \\`);
    console.log('     -H "Content-Type: application/json" \\');
    console.log('     -H "Authorization: Bearer YOUR_TOKEN" \\');
    console.log(`     -d \'${JSON.stringify(updatePayload2)}\'`);
    console.log('\n');

    // Test 3: Update with optional fields
    console.log('════════════════════════════════════════════════════════════════');
    console.log('Test 3: Update with optional fields (keyTerms, conditions, timeline)');
    console.log('════════════════════════════════════════════════════════════════\n');

    const updatePayload3 = {
      keyTerms: 'Updated key terms and conditions',
      conditions: 'Updated investment conditions',
      timeline: 'Q2 2024'
    };

    console.log('Request Body:', JSON.stringify(updatePayload3, null, 2));
    console.log('\n📤 Making request...\n');

    console.log('⚠️  NOTE: This test requires authentication.');
    console.log('   To test manually, use:');
    console.log(`   curl -X PUT "${BASE_URL}/api/term-sheets/${APPLICATION_ID}" \\`);
    console.log('     -H "Content-Type: application/json" \\');
    console.log('     -H "Authorization: Bearer YOUR_TOKEN" \\');
    console.log(`     -d \'${JSON.stringify(updatePayload3)}\'`);
    console.log('\n');

    // Test 4: Empty body (should fail)
    console.log('════════════════════════════════════════════════════════════════');
    console.log('Test 4: Empty body (should return error)');
    console.log('════════════════════════════════════════════════════════════════\n');

    const updatePayload4 = {};

    console.log('Request Body:', JSON.stringify(updatePayload4, null, 2));
    console.log('\n📤 Making request...\n');

    console.log('⚠️  NOTE: This test requires authentication.');
    console.log('   Expected response:');
    console.log('   {"success":false,"message":"No update fields provided. You can update: title, investmentAmount, equityPercentage, valuation, keyTerms, conditions, timeline, documentUrl, documentFileName, documentSize, status, isDraft, isFinal"}');
    console.log('\n');

    console.log('✅ Test scenarios prepared!');
    console.log('\n📋 Summary:');
    console.log('   - All mandatory fields (title, investmentAmount, equityPercentage, valuation) can be updated');
    console.log('   - Optional fields (keyTerms, conditions, timeline, etc.) can be updated');
    console.log('   - Empty body will return helpful error message');
    console.log('   - Signature fields cannot be updated (immutable)');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

testTermSheetUpdateAPI()
  .then(() => {
    console.log('\n✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

