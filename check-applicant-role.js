const axios = require('axios');
const BASE_URL = 'http://localhost:3004/api';

const EMAIL = 'nyasha@lysp.io';
const PASSWORD = '0hmic0nmBR9IOROU';

async function checkUserRole() {
  try {
    console.log('\n🔐 Logging in...');
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
      email: EMAIL,
      password: PASSWORD
    });

    if (loginResponse.data.success && loginResponse.data.user) {
      const user = loginResponse.data.user;
      console.log('\n📋 User Information:');
      console.log('   ID:', user.id);
      console.log('   Email:', user.email);
      console.log('   Name:', user.firstName, user.lastName);
      console.log('   Role ID:', user.roleId);
      console.log('   Role Name:', user.role?.name || 'N/A');
      console.log('   Role Code:', user.roleCode || 'N/A');
      console.log('   Department:', user.userDepartment || 'N/A');
      console.log('   Department Role:', user.departmentRole || 'N/A');
      
      console.log('\n🔍 Role Check:');
      const isApplicantByName = user.role?.name === 'applicant';
      const isApplicantByCode = user.roleCode === 'APPLICANT';
      console.log('   role.name === "applicant":', isApplicantByName);
      console.log('   roleCode === "APPLICANT":', isApplicantByCode);
      console.log('   Is Applicant:', isApplicantByName || isApplicantByCode);
      
      // Test one endpoint to see if authorization works
      console.log('\n🧪 Testing authorization...');
      const profileResponse = await axios.get(`${BASE_URL}/applicant/profile`, {
        headers: {
          'Authorization': `Bearer ${loginResponse.data.token}`
        }
      });
      
      if (profileResponse.data.success) {
        console.log('   ✅ Access granted - user is recognized as applicant');
      } else {
        console.log('   ❌ Access denied:', profileResponse.data.message);
      }
    }
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

checkUserRole();

