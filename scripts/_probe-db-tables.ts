import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const url =
  process.argv[2] ||
  process.env.DATABASE_URL ||
  "mysql://nts_user:StrongPass123!@31.220.82.129:3306/demo_env?ssl-mode=DISABLED";

async function main() {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const db = await prisma.$queryRawUnsafe<Array<{ db: string }>>("SELECT DATABASE() AS db");
  console.log("URL db:", url.split("/").pop()?.split("?")[0]);
  console.log("Connected:", db[0]?.db);
  const tables = await prisma.$queryRawUnsafe<Array<{ TABLE_NAME: string }>>(
    `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME`
  );
  console.log("table count:", tables.length);
  const hasUsers = tables.some((t) => t.TABLE_NAME === "users" || t.TABLE_NAME === "User");
  console.log("has users table:", hasUsers);
  if (hasUsers) {
    const table = tables.find((t) => t.TABLE_NAME === "users" || t.TABLE_NAME === "User")!.TABLE_NAME;
    const users = await prisma.$queryRawUnsafe<Array<{ email: string }>>(
      `SELECT email FROM \`${table}\` ORDER BY email`
    );
    console.log("user count:", users.length);
    users.forEach((u) => console.log(" ", u.email));
  }
  await prisma.$disconnect();
}

main();
