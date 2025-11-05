const axios = require('axios');
const BASE_URL = 'http://localhost:3004/api';

const EMAIL = 'nyasha@lysp.io';
const PASSWORD = '0hmic0nmBR9IOROU';

async function checkUserRoleDetails() {
  try {
    console.log('\n🔐 Logging in...');
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
      email: EMAIL,
      password: PASSWORD
    });

    if (loginResponse.data.success && loginResponse.data.token) {
      const token = loginResponse.data.token;
      
      // Get profile to see what data is available
      console.log('\n📋 Getting user profile...');
      const profileResponse = await axios.get(`${BASE_URL}/applicant/profile`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      console.log('Profile Response:', JSON.stringify(profileResponse.data, null, 2));
      
      // Also check what the auth endpoint returns
      console.log('\n📋 Login Response User Data:');
      console.log(JSON.stringify(loginResponse.data.user, null, 2));
    }
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

checkUserRoleDetails();

