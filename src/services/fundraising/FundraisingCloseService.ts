// @ts-nocheck
import { prisma } from "../../utils/database";
import { ClientService } from "../ClientService";
import { LpFundMetricsService } from "../fundReporting/LpFundMetricsService";
import { FundraisingGlPostingService } from "./FundraisingGlPostingService";

export class FundraisingCloseService {
  static async closeDeal(dealId: string, userId: string) {
    const deal = await prisma.fundraisingPipelineDeal.findUnique({
      where: { id: dealId },
      include: {
        campaign: { include: { fund: true } },
        agreement: true,
        stage: true,
      },
    });
    if (!deal) throw Object.assign(new Error("Deal not found"), { statusCode: 404 });
    if (deal.closedAt && deal.clientId) {
      return FundraisingCloseService.getCloseResult(dealId);
    }

    if (deal.agreement?.status !== "SIGNED" && deal.stage.stageCode !== "WON_SIGNED") {
      throw Object.assign(new Error("Deal must have signed agreement before close"), { statusCode: 400 });
    }

    const fund = deal.campaign.fund;
    const email = String(deal.prospectEmail || `${deal.prospectName.replace(/\s+/g, ".").toLowerCase()}@lp.placeholder.local`).trim();
    const amount = Number(deal.proposedAmount);
    const effectiveDate = deal.agreement?.signedAt ?? new Date();

    let clientId = deal.clientId;

    if (!clientId) {
      const existing = await prisma.client.findUnique({ where: { email } });
      if (existing) {
        clientId = existing.id;
      } else {
        try {
          const created = await ClientService.createClient({
            type: deal.prospectType || "institutional",
            legalName: deal.prospectName,
            email,
            country: deal.prospectCountry || "ZW",
            phone: deal.prospectPhone || undefined,
            fundId: fund.id,
            amount,
            currency: deal.currencyCode,
            effectiveDate,
            notes: `Fundraising pipeline close — deal ${dealId}`,
            eSign: deal.agreement
              ? { agreementUrl: deal.agreement.fileUrl, signedAt: deal.agreement.signedAt }
              : undefined,
          });
          clientId = created?.id;
        } catch (e: any) {
          if (String(e?.message || "").includes("email already exists")) {
            const byEmail = await prisma.client.findUnique({ where: { email } });
            clientId = byEmail?.id;
          } else if (
            String(e?.message || "").includes("Fund is not open") ||
            String(e?.message || "").includes("Investment amount") ||
            String(e?.message || "").includes("Insufficient remaining")
          ) {
            const created = await prisma.$transaction(async (tx) => {
              const investorId = await ClientService.allocateNextPartnerInvestorId(tx);
              const client = await tx.client.create({
                data: {
                  investorId,
                  type: deal.prospectType || "institutional",
                  legalName: deal.prospectName,
                  email,
                  country: deal.prospectCountry || "ZW",
                  phone: deal.prospectPhone,
                  status: "ACTIVE",
                },
              });
              await tx.investmentCommitment.create({
                data: {
                  clientId: client.id,
                  fundId: fund.id,
                  amount,
                  currency: deal.currencyCode,
                  effectiveDate,
                  status: "ACTIVE",
                  notes: `Fundraising pipeline close — deal ${dealId}`,
                  eSign: deal.agreement
                    ? { agreementUrl: deal.agreement.fileUrl, signedAt: deal.agreement.signedAt }
                    : undefined,
                },
              });
              return client;
            });
            clientId = created.id;
          } else {
            throw e;
          }
        }
      }
    }

    if (!clientId) throw new Error("Failed to provision LP client");

    await prisma.investmentCommitment.updateMany({
      where: { clientId, fundId: fund.id },
      data: { status: "ACTIVE" },
    });

    const existingCommitment = await prisma.investmentCommitment.findUnique({
      where: { clientId_fundId: { clientId, fundId: fund.id } },
    });
    if (!existingCommitment) {
      await prisma.investmentCommitment.create({
        data: {
          clientId,
          fundId: fund.id,
          amount,
          currency: deal.currencyCode,
          effectiveDate,
          status: "ACTIVE",
          notes: `Fundraising pipeline close — deal ${dealId}`,
        },
      });
    }

    const portalUser = await prisma.user.findFirst({
      where: { email },
      select: { id: true },
    });
    if (portalUser) {
      try {
        await ClientService.linkPortalUser(clientId, portalUser.id);
      } catch {
        // non-fatal if link fails
      }
    }

    let journalEntryId = deal.journalEntryId;
    if (!journalEntryId) {
      journalEntryId = await FundraisingGlPostingService.postCommitment({
        campaignId: deal.campaignId,
        dealId,
        clientName: deal.prospectName,
        amount,
        createdById: userId,
        effectiveDate,
      });
    }

    await prisma.fundraisingPipelineDeal.update({
      where: { id: dealId },
      data: {
        clientId,
        closedAt: new Date(),
        journalEntryId,
      },
    });

    try {
      const asOf = new Date();
      const periodEnd = asOf;
      const periodStart = new Date(asOf);
      periodStart.setFullYear(periodStart.getFullYear() - 1);
      const metrics = await LpFundMetricsService.computeForClient({
        fundId: fund.id,
        clientId,
        periodStart,
        periodEnd,
      });
      await prisma.lpPortalMetricSnapshot.upsert({
        where: {
          clientId_fundId_asOfDate: {
            clientId,
            fundId: fund.id,
            asOfDate: asOf,
          },
        },
        create: { clientId, fundId: fund.id, asOfDate: asOf, metrics },
        update: { metrics },
      });
    } catch {
      // snapshot refresh is best-effort
    }

    return FundraisingCloseService.getCloseResult(dealId);
  }

  static async getCloseResult(dealId: string) {
    return prisma.fundraisingPipelineDeal.findUnique({
      where: { id: dealId },
      include: {
        client: { select: { id: true, legalName: true, investorId: true, email: true } },
        agreement: true,
        campaign: { include: { fund: { select: { id: true, name: true } } } },
      },
    });
  }
}
