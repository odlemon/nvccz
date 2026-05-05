import { prisma } from "../src/utils/database";

/**
 * Deletes guests for the latest (most recently created) active event.
 *
 * Options:
 * - EVENT_ID: delete guests for this exact event id
 */
async function main() {
  const eventIdArg = String(process.env.EVENT_ID || "").trim();

  const event =
    eventIdArg !== ""
      ? await prisma.event.findUnique({
          where: { id: eventIdArg },
          select: { id: true, title: true, createdAt: true, googleCalendarEventId: true },
        })
      : await prisma.event.findFirst({
          where: { isActive: true },
          orderBy: { createdAt: "desc" },
          select: { id: true, title: true, createdAt: true, googleCalendarEventId: true },
        });

  if (!event) {
    console.log("No event found to delete guests for.");
    return;
  }

  const countBefore = await prisma.eventGuest.count({ where: { eventId: event.id } });
  console.log(
    `Deleting guests for event ${event.id} (${event.title || "untitled"}) createdAt=${event.createdAt.toISOString()} googleEventId=${event.googleCalendarEventId || "null"}`
  );
  console.log(`Guests before: ${countBefore}`);

  const del = await prisma.eventGuest.deleteMany({ where: { eventId: event.id } });
  console.log(`Deleted guests: ${del.count}`);

  const countAfter = await prisma.eventGuest.count({ where: { eventId: event.id } });
  console.log(`Guests after: ${countAfter}`);
}

main()
  .catch((e) => {
    console.error("delete-latest-event-guests failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

