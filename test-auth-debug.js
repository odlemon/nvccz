const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';

async function testAuthDebug() {
  console.log('🔍 Testing Authentication Debug\n');

  try {
    // Step 1: Create a user and company
    console.log('📝 Step 1: Creating Portfolio Company...');
    const createResponse = await axios.post(`${BASE_URL}/portfolio-companies`, {
      firstName: "Test",
      lastName: "User",
      email: "test.user@example.com",
      password: "password123",
      name: "Test Company",
      registrationNumber: "TEST123456",
      industry: "Technology",
      foundingDate: "2020-01-15",
      address: "123 Test Street"
    });

    console.log('✅ Company created successfully!');
    console.log('User ID:', createResponse.data.data.user.id);
    console.log('User Role:', createResponse.data.data.user.role.name);
    console.log('');

    // Step 2: Login to get token
    console.log('🔐 Step 2: Logging in...');
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
      email: "test.user@example.com",
      password: "password123"
    });

    const token = loginResponse.data.data.token;
    console.log('✅ Login successful!');
    console.log('Token:', token.substring(0, 50) + '...');
    console.log('User Role:', loginResponse.data.data.user.role.name);
    console.log('');

    // Step 3: Test the /me endpoint
    console.log('📊 Step 3: Testing /me endpoint...');
    try {
      const meResponse = await axios.get(`${BASE_URL}/portfolio-companies/me`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      console.log('✅ /me endpoint works!');
      console.log('Company Name:', meResponse.data.data.name);
      console.log('Status:', meResponse.data.data.status);
    } catch (error) {
      console.log('❌ /me endpoint failed:');
      console.log('Status:', error.response?.status);
      console.log('Message:', error.response?.data?.message);
      console.log('Full error:', error.response?.data);
    }

    console.log('');
    console.log('🎉 Debug test completed!');

  } catch (error) {
    console.error('❌ Error occurred:', error.response?.data || error.message);
  }
}

// Run the test
testAuthDebug();


