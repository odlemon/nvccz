/**
 * Force UAT / seed helpers onto DEV MySQL (`nts` or local `arcus_dev`).
 * dotenv does not override an existing shell DATABASE_URL — this catches that.
 */
import { PrismaClient } from "@prisma/client";

/** Contabo / historical local name, plus the local-dev database name. */
const DEV_DBS = new Set(["nts", "arcus_dev"]);

export async function assertDevDatabase(prisma: PrismaClient, label = "uat"): Promise<string> {
  if (process.env.UAT_ALLOW_NON_DEV_DB === "1") {
    const rows = await prisma.$queryRawUnsafe<Array<{ d: string }>>(`SELECT DATABASE() AS d`);
    const db = String(rows[0]?.d || "");
    console.warn(`[${label}] UAT_ALLOW_NON_DEV_DB=1 — using database=${db}`);
    return db;
  }

  const url = String(process.env.DATABASE_URL || "");
  if (/client1_db/i.test(url) || /demo_env/i.test(url)) {
    console.error(
      `[${label}] Refusing DATABASE_URL pointing at non-dev DB.\n` +
        `  Unset shell DATABASE_URL so .env (nts|arcus_dev) is used.\n` +
        `  PowerShell: Remove-Item Env:DATABASE_URL\n` +
        `  Or set UAT_ALLOW_NON_DEV_DB=1 only if intentional.`
    );
    process.exit(1);
  }

  const rows = await prisma.$queryRawUnsafe<Array<{ d: string }>>(`SELECT DATABASE() AS d`);
  const db = String(rows[0]?.d || "");
  if (!DEV_DBS.has(db)) {
    console.error(
      `[${label}] Expected DEV database nts|arcus_dev, got "${db}".\n` +
        `  Clear shell DATABASE_URL overrides from migrate-all-dbs, then retry.`
    );
    process.exit(1);
  }
  console.log(`[${label}] database=${db} (dev OK)`);
  return db;
}
