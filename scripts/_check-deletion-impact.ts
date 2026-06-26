import { PrismaClient } from "@prisma/client";

const url =
  "mysql://client1_user:Client1Pass!2025@31.220.82.129:3306/client1_db?ssl-mode=DISABLED";
const DELETED_USER_ID = "cmislgonq0001unfkpukqyiah";
const KEEPER_ID = "cmhlnqd460001unnslmw98ry8";

async function main() {
  const p = new PrismaClient({ datasources: { db: { url } } });
  try {
    const stillExists = await p.$queryRawUnsafe<Array<{ c: bigint }>>(
      `SELECT COUNT(*) AS c FROM users WHERE id = ?`,
      DELETED_USER_ID
    );
    console.log("deleted user row still exists:", Number(stillExists[0]?.c ?? 0) > 0);

    const refs = await p.$queryRawUnsafe<Array<{ TABLE_NAME: string; COLUMN_NAME: string }>>(
      `SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME = 'users'`
    );

    let refsToDeleted = 0;
    for (const r of refs) {
      try {
        const c = await p.$queryRawUnsafe<Array<{ c: bigint }>>(
          `SELECT COUNT(*) AS c FROM \`${r.TABLE_NAME}\` WHERE \`${r.COLUMN_NAME}\` = ?`,
          DELETED_USER_ID
        );
        const n = Number(c[0]?.c ?? 0);
        if (n > 0) console.log(`  orphan ref: ${r.TABLE_NAME}.${r.COLUMN_NAME} = ${n}`);
        refsToDeleted += n;
      } catch {
        // skip
      }
    }
    console.log("orphan refs to deleted user:", refsToDeleted);
  } finally {
    await p.$disconnect();
  }
}

main();
