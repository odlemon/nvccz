import axios from 'axios';

// Nyasha K Application Data - Pricing Intelligence Platform for Law Firms
const nyashaKApplication = {
  // Applicant Information
  applicantName: "Nyasha K",
  applicantEmail: "nyasha@lysp.io",
  applicantPhone: "+263771234567",
  applicantAddress: "123 Business Street, Harare, Zimbabwe",
  
  // Business Information
  businessName: "LegalPricing AI",
  businessDescription: "AI-powered pricing intelligence platform for law firms, providing competitive analysis, market insights, and dynamic pricing recommendations to optimize legal service pricing strategies",
  industry: "Legal Technology",
  businessStage: "STARTUP",
  foundingDate: "2023-06-15",
  
  // Investment Details
  requestedAmount: 500000, // $500,000 investment request
  fundId: undefined, // Optional - can be assigned later
  
  // Required Documents (simulated URLs for demo)
  documents: [
    {
      documentType: "BUSINESS_PLAN",
      fileName: "legal_pricing_ai_business_plan.pdf",
      fileUrl: "https://drive.google.com/file/d/1legal_pricing_ai_business_plan_2024.pdf",
      fileSize: 3072000, // 3MB
      isRequired: true
    },
    {
      documentType: "PROOF_OF_CONCEPT",
      fileName: "legal_pricing_ai_demo.mp4",
      fileUrl: "https://drive.google.com/file/d/1legal_pricing_ai_demo_2024.mp4",
      fileSize: 20971520, // 20MB
      isRequired: true
    },
    {
      documentType: "MARKET_RESEARCH",
      fileName: "legal_tech_market_analysis.pdf",
      fileUrl: "https://drive.google.com/file/d/1legal_tech_market_research_2024.pdf",
      fileSize: 1536000, // 1.5MB
      isRequired: true
    },
    {
      documentType: "PROJECTED_CASH_FLOWS",
      fileName: "legal_pricing_ai_financial_projections.xlsx",
      fileUrl: "https://drive.google.com/file/d/1legal_pricing_ai_financial_projections_2024.xlsx",
      fileSize: 768000, // 768KB
      isRequired: true
    },
    {
      documentType: "HISTORICAL_FINANCIALS",
      fileName: "legal_pricing_ai_historical_financials.pdf",
      fileUrl: "https://drive.google.com/file/d/1legal_pricing_ai_historical_financials_2024.pdf",
      fileSize: 1024000, // 1MB
      isRequired: false
    }
  ]
};

async function submitNyashaKApplication() {
  try {
    console.log('🚀 Submitting Nyasha K Application - Legal Pricing AI...');
    console.log('📋 Application Details:');
    console.log(`   Company: ${nyashaKApplication.businessName}`);
    console.log(`   Applicant: ${nyashaKApplication.applicantName}`);
    console.log(`   Email: ${nyashaKApplication.applicantEmail}`);
    console.log(`   Investment Request: $${nyashaKApplication.requestedAmount.toLocaleString()}`);
    console.log(`   Industry: ${nyashaKApplication.industry}`);
    console.log(`   Stage: ${nyashaKApplication.businessStage}`);
    console.log(`   Business: ${nyashaKApplication.businessDescription}`);
    console.log(`   Documents: ${nyashaKApplication.documents.length} files`);
    
    // Make API call to submit application
    const response = await axios.post('http://localhost:3000/api/applications', nyashaKApplication, {
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
    
    console.log('\n🎯 Business Description:');
    console.log('   AI-powered pricing intelligence platform for law firms');
    console.log('   - Competitive analysis and market insights');
    console.log('   - Dynamic pricing recommendations');
    console.log('   - Legal service pricing optimization');
    console.log('   - Market intelligence for legal professionals');
    
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
submitNyashaKApplication();



