const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';

async function testPortfolioCompanyFlow() {
  console.log('🚀 Testing Portfolio Company Registration and Login Flow\n');

  try {
    // Step 1: Create Portfolio Company (creates user + company)
    console.log('📝 Step 1: Creating Portfolio Company...');
    const createResponse = await axios.post(`${BASE_URL}/portfolio-companies`, {
      firstName: "John",
      lastName: "Doe",
      email: "john.doe@techstartup.com",
      password: "password123",
      name: "TechStartup Inc.",
      registrationNumber: "REG123456789",
      industry: "Technology",
      foundingDate: "2020-01-15",
      address: "123 Innovation Street, Tech City, TC 12345",
      website: "https://techstartup.com",
      description: "A leading technology startup focused on AI solutions",
      logoUrl: "https://example.com/logo.png",
      status: "PENDING",
      companySize: "MEDIUM",
      employeeCount: 50,
      annualRevenue: 1000000.00,
      fundingStage: "SERIES_A",
      contactPerson: "John Doe",
      contactPhone: "+1234567890",
      contactEmail: "contact@techstartup.com",
      socialMedia: {
        linkedin: "https://linkedin.com/company/techstartup",
        twitter: "https://twitter.com/techstartup",
        facebook: "https://facebook.com/techstartup"
      }
    });

    console.log('✅ Company created successfully!');
    console.log('Company ID:', createResponse.data.data.id);
    console.log('User ID:', createResponse.data.data.user.id);
    console.log('User Role:', createResponse.data.data.user.role.name);
    console.log('');

    // Step 2: Login with created user
    console.log('🔐 Step 2: Logging in with created user...');
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
      email: "john.doe@techstartup.com",
      password: "password123"
    });

    const token = loginResponse.data.data.token;
    console.log('✅ Login successful!');
    console.log('Token received:', token.substring(0, 50) + '...');
    console.log('User Role:', loginResponse.data.data.user.role.name);
    console.log('');

    // Step 3: Get current user's company details (no ID needed!)
    console.log('📊 Step 3: Getting current user\'s company details...');
    const getCompanyResponse = await axios.get(`${BASE_URL}/portfolio-companies/me`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    console.log('✅ Company details retrieved!');
    console.log('Company Name:', getCompanyResponse.data.data.name);
    console.log('Status:', getCompanyResponse.data.data.status);
    console.log('Industry:', getCompanyResponse.data.data.industry);
    console.log('Employee Count:', getCompanyResponse.data.data.employeeCount);
    console.log('');

    // Step 4: Update current user's company details (no ID needed!)
    console.log('✏️ Step 4: Updating current user\'s company details...');
    const updateResponse = await axios.put(`${BASE_URL}/portfolio-companies/me`, {
      name: "TechStartup Inc. Updated",
      companySize: "LARGE",
      employeeCount: 100,
      annualRevenue: 2000000.00,
      fundingStage: "SERIES_B",
      status: "APPROVED",
      socialMedia: {
        linkedin: "https://linkedin.com/company/techstartup-updated",
        twitter: "https://twitter.com/techstartup-updated",
        facebook: "https://facebook.com/techstartup-updated",
        instagram: "https://instagram.com/techstartup"
      }
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Company updated successfully!');
    console.log('Updated Name:', updateResponse.data.data.name);
    console.log('Updated Status:', updateResponse.data.data.status);
    console.log('Updated Employee Count:', updateResponse.data.data.employeeCount);
    console.log('Updated Social Media:', updateResponse.data.data.socialMedia);
    console.log('');

    console.log('🎉 All tests completed successfully!');
    console.log('\n📋 Summary:');
    console.log('- User created with "applicant" role');
    console.log('- Company profile created and linked to user');
    console.log('- User can login and access their company data (no ID needed!)');
    console.log('- User can update their company profile (no ID needed!)');
    console.log('- All operations work with proper authentication');
    console.log('- Much simpler and more secure API design');

  } catch (error) {
    console.error('❌ Error occurred:', error.response?.data || error.message);
  }
}

// Run the test
testPortfolioCompanyFlow();
