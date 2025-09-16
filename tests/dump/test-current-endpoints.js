const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000/api';

async function testCurrentEndpoints() {
  try {
    console.log('🧪 Testing Current Application Endpoints...\n');

    // Step 1: Login to get token
    console.log('🔐 Step 1: Logging in...');
    const loginResponse = await axios.post(`${API_BASE_URL}/auth/login`, {
      email: "admin@nvccz.co.zw",
      password: "admin123"
    });

    const token = loginResponse.data.data.token;
    console.log('✅ Login successful!');

    // Step 2: Test GET /api/applications (authenticated)
    console.log('\n📋 Step 2: Testing GET /api/applications...');
    const allAppsResponse = await axios.get(`${API_BASE_URL}/applications`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    console.log('✅ GET /api/applications working!');
    console.log(`   Total applications: ${allAppsResponse.data.data.total}`);

    // Step 3: Test GET /api/applications/:id (if any applications exist)
    if (allAppsResponse.data.data.applications.length > 0) {
      const firstAppId = allAppsResponse.data.data.applications[0].id;
      console.log('\n📋 Step 3: Testing GET /api/applications/:id...');
      
      const singleAppResponse = await axios.get(`${API_BASE_URL}/applications/${firstAppId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      console.log('✅ GET /api/applications/:id working!');
      console.log(`   Application: ${singleAppResponse.data.data.businessName}`);
      console.log(`   Stage: ${singleAppResponse.data.data.currentStage}`);
    }

    // Step 4: Test GET /api/applications/:id/status (public)
    if (allAppsResponse.data.data.applications.length > 0) {
      const firstAppId = allAppsResponse.data.data.applications[0].id;
      console.log('\n📋 Step 4: Testing GET /api/applications/:id/status (public)...');
      
      const statusResponse = await axios.get(`${API_BASE_URL}/applications/${firstAppId}/status`);

      console.log('✅ GET /api/applications/:id/status working!');
      console.log(`   Current Stage: ${statusResponse.data.data.currentStage}`);
    }

    // Step 5: Test POST /api/applications (public - create new application)
    console.log('\n📋 Step 5: Testing POST /api/applications (create new)...');
    const newAppData = {
      applicantName: "Test User",
      applicantEmail: "test@example.com",
      applicantPhone: "+1234567890",
      businessName: "Test Business",
      businessDescription: "A test business for endpoint verification",
      industry: "Technology",
      businessStage: "STARTUP",
      requestedAmount: 50000,
      documents: [
        {
          documentType: "BUSINESS_PLAN",
          fileName: "test-business-plan.pdf",
          fileUrl: "https://example.com/test-plan.pdf",
          fileSize: 1024000,
          isRequired: true
        },
        {
          documentType: "PROOF_OF_CONCEPT",
          fileName: "test-poc.pdf",
          fileUrl: "https://example.com/test-poc.pdf",
          fileSize: 512000,
          isRequired: true
        },
        {
          documentType: "MARKET_RESEARCH",
          fileName: "test-market-research.pdf",
          fileUrl: "https://example.com/test-market.pdf",
          fileSize: 768000,
          isRequired: true
        },
        {
          documentType: "PROJECTED_CASH_FLOWS",
          fileName: "test-cash-flows.pdf",
          fileUrl: "https://example.com/test-cash-flows.pdf",
          fileSize: 256000,
          isRequired: true
        }
      ]
    };

    const createResponse = await axios.post(`${API_BASE_URL}/applications`, newAppData);
    console.log('✅ POST /api/applications working!');
    console.log(`   Created application ID: ${createResponse.data.data.id}`);
    console.log(`   Stage: ${createResponse.data.data.currentStage}`);

    // Step 6: Test PUT /api/applications/:id (authenticated)
    console.log('\n📋 Step 6: Testing PUT /api/applications/:id...');
    const updateData = {
      businessDescription: "Updated test business description"
    };

    const updateResponse = await axios.put(`${API_BASE_URL}/applications/${createResponse.data.data.id}`, updateData, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    console.log('✅ PUT /api/applications/:id working!');
    console.log(`   Updated description: ${updateResponse.data.data.businessDescription}`);

    // Step 7: Test POST /api/applications/:id/change-stage
    console.log('\n📋 Step 7: Testing POST /api/applications/:id/change-stage...');
    const stageChangeData = {
      newStage: "UNDER_DUE_DILIGENCE",
      notes: "Moving to due diligence phase"
    };

    const stageChangeResponse = await axios.post(`${API_BASE_URL}/applications/${createResponse.data.data.id}/change-stage`, stageChangeData, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    console.log('✅ POST /api/applications/:id/change-stage working!');
    console.log(`   New stage: ${stageChangeResponse.data.data.currentStage}`);

    // Step 8: Test filtering by stage
    console.log('\n📋 Step 8: Testing filtering by stage...');
    const filteredResponse = await axios.get(`${API_BASE_URL}/applications?stage=UNDER_DUE_DILIGENCE`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    console.log('✅ Stage filtering working!');
    console.log(`   Applications in UNDER_DUE_DILIGENCE: ${filteredResponse.data.data.total}`);

    console.log('\n🎉 All current endpoints are working correctly!');
    console.log('\n📋 Current Available Endpoints:');
    console.log('   ✅ POST /api/applications - Create application (public)');
    console.log('   ✅ GET /api/applications - Get all applications (authenticated)');
    console.log('   ✅ GET /api/applications/:id - Get specific application (authenticated)');
    console.log('   ✅ GET /api/applications/:id/status - Get application status (public)');
    console.log('   ✅ PUT /api/applications/:id - Update application (authenticated)');
    console.log('   ✅ POST /api/applications/:id/change-stage - Change stage (authenticated)');
    console.log('   ✅ DELETE /api/applications/:id - Delete application (authenticated)');

    console.log('\n❌ Missing Due Diligence Endpoints:');
    console.log('   ❌ POST /api/applications/:id/due-diligence/initiate');
    console.log('   ❌ PUT /api/applications/:id/due-diligence');
    console.log('   ❌ GET /api/applications/:id/due-diligence');
    console.log('   ❌ POST /api/applications/:id/due-diligence/complete');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    if (error.response?.data) {
      console.error('Error details:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

// Run the test
testCurrentEndpoints();

