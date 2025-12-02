// @ts-nocheck
/**
 * Test term sheet update endpoint - login, find term sheet, and update it
 */

import axios from 'axios';

const BASE_URL = 'https://nvccz-pi.vercel.app';
const ADMIN_EMAIL = 'admin@nvccz.co.zw';
const ADMIN_PASSWORD = 'admin123';

async function testTermSheetUpdate() {
  try {
    console.log('🧪 Testing Term Sheet Update Endpoint\n');
    console.log('════════════════════════════════════════════════════════════════\n');

    // Step 1: Login as admin
    console.log('Step 1: Logging in as admin...');
    const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD
    });

    if (!loginResponse.data.success || !loginResponse.data.token) {
      console.error('❌ Login failed:', loginResponse.data.message);
      return;
    }

    const token = loginResponse.data.token;
    console.log('✅ Login successful!\n');

    // Step 2: Find an existing term sheet
    console.log('Step 2: Finding existing term sheet...');
    const termSheetsResponse = await axios.get(`${BASE_URL}/api/term-sheets`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      params: {
        page: 1,
        limit: 10
      }
    });

    if (!termSheetsResponse.data.success || !termSheetsResponse.data.data?.termSheets?.length) {
      console.log('❌ No term sheets found');
      return;
    }

    const termSheet = termSheetsResponse.data.data.termSheets[0];
    console.log(`✅ Found term sheet: ${termSheet.id}`);
    console.log(`   Application ID: ${termSheet.applicationId}`);
    console.log(`   Title: ${termSheet.title}`);
    console.log(`   Investment Amount: ${termSheet.investmentAmount}`);
    console.log(`   Equity Percentage: ${termSheet.equityPercentage}`);
    console.log(`   Valuation: ${termSheet.valuation}\n`);

    // Step 3: Test update with mandatory fields
    console.log('Step 3: Testing update with mandatory fields...');
    const updateData = {
      title: termSheet.title + ' (Test Update)',
      investmentAmount: Number(termSheet.investmentAmount) + 1000,
      equityPercentage: Number(termSheet.equityPercentage) + 0.5,
      valuation: Number(termSheet.valuation) + 5000
    };

    console.log('   Update payload:', JSON.stringify(updateData, null, 2));
    console.log('');

    const updateResponse = await axios.put(
      `${BASE_URL}/api/term-sheets/${termSheet.applicationId}`,
      updateData,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (updateResponse.data.success) {
      console.log('✅ Update successful!');
      console.log('   Response:', JSON.stringify(updateResponse.data, null, 2));
      
      // Verify the update
      const updatedTermSheet = updateResponse.data.data;
      console.log('\n   Updated values:');
      console.log(`   - Title: ${updatedTermSheet.title}`);
      console.log(`   - Investment Amount: ${updatedTermSheet.investmentAmount}`);
      console.log(`   - Equity Percentage: ${updatedTermSheet.equityPercentage}`);
      console.log(`   - Valuation: ${updatedTermSheet.valuation}`);

      // Step 4: Revert the changes
      console.log('\nStep 4: Reverting changes...');
      const revertData = {
        title: termSheet.title,
        investmentAmount: termSheet.investmentAmount,
        equityPercentage: termSheet.equityPercentage,
        valuation: termSheet.valuation
      };

      await axios.put(
        `${BASE_URL}/api/term-sheets/${termSheet.applicationId}`,
        revertData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log('✅ Changes reverted successfully');

    } else {
      console.error('❌ Update failed:', updateResponse.data.message);
      console.error('   Response:', JSON.stringify(updateResponse.data, null, 2));
    }

    // Step 5: Test with single field
    console.log('\nStep 5: Testing update with single field (title only)...');
    const singleFieldUpdate = {
      title: termSheet.title + ' (Single Field Test)'
    };

    const singleFieldResponse = await axios.put(
      `${BASE_URL}/api/term-sheets/${termSheet.applicationId}`,
      singleFieldUpdate,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (singleFieldResponse.data.success) {
      console.log('✅ Single field update successful!');
      console.log(`   Updated title: ${singleFieldResponse.data.data.title}`);
      
      // Revert
      await axios.put(
        `${BASE_URL}/api/term-sheets/${termSheet.applicationId}`,
        { title: termSheet.title },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log('✅ Reverted');
    } else {
      console.error('❌ Single field update failed:', singleFieldResponse.data.message);
    }

    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('✅ All tests completed!');
    console.log('════════════════════════════════════════════════════════════════');

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Response:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

testTermSheetUpdate()
  .then(() => {
    console.log('\n✅ Test script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test script failed:', error);
    process.exit(1);
  });


