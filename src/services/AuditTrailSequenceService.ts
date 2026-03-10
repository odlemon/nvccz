/**
 * Audit Trail Sequence Service
 * Assigns strictly sequential audit trail IDs (e.g. 1001, 1002, 1003) for accounting entries.
 */

import { prisma } from "../utils/database";

const SEQUENCE_NAME = "journal_entry";
const INITIAL_VALUE = 1000;

type PrismaLike = typeof prisma;

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
