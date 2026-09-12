import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  await p.$executeRawUnsafe("DROP TABLE IF EXISTS `planning_cycles`");
  console.log("dropped planning_cycles (orphan from first attempt)");
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
