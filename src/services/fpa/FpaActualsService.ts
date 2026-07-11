// @ts-nocheck
import { prisma } from "../../utils/database";
import { FpaError } from "./FpaError";
import { FpaAuditService } from "./FpaAuditService";

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export class FpaActualsService {
  static async sync(input: any, userId: string, ip?: string) {
    const modelId = input.modelId;
    if (!modelId) throw new FpaError(400, "VALIDATION", "modelId required");
    const model = await prisma.planningModel.findUnique({
      where: { id: modelId },
      include: { lineItems: true },
    });
    if (!model) throw new FpaError(404, "NOT_FOUND", "Model not found");

    const periodStart = input.periodStart ? new Date(input.periodStart) : model.startPeriod;
    const periodEnd = input.periodEnd ? new Date(input.periodEnd) : model.endPeriod;
    const versionId = input.versionId;
    const scenarioId = input.scenarioId;

    const job = await prisma.planningImportJob.create({
      data: {
        modelId,
        sourceModule: "GL_JOURNAL",
        status: "RUNNING",
        periodStart,
        periodEnd,
        createdById: userId,
      },
    });

    try {
      const lineItemsWithAccount = model.lineItems.filter((li) => li.accountId);
      const accountIds = lineItemsWithAccount.map((li) => li.accountId).filter(Boolean);

      let rows = 0;
      const snapshots = [];

      if (accountIds.length) {
        const lines = await prisma.journalEntryLine.findMany({
          where: {
            chartOfAccountId: { in: accountIds },
            journalEntry: {
              status: { in: ["POSTED", "APPROVED"] },
              transactionDate: { gte: periodStart, lte: periodEnd },
            },
          },
          include: {
            journalEntry: { select: { transactionDate: true, currencyId: true, status: true } },
            chartOfAccount: { select: { id: true, accountNo: true } },
          },
        });

        const bucket: Record<string, { amount: number; accountId: string; lineItemId: string; periodDate: Date }> = {};
        for (const line of lines) {
          const li = lineItemsWithAccount.find((x) => x.accountId === line.chartOfAccountId);
          if (!li) continue;
          const td = new Date(line.journalEntry.transactionDate);
          const pk = `${li.id}|${monthKey(td)}`;
          const debit = Number(line.debitAmount || 0);
          const credit = Number(line.creditAmount || 0);
          const signed =
            li.lineItemType === "REVENUE" || li.lineItemType === "CASH" ? credit - debit : debit - credit;
          if (!bucket[pk]) {
            bucket[pk] = {
              amount: 0,
              accountId: line.chartOfAccountId,
              lineItemId: li.id,
              periodDate: new Date(monthKey(td)),
            };
          }
          bucket[pk].amount += signed;
        }

        for (const b of Object.values(bucket)) {
          const snap = await prisma.planningActualsSnapshot.create({
            data: {
              modelId,
              periodDate: b.periodDate,
              accountId: b.accountId,
              lineItemId: b.lineItemId,
              currencyCode: model.baseCurrency,
              amount: b.amount,
              sourceModule: "GL_JOURNAL",
              importJobId: job.id,
            },
          });
          snapshots.push(snap);
          rows++;

          if (versionId && scenarioId) {
            const cell = await prisma.planningCell.findFirst({
              where: {
                modelId,
                versionId,
                scenarioId,
                lineItemId: b.lineItemId,
                periodDate: b.periodDate,
              },
            });
            if (cell) {
              await prisma.planningCell.update({
                where: { id: cell.id },
                data: {
                  value: b.amount,
                  sourceType: "ACTUAL",
                  valueType: "ACTUAL",
                  lastUpdatedById: userId,
                  lastUpdatedAt: new Date(),
                },
              });
            }
          }
        }
      }

      // Lock closed fiscal period cells marked ACTUAL
      const closedPeriods = await prisma.fiscalPeriod.findMany({
        where: {
          status: { in: ["CLOSED", "LOCKED"] },
          startDate: { lte: periodEnd },
          endDate: { gte: periodStart },
        },
      });
      let lockedCells = 0;
      if (versionId && closedPeriods.length) {
        for (const fp of closedPeriods) {
          const res = await prisma.planningCell.updateMany({
            where: {
              modelId,
              versionId,
              sourceType: "ACTUAL",
              periodDate: { gte: fp.startDate, lte: fp.endDate },
            },
            data: { isEditable: false, isLocked: true },
          });
          lockedCells += res.count;
        }
      }

      const completed = await prisma.planningImportJob.update({
        where: { id: job.id },
        data: { status: "COMPLETED", rowCount: rows, completedAt: new Date() },
      });

      await FpaAuditService.log("ACTUALS_SYNC", userId, {
        modelId,
        versionId,
        newValue: String(rows),
        ip,
      });

      return {
        job: completed,
        snapshotCount: snapshots.length,
        lockedCells,
        note: accountIds.length
          ? "Synced from journal_entry_lines for line items with accountId"
          : "No line items have accountId mapped; job completed with 0 rows",
      };
    } catch (e: any) {
      await prisma.planningImportJob.update({
        where: { id: job.id },
        data: { status: "FAILED", errorMessage: e?.message || String(e), completedAt: new Date() },
      });
      throw e;
    }
  }

  static async listSnapshots(query: any = {}) {
    const where: any = {};
    if (query.modelId) where.modelId = String(query.modelId);
    if (query.periodStart || query.periodEnd) {
      where.periodDate = {};
      if (query.periodStart) where.periodDate.gte = new Date(query.periodStart);
      if (query.periodEnd) where.periodDate.lte = new Date(query.periodEnd);
    }
    return prisma.planningActualsSnapshot.findMany({
      where,
      orderBy: [{ periodDate: "desc" }, { createdAt: "desc" }],
      take: Math.min(500, Number(query.limit || 100)),
    });
  }
}
