// @ts-nocheck
import { prisma } from "../src/utils/database";

async function main() {
  try {
    const emails = ["logixvine@gmail.com", "logixvine@gmial.com"];

    const users = await prisma.user.findMany({
      where: {
        email: {
          in: emails
        }
      }
    });

    console.log("Found users:");
    for (const user of users) {
      const votingPower = user.votingPower !== null && user.votingPower !== undefined
        ? Number(user.votingPower)
        : null;

      console.log({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roleCode: user.roleCode,
        userDepartment: user.userDepartment,
        departmentRole: user.departmentRole,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        votingPower
      });
    }
  } catch (error) {
    console.error("Error fetching users", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();

