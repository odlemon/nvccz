// @ts-nocheck
import { prisma } from "../src/utils/database";

const REMOVE_EMAIL = "info@niakazi.com";
const SET_100_EMAIL = "nyasha@lysp.io";

async function main() {
  try {
    console.log("🔍 Starting voting power update process...\n");

    // Step 1: Remove voting power from info@niakazi.com
    console.log(`📋 Step 1: Removing voting power from ${REMOVE_EMAIL}`);
    const userToRemove = await prisma.user.findUnique({
      where: {
        email: REMOVE_EMAIL.toLowerCase()
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        userDepartment: true,
        roleCode: true,
        votingPower: true
      }
    });

    if (!userToRemove) {
      console.log(`   ⚠️  No user found with email: ${REMOVE_EMAIL}`);
    } else {
      console.log(`   ✅ Found user:`);
      console.log(`      ID: ${userToRemove.id}`);
      console.log(`      Name: ${userToRemove.firstName} ${userToRemove.lastName}`);
      console.log(`      Department: ${userToRemove.userDepartment || 'N/A'}`);
      console.log(`      Role: ${userToRemove.roleCode || 'N/A'}`);
      console.log(`      Current Voting Power: ${userToRemove.votingPower || 'null'}%`);
      
      // Check if user is eligible for voting power
      if (userToRemove.userDepartment !== "Investments" || 
          !["BOARD_CHAIR", "BOARD_MEMBER"].includes(userToRemove.roleCode || "")) {
        console.log(`   ⚠️  User is not in Investments department or doesn't have board role. Skipping...`);
      } else {
        await prisma.user.update({
          where: { id: userToRemove.id },
          data: { votingPower: null }
        });
        console.log(`   ✅ Successfully removed voting power from ${REMOVE_EMAIL}\n`);
      }
    }

    // Step 2: Set voting power to 100% for nyasha@lysp.io
    console.log(`📋 Step 2: Setting voting power to 100% for ${SET_100_EMAIL}`);
    const userToSet = await prisma.user.findUnique({
      where: {
        email: SET_100_EMAIL.toLowerCase()
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        userDepartment: true,
        roleCode: true,
        votingPower: true
      }
    });

    if (!userToSet) {
      console.log(`   ❌ No user found with email: ${SET_100_EMAIL}`);
      console.log(`   ⚠️  Cannot proceed without this user.`);
      process.exit(1);
    }

    console.log(`   ✅ Found user:`);
    console.log(`      ID: ${userToSet.id}`);
    console.log(`      Name: ${userToSet.firstName} ${userToSet.lastName}`);
    console.log(`      Department: ${userToSet.userDepartment || 'N/A'}`);
    console.log(`      Role: ${userToSet.roleCode || 'N/A'}`);
    console.log(`      Current Voting Power: ${userToSet.votingPower || 'null'}%`);

    // Check if user is eligible for voting power
    if (userToSet.userDepartment !== "Investments" || 
        !["BOARD_CHAIR", "BOARD_MEMBER"].includes(userToSet.roleCode || "")) {
      console.log(`   ❌ User is not in Investments department or doesn't have board role.`);
      console.log(`   ⚠️  Cannot set voting power for this user.`);
      process.exit(1);
    }

    // Set voting power to 100
    await prisma.user.update({
      where: { id: userToSet.id },
      data: { votingPower: 100 }
    });
    console.log(`   ✅ Successfully set voting power to 100% for ${SET_100_EMAIL}\n`);

    // Step 3: Verify final state
    console.log(`📋 Step 3: Verifying final voting power configuration`);
    const allVotingMembers = await prisma.user.findMany({
      where: {
        userDepartment: "Investments",
        roleCode: {
          in: ["BOARD_CHAIR", "BOARD_MEMBER"]
        }
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        roleCode: true,
        votingPower: true
      }
    });

    console.log(`\n   📊 Current voting members:`);
    let totalPower = 0;
    for (const member of allVotingMembers) {
      const power = member.votingPower ? Number(member.votingPower) : 0;
      totalPower += power;
      console.log(`      - ${member.firstName} ${member.lastName} (${member.email}): ${power}%`);
    }
    console.log(`\n   ✅ Total voting power: ${totalPower}%`);

    if (totalPower === 100) {
      console.log(`\n🎉 Voting power configuration completed successfully!`);
    } else {
      console.log(`\n⚠️  Warning: Total voting power is ${totalPower}%, not 100%`);
    }

  } catch (error: any) {
    console.error("❌ Failed to update voting powers:", error.message);
    if (error.stack) {
      console.error("Stack trace:", error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
