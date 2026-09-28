// @ts-nocheck
import { randomBytes } from "crypto";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../utils/database";
import { createJournalEntryWithAuditSequence } from "./AuditTrailSequenceService";
import { EmailNotificationService } from "./EmailNotificationService";

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

export type RecurringJournalLineInput = {
  chartOfAccountId: string;
  debitAmount: number;
  creditAmount: number;
  description?: string;
};

function parseLinesJson(raw: unknown): RecurringJournalLineInput[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row: any) => ({
    chartOfAccountId: String(row.chartOfAccountId),
    debitAmount: Number(row.debitAmount) || 0,
    creditAmount: Number(row.creditAmount) || 0,
    description: row.description != null ? String(row.description) : undefined,
  }));
}

function validateBalancedLines(lines: RecurringJournalLineInput[]) {
  if (!lines.length) throw new Error("At least one journal line is required");
  let dr = 0;
  let cr = 0;
  for (const l of lines) {
    if (l.debitAmount < 0 || l.creditAmount < 0) {
      throw new Error("Line amounts cannot be negative");
    }
    dr += l.debitAmount;
    cr += l.creditAmount;
  }
  if (Math.abs(dr - cr) > 0.02) {
    throw new Error(`Journal lines must balance (debits ${dr} vs credits ${cr})`);
  }
  if (dr <= 0) {
    throw new Error("Total debits must be greater than zero");
  }
}

export class RecurringJournalService {
  static yearMonthKey(d: Date): string {
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
  }

  static isDueOnDate(template: { dayOfMonth: number }, d: Date): boolean {
    const dom = template.dayOfMonth;
    if (dom < 1 || dom > 31) return false;
    return d.getUTCDate() === dom;
  }

  static async assertChartAccountsExist(chartOfAccountIds: string[]) {
    const unique = [...new Set(chartOfAccountIds.filter(Boolean))];
    if (!unique.length) throw new Error("No chart of account IDs on lines");
    const found = await prisma.chartOfAccounts.findMany({
      where: { id: { in: unique } },
      select: { id: true },
    });
    if (found.length !== unique.length) {
      const have = new Set(found.map((f) => f.id));
      const missing = unique.filter((id) => !have.has(id));
      throw new Error(`Unknown chart of account id(s): ${missing.join(", ")}`);
    }
  }

  static async createTemplate(params: {
    name: string;
    description?: string;
    dayOfMonth?: number;
    currencyId: string;
    lines: RecurringJournalLineInput[];
    referencePrefix?: string;
    createdById: string;
  }) {
    validateBalancedLines(params.lines);
    const dayOfMonth = params.dayOfMonth ?? 1;
    if (dayOfMonth < 1 || dayOfMonth > 31) {
      throw new Error("dayOfMonth must be 1–31");
    }
    await prisma.currency.findUniqueOrThrow({ where: { id: params.currencyId } });
    await this.assertChartAccountsExist(params.lines.map((l) => l.chartOfAccountId));
    return prisma.recurringJournalTemplate.create({
      data: {
        name: params.name,
        description: params.description ?? null,
        dayOfMonth,
        currencyId: params.currencyId,
        linesJson: params.lines as object[],
        referencePrefix: params.referencePrefix ?? "REC-JE",
        createdById: params.createdById,
        // it posts every month without further review once on, so an approver other than its author switches it on
        isActive: false,
      },
      include: { currency: true, createdBy: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });
  }

  static async listTemplates(activeOnly = false) {
    return prisma.recurringJournalTemplate.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: { name: "asc" },
      include: {
        currency: { select: { id: true, code: true, symbol: true } },
        _count: { select: { runs: true } },
      },
    });
  }

  static async setActive(templateId: string, isActive: boolean, actorId?: string) {
    const t = await prisma.recurringJournalTemplate.findUnique({ where: { id: templateId }, select: { createdById: true, isActive: true, name: true } });
    if (!t) throw new Error("Template not found");
    // switching one on approves it: every month it posts without further review (maker-checker, D3)
    if (isActive && !t.isActive && actorId && actorId === t.createdById) {
      throw Object.assign(new Error("A recurring journal is switched on by an approver other than the person who set it up."), { statusCode: 403 });
    }
    const updated = await prisma.recurringJournalTemplate.update({
      where: { id: templateId },
      data: { isActive },
    });
    if (actorId) {
      const { default: AuditService } = await import("./AuditService");
      await AuditService.log({ userId: actorId, action: "UPDATE", entityType: "RecurringJournalTemplate", entityId: templateId, oldValues: { isActive: t.isActive }, newValues: { isActive, name: t.name } }).catch(() => null);
    }
    return updated;
  }

  /**
   * Post one template for a given calendar month (UTC yearMonth) if not already run.
   */
  static async postTemplateForMonth(templateId: string, asOf: Date, yearMonth: string) {
    const template = await prisma.recurringJournalTemplate.findUnique({
      where: { id: templateId },
    });
    if (!template || !template.isActive) {
      throw new Error("Template not found or inactive");
    }
    const existing = await prisma.recurringJournalRun.findUnique({
      where: {
        templateId_yearMonth: { templateId, yearMonth },
      },
    });
    if (existing) {
      return { skipped: true as const, reason: "already_posted", journalEntryId: existing.journalEntryId };
    }
    const lines = parseLinesJson(template.linesJson);
    validateBalancedLines(lines);
    await this.assertChartAccountsExist(lines.map((l) => l.chartOfAccountId));
    const totalDebit = lines.reduce((s, l) => s + l.debitAmount, 0);
    const ref = `${template.referencePrefix}-${yearMonth}-${randomBytes(4).toString("hex").toUpperCase()}`;
    const postingDate = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), template.dayOfMonth, 12, 0, 0, 0));

    const journalEntry = await createJournalEntryWithAuditSequence({
      transactionDate: postingDate,
      referenceNumber: ref,
      description: `${template.name} (${yearMonth})`,
      totalAmount: new Decimal(Number(totalDebit).toFixed(2)),
      currencyId: template.currencyId,
      status: "POSTED",
      createdById: template.createdById,
    });

    await prisma.journalEntryLine.createMany({
      data: lines.map((l) => ({
        journalEntryId: journalEntry.id,
        chartOfAccountId: l.chartOfAccountId,
        debitAmount: new Decimal(l.debitAmount),
        creditAmount: new Decimal(l.creditAmount),
        description: l.description || template.name,
      })),
    });

    await prisma.recurringJournalRun.create({
      data: {
        templateId,
        yearMonth,
        journalEntryId: journalEntry.id,
      },
    });

    await EmailNotificationService.notifyAccountantsRecurringJournalPosted({
      templateName: template.name,
      referenceNumber: ref,
      journalEntryId: journalEntry.id,
      yearMonth,
    }).catch((err: Error) => {
      console.error("Accountant notification (recurring journal) failed:", err.message);
    });

    return { skipped: false as const, journalEntryId: journalEntry.id, referenceNumber: ref };
  }

  /**
   * Run all active templates that are due on `asOf` (UTC day-of-month match) for current year-month.
   */
  static async runDueTemplates(asOf = new Date()): Promise<{
    posted: Array<{
      templateId: string;
      templateName?: string;
      journalEntryId?: string;
      referenceNumber?: string;
      skipped?: boolean;
      error?: string;
    }>;
  }> {
    const yearMonth = this.yearMonthKey(asOf);
    const templates = await prisma.recurringJournalTemplate.findMany({
      where: { isActive: true },
    });
    const posted: Array<{
      templateId: string;
      templateName?: string;
      journalEntryId?: string;
      referenceNumber?: string;
      skipped?: boolean;
      error?: string;
    }> = [];
    for (const t of templates) {
      if (!this.isDueOnDate(t, asOf)) continue;
      try {
        const r = await this.postTemplateForMonth(t.id, asOf, yearMonth);
        if (r.skipped) {
          posted.push({
            templateId: t.id,
            templateName: t.name,
            skipped: true,
            journalEntryId: r.journalEntryId,
          });
        } else {
          posted.push({
            templateId: t.id,
            templateName: t.name,
            journalEntryId: r.journalEntryId,
            referenceNumber: r.referenceNumber,
          });
        }
      } catch (e: any) {
        console.error(`RecurringJournal template ${t.name} (${t.id}) failed:`, e.message);
        posted.push({ templateId: t.id, templateName: t.name, error: e.message });
      }
    }
    return { posted };
  }
}
