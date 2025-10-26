import axios from 'axios';

// Application ID from the previous Lysp application
const lyspApplicationId = 'cmh4k3d830000unb44xt2w6ef';

async function deleteLyspApplication() {
  try {
    console.log('🗑️ Deleting Lysp Application...');
    console.log(`📋 Application ID: ${lyspApplicationId}`);
    console.log('⚠️  Note: This requires admin authentication');
    
    // First, let's try to get the application details to confirm it exists
    try {
      const getResponse = await axios.get(`http://localhost:3000/api/applications/${lyspApplicationId}`, {
        headers: {
          'Authorization': 'Bearer admin_token_placeholder' // This will likely fail without proper auth
        }
      });
      
      console.log('📊 Application Details:');
      console.log(`   Business Name: ${getResponse.data.data?.businessName}`);
      console.log(`   Applicant: ${getResponse.data.data?.applicantName}`);
      console.log(`   Current Stage: ${getResponse.data.data?.currentStage}`);
      
    } catch (getError: any) {
      console.log('⚠️  Could not retrieve application details (likely due to authentication)');
      console.log(`   Error: ${getError.response?.status} - ${getError.response?.data?.message || 'Unauthorized'}`);
    }
    
    // Attempt to delete the application
    console.log('\n🗑️ Attempting to delete application...');
    const response = await axios.delete(`http://localhost:3000/api/applications/${lyspApplicationId}`, {
      headers: {
        'Authorization': 'Bearer admin_token_placeholder' // This will likely fail without proper auth
      }
    });
    
    console.log('\n✅ Application Deleted Successfully!');
    console.log('📊 Response Details:');
    console.log(`   Status: ${response.status}`);
    console.log(`   Success: ${response.data.success}`);
    console.log(`   Message: ${response.data.message}`);
    
  } catch (error: any) {
    console.error('\n❌ Error deleting application:');
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Message: ${error.response.data?.message || 'Unknown error'}`);
      
      if (error.response.status === 401) {
        console.error('\n🔐 Authentication Required:');
        console.error('   The delete operation requires admin authentication.');
        console.error('   You need to:');
        console.error('   1. Login as an admin user');
        console.error('   2. Get a valid admin token');
        console.error('   3. Use the token in the Authorization header');
        console.error('\n💡 Alternative: The application can be deleted through the admin dashboard');
      } else if (error.response.status === 400) {
        console.error('\n⚠️  Application Cannot Be Deleted:');
        console.error('   The application may not be in SHORTLISTED stage');
        console.error('   Only applications in SHORTLISTED stage can be deleted');
      } else if (error.response.status === 404) {
        console.error('\n❌ Application Not Found:');
        console.error('   The application may have already been deleted');
        console.error('   Or the application ID is incorrect');
      }
    } else if (error.request) {
      console.error('   Network Error: Could not reach the server');
      console.error('   Make sure the server is running on http://localhost:3000');
    } else {
      console.error(`   Error: ${error.message}`);
    }
    
    console.log('\n📋 Manual Deletion Options:');
    console.log('   1. Use the admin dashboard to delete the application');
    console.log('   2. Login as admin and use the API with proper authentication');
    console.log('   3. Delete directly from the database (if you have access)');
  }
}

// Run the deletion
deleteLyspApplication();



