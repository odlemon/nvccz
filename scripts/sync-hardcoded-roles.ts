//@ts-nocheck
import 'dotenv/config';
import { prisma } from '../src/utils/database';
import { HARDCODED_ROLES } from '../src/config/hardcodedRoles';

async function main() {
  const ADMIN_ROLE_NAMES = new Set(['admin', 'super admin', 'super_admin']);

  console.log('🔄 Synchronizing Prisma roles with hardcoded definitions (excluding admin roles)...');

  const existingRoles = await prisma.role.findMany();
  const roleByName = new Map(existingRoles.map(role => [role.name.toLowerCase(), role]));

  for (const hardcoded of HARDCODED_ROLES) {
    const key = hardcoded.name.toLowerCase();
    if (ADMIN_ROLE_NAMES.has(key)) {
      console.log(`⚠️ Skipping admin role: ${hardcoded.name}`);
      continue;
    }

    const existing = roleByName.get(key);
    if (existing) {
      await prisma.role.update({
        where: { id: existing.id },
        data: {
          name: hardcoded.name,
          description: hardcoded.description
        }
      });
      console.log(`🔁 Updated existing role: ${hardcoded.name}`);
    } else {
      await prisma.role.create({
        data: {
          name: hardcoded.name,
          description: hardcoded.description,
          permissions: []
        }
      });
      console.log(`➕ Created new role: ${hardcoded.name}`);
    }
  }

  console.log('✅ Role synchronization complete.');
}

main()
  .catch(error => {
    console.error('❌ Failed to synchronize roles:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


