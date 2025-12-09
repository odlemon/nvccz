// @ts-nocheck
import { prisma } from "../src/utils/database";

const searchTerm = process.argv[2] || "";

if (!searchTerm) {
  console.error("❌ Please provide a search term");
  console.log("Usage: npx ts-node scripts/find-user-by-email.ts searchterm");
  process.exit(1);
}

async function main() {
  try {
    const users = await prisma.user.findMany({
      where: {
        email: {
          contains: searchTerm,
        }
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        userDepartment: true
      }
    });

    if (users.length === 0) {
      console.log(`❌ No users found with email containing: ${searchTerm}`);
    } else {
      console.log(`\n📋 Found ${users.length} user(s) with email containing "${searchTerm}":\n`);
      users.forEach((user, index) => {
        console.log(`${index + 1}. Email: ${user.email}`);
        console.log(`   Name: ${user.firstName} ${user.lastName}`);
        console.log(`   Department: ${user.userDepartment || 'N/A'}`);
        console.log(`   ID: ${user.id}\n`);
      });
    }
  } catch (error) {
    console.error("❌ Error searching for users:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();


