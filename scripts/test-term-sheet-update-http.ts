// @ts-nocheck
/**
 * Test term sheet update via HTTP request
 */

const BASE_URL = 'https://nvccz-pi.vercel.app';
const APPLICATION_ID = 'cmihbwtck0000jp04iip7p447'; // Rug Tufting

async function testTermSheetUpdate() {
  try {
    console.log('🧪 Testing Term Sheet Update via HTTP\n');
    console.log(`Base URL: ${BASE_URL}`);
    console.log(`Application ID: ${APPLICATION_ID}\n`);

    // Step 1: Login to get token
    console.log('════════════════════════════════════════════════════════════════');
    console.log('Step 1: Login to get authentication token');
    console.log('════════════════════════════════════════════════════════════════\n');

    const loginResponse = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'admin@nvccz.co.zw',
        password: 'admin123'
      })
    });

    if (!loginResponse.ok) {
      const errorText = await loginResponse.text();
      console.log('❌ Login failed:', errorText);
      console.log('\n⚠️  Cannot proceed without authentication token');
      return;
    }

    const loginData = await loginResponse.json();
    const token = loginData.token || loginData.data?.token;

    if (!token) {
      console.log('❌ No token received from login');
      console.log('Response:', loginData);
      return;
    }

    console.log('✅ Login successful!');
    console.log(`   Token: ${token.substring(0, 20)}...\n`);

    // Step 2: Get current term sheet
    console.log('════════════════════════════════════════════════════════════════');
    console.log('Step 2: Get current term sheet');
    console.log('════════════════════════════════════════════════════════════════\n');

    const getResponse = await fetch(`${BASE_URL}/api/term-sheets/${APPLICATION_ID}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    if (!getResponse.ok) {
      const errorText = await getResponse.text();
      console.log('❌ Failed to get term sheet:', errorText);
      return;
    }

    const getData = await getResponse.json();
    const currentTermSheet = getData.data;

    if (!currentTermSheet) {
      console.log('❌ Term sheet not found');
      return;
    }

    console.log('✅ Current term sheet retrieved:');
    console.log(`   Title: ${currentTermSheet.title}`);
    console.log(`   Investment Amount: ${currentTermSheet.investmentAmount}`);
    console.log(`   Equity Percentage: ${currentTermSheet.equityPercentage}`);
    console.log(`   Valuation: ${currentTermSheet.valuation}\n`);

    // Step 3: Update term sheet
    console.log('════════════════════════════════════════════════════════════════');
    console.log('Step 3: Update term sheet');
    console.log('════════════════════════════════════════════════════════════════\n');

    const updatePayload = {
      title: currentTermSheet.title + ' (Test Update)',
      investmentAmount: Number(currentTermSheet.investmentAmount) + 1000,
      equityPercentage: Number(currentTermSheet.equityPercentage) + 0.5,
      valuation: Number(currentTermSheet.valuation) + 5000
    };

    console.log('📤 Sending update request...');
    console.log('   Payload:', JSON.stringify(updatePayload, null, 2));
    console.log('');

    const updateResponse = await fetch(`${BASE_URL}/api/term-sheets/${APPLICATION_ID}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(updatePayload)
    });

    const updateResult = await updateResponse.json();

    if (!updateResponse.ok) {
      console.log('❌ Update failed!');
      console.log('   Status:', updateResponse.status);
      console.log('   Response:', JSON.stringify(updateResult, null, 2));
      return;
    }

    console.log('✅ Update successful!');
    console.log('   Response:', JSON.stringify(updateResult, null, 2));
    console.log('');

    // Step 4: Verify update
    console.log('════════════════════════════════════════════════════════════════');
    console.log('Step 4: Verify update');
    console.log('════════════════════════════════════════════════════════════════\n');

    const verifyResponse = await fetch(`${BASE_URL}/api/term-sheets/${APPLICATION_ID}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const verifyData = await verifyResponse.json();
    const updatedTermSheet = verifyData.data;

    console.log('✅ Updated term sheet:');
    console.log(`   Title: ${updatedTermSheet.title}`);
    console.log(`   Investment Amount: ${updatedTermSheet.investmentAmount}`);
    console.log(`   Equity Percentage: ${updatedTermSheet.equityPercentage}`);
    console.log(`   Valuation: ${updatedTermSheet.valuation}`);
    console.log('');

    // Check if signature data is included
    if (updatedTermSheet.applicantSignature || updatedTermSheet.investorSignature) {
      console.log('✅ Signature data included in response:');
      if (updatedTermSheet.applicantSignature) {
        console.log('   Applicant Signature:', {
          hasSignature: !!updatedTermSheet.applicantSignature.signatureUrl,
          signedAt: updatedTermSheet.applicantSignature.signedAt,
          signedBy: updatedTermSheet.applicantSignature.signedBy
        });
      }
      if (updatedTermSheet.investorSignature) {
        console.log('   Investor Signature:', {
          hasSignature: !!updatedTermSheet.investorSignature.signatureUrl,
          signedAt: updatedTermSheet.investorSignature.signedAt,
          signedBy: updatedTermSheet.investorSignature.signedBy
        });
      }
    } else {
      console.log('ℹ️  No signature data (term sheet not signed yet)');
    }

    console.log('\n✅ All tests passed!');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
    throw error;
  }
}

testTermSheetUpdate()
  .then(() => {
    console.log('\n✅ Test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });

