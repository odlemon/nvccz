import { prisma } from '../src/utils/database';

async function listUsersWithRoles() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      userDepartment: true,
      role: {
        select: {
          name: true
        }
      }
    }
  });

  const filtered = users.filter((user) => user.role && user.role.name);
  console.log(JSON.stringify(filtered, null, 2));
}

listUsersWithRoles()
  .catch((error) => {
    console.error('Failed to list users', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

