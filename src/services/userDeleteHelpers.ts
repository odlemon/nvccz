// @ts-nocheck
import { Prisma } from "@prisma/client";
import { prisma } from "../utils/database";

function isMissingTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    message.includes("does not exist in the current database") ||
    message.includes("P2021")
  );
}

function isSkippableReassignError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    isMissingTableError(error) ||
    message.includes("Unknown argument") ||
    message.includes("Duplicate entry") ||
    message.includes("ER_DUP_ENTRY") ||
    message.includes("P2002")
  );
}

function isRelationViolation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    message.includes("required relation") ||
    message.includes("Foreign key constraint") ||
    message.includes("P2003") ||
    message.includes("ER_ROW_IS_REFERENCED") ||
    message.includes("1451")
  );
}

function modelToDelegate(modelName: string): string {
  return modelName.charAt(0).toLowerCase() + modelName.slice(1);
}

function buildPrismaUserReferenceUpdates(): Array<{ model: string; field: string }> {
  const updates: Array<{ model: string; field: string }> = [];

  for (const model of Prisma.dmmf.datamodel.models) {
    if (model.name === "User") continue;
    const delegate = modelToDelegate(model.name);

    for (const relationField of model.fields) {
      if (relationField.kind !== "object" || relationField.type !== "User") continue;

      const fkField = model.fields.find(
        (f) => f.relationName === relationField.relationName && f.kind === "scalar"
      );
      if (!fkField) continue;

      updates.push({ model: delegate, field: fkField.name });
    }
  }

  return updates;
}

const PRISMA_USER_REFERENCE_UPDATES = buildPrismaUserReferenceUpdates();

type DbUserFk = {
  tableName: string;
  columnName: string;
  isUniqueColumn: boolean;
};

async function loadDatabaseUserForeignKeys(): Promise<DbUserFk[]> {
  const fkRows = await prisma.$queryRawUnsafe<
    Array<{ TABLE_NAME: string; COLUMN_NAME: string }>
  >(
    `SELECT kcu.TABLE_NAME, kcu.COLUMN_NAME
     FROM information_schema.KEY_COLUMN_USAGE kcu
     WHERE kcu.TABLE_SCHEMA = DATABASE()
       AND kcu.REFERENCED_TABLE_NAME = 'users'
       AND kcu.REFERENCED_COLUMN_NAME = 'id'`
  );

  const uniqueRows = await prisma.$queryRawUnsafe<
    Array<{ TABLE_NAME: string; COLUMN_NAME: string; NON_UNIQUE: number; SEQ_IN_INDEX: number }>
  >(
    `SELECT TABLE_NAME, COLUMN_NAME, NON_UNIQUE, SEQ_IN_INDEX
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()`
  );

  const uniqueColumns = new Set(
    uniqueRows
      .filter((r) => Number(r.NON_UNIQUE) === 0 && Number(r.SEQ_IN_INDEX) === 1)
      .map((r) => `${r.TABLE_NAME}.${r.COLUMN_NAME}`)
  );

  const seen = new Set<string>();
  const result: DbUserFk[] = [];
  for (const row of fkRows) {
    if (row.TABLE_NAME === "users") continue;
    const key = `${row.TABLE_NAME}.${row.COLUMN_NAME}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      tableName: row.TABLE_NAME,
      columnName: row.COLUMN_NAME,
      isUniqueColumn: uniqueColumns.has(key)
    });
  }
  return result;
}

async function countRows(tableName: string, columnName: string, userId: string): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM \`${tableName}\` WHERE \`${columnName}\` = ?`,
    userId
  );
  return Number(rows[0]?.c ?? 0);
}

export async function scanUserReferences(userId: string) {
  const prismaRefs = await Promise.all(
    PRISMA_USER_REFERENCE_UPDATES.map(async ({ model, field }) => {
      const delegate = prisma[model];
      if (!delegate?.count) return null;
      try {
        const count = await delegate.count({ where: { [field]: userId } });
        return count > 0 ? { source: "prisma", model, field, count } : null;
      } catch (error) {
        if (isMissingTableError(error)) return null;
        throw error;
      }
    })
  );

  const dbFks = await loadDatabaseUserForeignKeys();
  const dbRefs = await Promise.all(
    dbFks.map(async (fk) => {
      try {
        const count = await countRows(fk.tableName, fk.columnName, userId);
        return count > 0
          ? {
              source: "db",
              table: fk.tableName,
              column: fk.columnName,
              unique: fk.isUniqueColumn,
              count
            }
          : null;
      } catch {
        return null;
      }
    })
  );

  return {
    prisma: prismaRefs.filter(Boolean),
    database: dbRefs.filter(Boolean)
  };
}

async function reassignViaPrisma(fromUserId: string, toUserId: string) {
  for (const { model, field } of PRISMA_USER_REFERENCE_UPDATES) {
    const delegate = prisma[model];
    if (!delegate?.updateMany) continue;
    try {
      await delegate.updateMany({
        where: { [field]: fromUserId },
        data: { [field]: toUserId }
      });
    } catch (error) {
      if (!isSkippableReassignError(error) && !isMissingTableError(error)) throw error;
    }
  }
}

async function reassignViaDatabaseForeignKeys(fromUserId: string, toUserId: string) {
  const fks = await loadDatabaseUserForeignKeys();

  for (const fk of fks) {
    const refs = await countRows(fk.tableName, fk.columnName, fromUserId);
    if (refs === 0) continue;

    try {
      await prisma.$executeRawUnsafe(
        `UPDATE \`${fk.tableName}\` SET \`${fk.columnName}\` = ? WHERE \`${fk.columnName}\` = ?`,
        toUserId,
        fromUserId
      );
    } catch (error) {
      if (isMissingTableError(error)) continue;

      if (fk.isUniqueColumn && isSkippableReassignError(error)) {
        await prisma.$executeRawUnsafe(
          `DELETE FROM \`${fk.tableName}\` WHERE \`${fk.columnName}\` = ?`,
          fromUserId
        );
        continue;
      }

      if (!isSkippableReassignError(error)) throw error;
    }
  }
}

async function cleanupApprovals(fromUserId: string, toUserId: string) {
  try {
    await prisma.approval.updateMany({
      where: { approverId: fromUserId },
      data: { approverId: toUserId }
    });
  } catch {
    await prisma.approval.deleteMany({ where: { approverId: fromUserId } });
  }

  try {
    await prisma.approval.updateMany({
      where: { delegatedToId: fromUserId },
      data: { delegatedToId: null }
    });
  } catch {
    // optional table / column
  }
}

export async function resolveAdminReassignTarget(excludeUserId: string) {
  const admin = await prisma.user.findFirst({
    where: {
      id: { not: excludeUserId },
      role: { name: "admin" }
    },
    select: { id: true, firstName: true, lastName: true, email: true },
    orderBy: { createdAt: "asc" }
  });

  if (!admin) {
    throw new Error("No admin user available to receive reassigned records");
  }

  return admin;
}

export async function reassignUserReferences(fromUserId: string, toUserId: string) {
  if (fromUserId === toUserId) {
    throw new Error("Cannot reassign user references to the same user");
  }

  const target = await prisma.user.findUnique({
    where: { id: toUserId },
    select: { id: true, firstName: true, lastName: true, email: true }
  });
  if (!target) {
    throw new Error("Admin user for reassignment not found");
  }

  await reassignViaPrisma(fromUserId, toUserId);
  await reassignViaDatabaseForeignKeys(fromUserId, toUserId);
  await cleanupApprovals(fromUserId, toUserId);

  // Second pass — catch anything the first pass missed (ordering / partial failures)
  await reassignViaDatabaseForeignKeys(fromUserId, toUserId);

  return target;
}

export async function getUserDeleteBlockers(userId: string) {
  const refs = await scanUserReferences(userId);
  const merged = new Map<string, number>();

  for (const ref of refs.database) {
    const label = `${ref.table}.${ref.column}`;
    merged.set(label, (merged.get(label) ?? 0) + ref.count);
  }

  return [...merged.entries()]
    .slice(0, 8)
    .map(([label, count]) => ({
      label: label.replace(/_/g, " "),
      count
    }));
}

export async function deleteUserRecord(userId: string) {
  try {
    await prisma.user.delete({ where: { id: userId } });
    return;
  } catch (error) {
    if (!isRelationViolation(error) && !isMissingTableError(error)) throw error;
  }

  const remaining = await scanUserReferences(userId);
  const stillReferenced = remaining.database.length > 0;
  if (stillReferenced) {
    const sample = remaining.database
      .slice(0, 5)
      .map((r) => `${r.count} in ${r.table}.${r.column}`)
      .join(", ");
    throw new Error(
      `Cannot delete user: still referenced after reassignment (${sample}). Contact support.`
    );
  }

  try {
    await prisma.user.delete({ where: { id: userId } });
  } catch (error) {
    if (!isMissingTableError(error) && !isRelationViolation(error)) throw error;
    await prisma.$executeRawUnsafe("DELETE FROM users WHERE id = ?", userId);
  }
}

function formatBlockerList(parts: string[]): string {
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

export function formatReassignedRecordsMessage(
  blockers: Array<{ label: string; count: number }>,
  admin: { firstName: string; lastName: string }
): string {
  if (blockers.length === 0) {
    return "User deleted successfully";
  }
  const parts = blockers.map((b) => `${b.count} ${b.label}`);
  const adminName = `${admin.firstName} ${admin.lastName}`.trim();
  return `User deleted successfully. Related records (${formatBlockerList(parts)}) reassigned to admin ${adminName}.`;
}
