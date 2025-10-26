const axios = require('axios');

async function testTransfersOnly() {
  try {
    // 1. Login to get token
    console.log('🔐 Logging in...');
    const loginResponse = await axios.post('http://localhost:3000/api/auth/login', {
      email: 'admin@nvccz.co.zw',
      password: 'admin123'
    });
    
    const loginData = loginResponse.data;
    if (!loginData.success) {
      throw new Error('Login failed: ' + loginData.message);
    }
    
    const token = loginData.token;
    console.log('✅ Login successful');
    
    // 2. Test Transfers
    console.log('\n💸 Testing Transfers...');
    const transfersResponse = await axios.get('http://localhost:3000/api/cashbook/transfers', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    const transfersData = transfersResponse.data;
    console.log('Transfers Response:', JSON.stringify(transfersData, null, 2));
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

testTransfersOnly();

