// @ts-nocheck
/**
 * Security & audit UAT — journal creator + audit log timestamp
 *
 * - Journal detail exposes full user id (createdById / CreatedBy / createdByUserId) and createdAtIso
 * - Audit log row for JournalEntry CREATE has userId matching creator; createdAt is ISO-8601
 *
 * Run: npx ts-node scripts/test-journal-security-audit-uat.ts
 */
import { prisma } from '../src/utils/database';
import { JournalEntryService } from '../src/services/JournalEntryService';

const ISO_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;
const failures: string[] = [];
function assert(cond: boolean, msg: string) {
  if (!cond) failures.push(msg);
}

function isCuidLike(s: string) {
  return typeof s === 'string' && s.length >= 20 && /^c[a-z0-9]+$/i.test(s);
}

async function main() {
  console.log('========== Journal security & audit UAT ==========\n');

  const je = await prisma.journalEntry.findFirst({
    where: { createdById: { not: '' } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, createdById: true, createdAt: true, referenceNumber: true }
  });
  assert(!!je, 'Need at least one journal entry in DB');
  if (!je) {
    printExit();
    return;
  }

  const detail = await JournalEntryService.getJournalEntryWithLines(je.id);
  assert(!!detail?.journalEntry, 'getJournalEntryWithLines must return journal');
  const j = detail!.journalEntry;

  assert(isCuidLike(j.createdById), `createdById must be full user id (cuid); got "${j.createdById}"`);
  assert(j.CreatedBy === j.createdById, 'CreatedBy must equal createdById');
  assert(j.createdByUserId === j.createdById, 'createdByUserId must equal createdById');
  assert(typeof j.createdAtIso === 'string' && ISO_REGEX.test(j.createdAtIso), `createdAtIso must be ISO-8601 UTC; got "${j.createdAtIso}"`);
  const dbIso = je.createdAt instanceof Date ? je.createdAt.toISOString() : new Date(je.createdAt).toISOString();
  assert(j.createdAtIso === dbIso, 'createdAtIso must match journal row createdAt in DB');

  assert(!!j.createdBy && j.createdBy.id === j.createdById, 'createdBy.id must match createdById');

  const audit = await prisma.auditLog.findFirst({
    where: { entityType: 'JournalEntry', entityId: je.id, action: 'CREATE' },
    orderBy: { createdAt: 'desc' }
  });

  if (audit) {
    const auditIso = audit.createdAt instanceof Date ? audit.createdAt.toISOString() : new Date(audit.createdAt).toISOString();
    assert(ISO_REGEX.test(auditIso), `DB audit log createdAt maps to ISO: ${auditIso}`);
    assert(audit.userId === je.createdById, 'Audit log userId must match journal createdById');
    const nv = audit.newValues as Record<string, unknown> | null;
    assert(nv?.createdById === je.createdById, 'Audit newValues.createdById must match journal creator');
    console.log('Audit CREATE row:', audit.id, '| userId matches | createdAt', auditIso);
  } else {
    console.log('Note: No CREATE audit row for this journal (older data or path without AuditService.log).');
    console.log('      Manual journals created after the fix will have CREATE + createdById in newValues.');
  }

  console.log('\nJournal:', je.referenceNumber, '| createdById:', je.createdById);
  console.log('createdAtIso:', j.createdAtIso);

  printExit();
}

function printExit() {
  console.log('\n========== Summary ==========');
  if (failures.length) {
    failures.forEach((f) => console.log('FAIL:', f));
    process.exit(1);
  }
  console.log('Journal security & audit UAT passed.');
  process.exit(0);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
