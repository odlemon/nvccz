// @ts-nocheck
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../utils/database";
import { BscDigitalEntryService } from "./BscDigitalEntryService";

function toDecimalOrNull(v: unknown): Decimal | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return new Decimal(n);
}

export class BscWorkflowService {
  static async createBudgetVarianceReport(input: {
    performanceGoalId: string;
    narrative: string;
    submittedById: string;
    periodLabel?: string | null;
    periodStart?: string | Date | null;
    periodEnd?: string | Date | null;
    actualSpend?: unknown;
    strategicAllocation?: unknown;
  }) {
    const narrative = String(input.narrative ?? "").trim();
    if (!narrative) throw new Error("narrative is required");

    const goal = await prisma.performanceGoal.findUnique({
      where: { id: input.performanceGoalId }
    });
    if (!goal) throw new Error("Performance goal not found");

    return prisma.bscBudgetVarianceReport.create({
      data: {
        performanceGoalId: input.performanceGoalId,
        periodLabel: input.periodLabel != null ? String(input.periodLabel).trim() || null : null,
        periodStart:
          input.periodStart != null && input.periodStart !== ""
            ? new Date(input.periodStart)
            : null,
        periodEnd:
          input.periodEnd != null && input.periodEnd !== "" ? new Date(input.periodEnd) : null,
        narrative,
        actualSpendSnapshot: toDecimalOrNull(input.actualSpend),
        allocationSnapshot: toDecimalOrNull(input.strategicAllocation),
        submittedById: input.submittedById
      },
      include: {
        submittedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        goal: { select: { id: true, title: true } }
      }
    });
  }

  static async submitStatutoryWithSubmissionRecord(input: {
    goalId: string;
    submittedById: string;
    incrementBy?: unknown;
    evidenceDocumentUrl?: string | null;
    frequency?: string;
    periodLabel?: string;
  }) {
    const goalOut = await BscDigitalEntryService.submitStatutoryReportsOutput({
      goalId: input.goalId,
      incrementBy: input.incrementBy,
      evidenceDocumentUrl: input.evidenceDocumentUrl,
      responsibleUserId: input.submittedById,
      frequency: input.frequency,
      periodLabel: input.periodLabel
    });

    const submission = await prisma.bscStatutorySubmission.create({
      data: {
        performanceGoalId: input.goalId,
        periodLabel: input.periodLabel != null ? String(input.periodLabel).trim() || null : null,
        evidenceDocumentUrl:
          input.evidenceDocumentUrl != null ? String(input.evidenceDocumentUrl).trim() || null : null,
        submittedById: input.submittedById,
        status: "pending_manager_review"
      },
      include: {
        submittedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        goal: { select: { id: true, title: true } }
      }
    });

    return { submission, goalUpdate: goalOut };
  }

  static async managerSignOffStatutorySubmission(input: {
    submissionId: string;
    managerUserId: string;
    note?: string | null;
  }) {
    const sub = await prisma.bscStatutorySubmission.findUnique({
      where: { id: input.submissionId }
    });
    if (!sub) throw new Error("Statutory submission not found");
    if (sub.status === "signed_off") {
      return prisma.bscStatutorySubmission.findUnique({
        where: { id: input.submissionId },
        include: {
          submittedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
          managerSignOffBy: { select: { id: true, firstName: true, lastName: true, email: true } },
          goal: { select: { id: true, title: true } }
        }
      });
    }

    const updated = await prisma.bscStatutorySubmission.update({
      where: { id: input.submissionId },
      data: {
        managerSignOffById: input.managerUserId,
        managerSignOffAt: new Date(),
        managerSignOffNote: input.note != null ? String(input.note).trim() || null : null,
        status: "signed_off"
      },
      include: {
        submittedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        managerSignOffBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        goal: { select: { id: true, title: true } }
      }
    });

    await prisma.activityLog
      .create({
        data: {
          userId: input.managerUserId,
          activityType: "bsc_statutory_manager_sign_off",
          title: "Statutory submission signed off",
          description: `Submission ${input.submissionId} for goal ${sub.performanceGoalId}.`,
          goalId: sub.performanceGoalId,
          status: "completed"
        }
      })
      .catch(() => undefined);

    return updated;
  }

  static async listStatutorySubmissionsForGoal(performanceGoalId: string) {
    return prisma.bscStatutorySubmission.findMany({
      where: { performanceGoalId },
      orderBy: { createdAt: "desc" },
      include: {
        submittedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        managerSignOffBy: { select: { id: true, firstName: true, lastName: true, email: true } }
      }
    });
  }

  static async listBudgetVarianceReportsForGoal(performanceGoalId: string) {
    return prisma.bscBudgetVarianceReport.findMany({
      where: { performanceGoalId },
      orderBy: { createdAt: "desc" },
      include: {
        submittedBy: { select: { id: true, firstName: true, lastName: true, email: true } }
      }
    });
  }
}
