//@ts-nocheck
import 'dotenv/config';
import { prisma } from '../src/utils/database';
import { HARDCODED_ROLES } from '../src/config/hardcodedRoles';

async function main() {
  console.log('🔄 Synchronizing user.roleId with hardcoded role codes...');

  const codeToRole = new Map(HARDCODED_ROLES.map(role => [role.code, role]));

  const roles = await prisma.role.findMany();
  const roleNameToId = new Map(roles.map(role => [role.name.toLowerCase(), role.id]));

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      roleId: true,
      roleCode: true
    }
  });

  for (const user of users) {
    if (!user.roleCode) {
      continue;
    }

    const hardcoded = codeToRole.get(user.roleCode);
    if (!hardcoded) {
      console.warn(`⚠️ No hardcoded role found for code ${user.roleCode} (user ${user.email})`);
      continue;
    }

    const targetRoleId = roleNameToId.get(hardcoded.name.toLowerCase());
    if (!targetRoleId) {
      console.warn(`⚠️ No role record found for ${hardcoded.name} (user ${user.email}). Did you run sync-hardcoded-roles?`);
      continue;
    }

    if (user.roleId === targetRoleId) {
      continue;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { roleId: targetRoleId }
    });

    console.log(`✅ Updated ${user.email} → ${hardcoded.name}`);
  }

  console.log('🎉 User role synchronization complete.');
}

main()
  .catch(error => {
    console.error('❌ Failed to synchronize user roles:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


