// @ts-nocheck
import { randomUUID } from "crypto";
import { emailTransport, getFromAddress } from "../../config/email.config";
import { prisma } from "../../utils/database";
import { FundraisingInteractionService } from "./FundraisingInteractionService";

const TEMPLATES: Record<string, { subject: string; body: (ctx: any) => string }> = {
  TEASER: {
    subject: "Investment opportunity — {{fundName}}",
    body: (ctx) =>
      `Dear ${ctx.prospectName},\n\nWe would like to share an investment opportunity in ${ctx.fundName}.\n\nRegards,\nInvestor Relations`,
  },
  UPDATE: {
    subject: "Fund update — {{fundName}}",
    body: (ctx) =>
      `Dear ${ctx.prospectName},\n\nPlease find our latest update on ${ctx.fundName}.\n\nRegards,\nInvestor Relations`,
  },
  FOLLOW_UP: {
    subject: "Following up — {{fundName}}",
    body: (ctx) =>
      `Dear ${ctx.prospectName},\n\nFollowing up on our recent conversation regarding ${ctx.fundName}.\n\nRegards,\nInvestor Relations`,
  },
};

function render(template: string, ctx: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => ctx[k] ?? "");
}

export class FundraisingMailerService {
  static async sendBatch(
    campaignId: string,
    userId: string,
    body: { dealIds: string[]; templateKey: string }
  ) {
    const campaign = await prisma.fundraisingCampaign.findUnique({
      where: { id: campaignId },
      include: { fund: { select: { name: true } } },
    });
    if (!campaign) throw Object.assign(new Error("Campaign not found"), { statusCode: 404 });

    const template = TEMPLATES[String(body.templateKey || "UPDATE").toUpperCase()];
    if (!template) {
      throw Object.assign(new Error(`Unknown mailer template: ${body.templateKey}`), { statusCode: 400 });
    }

    const deals = await prisma.fundraisingPipelineDeal.findMany({
      where: { id: { in: body.dealIds }, campaignId },
    });
    if (!deals.length) {
      throw Object.assign(new Error("No matching deals found"), { statusCode: 400 });
    }

    const batchId = randomUUID().slice(0, 8);
    const fundName = campaign.fund?.name || "Fund";
    const sent: string[] = [];
    const skipped: Array<{ dealId: string; reason: string }> = [];

    for (const deal of deals) {
      const email = String(deal.prospectEmail || "").trim();
      if (!email) {
        skipped.push({ dealId: deal.id, reason: "Missing email" });
        continue;
      }

      const ctx = { prospectName: deal.prospectName, fundName };
      const subject = render(template.subject, ctx);
      const text = template.body(ctx);

      try {
        const from = getFromAddress("investment");
        await emailTransport.sendMail({
          from: `"${from.name}" <${from.address}>`,
          to: [{ name: deal.prospectName, address: email }],
          subject,
          text,
        });
        sent.push(deal.id);
        await FundraisingInteractionService.log(deal.id, userId, {
          interactionType: "EMAIL",
          subject,
          body: text,
          mailerBatchId: batchId,
          metadata: { templateKey: body.templateKey, batchId },
        });
      } catch (e) {
        skipped.push({ dealId: deal.id, reason: (e as Error).message });
      }
    }

    return { batchId, sentCount: sent.length, skippedCount: skipped.length, sent, skipped };
  }
}
