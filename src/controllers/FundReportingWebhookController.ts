// @ts-nocheck
import { Request, Response } from "express";
import { prisma } from "../utils/database";

export class FundReportingWebhookController {
  static async emailDelivery(req: Request, res: Response) {
    try {
      const secret = process.env.FUND_REPORTING_WEBHOOK_SECRET?.trim();
      if (!secret) {
        return res.status(503).json({
          success: false,
          code: "WEBHOOK_SECRET_MISSING",
          message: "FUND_REPORTING_WEBHOOK_SECRET is not configured",
        });
      }
      const header = String(req.headers["x-fund-reporting-webhook-secret"] || "");
      if (header !== secret) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const body = req.body || {};
      const eventType = String(body.eventType || body.event || "UNKNOWN").toUpperCase();
      const jobId = body.jobId || body.metadata?.jobId;
      const email = body.email || body.recipient;

      if (jobId) {
        await prisma.fundReportDistributionLog.create({
          data: {
            jobId: String(jobId),
            eventType: eventType === "BOUNCE" ? "BOUNCE" : eventType === "COMPLAINT" ? "COMPLAINT" : "DELIVERED",
            providerRef: body.messageId || body.providerRef || null,
            payload: body,
            message: body.message || `Webhook ${eventType}`,
          },
        });

        if (eventType === "BOUNCE" && body.bounceType === "hard") {
          const job = await prisma.fundReportRecipientJob.findUnique({
            where: { id: String(jobId) },
            include: { client: true },
          });
          if (job?.client) {
            await prisma.client.update({
              where: { id: job.clientId },
              data: { status: "INACTIVE" },
            });
          }
          await prisma.fundReportRecipientJob.update({
            where: { id: String(jobId) },
            data: { status: "BOUNCED", lastError: body.message || "Hard bounce" },
          });
        }
      } else if (email) {
        const job = await prisma.fundReportRecipientJob.findFirst({
          where: { email: String(email) },
          orderBy: { createdAt: "desc" },
        });
        if (job) {
          await prisma.fundReportDistributionLog.create({
            data: {
              jobId: job.id,
              eventType,
              payload: body,
              message: "Webhook matched by email",
            },
          });
        }
      }

      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }
}
