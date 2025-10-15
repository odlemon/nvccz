// @ts-nocheck
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Hardcoded departments
const DEPARTMENTS = [
  "Finance",
  "Operations",
  "Procurement",
  "Human Resources",
  "Marketing",
  "Legal",
  "IT"
];

// Department roles
const ROLES = [
  "HEAD",
  "DEPUTY",
  "MEMBER"
];

// Helper function to get random item from array
function getRandomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

// Helper function to distribute roles more realistically
// Most users are MEMBER, fewer DEPUTY, and even fewer HEAD
function getRandomRole() {
  const random = Math.random();
  if (random < 0.1) return "HEAD";      // 10% chance
  if (random < 0.3) return "DEPUTY";     // 20% chance
  return "MEMBER";                        // 70% chance
}

async function main() {
  console.log("\n╔════════════════════════════════════════════════════════════════╗");
  console.log("║  ASSIGN DEPARTMENTS AND ROLES TO USERS                         ║");
  console.log("║  Date: 2025-10-14                                              ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  console.log("📊 Available Departments:");
  DEPARTMENTS.forEach((dept, i) => console.log(`   ${i + 1}. ${dept}`));
  console.log("");

  console.log("👔 Available Roles:");
  ROLES.forEach((role, i) => console.log(`   ${i + 1}. ${role}`));
  console.log("");

  // Fetch all users
  console.log("🔍 Fetching existing users...");
  const users = await prisma.user.findMany({
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      userDepartment: true,
      departmentRole: true
    },
    orderBy: {
      firstName: 'asc'
    }
  });

  console.log(`✅ Found ${users.length} user(s)\n`);

  if (users.length === 0) {
    console.log("⚠️  No users found in the database.");
    return;
  }

  // Show preview of what will be updated
  console.log("📋 Preview of updates:\n");
  console.log("┌─────────────────────────────────────────────────────────────────┐");
  console.log("│ User                    │ Current           │ Will Assign       │");
  console.log("├─────────────────────────────────────────────────────────────────┤");

  const updates = users.map(user => {
    const department = getRandomItem(DEPARTMENTS);
    const role = getRandomRole();
    
    const userName = `${user.firstName} ${user.lastName}`.padEnd(23).substring(0, 23);
    const current = (user.userDepartment || 'None').padEnd(17).substring(0, 17);
    const willAssign = `${department} - ${role}`.padEnd(17).substring(0, 17);
    
    console.log(`│ ${userName} │ ${current} │ ${willAssign} │`);
    
    return {
      userId: user.id,
      email: user.email,
      department: department,
      role: role
    };
  });

  console.log("└─────────────────────────────────────────────────────────────────┘\n");

  // Count distribution
  const deptCounts = {};
  const roleCounts = { HEAD: 0, DEPUTY: 0, MEMBER: 0 };
  
  updates.forEach(u => {
    deptCounts[u.department] = (deptCounts[u.department] || 0) + 1;
    roleCounts[u.role]++;
  });

  console.log("📊 Distribution Summary:");
  console.log("\n   By Department:");
  Object.entries(deptCounts).forEach(([dept, count]) => {
    console.log(`   - ${dept}: ${count} user(s)`);
  });

  console.log("\n   By Role:");
  Object.entries(roleCounts).forEach(([role, count]) => {
    console.log(`   - ${role}: ${count} user(s)`);
  });

  console.log("\n⚠️  This will update ALL users in the database!");
  console.log("   Press Ctrl+C to cancel, or continue to proceed.\n");

  // Ask for confirmation
  const confirm = await new Promise(resolve => {
    process.stdout.write("? Are you sure you want to proceed? (y/N) ");
    process.stdin.once('data', data => {
      resolve(data.toString().trim().toLowerCase() === 'y');
    });
  });

  if (!confirm) {
    console.log("\n🚫 Update cancelled.\n");
    return;
  }

  console.log("\n🔄 Starting updates...\n");

  // Update users one by one
  let successCount = 0;
  let errorCount = 0;

  for (const update of updates) {
    try {
      await prisma.user.update({
        where: { id: update.userId },
        data: {
          userDepartment: update.department,
          departmentRole: update.role
        }
      });
      
      console.log(`✅ ${update.email.padEnd(40)} → ${update.department} (${update.role})`);
      successCount++;
    } catch (error) {
      console.error(`❌ Failed to update ${update.email}:`, error.message);
      errorCount++;
    }
  }

  console.log("\n════════════════════════════════════════════════════════════════");
  console.log("✅ UPDATE COMPLETE!");
  console.log("════════════════════════════════════════════════════════════════");
  console.log(`Summary:`);
  console.log(`   - Total users: ${users.length}`);
  console.log(`   - Successfully updated: ${successCount}`);
  console.log(`   - Errors: ${errorCount}`);
  console.log("");
  console.log("✅ All users now have departments and roles assigned!");
  console.log("════════════════════════════════════════════════════════════════\n");
}

main()
  .catch(e => {
    console.error("\n❌ An error occurred during the update:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });


