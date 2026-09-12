import axios from "axios";

async function testRollupAPI() {
  try {
    console.log("🧪 Testing Roll-up API Endpoint");
    console.log("═══════════════════════════════════════════════════════════\n");

    // Step 1: Login
    console.log("Step 1: Logging in...");
    const loginResponse = await axios.post("http://localhost:3000/api/auth/login", {
      email: "admin@nts.com",
      password: "admin123"
    });

    const token = loginResponse.data?.data?.token || loginResponse.data?.token;
    if (!token) {
      console.error("❌ Login failed - no token received");
      console.error("Response:", JSON.stringify(loginResponse.data, null, 2));
      return;
    }
    console.log("✅ Logged in successfully\n");

    // Step 2: Find the Payroll control goal
    console.log("Step 2: Finding Payroll control goal...");
    const goalsResponse = await axios.get("http://localhost:3000/api/performance/goals", {
      headers: { Authorization: `Bearer ${token}` }
    });

    const goals = goalsResponse.data?.goals || goalsResponse.data?.data || [];
    
    console.log(`Found ${goals.length} goals`);
    
    const payrollGoal = goals.find((g: any) => 
      g.title && g.title.toLowerCase().includes("payroll")
    );

    if (!payrollGoal) {
      console.log("❌ Payroll goal not found");
      console.log("Available goals:", goals.map((g: any) => g.title || g.id).join(", "));
      return;
    }

    console.log(`✅ Found goal: "${payrollGoal.title}" (${payrollGoal.id})\n`);

    // Step 3: Test GET roll-up endpoint
    console.log("Step 3: Testing GET /api/performance/rollup/:goalId...");
    const rollupResponse = await axios.get(
      `http://localhost:3000/api/performance/rollup/${payrollGoal.id}`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    const rollupData = rollupResponse.data.data;
    console.log("✅ Roll-up data retrieved:");
    console.log(`   Goal:`);
    console.log(`   - Title: ${rollupData.goal.title}`);
    console.log(`   - Target Value: $${rollupData.goal.targetValue}`);
    console.log(`   - Current Value: $${rollupData.goal.currentValue}`);
    console.log(`   - Progress Percentage: ${rollupData.goal.progressPercentage}%`);
    console.log(`   - Stage: ${rollupData.goal.stage}`);
    console.log(`   Roll-up:`);
    console.log(`   - Total Sub-goals: ${rollupData.rollup.totalSubGoals}`);
    console.log(`   - Total Target Value: $${rollupData.rollup.totalTargetValue}`);
    console.log(`   - Total Current Value: $${rollupData.rollup.totalCurrentValue}`);
    console.log(`   - Overall Progress: ${rollupData.rollup.overallProgressPercentage}%\n`);

    // Step 4: Test POST recalculate endpoint
    console.log("Step 4: Testing POST /api/performance/rollup/:goalId/recalculate...");
    const recalculateResponse = await axios.post(
      `http://localhost:3000/api/performance/rollup/${payrollGoal.id}/recalculate`,
      {},
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    const recalculatedData = recalculateResponse.data.data;
    console.log("✅ Roll-up recalculated:");
    console.log(`   Goal:`);
    console.log(`   - Target Value: $${recalculatedData.goal.targetValue}`);
    console.log(`   - Current Value: $${recalculatedData.goal.currentValue}`);
    console.log(`   - Progress Percentage: ${recalculatedData.goal.progressPercentage}%`);
    console.log(`   - Stage: ${recalculatedData.goal.stage}`);
    console.log(`   Roll-up:`);
    console.log(`   - Total Sub-goals: ${recalculatedData.rollup.totalSubGoals}`);
    console.log(`   - Total Target Value: $${recalculatedData.rollup.totalTargetValue}`);
    console.log(`   - Total Current Value: $${recalculatedData.rollup.totalCurrentValue}`);
    console.log(`   - Overall Progress: ${recalculatedData.rollup.overallProgressPercentage}%\n`);

    // Verify the data
    const goalCurrent = parseFloat(recalculatedData.goal.currentValue);
    const goalTarget = parseFloat(recalculatedData.goal.targetValue);
    const rollupCurrent = recalculatedData.rollup.totalCurrentValue;
    const rollupTarget = recalculatedData.rollup.totalTargetValue;

    console.log("📊 Verification:");
    if (Math.abs(goalCurrent - rollupCurrent) < 0.01 && Math.abs(goalTarget - rollupTarget) < 0.01) {
      console.log("✅ Goal values match roll-up values!");
    } else {
      console.log("⚠️ Mismatch detected!");
      console.log(`   Goal: $${goalCurrent} / $${goalTarget}`);
      console.log(`   Roll-up: $${rollupCurrent} / $${rollupTarget}`);
    }

    if (parseFloat(recalculatedData.goal.currentValue) > 0) {
      console.log("✅ Current value is not zero!");
    } else {
      console.log("❌ Current value is zero - this is wrong!");
    }

    if (parseFloat(recalculatedData.goal.progressPercentage) > 0) {
      console.log("✅ Progress percentage is not zero!");
    } else {
      console.log("❌ Progress percentage is zero - this is wrong!");
    }

    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("✅ API Test Complete");
    console.log("═══════════════════════════════════════════════════════════");

  } catch (error: any) {
    console.error("❌ Error testing API:", error.response?.data || error.message);
    throw error;
  }
}

testRollupAPI()
  .then(() => {
    console.log("\n✅ Test completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  });

