/**
 * Merges CFO module permissions into the Chief Financial Officer role.
 * Idempotent. Run: npm run db:seed:cfo-module-permissions
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  CFO_MODULE_PERMISSIONS,
  mergeCfoModulePermissions,
} from "../src/config/cfoModulePermissions";

const prisma = new PrismaClient();
const CFO_ROLE_NAME = "Chief Financial Officer";

async function main() {
  const role = await prisma.role.findFirst({
    where: { name: CFO_ROLE_NAME },
  });

  if (!role) {
    console.log(`[skip] Role not found: ${CFO_ROLE_NAME}`);
    return;
  }

  const existing = (role.permissions as { name: string; value: boolean }[]) || [];
  const beforeCount = existing.length;
  const merged = mergeCfoModulePermissions(existing);
  const afterCount = merged.length;

  if (afterCount === beforeCount) {
    const names = new Set(existing.map((p) => p.name));
    const allPresent = CFO_MODULE_PERMISSIONS.every((p) => names.has(p.name));
    if (allPresent) {
      console.log(`[skip] ${CFO_ROLE_NAME} already has all CFO module permissions (${beforeCount} total)`);
      return;
    }
  }

  await prisma.role.update({
    where: { id: role.id },
    data: { permissions: merged as object[] },
  });

  console.log(
    `[ok] ${CFO_ROLE_NAME}: permissions ${beforeCount} -> ${afterCount} (merged ${CFO_MODULE_PERMISSIONS.length} CFO module grants)`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
