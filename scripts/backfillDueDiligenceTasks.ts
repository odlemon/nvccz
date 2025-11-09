import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Backfill Task.applicationId and Task.fromDueDiligence for legacy due diligence tasks.
 * It looks for application identifiers that were embedded in the task description.
 */
async function backfillDueDiligenceTasks() {
  const candidates = await prisma.$queryRawUnsafe<Array<{ id: string; description: string | null }>>(
    `
      SELECT id, description
      FROM tasks
      WHERE description LIKE '%Due Diligence Task - Application:%'
        AND (applicationId IS NULL OR fromDueDiligence = 0)
    `
  );

  console.log(`Found ${candidates.length} candidate tasks to evaluate.`);

  let updated = 0;

  for (const task of candidates) {
    if (!task.description) continue;

    const match =
      task.description.match(/\[Due Diligence Task - Application:\s*([^\]\s]+)\]/) ??
      task.description.match(/\[DueDiligenceApplication:([^\]\s]+)\]/);

    if (!match) {
      console.warn(`Skipping task ${task.id}: application id marker not found.`);
      continue;
    }

    const applicationId = match[1].trim();

    try {
      await prisma.$executeRawUnsafe(
        `
          UPDATE tasks
          SET applicationId = ?, fromDueDiligence = 1
          WHERE id = ?
        `,
        applicationId,
        task.id
      );
      updated += 1;
      console.log(`Updated task ${task.id} -> application ${applicationId}`);
    } catch (error) {
      console.error(`Failed to update task ${task.id}:`, error);
    }
  }

  console.log(`Backfill complete. Updated ${updated} tasks.`);
}

backfillDueDiligenceTasks()
  .catch((error) => {
    console.error('Backfill failed', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

