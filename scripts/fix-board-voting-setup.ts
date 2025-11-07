/* eslint-disable no-console */
// @ts-nocheck
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function ensureVotingPowerColumn() {
  const columnExists = await prisma.$queryRawUnsafe<
    Array<{ column_name: string }>
  >(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'users'
        AND column_name = 'votingPower'`
  );

  if (columnExists.length === 0) {
    console.log('➡️  Adding votingPower column to users table...');
    await prisma.$executeRawUnsafe(
      `ALTER TABLE users
         ADD COLUMN votingPower DECIMAL(5,2) NULL`
    );
    console.log('✅ votingPower column added.');
  } else {
    console.log('✅ votingPower column already exists.');
  }
}

async function ensureBoardReviewVotesTable() {
  const tableExists = await prisma.$queryRawUnsafe<
    Array<{ table_name: string }>
  >(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name = 'board_review_votes'`
  );

  if (tableExists.length === 0) {
    console.log('➡️  Creating board_review_votes table...');
    await prisma.$executeRawUnsafe(
      `CREATE TABLE board_review_votes (
          id            VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci PRIMARY KEY,
          boardReviewId VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
          userId        VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
          vote          VARCHAR(16)  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
          comment       TEXT NULL,
          votingPower   DECIMAL(5,2) NOT NULL,
          createdAt     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          updatedAt     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
          CONSTRAINT board_review_votes_review_fkey FOREIGN KEY (boardReviewId)
            REFERENCES board_reviews(id) ON DELETE CASCADE,
          CONSTRAINT board_review_votes_user_fkey FOREIGN KEY (userId)
            REFERENCES users(id) ON DELETE CASCADE,
          CONSTRAINT board_review_votes_unique UNIQUE (boardReviewId, userId)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    );
    console.log('✅ board_review_votes table created.');
  } else {
    console.log('✅ board_review_votes table already exists.');
  }
}

async function backfillVotingPowers() {
  const boardUsers = await prisma.$queryRawUnsafe<Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    roleCode: string;
    votingPower: number | null;
  }>>(`
    SELECT id, firstName, lastName, email, roleCode, votingPower
      FROM users
     WHERE userDepartment = 'Investments'
       AND roleCode IN ('BOARD_CHAIR', 'BOARD_MEMBER')
  `);

  if (boardUsers.length === 0) {
    console.log('ℹ️  No board users found to backfill voting power.');
    return;
  }

  const alreadyConfigured = boardUsers.filter(
    (user) => user.votingPower !== null && Number(user.votingPower) > 0
  );
  const missing = boardUsers.filter(
    (user) => user.votingPower === null || Number(user.votingPower) <= 0
  );

  console.log(
    `ℹ️  Found ${boardUsers.length} board users (${alreadyConfigured.length} configured, ${missing.length} missing).`
  );

  if (missing.length === 0) {
    const total = alreadyConfigured.reduce(
      (sum, user) => sum + Number(user.votingPower),
      0
    );
    console.log(`✅ All board users already have voting power (total = ${total}%).`);
    return;
  }

  const totalConfigured = alreadyConfigured.reduce(
    (sum, user) => sum + Number(user.votingPower),
    0
  );
  const remaining = 100 - totalConfigured;

  if (remaining <= 0) {
    console.warn(
      `⚠️  Current configured voting power already reaches ${totalConfigured}%. Unable to auto-assign the remaining ${missing.length} users.`
    );
    return;
  }

  const share = Number((remaining / missing.length).toFixed(2));
  let adjustment = remaining - share * missing.length;

  for (const user of missing) {
    let assigned = share;
    if (adjustment !== 0) {
      assigned = Number((share + adjustment).toFixed(2));
      adjustment = 0;
    }

    await prisma.$executeRawUnsafe(
      `UPDATE users SET votingPower = ? WHERE id = ?`,
      assigned,
      user.id
    );

    console.log(
      `✅ Assigned ${assigned}% voting power to ${user.firstName} ${user.lastName} (${user.email}) [${user.roleCode}].`
    );
  }

  const finalTotalRow = await prisma.$queryRawUnsafe<Array<{ total: number | null }>>(
    `SELECT SUM(COALESCE(votingPower, 0)) as total
       FROM users
      WHERE userDepartment = 'Investments'
        AND roleCode IN ('BOARD_CHAIR', 'BOARD_MEMBER')`
  );

  const finalTotal = finalTotalRow[0]?.total ?? 0;

  console.log(`✅ Final total voting power after backfill: ${finalTotal}%.`);
}

async function main() {
  try {
    console.log('🔧 Ensuring board voting schema and data...');
    await ensureVotingPowerColumn();
    await ensureBoardReviewVotesTable();
    await backfillVotingPowers();
    console.log('🎉 Board voting setup completed successfully.');
  } catch (error: any) {
    console.error('❌ Failed to ensure board voting setup:', error.message);
    console.error(error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();

