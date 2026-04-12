/**
 * Audit Trail Sequence Service
 * Assigns strictly sequential audit trail IDs (e.g. 1001, 1002, 1003) for accounting entries.
 */

import type { JournalEntry, Prisma } from "@prisma/client";
import { prisma } from "../utils/database";
import type { PeriodLockSource } from "./fiscalPeriodLockTypes";
import PeriodLockService from "./PeriodLockService";

/** Journal create payload without audit id (assigned automatically). */
export type JournalEntryCreateWithoutAudit = Omit<
  Prisma.JournalEntryUncheckedCreateInput,
  "auditTrailSequenceNumber"
>;

const SEQUENCE_NAME = "journal_entry";
const INITIAL_VALUE = 1000;

type PrismaLike = typeof prisma;

/** Optional: pass from HTTP layer for WARN/override; jobs omit. */
export type JournalEntryPeriodLockOptions = {
  userPermissions?: Array<{ name: string; value: boolean }>;
  source?: PeriodLockSource;
};

/**
 * Get the next audit trail sequence number and increment the counter.
 * Must be called inside a transaction when creating a journal entry to avoid gaps.
 */
export async function getNextAuditTrailSequenceNumber(tx?: PrismaLike): Promise<number> {
  const client = tx ?? prisma;
  const seq = await client.auditTrailSequence.findUnique({
    where: { name: SEQUENCE_NAME },
  });
  const current = seq?.value ?? INITIAL_VALUE;
  const next = current + 1;
  await client.auditTrailSequence.upsert({
    where: { name: SEQUENCE_NAME },
    create: { name: SEQUENCE_NAME, value: next },
    update: { value: next },
  });
  return next;
}

/**
 * Ensure the sequence row exists (e.g. after fresh deploy). Idempotent.
 */
export async function ensureAuditTrailSequenceExists(tx?: PrismaLike): Promise<void> {
  const client = tx ?? prisma;
  await client.auditTrailSequence.upsert({
    where: { name: SEQUENCE_NAME },
    create: { name: SEQUENCE_NAME, value: INITIAL_VALUE },
    update: {},
  });
}

/**
 * Inside an existing transaction: reserve next audit id and create the journal header.
 */
export async function assignNextAuditIdAndCreateJournal(
  tx: Prisma.TransactionClient,
  data: JournalEntryCreateWithoutAudit,
  periodLockOpts?: JournalEntryPeriodLockOptions
): Promise<JournalEntry> {
  const accountingDate =
    data.transactionDate instanceof Date
      ? data.transactionDate
      : new Date(data.transactionDate as string | number);
  await PeriodLockService.assertModuleDateOpen({
    moduleCode: "GL",
    accountingDate,
    userId: data.createdById,
    source: periodLockOpts?.source ?? "SYSTEM",
    actionType: "CREATE_JOURNAL",
    userPermissions: periodLockOpts?.userPermissions,
  });
  await ensureAuditTrailSequenceExists(tx as PrismaLike);
  const auditTrailSequenceNumber = await getNextAuditTrailSequenceNumber(tx as PrismaLike);
  return tx.journalEntry.create({
    data: { ...data, auditTrailSequenceNumber },
  });
}

/**
 * Standalone: atomically reserve audit id + create journal (use when not already in a transaction).
 */
export async function createJournalEntryWithAuditSequence(
  data: JournalEntryCreateWithoutAudit,
  periodLockOpts?: JournalEntryPeriodLockOptions
): Promise<JournalEntry> {
  return prisma.$transaction(
    (tx) => assignNextAuditIdAndCreateJournal(tx, data, periodLockOpts),
    { maxWait: 8_000, timeout: 15_000 }
  );
}

/**
 * Reserve `count` consecutive audit sequence numbers in a single transaction.
 * Returns the first number in the reserved range — caller uses first, first+1, …, first+count-1.
 * Use this before parallel JE creation so the sequence counter is only touched once.
 */
export async function reserveAuditSequences(count: number): Promise<number> {
  if (count <= 0) throw new Error('count must be > 0');
  return prisma.$transaction(async (tx) => {
    return reserveAuditSequencesInTx(tx, count);
  }, { maxWait: 30000, timeout: 60000 });
}

/**
 * Reserve `count` consecutive audit IDs using an existing Prisma transaction (same semantics as `reserveAuditSequences`).
 */
export async function reserveAuditSequencesInTx(
  tx: Prisma.TransactionClient,
  count: number
): Promise<number> {
  if (count <= 0) throw new Error('count must be > 0');
  await ensureAuditTrailSequenceExists(tx as PrismaLike);
  const seq = await (tx as PrismaLike).auditTrailSequence.findUnique({ where: { name: SEQUENCE_NAME } });
  const current = seq?.value ?? INITIAL_VALUE;
  const firstReserved = current + 1;
  await (tx as PrismaLike).auditTrailSequence.update({
    where: { name: SEQUENCE_NAME },
    data: { value: current + count },
  });
  return firstReserved;
}

export interface AuditTrailEntry {
  id: string;
  auditTrailSequenceNumber: number;
  referenceNumber: string;
  transactionDate: Date;
  description: string;
  createdAt: Date;
}

export interface SequentialIntegrityResult {
  entries: AuditTrailEntry[];
  isSequential: boolean;
  expectedCount: number;
  gaps: Array<{ expected: number; actual: number }>;
  message: string;
}

/**
 * Get the last N journal entries that have audit trail sequence numbers, ordered by sequence desc.
 */
export async function getLastAuditTrailEntries(limit: number = 10): Promise<AuditTrailEntry[]> {
  const rows = await prisma.journalEntry.findMany({
    where: { auditTrailSequenceNumber: { not: null } },
    orderBy: { auditTrailSequenceNumber: "desc" },
    take: limit,
    select: {
      id: true,
      auditTrailSequenceNumber: true,
      referenceNumber: true,
      transactionDate: true,
      description: true,
      createdAt: true,
    },
  });
  return rows
    .filter((r): r is typeof r & { auditTrailSequenceNumber: number } => r.auditTrailSequenceNumber != null)
    .map((r) => ({
      id: r.id,
      auditTrailSequenceNumber: r.auditTrailSequenceNumber,
      referenceNumber: r.referenceNumber,
      transactionDate: r.transactionDate,
      description: r.description,
      createdAt: r.createdAt,
    }));
}

/**
 * Verify that the last 10 audit trail entries have strictly sequential IDs with no gaps.
 * Order: highest ID first (e.g. 1010, 1009, ..., 1001). Each must equal previous - 1.
 */
export async function verifySequentialIntegrity(limit: number = 10): Promise<SequentialIntegrityResult> {
  const entries = await getLastAuditTrailEntries(limit);
  const gaps: Array<{ expected: number; actual: number }> = [];
  let isSequential = true;

  for (let i = 0; i < entries.length - 1; i++) {
    const current = entries[i].auditTrailSequenceNumber;
    const next = entries[i + 1].auditTrailSequenceNumber;
    const expectedNext = current - 1;
    if (next !== expectedNext) {
      isSequential = false;
      gaps.push({ expected: expectedNext, actual: next });
    }
  }

  const message = isSequential
    ? `Last ${entries.length} audit trail IDs are strictly sequential with no gaps.`
    : `Gaps found in audit trail sequence: ${gaps.length} gap(s).`;

  return {
    entries,
    isSequential,
    expectedCount: limit,
    gaps,
    message,
  };
}
