/**
 * Fund disbursement: payment/commitment currency + system FX snapshot for IC cap checks.
 * Idempotent (MySQL). No manual rates — app uses MultiCurrencyService / exchange_rates.
 *
 * Run: npm run db:migrate:fund-disbursement-fx
 * Then: npx prisma generate
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function fkExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND CONSTRAINT_TYPE = 'FOREIGN KEY' AND CONSTRAINT_NAME = ?`,
    name
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function main() {
  const ii = "investment_implementations";
  const fd = "fund_disbursements";

  if (!(await columnExists(ii, "commitment_currency_id"))) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`${ii}\`
      ADD COLUMN \`commitment_currency_id\` VARCHAR(191) NULL
    `);
    console.log("[ok] investment_implementations.commitment_currency_id");
  } else {
    console.log("[skip] investment_implementations.commitment_currency_id exists");
  }

  if (!(await fkExists("investment_implementations_commitment_currency_id_fkey"))) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`${ii}\`
      ADD CONSTRAINT \`investment_implementations_commitment_currency_id_fkey\`
      FOREIGN KEY (\`commitment_currency_id\`) REFERENCES \`currencies\`(\`id\`)
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    console.log("[ok] FK investment_implementations.commitment_currency_id");
  } else {
    console.log("[skip] FK investment_implementations.commitment_currency_id");
  }

  const fdCols: Array<{ name: string; ddl: string }> = [
    {
      name: "payment_currency_id",
      ddl: "ADD COLUMN `payment_currency_id` VARCHAR(191) NULL"
    },
    {
      name: "commitment_currency_id",
      ddl: "ADD COLUMN `commitment_currency_id` VARCHAR(191) NULL"
    },
    {
      name: "amount_commitment_currency",
      ddl: "ADD COLUMN `amount_commitment_currency` DECIMAL(15, 2) NULL"
    },
    {
      name: "applied_exchange_rate",
      ddl: "ADD COLUMN `applied_exchange_rate` DECIMAL(15, 6) NULL"
    }
  ];

  for (const col of fdCols) {
    if (!(await columnExists(fd, col.name))) {
      await prisma.$executeRawUnsafe(`ALTER TABLE \`${fd}\` ${col.ddl}`);
      console.log(`[ok] fund_disbursements.${col.name}`);
    } else {
      console.log(`[skip] fund_disbursements.${col.name} exists`);
    }
  }

  if (!(await fkExists("fund_disbursements_payment_currency_id_fkey"))) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`${fd}\`
      ADD CONSTRAINT \`fund_disbursements_payment_currency_id_fkey\`
      FOREIGN KEY (\`payment_currency_id\`) REFERENCES \`currencies\`(\`id\`)
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    console.log("[ok] FK fund_disbursements.payment_currency_id");
  } else {
    console.log("[skip] FK fund_disbursements.payment_currency_id");
  }

  if (!(await fkExists("fund_disbursements_commitment_currency_id_fkey"))) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`${fd}\`
      ADD CONSTRAINT \`fund_disbursements_commitment_currency_id_fkey\`
      FOREIGN KEY (\`commitment_currency_id\`) REFERENCES \`currencies\`(\`id\`)
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    console.log("[ok] FK fund_disbursements.commitment_currency_id");
  } else {
    console.log("[skip] FK fund_disbursements.commitment_currency_id");
  }

  const defaultCur =
    (await prisma.currency.findFirst({ where: { isDefault: true } })) ||
    (await prisma.currency.findFirst({ where: { code: "USD" } }));

  if (defaultCur) {
    const id = defaultCur.id.replace(/[^a-z0-9_]/gi, "");
    const n = await prisma.$executeRawUnsafe(
      `UPDATE \`${fd}\` SET
         \`amount_commitment_currency\` = \`amount\`,
         \`applied_exchange_rate\` = 1,
         \`commitment_currency_id\` = COALESCE(\`commitment_currency_id\`, '${id}'),
         \`payment_currency_id\` = COALESCE(\`payment_currency_id\`, '${id}')
       WHERE \`amount_commitment_currency\` IS NULL`
    );
    console.log(`[ok] Backfilled fund_disbursements FX columns where null (rows affected: ${Number(n)})`);
  } else {
    console.warn("[warn] No default or USD currency — skipped backfill of fund_disbursements");
  }

  console.log("\nfund disbursement FX migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
