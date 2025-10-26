import axios from 'axios';

// Lysp Company Application Data
const lyspApplication = {
  // Applicant Information
  applicantName: "Nyasha Muzondo",
  applicantEmail: "nyasha@lysp.io",
  applicantPhone: "+263771234567",
  applicantAddress: "123 Business Street, Harare, Zimbabwe",
  
  // Business Information
  businessName: "Lysp",
  businessDescription: "AI-powered fintech solution for SMEs in Zimbabwe, providing digital banking and financial services",
  industry: "Technology",
  businessStage: "STARTUP",
  foundingDate: "2023-01-15",
  
  // Investment Details
  requestedAmount: 750000, // $750,000 investment request
  fundId: undefined, // Optional - can be assigned later
  
  // Required Documents (simulated URLs for demo)
  documents: [
    {
      documentType: "BUSINESS_PLAN",
      fileName: "lysp_business_plan.pdf",
      fileUrl: "https://drive.google.com/file/d/1lysp_business_plan_2024.pdf",
      fileSize: 2048576, // 2MB
      isRequired: true
    },
    {
      documentType: "PROOF_OF_CONCEPT",
      fileName: "lysp_poc_demo.mp4",
      fileUrl: "https://drive.google.com/file/d/1lysp_poc_demo_2024.mp4",
      fileSize: 15728640, // 15MB
      isRequired: true
    },
    {
      documentType: "MARKET_RESEARCH",
      fileName: "lysp_market_analysis.pdf",
      fileUrl: "https://drive.google.com/file/d/1lysp_market_research_2024.pdf",
      fileSize: 1024000, // 1MB
      isRequired: true
    },
    {
      documentType: "PROJECTED_CASH_FLOWS",
      fileName: "lysp_financial_projections.xlsx",
      fileUrl: "https://drive.google.com/file/d/1lysp_financial_projections_2024.xlsx",
      fileSize: 512000, // 512KB
      isRequired: true
    },
    {
      documentType: "HISTORICAL_FINANCIALS",
      fileName: "lysp_historical_financials.pdf",
      fileUrl: "https://drive.google.com/file/d/1lysp_historical_financials_2024.pdf",
      fileSize: 768000, // 768KB
      isRequired: false
    }
  ]
};

async function submitLyspApplication() {
  try {
    console.log('🚀 Submitting Lysp Company Application...');
    console.log('📋 Application Details:');
    console.log(`   Company: ${lyspApplication.businessName}`);
    console.log(`   Applicant: ${lyspApplication.applicantName}`);
    console.log(`   Email: ${lyspApplication.applicantEmail}`);
    console.log(`   Investment Request: $${lyspApplication.requestedAmount.toLocaleString()}`);
    console.log(`   Industry: ${lyspApplication.industry}`);
    console.log(`   Stage: ${lyspApplication.businessStage}`);
    console.log(`   Documents: ${lyspApplication.documents.length} files`);
    
    // Make API call to submit application
    const response = await axios.post('http://localhost:3000/api/applications', lyspApplication, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('\n✅ Application Submitted Successfully!');
    console.log('📊 Response Details:');
    console.log(`   Status: ${response.status}`);
    console.log(`   Success: ${response.data.success}`);
    console.log(`   Message: ${response.data.message}`);
    
    if (response.data.data) {
      console.log('\n📋 Application Data:');
      console.log(`   Application ID: ${response.data.data.id}`);
      console.log(`   Current Stage: ${response.data.data.currentStage}`);
      console.log(`   Submitted At: ${response.data.data.submittedAt}`);
      console.log(`   Business Name: ${response.data.data.businessName}`);
      console.log(`   Requested Amount: $${response.data.data.requestedAmount?.toLocaleString()}`);
      
      if (response.data.data.documents && response.data.data.documents.length > 0) {
        console.log('\n📄 Documents Uploaded:');
        response.data.data.documents.forEach((doc: any, index: number) => {
          console.log(`   ${index + 1}. ${doc.documentType} - ${doc.fileName} (${(doc.fileSize / 1024).toFixed(1)}KB)`);
        });
      }
    }
    
    console.log('\n📧 Next Steps:');
    console.log('   1. Check email for application confirmation');
    console.log('   2. Admin will review the application');
    console.log('   3. Due diligence process will begin');
    console.log('   4. Board review for final decision');
    console.log('   5. If approved, user account will be created automatically');
    
  } catch (error: any) {
    console.error('\n❌ Error submitting application:');
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Message: ${error.response.data?.message || 'Unknown error'}`);
      console.error(`   Details: ${JSON.stringify(error.response.data, null, 2)}`);
    } else if (error.request) {
      console.error('   Network Error: Could not reach the server');
      console.error('   Make sure the server is running on http://localhost:3000');
    } else {
      console.error(`   Error: ${error.message}`);
    }
  }
}

// Run the application submission
submitLyspApplication();



