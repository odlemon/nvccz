/**
 * Reassign events with missing author users to the first admin user.
 * Idempotent. Run: npm run db:repair:event-authors
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const admin =
    (await prisma.user.findFirst({
      where: { email: { contains: "admin" } },
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true },
    })) ||
    (await prisma.user.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true },
    }));

  if (!admin) {
    console.log("[skip] No users in database");
    return;
  }

  const events = await prisma.event.findMany({ select: { id: true, authorId: true } });
  const userIds = new Set(
    (
      await prisma.user.findMany({
        where: { id: { in: [...new Set(events.map((e) => e.authorId))] } },
        select: { id: true },
      })
    ).map((u) => u.id)
  );

  const orphans = events.filter((e) => !userIds.has(e.authorId));
  if (!orphans.length) {
    console.log("[skip] No orphaned event authors");
    return;
  }

  for (const event of orphans) {
    await prisma.event.update({
      where: { id: event.id },
      data: { authorId: admin.id },
    });
    console.log(`[ok] event ${event.id}: author ${event.authorId} -> ${admin.email}`);
  }

  console.log(`Done. Repaired ${orphans.length} event(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
