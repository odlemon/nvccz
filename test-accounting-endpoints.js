const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function testAccountingEndpoints() {
  console.log('🧪 Testing Accounting Module Endpoints...\n');

  try {
    // Test 1: Health check
    console.log('1. Testing health endpoint...');
    const healthResponse = await axios.get(`${BASE_URL}/health`);
    console.log('✅ Health check passed:', healthResponse.data.status);

    // Test 2: Get currencies
    console.log('\n2. Testing currencies endpoint...');
    const currenciesResponse = await axios.get(`${BASE_URL}/api/accounting/currencies`);
    console.log('✅ Currencies endpoint working:', currenciesResponse.data.success);
    console.log('   Found currencies:', currenciesResponse.data.data?.length || 0);

    // Test 3: Get vendors
    console.log('\n3. Testing vendors endpoint...');
    const vendorsResponse = await axios.get(`${BASE_URL}/api/accounting/vendors`);
    console.log('✅ Vendors endpoint working:', vendorsResponse.data.success);
    console.log('   Found vendors:', vendorsResponse.data.data?.length || 0);

    // Test 4: Get expense categories
    console.log('\n4. Testing expense categories endpoint...');
    const categoriesResponse = await axios.get(`${BASE_URL}/api/accounting/expense-categories`);
    console.log('✅ Expense categories endpoint working:', categoriesResponse.data.success);
    console.log('   Found categories:', categoriesResponse.data.data?.length || 0);

    // Test 5: Get expenses
    console.log('\n5. Testing expenses endpoint...');
    const expensesResponse = await axios.get(`${BASE_URL}/api/accounting/expenses`);
    console.log('✅ Expenses endpoint working:', expensesResponse.data.success);
    console.log('   Found expenses:', expensesResponse.data.data?.length || 0);

    console.log('\n🎉 All accounting endpoints are working correctly!');
    console.log('\n📚 API Documentation available at: http://localhost:3000/api-docs');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testAccountingEndpoints(); 