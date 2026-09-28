import {
  Prisma,
  CashbookReconciliationSessionStatus,
  CashbookEntryType,
} from "@prisma/client";
import { prisma } from "../utils/database";

const BALANCE_EPS = 0.01;

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function num(v: Prisma.Decimal | null | undefined): number {
  if (v == null) return 0;
  const n = parseFloat(v.toString());
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toDecimalString(n: number): string {
  return Number(n).toFixed(2);
}

export class CashbookReconciliationSessionService {
  /** A statement ends on a day that has happened. */
  static assertStatementDate(d: Date) {
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) throw new Error("Invalid statement date");
    if (d.getTime() > endOfDay(new Date()).getTime()) throw new Error("A statement date cannot be in the future.");
  }

  static async findPriorFinalizedSession(bankId: string, excludeSessionId?: string) {
    return prisma.cashbookReconciliationSession.findFirst({
      where: {
        bankId,
        status: CashbookReconciliationSessionStatus.FINALIZED,
        ...(excludeSessionId ? { id: { not: excludeSessionId } } : {}),
      },
      orderBy: [{ finishedAt: "desc" }],
    });
  }

  /** Closing balance of the chronologically previous finalized session (by finishedAt). */
  static async getPriorClosingBalance(bankId: string, excludeSessionId?: string): Promise<number | null> {
    const prior = await this.findPriorFinalizedSession(bankId, excludeSessionId);
    if (!prior || prior.closingBalance == null) return null;
    return num(prior.closingBalance);
  }

  static formatEntryRow(entry: {
    id: string;
    transactionDate: Date;
    type: CashbookEntryType;
    description: string;
    reference: string | null;
    amount: Prisma.Decimal;
    status: string;
    isReconciled: boolean;
    counterpartyType: string;
    customer: { name: string } | null;
    vendor: { name: string } | null;
    glAccount: { accountName: string; accountNo: string } | null;
    bank?: { id: string; name: string; accountNumber: string } | null;
    cashbookReconciliationSessionId?: string | null;
  }) {
    const amount = num(entry.amount);
    const signedAmount = entry.type === CashbookEntryType.RECEIPT ? amount : -amount;
    const counterparty =
      entry.counterpartyType === "CUSTOMER"
        ? entry.customer?.name
        : entry.counterpartyType === "SUPPLIER"
          ? entry.vendor?.name
          : entry.glAccount?.accountName || "N/A";
    return {
      id: entry.id,
      transactionDate: entry.transactionDate,
      type: entry.type,
      description: entry.description,
      reference: entry.reference,
      amount,
      received: entry.type === CashbookEntryType.RECEIPT ? amount : 0,
      paid: entry.type === CashbookEntryType.PAYMENT ? amount : 0,
      signedAmount,
      status: entry.status,
      isReconciled: entry.isReconciled,
      counterpartyType: entry.counterpartyType,
      counterparty,
      cashbookReconciliationSessionId: entry.cashbookReconciliationSessionId ?? null,
    };
  }

  static entryInclude() {
    return {
      customer: { select: { id: true, name: true } },
      vendor: { select: { id: true, name: true } },
      glAccount: { select: { id: true, accountNo: true, accountName: true } },
      bank: { select: { id: true, name: true, accountNumber: true } },
    } as const;
  }

  /** Posted cashbook lines for bank up to as-of date (default: unreconciled only). */
  static async listCandidateEntries(params: {
    bankId: string;
    asOf: Date;
    includeReconciled?: boolean;
  }) {
    const bank = await prisma.bank.findUnique({ where: { id: params.bankId } });
    if (!bank) throw new Error("Bank not found");

    const end = endOfDay(params.asOf);
    const where: Prisma.CashbookEntryWhereInput = {
      bankId: params.bankId,
      status: "POSTED",
      transactionDate: { lte: end },
    };
    if (!params.includeReconciled) {
      where.isReconciled = false;
    }

    const entries = await prisma.cashbookEntry.findMany({
      where,
      include: this.entryInclude(),
      orderBy: { transactionDate: "asc" },
    });

    return entries.map((e) => this.formatEntryRow(e));
  }

  /**
   * Session-level figures from opening + only lines with selected=true (Sage-style footer).
   */
  static computeSessionTotals(
    session: {
      openingBalance: Prisma.Decimal | null;
      statementEndBalance: Prisma.Decimal;
    },
    lines: Array<{ selected: boolean; entry: { type: string; amount: number } }>
  ) {
    const opening = session.openingBalance != null ? num(session.openingBalance) : null;
    let received = 0;
    let paid = 0;
    for (const l of lines) {
      if (!l.selected) continue;
      if (l.entry.type === CashbookEntryType.RECEIPT) received += l.entry.amount;
      else if (l.entry.type === CashbookEntryType.PAYMENT) paid += l.entry.amount;
    }
    received = round2(received);
    paid = round2(paid);
    const ob = opening ?? 0;
    const reconciled = round2(ob + received - paid);
    const target = num(session.statementEndBalance);
    return {
      openingBalance: opening,
      totalSelectedReceived: received,
      totalSelectedPaid: paid,
      reconciledBalance: reconciled,
      statementEndBalance: target,
      difference: round2(target - reconciled),
    };
  }

  static mapSessionLines(
    session: { id: string; status: CashbookReconciliationSessionStatus },
    rawLines: Array<{
      id: string;
      selected: boolean;
      cashbookEntryId: string;
      cashbookEntry: {
        id: string;
        transactionDate: Date;
        type: CashbookEntryType;
        description: string;
        reference: string | null;
        amount: Prisma.Decimal;
        status: string;
        isReconciled: boolean;
        counterpartyType: string;
        cashbookReconciliationSessionId?: string | null;
        customer: { id: string; name: string } | null;
        vendor: { id: string; name: string } | null;
        glAccount: { id: string; accountNo: string; accountName: string } | null;
        bank?: { id: string; name: string; accountNumber: string } | null;
      };
    }>
  ) {
    return rawLines.map((l) => {
      const e = l.cashbookEntry;
      const base = this.formatEntryRow(e as any);
      return {
        id: l.id,
        cashbookEntryId: l.cashbookEntryId,
        selected: l.selected,
        entry: {
          ...base,
          stats: {
            selectedForSession: l.selected,
            posted: e.status === "POSTED",
            reconciledOnBooks: e.isReconciled,
            clearedByThisSession:
              e.cashbookReconciliationSessionId != null && e.cashbookReconciliationSessionId === session.id,
            reconciliationSessionId: e.cashbookReconciliationSessionId ?? null,
          },
        },
      };
    });
  }

  static serializeSession(
    session: {
      id: string;
      bankId: string;
      status: CashbookReconciliationSessionStatus;
      statementDate: Date;
      statementEndBalance: Prisma.Decimal;
      reference: string | null;
      openingBalance: Prisma.Decimal | null;
      closingBalance: Prisma.Decimal | null;
      createdById: string;
      finishedById: string | null;
      finishedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    },
    extras?: {
      lines?: Array<{ selected: boolean; entry: { type: string; amount: number } }>;
      priorClosingBalance?: number | null;
    }
  ) {
    const openingBalance = session.openingBalance != null ? num(session.openingBalance) : null;
    const statementEnd = num(session.statementEndBalance);
    const persistedClosing =
      session.closingBalance != null ? num(session.closingBalance) : null;
    const closingBalance =
      persistedClosing != null
        ? persistedClosing
        : session.status === CashbookReconciliationSessionStatus.DRAFT
          ? statementEnd
          : null;

    const lines = extras?.lines;
    const totals =
      lines && lines.length > 0 ? this.computeSessionTotals(session, lines) : undefined;

    return {
      id: session.id,
      bankId: session.bankId,
      status: session.status,
      statementDate: session.statementDate,
      statementEndBalance: statementEnd,
      reference: session.reference,
      closingBalance,
      createdById: session.createdById,
      finishedById: session.finishedById,
      finishedAt: session.finishedAt,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      priorClosingBalanceFromLastFinalized: extras?.priorClosingBalance ?? null,
      totals,
      lines,
      openingBalance,
    };
  }

  static async createDraft(params: {
    bankId: string;
    userId: string;
    statementDate: Date;
    statementEndBalance: number;
    reference?: string | null;
    openingBalance?: number | null;
    selectedEntryIds?: string[];
  }) {
    const bank = await prisma.bank.findUnique({ where: { id: params.bankId } });
    if (!bank) throw new Error("Bank not found");
    this.assertStatementDate(params.statementDate);
    // one open reconciliation per account, and it starts after the last finished one
    const openDraft = await prisma.cashbookReconciliationSession.findFirst({ where: { bankId: params.bankId, status: CashbookReconciliationSessionStatus.DRAFT }, select: { id: true } });
    if (openDraft) throw new Error("This account already has a reconciliation in progress; finish or discard it first.");
    const lastDone = await this.findPriorFinalizedSession(params.bankId);
    if (lastDone && params.statementDate <= lastDone.statementDate) {
      throw new Error(`This account is reconciled up to ${lastDone.statementDate.toISOString().slice(0, 10)}; the next statement ends after that date.`);
    }

    const priorClosing = await this.getPriorClosingBalance(params.bankId);
    let opening: number | null =
      params.openingBalance !== undefined && params.openingBalance !== null
        ? Number(params.openingBalance)
        : priorClosing;
    if (opening !== null && !Number.isFinite(opening)) {
      throw new Error("Invalid openingBalance");
    }

    const end = endOfDay(params.statementDate);
    const ids = params.selectedEntryIds ?? [];
    if (ids.length > 0) {
      const entries = await prisma.cashbookEntry.findMany({
        where: { id: { in: ids }, bankId: params.bankId },
        select: { id: true },
      });
      if (entries.length !== ids.length) {
        throw new Error("One or more cashbook entry IDs are invalid or belong to another bank");
      }
      const full = await prisma.cashbookEntry.findMany({
        where: { id: { in: ids } },
        select: { id: true, status: true, isReconciled: true, transactionDate: true },
      });
      for (const e of full) {
        if (e.status !== "POSTED") throw new Error(`Entry ${e.id} is not POSTED`);
        if (e.isReconciled) throw new Error(`Entry ${e.id} is already reconciled`);
        if (e.transactionDate > end) {
          throw new Error(`Entry ${e.id} is after statement date`);
        }
      }
    }

    const newId = await prisma.$transaction(
      async (tx) => {
      const session = await tx.cashbookReconciliationSession.create({
        data: {
          bankId: params.bankId,
          status: CashbookReconciliationSessionStatus.DRAFT,
          statementDate: params.statementDate,
          statementEndBalance: toDecimalString(params.statementEndBalance),
          reference: params.reference?.trim() || null,
          openingBalance:
            opening !== null && Number.isFinite(opening) ? toDecimalString(opening) : null,
          createdById: params.userId,
        },
      });

      if (ids.length > 0) {
        await tx.cashbookReconciliationSessionLine.createMany({
          data: ids.map((cashbookEntryId) => ({
            sessionId: session.id,
            cashbookEntryId,
            selected: true,
          })),
        });
      }

      return session.id;
    },
      { maxWait: 60000, timeout: 120000 }
    );

    return this.getById(newId);
  }

  static async getById(sessionId: string) {
    const session = await prisma.cashbookReconciliationSession.findUnique({
      where: { id: sessionId },
      include: {
        lines: {
          include: {
            cashbookEntry: { include: this.entryInclude() },
          },
        },
      },
    });
    if (!session) return null;

    const priorClosing = await this.getPriorClosingBalance(session.bankId, session.id);

    const lines = this.mapSessionLines(
      { id: session.id, status: session.status },
      session.lines as any
    );

    return this.serializeSession(session, { lines, priorClosingBalance: priorClosing });
  }

  static async listForBank(bankId: string) {
    const bank = await prisma.bank.findUnique({ where: { id: bankId } });
    if (!bank) throw new Error("Bank not found");

    const sessions = await prisma.cashbookReconciliationSession.findMany({
      where: { bankId, status: { not: CashbookReconciliationSessionStatus.CANCELLED } },
      include: {
        lines: {
          include: {
            cashbookEntry: { include: this.entryInclude() },
          },
        },
      },
      orderBy: [{ statementDate: "desc" }, { updatedAt: "desc" }],
    });

    return sessions.map((s) => {
      const lines = this.mapSessionLines({ id: s.id, status: s.status }, s.lines as any);
      return this.serializeSession(s, { lines });
    });
  }

  static async updateDraft(params: {
    sessionId: string;
    userId: string;
    statementDate?: Date;
    statementEndBalance?: number;
    reference?: string | null;
    openingBalance?: number | null;
    lines?: Array<{ cashbookEntryId: string; selected: boolean }>;
  }) {
    const session = await prisma.cashbookReconciliationSession.findUnique({
      where: { id: params.sessionId },
    });
    if (!session) throw new Error("Reconciliation session not found");
    if (session.status !== CashbookReconciliationSessionStatus.DRAFT) {
      throw new Error("Only draft sessions can be updated");
    }

    const end = endOfDay(params.statementDate ?? session.statementDate);
    if (params.statementDate !== undefined) this.assertStatementDate(params.statementDate);

    const data: Prisma.CashbookReconciliationSessionUpdateInput = {};
    if (params.statementDate !== undefined) data.statementDate = params.statementDate;
    if (params.statementEndBalance !== undefined) {
      if (!Number.isFinite(params.statementEndBalance)) throw new Error("Invalid statementEndBalance");
      data.statementEndBalance = toDecimalString(params.statementEndBalance);
    }
    if (params.reference !== undefined) data.reference = params.reference?.trim() || null;
    if (params.openingBalance !== undefined) {
      if (params.openingBalance === null) {
        data.openingBalance = null;
      } else if (!Number.isFinite(params.openingBalance)) {
        throw new Error("Invalid openingBalance");
      } else {
        data.openingBalance = toDecimalString(params.openingBalance);
      }
    }

    await prisma.$transaction(
      async (tx) => {
      if (Object.keys(data).length > 0) {
        await tx.cashbookReconciliationSession.update({
          where: { id: params.sessionId },
          data,
        });
      }

      if (params.lines !== undefined) {
        const seen = new Set<string>();
        for (const row of params.lines) {
          if (seen.has(row.cashbookEntryId)) throw new Error("Duplicate cashbookEntryId in lines");
          seen.add(row.cashbookEntryId);
        }

        if (params.lines.length > 0) {
          const ids = params.lines.map((l) => l.cashbookEntryId);
          const entries = await tx.cashbookEntry.findMany({
            where: { id: { in: ids }, bankId: session.bankId },
            select: {
              id: true,
              status: true,
              isReconciled: true,
              transactionDate: true,
            },
          });
          if (entries.length !== ids.length) {
            throw new Error("One or more cashbook entry IDs are invalid or belong to another bank");
          }
          for (const e of entries) {
            if (e.status !== "POSTED") throw new Error(`Entry ${e.id} is not POSTED`);
            if (e.isReconciled) throw new Error(`Entry ${e.id} is already reconciled`);
            if (e.transactionDate > end) {
              throw new Error(`Entry ${e.id} is after statement date`);
            }
          }
        }

        await tx.cashbookReconciliationSessionLine.deleteMany({
          where: { sessionId: params.sessionId },
        });
        if (params.lines.length > 0) {
          await tx.cashbookReconciliationSessionLine.createMany({
            data: params.lines.map((l) => ({
              sessionId: params.sessionId,
              cashbookEntryId: l.cashbookEntryId,
              selected: l.selected,
            })),
          });
        }
      }
    },
      { maxWait: 60000, timeout: 120000 }
    );

    return this.getById(params.sessionId);
  }

  static async finish(params: { sessionId: string; userId: string }) {
    const session = await prisma.cashbookReconciliationSession.findUnique({
      where: { id: params.sessionId },
      include: {
        lines: {
          include: {
            cashbookEntry: true,
          },
        },
      },
    });

    if (!session) throw new Error("Reconciliation session not found");
    if (session.status !== CashbookReconciliationSessionStatus.DRAFT) {
      throw new Error("Only draft sessions can be finished");
    }

    const priorClosing = await this.getPriorClosingBalance(session.bankId, session.id);
    let opening = session.openingBalance != null ? num(session.openingBalance) : null;
    if (opening === null || !Number.isFinite(opening)) {
      opening = priorClosing;
    }
    if (opening === null || !Number.isFinite(opening)) {
      throw new Error("Enter the opening balance of this first reconciliation (the statement's opening balance).");
    }
    // an imported statement is reconciled line by line: every line matched to a book entry (ACC-CB-32)
    const linked: any[] = await prisma.$queryRawUnsafe("SELECT bank_statement_id FROM cashbook_reconciliation_statements WHERE session_id = ? LIMIT 1", session.id);
    const statementId = linked[0]?.bank_statement_id || null;
    if (statementId) {
      const unmatched = await prisma.bankStatementItem.count({ where: { statementId, isMatched: false } });
      if (unmatched) throw new Error(`${unmatched} statement line(s) are not matched to the cashbook; match them, or book the ones that are not in the books (charges, interest).`);
    }

    const selectedLines = session.lines.filter((l) => l.selected);
    if (selectedLines.length === 0) {
      throw new Error("Select at least one cashbook line to finish reconciliation");
    }

    let totalReceived = 0;
    let totalPaid = 0;
    const entryIds: string[] = [];

    for (const line of selectedLines) {
      const e = line.cashbookEntry;
      if (e.bankId !== session.bankId) throw new Error(`Entry ${e.id} does not belong to this bank`);
      if (e.status !== "POSTED") throw new Error(`Entry ${e.id} is not POSTED`);
      if (e.isReconciled) throw new Error(`Entry ${e.id} is already reconciled`);
      const end = endOfDay(session.statementDate);
      if (e.transactionDate > end) throw new Error(`Entry ${e.id} is after statement date`);

      const amount = num(e.amount);
      if (e.type === CashbookEntryType.RECEIPT) totalReceived += amount;
      else totalPaid += amount;
      entryIds.push(e.id);
    }

    const target = num(session.statementEndBalance);
    const reconciledBalance = opening + totalReceived - totalPaid;
    if (Math.abs(reconciledBalance - target) > BALANCE_EPS) {
      throw new Error(
        `Reconciled balance ${reconciledBalance.toFixed(2)} does not match statement end balance ${target.toFixed(2)} (tolerance ${BALANCE_EPS})`
      );
    }

    const now = new Date();

    await prisma.$transaction(
      async (tx) => {
        // claimed only while still unreconciled: two reconciliations finishing at once cannot both clear an entry
        const claimed = await tx.cashbookEntry.updateMany({
          where: { id: { in: entryIds }, isReconciled: false },
          data: {
            isReconciled: true,
            reconciledAt: now,
            reconciledById: params.userId,
            cashbookReconciliationSessionId: params.sessionId,
          },
        });
        if (claimed.count !== entryIds.length) {
          throw new Error("Some of the ticked entries were reconciled elsewhere a moment ago; reload the reconciliation.");
        }
        if (statementId) {
          await tx.bankStatement.update({ where: { id: statementId }, data: { isReconciled: true, reconciledAt: now, reconciledById: params.userId } });
        }

        await tx.cashbookReconciliationSession.update({
          where: { id: params.sessionId },
          data: {
            status: CashbookReconciliationSessionStatus.FINALIZED,
            openingBalance: toDecimalString(opening),
            closingBalance: toDecimalString(target),
            finishedAt: now,
            finishedById: params.userId,
          },
        });
      },
      { maxWait: 60000, timeout: 120000 }
    );

    try {
      const { default: AuditService } = await import("./AuditService");
      await AuditService.log({ userId: params.userId, action: "UPDATE", entityType: "CashbookReconciliationSession", entityId: params.sessionId, oldValues: { status: "DRAFT" }, newValues: { status: "FINALIZED", openingBalance: opening, closingBalance: target, entries: entryIds.length } });
    } catch { /* audit is best effort here; the reconciliation itself is committed */ }

    return this.getById(params.sessionId);
  }

  static async discard(params: { sessionId: string }) {
    const session = await prisma.cashbookReconciliationSession.findUnique({
      where: { id: params.sessionId },
    });
    if (!session) throw new Error("Reconciliation session not found");
    if (session.status !== CashbookReconciliationSessionStatus.DRAFT) {
      throw new Error("Only draft sessions can be discarded");
    }

    const linked: any[] = await prisma.$queryRawUnsafe("SELECT bank_statement_id FROM cashbook_reconciliation_statements WHERE session_id = ? LIMIT 1", params.sessionId);
    await prisma.$transaction(
      async (tx) => {
      await tx.cashbookReconciliationSessionLine.deleteMany({
        where: { sessionId: params.sessionId },
      });
      if (linked[0]) {
        await tx.$executeRawUnsafe("DELETE FROM cashbook_reconciliation_statements WHERE session_id = ?", params.sessionId);
        await tx.bankStatementItem.deleteMany({ where: { statementId: linked[0].bank_statement_id } });
        await tx.bankStatement.delete({ where: { id: linked[0].bank_statement_id } }).catch(() => null);
      }
      await tx.cashbookReconciliationSession.update({
        where: { id: params.sessionId },
        data: { status: CashbookReconciliationSessionStatus.CANCELLED },
      });
    },
      { maxWait: 60000, timeout: 120000 }
    );

    return { id: params.sessionId, status: CashbookReconciliationSessionStatus.CANCELLED };
  }
}
