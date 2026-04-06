import { prisma } from "../utils/database";
import PeriodLockService from "./PeriodLockService";
import type { AccountingModuleCode, PeriodLockSource } from "./fiscalPeriodLockTypes";
import { PeriodLockRejectedError } from "./fiscalPeriodLockTypes";

export default class PostingGuardService {
  /**
   * Validates period; on lock rejection persists a posting exception when policy allows / always for traceability.
   */
  static async validateOrEnqueueException(params: {
    sourceModule: AccountingModuleCode | string;
    targetModule: AccountingModuleCode | string;
    sourceDocumentType: string;
    sourceDocumentId: string;
    accountingDate: Date;
    userId: string;
    source: PeriodLockSource;
    actionType: string;
    payloadSnapshot?: unknown;
    userPermissions?: Array<{ name: string; value: boolean }>;
    /** When true, persist `posting_exceptions` on lock rejection (feeder / batch jobs). */
    persistException?: boolean;
  }): Promise<{ ok: true } | { ok: false; exceptionId: string; error: PeriodLockRejectedError }> {
    try {
      await PeriodLockService.assertModuleDateOpen({
        moduleCode: params.targetModule,
        accountingDate: params.accountingDate,
        userId: params.userId,
        source: params.source,
        actionType: params.actionType,
        userPermissions: params.userPermissions,
      });
      return { ok: true };
    } catch (e) {
      if (e instanceof PeriodLockRejectedError && params.persistException) {
        const row = await prisma.postingException.create({
          data: {
            sourceModule: String(params.sourceModule),
            targetModule: String(params.targetModule),
            sourceDocumentType: params.sourceDocumentType,
            sourceDocumentId: params.sourceDocumentId,
            accountingDate: params.accountingDate,
            reasonCode: "TARGET_PERIOD_LOCKED",
            status: "OPEN",
            payloadSnapshot: params.payloadSnapshot === undefined ? undefined : (params.payloadSnapshot as object),
          },
        });
        return { ok: false, exceptionId: row.id, error: e };
      }
      throw e;
    }
  }

  static async recordFeederLockFailure(params: {
    sourceModule: string;
    targetModule: string;
    sourceDocumentType: string;
    sourceDocumentId: string;
    accountingDate: Date;
    reasonCode: string;
    payloadSnapshot?: unknown;
  }) {
    return prisma.postingException.create({
      data: {
        sourceModule: params.sourceModule,
        targetModule: params.targetModule,
        sourceDocumentType: params.sourceDocumentType,
        sourceDocumentId: params.sourceDocumentId,
        accountingDate: params.accountingDate,
        reasonCode: params.reasonCode,
        status: "OPEN",
        payloadSnapshot:
          params.payloadSnapshot === undefined ? undefined : (params.payloadSnapshot as object),
      },
    });
  }

  static async listExceptions(params: { status?: string; take?: number; skip?: number }) {
    return prisma.postingException.findMany({
      where: params.status ? { status: params.status } : undefined,
      orderBy: { createdAt: "desc" },
      take: params.take ?? 50,
      skip: params.skip ?? 0,
    });
  }
}
