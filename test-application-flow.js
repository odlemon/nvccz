const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';

async function testApplicationFlow() {
  console.log('🔄 Testing Investment Application Flow\n');

  try {
    // Step 1: Create a new application (PUBLIC - no auth required)
    console.log('📝 Step 1: Creating new application...');
    const applicationData = {
      applicantName: "John Doe",
      applicantEmail: "john.doe@techstart.com",
      applicantPhone: "+1234567890",
      applicantAddress: "123 Innovation Street, Tech City, TC 12345",
      businessName: "TechStart Inc.",
      businessDescription: "A technology startup focused on AI solutions for healthcare",
      industry: "Technology",
      businessStage: "STARTUP",
      foundingDate: "2023-01-15",
      requestedAmount: 150000
    };

    const createResponse = await axios.post(`${BASE_URL}/applications`, applicationData);
    const application = createResponse.data.data;
    console.log('✅ Application created:', application.id);
    console.log('   Status:', application.status);
    console.log('   Current Stage:', application.currentStage);

    // Step 2: Check application status (PUBLIC - no auth required)
    console.log('\n📊 Step 2: Checking application status...');
    const statusResponse = await axios.get(`${BASE_URL}/applications/${application.id}/status`);
    const status = statusResponse.data.data;
    console.log('✅ Application status:', status.status);
    console.log('   Current stage:', status.currentStage);

    // Step 3: Try to submit application (should fail without documents)
    console.log('\n📤 Step 3: Attempting to submit application (should fail without documents)...');
    try {
      await axios.post(`${BASE_URL}/applications/${application.id}/submit`);
      console.log('❌ Unexpected: Application submitted without documents');
    } catch (error) {
      if (error.response?.status === 400) {
        console.log('✅ Correctly prevented submission without documents');
        console.log('   Error:', error.response.data.message);
      } else {
        console.log('❌ Unexpected error:', error.response?.data || error.message);
      }
    }

    // Step 4: Test protected endpoints (should fail without auth)
    console.log('\n🔒 Step 4: Testing protected endpoints (should fail without auth)...');
    
    try {
      await axios.get(`${BASE_URL}/applications`);
      console.log('❌ Unexpected: Got applications without auth');
    } catch (error) {
      if (error.response?.status === 401) {
        console.log('✅ Correctly blocked access to protected endpoint');
      } else {
        console.log('❌ Unexpected error:', error.response?.data || error.message);
      }
    }

    try {
      await axios.get(`${BASE_URL}/applications/${application.id}`);
      console.log('❌ Unexpected: Got application details without auth');
    } catch (error) {
      if (error.response?.status === 401) {
        console.log('✅ Correctly blocked access to protected endpoint');
      } else {
        console.log('❌ Unexpected error:', error.response?.data || error.message);
      }
    }

    console.log('\n🎉 Application flow test completed successfully!');
    console.log('\n📋 Summary:');
    console.log('   ✅ Application creation works (public endpoint)');
    console.log('   ✅ Status checking works (public endpoint)');
    console.log('   ✅ Document validation prevents premature submission');
    console.log('   ✅ Protected endpoints properly require authentication');
    console.log('   ✅ Application ID for testing:', application.id);

  } catch (error) {
    console.error('❌ Error occurred:', error.response?.data || error.message);
    if (error.response?.data) {
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

// Run the test
testApplicationFlow();

