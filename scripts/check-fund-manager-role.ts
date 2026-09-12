// @ts-nocheck
import { prisma } from "../src/utils/database";

async function checkFundManagerRole() {
  try {
    const roles = await prisma.role.findMany({
      where: {
        OR: [
          { name: { contains: "Fund" } },
          { name: { contains: "fund" } },
          { name: { contains: "FUND" } }
        ]
      }
    });

    console.log("Fund Manager related roles in database:");
    roles.forEach(role => {
      console.log(`  - ID: ${role.id}`);
      console.log(`    Name: "${role.name}"`);
      console.log(`    Description: ${role.description || 'N/A'}`);
      console.log("");
    });

    // Also check what the hardcoded role name is
    const { getRoleByCode } = await import("../src/config/hardcodedRoles");
    const fundMgrRole = getRoleByCode("FUND_MGR");
    console.log("Hardcoded role for FUND_MGR:");
    console.log(`  Name: "${fundMgrRole?.name}"`);
    console.log(`  Code: "${fundMgrRole?.code}"`);

  } catch (error: any) {
    console.error("Error:", error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkFundManagerRole();
