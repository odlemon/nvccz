const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000/api';

// You'll need to get a valid JWT token by logging in first
const JWT_TOKEN = 'YOUR_JWT_TOKEN_HERE'; // Replace with actual token

async function testGetAllApplications() {
  try {
    console.log('🧪 Testing Get All Applications (Authenticated)...\n');

    // Test 1: Get all applications (default pagination)
    console.log('📋 Test 1: Getting all applications...');
    const allApplicationsResponse = await axios.get(`${API_BASE_URL}/applications`, {
      headers: {
        'Authorization': `Bearer ${JWT_TOKEN}`
      }
    });

    console.log('✅ All applications retrieved successfully!');
    console.log('📊 Response Summary:');
    console.log(`   Total Applications: ${allApplicationsResponse.data.data.total}`);
    console.log(`   Current Page: ${allApplicationsResponse.data.data.page}`);
    console.log(`   Total Pages: ${allApplicationsResponse.data.data.totalPages}`);
    console.log(`   Applications in this page: ${allApplicationsResponse.data.data.applications.length}`);

    // Display first few applications
    console.log('\n📄 First few applications:');
    allApplicationsResponse.data.data.applications.slice(0, 3).forEach((app, index) => {
      console.log(`   ${index + 1}. ${app.businessName} (${app.currentStage})`);
      console.log(`      Applicant: ${app.applicantName}`);
      console.log(`      Amount: $${app.requestedAmount}`);
      console.log(`      Documents: ${app.documents.length} files`);
    });

    // Test 2: Get applications with pagination
    console.log('\n📋 Test 2: Getting applications with pagination...');
    const paginatedResponse = await axios.get(`${API_BASE_URL}/applications?page=1&limit=5`, {
      headers: {
        'Authorization': `Bearer ${JWT_TOKEN}`
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
        'Authorization': `Bearer ${JWT_TOKEN}`
      }
    });

    console.log('✅ Stage-filtered applications retrieved successfully!');
    console.log(`   SHORTLISTED applications: ${stageFilteredResponse.data.data.total}`);
    
    if (stageFilteredResponse.data.data.applications.length > 0) {
      console.log('   Sample SHORTLISTED application:');
      const sample = stageFilteredResponse.data.data.applications[0];
      console.log(`      Business: ${sample.businessName}`);
      console.log(`      Stage: ${sample.currentStage}`);
      console.log(`      Created: ${new Date(sample.createdAt).toLocaleDateString()}`);
    }

    // Test 4: Get specific application by ID
    if (allApplicationsResponse.data.data.applications.length > 0) {
      const firstAppId = allApplicationsResponse.data.data.applications[0].id;
      console.log('\n📋 Test 4: Getting specific application by ID...');
      
      const specificAppResponse = await axios.get(`${API_BASE_URL}/applications/${firstAppId}`, {
        headers: {
          'Authorization': `Bearer ${JWT_TOKEN}`
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
      
      console.log('\n📄 Documents:');
      app.documents.forEach((doc, index) => {
        console.log(`   ${index + 1}. ${doc.documentType}: ${doc.fileName}`);
        console.log(`      Required: ${doc.isRequired ? 'Yes' : 'No'}`);
        console.log(`      Submitted: ${doc.isSubmitted ? 'Yes' : 'No'}`);
      });
    }

    console.log('\n🎉 All tests passed! Application retrieval endpoints are working correctly.');
    console.log('\n📋 Available Query Parameters:');
    console.log('   - page: Page number (default: 1)');
    console.log('   - limit: Items per page (default: 10)');
    console.log('   - stage: Filter by application stage');
    console.log('   - fundId: Filter by fund ID');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    if (error.response?.status === 401) {
      console.error('🔐 Authentication failed. Please provide a valid JWT token.');
      console.error('   To get a token, login first using the auth endpoint.');
    }
    if (error.response?.data) {
      console.error('Error details:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

// Instructions for getting JWT token
console.log('🔐 To run this test, you need to:');
console.log('1. Login first to get a JWT token');
console.log('2. Replace JWT_TOKEN in this script with your actual token');
console.log('3. Run: node test-get-all-applications.js');
console.log('\nExample login request:');
console.log('POST /api/auth/login');
console.log('Body: { "email": "admin@nvccz.co.zw", "password": "admin123" }');
console.log('\n');

// Uncomment the line below after setting your JWT token
// testGetAllApplications();

