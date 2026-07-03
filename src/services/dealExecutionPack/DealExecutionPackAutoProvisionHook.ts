// @ts-nocheck
import { prisma } from "../../utils/database";
import { DealExecutionPackProvisionService } from "./DealExecutionPackProvisionService";

/** Thin wrapper for application / term-sheet workflow hooks. */
export class DealExecutionPackAutoProvisionHook {
  static async tryProvisionForApplication(applicationId: string, actorUserId: string) {
    try {
      const impl = await prisma.investmentImplementation.findUnique({
        where: { applicationId },
        include: {
          application: {
            select: {
              id: true,
              fundId: true,
              requestedAmount: true,
            },
          },
        },
      });
      if (!impl?.portfolioCompanyId || !impl.application?.fundId) {
        return null;
      }

      return DealExecutionPackProvisionService.provision({
        fundId: impl.application.fundId,
        portfolioCompanyId: impl.portfolioCompanyId,
        applicationId,
        investmentAmount: impl.application.requestedAmount
          ? Number(impl.application.requestedAmount)
          : impl.totalCommittedAmount
            ? Number(impl.totalCommittedAmount)
            : null,
        createdById: actorUserId,
      });
    } catch (err: any) {
      console.error("Deal execution pack auto-provision failed", {
        applicationId,
        error: err?.message || err,
      });
      return null;
    }
  }
}
