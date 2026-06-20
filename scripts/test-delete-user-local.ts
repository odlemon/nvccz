// @ts-nocheck
/**
 * Local DB delete test (uses DATABASE_URL from .env).
 * Usage: USER_ID=cmk24c3zx0011kt83fsuqqn84 npm run test:delete-user-local
 */
import "dotenv/config";
import { UserService } from "../src/services/UserService";
import { scanUserReferences } from "../src/services/userDeleteHelpers";
import { prisma } from "../src/utils/database";

const USER_ID = process.env.USER_ID || "cmk24c3zx0011kt83fsuqqn84";

async function main() {
  const user = await prisma.user.findUnique({
    where: { id: USER_ID },
    select: { id: true, email: true, firstName: true, lastName: true, role: { select: { name: true } } }
  });
  if (!user) {
    console.log("User not found — may already be deleted.");
    return;
  }
  console.log("User:", user);

  const before = await scanUserReferences(USER_ID);
  console.log("References before delete:");
  console.log(JSON.stringify(before, null, 2));

  const result = await UserService.deleteUser(USER_ID);
  console.log("Delete result:", result);

  const after = await prisma.user.findUnique({ where: { id: USER_ID } });
  console.log("User still exists?", Boolean(after));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
