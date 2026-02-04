// @ts-nocheck
import { prisma } from "../src/utils/database";
import { HARDCODED_ROLES, getRoleByCode } from "../src/config/hardcodedRoles";

async function checkRoleMappings() {
  try {
    console.log("🔍 Checking role code mappings...\n");

    // Get all users with their roleCode and role
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        roleCode: true,
        roleId: true,
        role: {
          select: {
            id: true,
            name: true,
            description: true
          }
        }
      },
      orderBy: {
        email: 'asc'
      }
    });

    // Get all roles in database
    const allRoles = await prisma.role.findMany();
    const roleNameToId = new Map(allRoles.map(role => [role.name.toLowerCase(), role.id]));
    const roleIdToName = new Map(allRoles.map(role => [role.id, role.name]));

    // Create mapping from roleCode to expected role name
    const codeToExpectedRole = new Map(
      HARDCODED_ROLES.map(role => [role.code, role.name])
    );

    console.log(`📊 Found ${users.length} users to check\n`);
    console.log("=" .repeat(100));

    let correctMappings = 0;
    let incorrectMappings = 0;
    let missingRoleCode = 0;
    let invalidRoleCode = 0;
    const issues: Array<{
      email: string;
      name: string;
      roleCode: string | null;
      currentRole: string;
      expectedRole: string;
      issue: string;
    }> = [];

    for (const user of users) {
      const userName = `${user.firstName} ${user.lastName}`;
      
      if (!user.roleCode) {
        missingRoleCode++;
        issues.push({
          email: user.email,
          name: userName,
          roleCode: null,
          currentRole: user.role?.name || 'N/A',
          expectedRole: 'N/A',
          issue: 'Missing roleCode'
        });
        continue;
      }

      const expectedRoleName = codeToExpectedRole.get(user.roleCode);
      
      if (!expectedRoleName) {
        invalidRoleCode++;
        issues.push({
          email: user.email,
          name: userName,
          roleCode: user.roleCode,
          currentRole: user.role?.name || 'N/A',
          expectedRole: 'N/A',
          issue: `Invalid roleCode: ${user.roleCode}`
        });
        continue;
      }

      const expectedRoleId = roleNameToId.get(expectedRoleName.toLowerCase());
      
      if (!expectedRoleId) {
        issues.push({
          email: user.email,
          name: userName,
          roleCode: user.roleCode,
          currentRole: user.role?.name || 'N/A',
          expectedRole: expectedRoleName,
          issue: `Expected role "${expectedRoleName}" not found in database`
        });
        continue;
      }

      const currentRoleName = user.role?.name || 'N/A';
      const isCorrect = user.roleId === expectedRoleId;

      if (isCorrect) {
        correctMappings++;
      } else {
        incorrectMappings++;
        issues.push({
          email: user.email,
          name: userName,
          roleCode: user.roleCode,
          currentRole: currentRoleName,
          expectedRole: expectedRoleName,
          issue: `Mismatch: Has "${currentRoleName}" but should have "${expectedRoleName}"`
        });
      }
    }

    // Print summary
    console.log("\n📈 SUMMARY\n");
    console.log("=" .repeat(100));
    console.log(`✅ Correct mappings:     ${correctMappings}`);
    console.log(`❌ Incorrect mappings:   ${incorrectMappings}`);
    console.log(`⚠️  Missing roleCode:      ${missingRoleCode}`);
    console.log(`🚫 Invalid roleCode:     ${invalidRoleCode}`);
    console.log(`📊 Total users:          ${users.length}`);
    console.log("=" .repeat(100));

    // Print issues
    if (issues.length > 0) {
      console.log("\n\n🔴 ISSUES FOUND:\n");
      console.log("=" .repeat(100));
      
      issues.forEach((issue, index) => {
        console.log(`\n${index + 1}. ${issue.name} (${issue.email})`);
        console.log(`   Role Code:     ${issue.roleCode || 'N/A'}`);
        console.log(`   Current Role:  ${issue.currentRole}`);
        console.log(`   Expected Role: ${issue.expectedRole}`);
        console.log(`   Issue:         ${issue.issue}`);
      });
    } else {
      console.log("\n✅ All role mappings are correct!");
    }

    // Check if all hardcoded roles exist in database
    console.log("\n\n🔍 CHECKING HARDCODED ROLES IN DATABASE:\n");
    console.log("=" .repeat(100));
    
    const missingRoles: string[] = [];
    for (const hardcodedRole of HARDCODED_ROLES) {
      const exists = roleNameToId.has(hardcodedRole.name.toLowerCase());
      if (!exists) {
        missingRoles.push(hardcodedRole.name);
        console.log(`❌ Missing: ${hardcodedRole.name} (code: ${hardcodedRole.code})`);
      } else {
        console.log(`✅ Found:  ${hardcodedRole.name} (code: ${hardcodedRole.code})`);
      }
    }

    if (missingRoles.length > 0) {
      console.log(`\n⚠️  ${missingRoles.length} hardcoded role(s) not found in database.`);
      console.log("   Run: npx ts-node scripts/sync-hardcoded-roles.ts");
    }

    // Show role code to role name mapping
    console.log("\n\n📋 ROLE CODE TO ROLE NAME MAPPING:\n");
    console.log("=" .repeat(100));
    const sortedRoles = [...HARDCODED_ROLES].sort((a, b) => a.code.localeCompare(b.code));
    sortedRoles.forEach(role => {
      const exists = roleNameToId.has(role.name.toLowerCase());
      const status = exists ? "✅" : "❌";
      console.log(`${status} ${role.code.padEnd(20)} → ${role.name}`);
    });

  } catch (error: any) {
    console.error("❌ Error checking role mappings:", error.message);
    if (error.stack) {
      console.error("Stack trace:", error.stack);
    }
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

checkRoleMappings();
