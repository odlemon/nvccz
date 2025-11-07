// @ts-nocheck
import { prisma } from "../src/utils/database";

const email = "logixvine@gmial.com";

async function main() {
  try {
    const result = await prisma.user.deleteMany({
      where: {
        email: email.trim().toLowerCase()
      }
    });

    console.log(`Deleted ${result.count} user(s) with email ${email}`);
  } catch (error) {
    console.error("Failed to delete user", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();

