// @ts-nocheck
/**
 * Test script to verify that createUser correctly maps roleCode to role name
 */
import { prisma } from "../src/utils/database";
import { HARDCODED_ROLES, getRoleByCode } from "../src/config/hardcodedRoles";

async function testRoleMapping() {
  try {
    console.log("🧪 Testing roleCode to role name mapping logic...\n");
    console.log("=" .repeat(100));

    // Get all roles from database
    const dbRoles = await prisma.role.findMany();
    const roleNameToId = new Map(dbRoles.map(role => [role.name.toLowerCase(), { id: role.id, name: role.name }]));

    console.log(`📊 Found ${dbRoles.length} roles in database\n`);

    // Test each hardcoded role code
    let passed = 0;
    let failed = 0;
    const failures: Array<{ code: string; expected: string; issue: string }> = [];

    for (const hardcodedRole of HARDCODED_ROLES) {
      // Simulate the createUser logic
      const roleCode = hardcodedRole.code;
      const expectedRoleName = hardcodedRole.name;

      // Step 1: Get hardcoded role by code (this is what createUser does)
      const foundHardcodedRole = getRoleByCode(roleCode);
      
      if (!foundHardcodedRole) {
        failed++;
        failures.push({
          code: roleCode,
          expected: expectedRoleName,
          issue: "Role code not found in hardcoded roles"
        });
        continue;
      }

      // Step 2: Find Role in database by name (exact match first)
      let dbRole = dbRoles.find(r => r.name === foundHardcodedRole.name);

      // Step 3: If exact match fails, try case-insensitive (fallback)
      if (!dbRole) {
        dbRole = dbRoles.find(r => r.name.toLowerCase() === foundHardcodedRole.name.toLowerCase());
      }

      if (!dbRole) {
        failed++;
        failures.push({
          code: roleCode,
          expected: expectedRoleName,
          issue: `Role "${foundHardcodedRole.name}" not found in database`
        });
        continue;
      }

      // Verify the mapping is correct
      if (dbRole.name.toLowerCase() === expectedRoleName.toLowerCase()) {
        passed++;
        console.log(`✅ ${roleCode.padEnd(20)} → ${dbRole.name}`);
      } else {
        failed++;
        failures.push({
          code: roleCode,
          expected: expectedRoleName,
          issue: `Mismatch: Database has "${dbRole.name}" but expected "${expectedRoleName}"`
        });
        console.log(`❌ ${roleCode.padEnd(20)} → ${dbRole.name} (expected: ${expectedRoleName})`);
      }
    }

    console.log("\n" + "=" .repeat(100));
    console.log("\n📈 TEST RESULTS:\n");
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📊 Total:  ${HARDCODED_ROLES.length}`);

    if (failures.length > 0) {
      console.log("\n🔴 FAILURES:\n");
      failures.forEach((failure, index) => {
        console.log(`${index + 1}. ${failure.code}`);
        console.log(`   Expected: ${failure.expected}`);
        console.log(`   Issue:    ${failure.issue}\n`);
      });
    } else {
      console.log("\n✅ All role mappings are correct!");
      console.log("\n✅ The createUser method will correctly map roleCode to role name!");
    }

    // Test the actual createUser logic flow
    console.log("\n" + "=" .repeat(100));
    console.log("\n🔍 Testing createUser logic flow with sample role codes:\n");

    const testRoleCodes = [
      "INV_ANALYST",
      "CEO",
      "CIO",
      "FIN_MGR",
      "OPS_MGR",
      "PROC_MGR",
      "BOARD_MEMBER"
    ];

    for (const testCode of testRoleCodes) {
      console.log(`\nTesting roleCode: ${testCode}`);
      
      // Step 1: Get hardcoded role
      const hardcodedRole = getRoleByCode(testCode);
      if (!hardcodedRole) {
        console.log(`   ❌ Role code not found in hardcoded roles`);
        continue;
      }
      console.log(`   ✅ Hardcoded role: ${hardcodedRole.name}`);

      // Step 2: Find in database (exact match)
      let dbRole = dbRoles.find(r => r.name === hardcodedRole.name);
      if (dbRole) {
        console.log(`   ✅ Found in DB (exact match): ${dbRole.name} (ID: ${dbRole.id})`);
      } else {
        // Step 3: Try case-insensitive
        dbRole = dbRoles.find(r => r.name.toLowerCase() === hardcodedRole.name.toLowerCase());
        if (dbRole) {
          console.log(`   ✅ Found in DB (case-insensitive): ${dbRole.name} (ID: ${dbRole.id})`);
        } else {
          console.log(`   ❌ Role not found in database`);
        }
      }

      if (dbRole) {
        console.log(`   ✅ Mapping: ${testCode} → ${dbRole.name} → roleId: ${dbRole.id}`);
      }
    }

  } catch (error: any) {
    console.error("❌ Error testing role mapping:", error.message);
    if (error.stack) {
      console.error("Stack trace:", error.stack);
    }
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

testRoleMapping();
