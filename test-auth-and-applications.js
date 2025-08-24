const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000/api';

async function testAuthAndApplications() {
  try {
    console.log('🔐 Step 1: Logging in to get JWT token...\n');
    
    // Login to get JWT token
    const loginResponse = await axios.post(`${API_BASE_URL}/auth/login`, {
      email: "admin@nvccz.co.zw",
      password: "admin123"
    });

    const token = loginResponse.data.data.token;
    console.log('✅ Login successful!');
    console.log(`   User: ${loginResponse.data.data.user.firstName} ${loginResponse.data.data.user.lastName}`);
    console.log(`   Role: ${loginResponse.data.data.user.role}`);
    console.log(`   Token: ${token.substring(0, 50)}...`);

    console.log('\n📋 Step 2: Testing Get All Applications...\n');

    // Test 1: Get all applications (default pagination)
    console.log('📋 Test 1: Getting all applications...');
    const allApplicationsResponse = await axios.get(`${API_BASE_URL}/applications`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    console.log('✅ All applications retrieved successfully!');
    console.log('📊 Response Summary:');
    console.log(`   Total Applications: ${allApplicationsResponse.data.data.total}`);
    console.log(`   Current Page: ${allApplicationsResponse.data.data.page}`);
    console.log(`   Total Pages: ${allApplicationsResponse.data.data.totalPages}`);
    console.log(`   Applications in this page: ${allApplicationsResponse.data.data.applications.length}`);

    // Display applications
    if (allApplicationsResponse.data.data.applications.length > 0) {
      console.log('\n📄 Applications:');
      allApplicationsResponse.data.data.applications.forEach((app, index) => {
        console.log(`   ${index + 1}. ${app.businessName}`);
        console.log(`      ID: ${app.id}`);
        console.log(`      Applicant: ${app.applicantName}`);
        console.log(`      Email: ${app.applicantEmail}`);
        console.log(`      Stage: ${app.currentStage}`);
        console.log(`      Amount: $${app.requestedAmount}`);
        console.log(`      Documents: ${app.documents.length} files`);
        console.log(`      Created: ${new Date(app.createdAt).toLocaleDateString()}`);
        console.log('');
      });
    } else {
      console.log('   No applications found.');
    }

    // Test 2: Get applications with pagination
    console.log('📋 Test 2: Getting applications with pagination...');
    const paginatedResponse = await axios.get(`${API_BASE_URL}/applications?page=1&limit=5`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    console.log('✅ Paginated applications retrieved successfully!');
    console.log(`   Page: ${paginatedResponse.data.data.page}`);
    console.log(`   Limit: 5`);
    console.log(`   Applications returned: ${paginatedResponse.data.data.applications.length}`);

    // Test 3: Filter by stage
    console.log('\n📋 Test 3: Filtering by stage (SHORTLISTED)...');
    const stageFilteredResponse = await axios.get(`${API_BASE_URL}/applications?stage=SHORTLISTED`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    console.log('✅ Stage-filtered applications retrieved successfully!');
    console.log(`   SHORTLISTED applications: ${stageFilteredResponse.data.data.total}`);

    // Test 4: Get specific application by ID (if any exist)
    if (allApplicationsResponse.data.data.applications.length > 0) {
      const firstAppId = allApplicationsResponse.data.data.applications[0].id;
      console.log('\n📋 Test 4: Getting specific application by ID...');
      
      const specificAppResponse = await axios.get(`${API_BASE_URL}/applications/${firstAppId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      console.log('✅ Specific application retrieved successfully!');
      const app = specificAppResponse.data.data;
      console.log(`   Business: ${app.businessName}`);
      console.log(`   Applicant: ${app.applicantName}`);
      console.log(`   Email: ${app.applicantEmail}`);
      console.log(`   Phone: ${app.applicantPhone}`);
      console.log(`   Industry: ${app.industry}`);
      console.log(`   Business Stage: ${app.businessStage}`);
      console.log(`   Current Stage: ${app.currentStage}`);
      console.log(`   Requested Amount: $${app.requestedAmount}`);
      console.log(`   Documents: ${app.documents.length} files`);
      
      if (app.documents.length > 0) {
        console.log('\n📄 Documents:');
        app.documents.forEach((doc, index) => {
          console.log(`   ${index + 1}. ${doc.documentType}: ${doc.fileName}`);
          console.log(`      Required: ${doc.isRequired ? 'Yes' : 'No'}`);
          console.log(`      Submitted: ${doc.isSubmitted ? 'Yes' : 'No'}`);
        });
      }
    }

    console.log('\n🎉 All tests passed! Application retrieval endpoints are working correctly.');
    console.log('\n📋 Available Query Parameters:');
    console.log('   - page: Page number (default: 1)');
    console.log('   - limit: Items per page (default: 10)');
    console.log('   - stage: Filter by application stage');
    console.log('   - fundId: Filter by fund ID');

    console.log('\n🔗 API Endpoints Summary:');
    console.log('   GET /api/applications - Get all applications (authenticated)');
    console.log('   GET /api/applications/:id - Get specific application (authenticated)');
    console.log('   GET /api/applications/:id/status - Get application status (public)');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    if (error.response?.status === 401) {
      console.error('🔐 Authentication failed. Please check your login credentials.');
    }
    if (error.response?.data) {
      console.error('Error details:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

// Run the test
testAuthAndApplications();

