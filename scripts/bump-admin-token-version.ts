/**
 * Bump admin token_version only — invalidates JWTs once authenticate.ts fix is deployed.
 *
 * Usage: npx ts-node scripts/bump-admin-token-version.ts
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";

const ADMIN_EMAIL = "admin@nvccz.co.zw";

async function main() {
  const before = await prisma.$queryRawUnsafe<Array<{ token_version: bigint | number }>>(
    `SELECT COALESCE(token_version, 0) AS token_version FROM users WHERE email = ?`,
    ADMIN_EMAIL
  );
  const oldV = Number(before[0]?.token_version ?? 0);

  await prisma.$executeRawUnsafe(
    `UPDATE users SET token_version = token_version + 1, updatedAt = NOW() WHERE email = ?`,
    ADMIN_EMAIL
  );

  const after = await prisma.$queryRawUnsafe<Array<{ token_version: bigint | number }>>(
    `SELECT COALESCE(token_version, 0) AS token_version FROM users WHERE email = ?`,
    ADMIN_EMAIL
  );
  const newV = Number(after[0]?.token_version ?? 0);

  console.log(`admin@nvccz.co.zw token_version: ${oldV} -> ${newV}`);
  console.log("Deploy api.arcus.co.zw with the authenticate.ts fix for this to take effect.");
}

main()
  .catch((e) => {
    console.error(e?.message || e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
