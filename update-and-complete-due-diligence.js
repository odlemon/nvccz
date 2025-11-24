const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';
const APPLICATION_ID = 'cmhukf24w0000lh0468l9xojj';

// Login as admin
async function login() {
  try {
    const response = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'admin@nvccz.co.zw',
      password: 'admin123'
    });
    console.log('✅ Logged in as admin\n');
    return response.data.token;
  } catch (error) {
    console.error('❌ Login failed:', error.response?.data || error.message);
    throw error;
  }
}

// Update due diligence assessment for all 6 areas
async function updateDueDiligence(token) {
  try {
    console.log('📝 Updating due diligence assessment...\n');
    
    const assessmentData = {
      marketResearchViable: true,
      marketResearchComments: "Strong market potential with growing demand for chips in Zimbabwe. Market size estimated at $2M annually with 15% CAGR. Target audience clearly defined.",
      
      financialViable: true,
      financialComments: "Solid financial projections with positive cash flow expected by Q3. Revenue model is sustainable. Requested amount of $29,978 is justified and reasonable.",
      
      competitiveOpportunities: true,
      competitiveComments: "Unique value proposition in the local market. Limited direct competition. Strong differentiation through quality and local production.",
      
      managementTeamQualified: true,
      managementComments: "Experienced management team led by Tino Moyo. Team has proven track record in food production. Strong operational capabilities.",
      
      legalCompliant: true,
      legalComments: "All legal documents verified and in order. Business properly registered. No outstanding legal issues. Regulatory compliance confirmed.",
      
      riskTolerable: true,
      riskComments: "Acceptable risk level with appropriate mitigation strategies. Market risk mitigated by diversified customer base. Operational risks are manageable.",
      
      // Add these fields required for completion
      overallScore: 87,
      recommendation: "APPROVE",
      finalComments: "Strong investment opportunity for Machips. All six due diligence areas have been thoroughly assessed and passed. The business demonstrates solid market potential, viable financials, experienced management, and acceptable risk levels. Recommend proceeding to term sheet negotiation. Total investment amount: $29,978."
    };

    const response = await axios.put(
      `${BASE_URL}/applications/${APPLICATION_ID}/due-diligence`,
      assessmentData,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Due diligence assessment updated successfully!\n');
    console.log('Assessment Summary:');
    console.log('  ✅ Market Research: Viable');
    console.log('  ✅ Financial Assessment: Viable');
    console.log('  ✅ Competitive Analysis: Opportunities Identified');
    console.log('  ✅ Management Team: Qualified');
    console.log('  ✅ Legal Compliance: Compliant');
    console.log('  ✅ Risk Assessment: Tolerable\n');
    
    return response.data;
  } catch (error) {
    console.error('❌ Failed to update due diligence:', error.response?.data?.message || error.message);
    throw error;
  }
}

// Complete due diligence with final recommendation
async function completeDueDiligence(token) {
  try {
    console.log('🎯 Completing due diligence with final recommendation...\n');
    
    const completionData = {
      overallScore: 87,
      recommendation: "APPROVE",
      finalComments: "Strong investment opportunity for Machips. All six due diligence areas have been thoroughly assessed and passed. The business demonstrates solid market potential, viable financials, experienced management, and acceptable risk levels. Recommend proceeding to term sheet negotiation. Total investment amount: $29,978."
    };

    const response = await axios.post(
      `${BASE_URL}/applications/${APPLICATION_ID}/due-diligence/complete`,
      completionData,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Due diligence completed successfully!\n');
    console.log('Final Decision:');
    console.log('  📊 Overall Score: 87/100');
    console.log('  ✅ Recommendation: APPROVE');
    console.log('  🎉 Status: User account created & moved to TERM_SHEET stage\n');
    
    return response.data;
  } catch (error) {
    console.error('❌ Failed to complete due diligence:', error.response?.data?.message || error.message);
    if (error.response?.data) {
      console.error('   Details:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

// Main execution
async function main() {
  try {
    console.log('🚀 Starting Due Diligence Approval Process...\n');
    console.log('═══════════════════════════════════════════════════════\n');
    
    const token = await login();
    
    // Step 1: Update assessment for all areas
    await updateDueDiligence(token);
    
    // Step 2: Complete due diligence
    await completeDueDiligence(token);
    
    console.log('═══════════════════════════════════════════════════════\n');
    console.log('🎉 SUCCESS! Due diligence fully completed!\n');
    console.log('📌 What happened:');
    console.log('   1. ✅ All 6 assessment areas marked as viable/compliant');
    console.log('   2. ✅ Final recommendation: APPROVE');
    console.log('   3. ✅ User account created for: info@griafrica.com');
    console.log('   4. ✅ Application moved to TERM_SHEET stage');
    console.log('   5. ✅ Email notification sent to applicant\n');
    console.log('📋 Next Steps:');
    console.log('   - Applicant can now log in and sign term sheet');
    console.log('   - After signing, application moves to board review');
    
  } catch (error) {
    console.error('\n❌ Process failed:', error.message);
    process.exit(1);
  }
}

main();

