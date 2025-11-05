const axios = require('axios');

const BASE_URL = 'http://localhost:3004';

async function testLogin() {
  console.log('\n🔐 Testing Admin Login...\n');

  try {
    const response = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: 'admin@nvccz.co.zw',
      password: 'admin123'
    });

    if (response.data.success) {
      console.log('✅ Login successful!');
      console.log(`   Token: ${response.data.token.substring(0, 50)}...`);
      console.log(`   User: ${response.data.user.firstName} ${response.data.user.lastName}`);
      console.log(`   Email: ${response.data.user.email}`);
      console.log(`   Role: ${response.data.user.role || 'N/A'}`);
      console.log(`   Department: ${response.data.user.department || 'N/A'}`);
      console.log(`   Is Applicant: ${response.data.user.isApplicant || false}`);
    } else {
      console.log('❌ Login failed:', response.data.message);
    }
  } catch (error) {
    if (error.response) {
      console.log('❌ Login failed:', error.response.status);
      console.log('   Message:', error.response.data.message || error.response.data);
    } else {
      console.log('❌ Error:', error.message);
    }
  }
}

testLogin();

