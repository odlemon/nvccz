// @ts-nocheck
import { Response, NextFunction } from "express";
import type { LpPortalRequest } from "../middleware/lpPortalAuth";
import { LpPortalDashboardService } from "../services/lpPortal/LpPortalDashboardService";
import { LpPortalLedgerService } from "../services/lpPortal/LpPortalLedgerService";
import { LpPortalVaultService } from "../services/lpPortal/LpPortalVaultService";
import { LpPortalReportsService } from "../services/lpPortal/LpPortalReportsService";
import { LpPortalColleagueService } from "../services/lpPortal/LpPortalColleagueService";
import { LpPortalAdminService } from "../services/lpPortal/LpPortalAdminService";

export class LpPortalController {
  static async getDashboard(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalDashboardService.getDashboard(req.lpPortal!, {
        fundId: req.query.fundId as string,
        presentationCurrency: req.query.presentationCurrency as string,
      });
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async listLedger(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalLedgerService.listLedger(req.lpPortal!, {
        fundId: req.query.fundId as string,
        from: req.query.from as string,
        to: req.query.to as string,
        currency: req.query.currency as string,
      });
      res.json({ success: true, data: data.data });
    } catch (e) {
      next(e);
    }
  }

  static async getLedgerEntry(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalLedgerService.getEntryDetail(req.lpPortal!, req.params.entryId);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async listVault(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalVaultService.listVault(req.lpPortal!, {
        category: req.query.category as string,
        search: req.query.search as string,
        fundId: req.query.fundId as string,
      });
      res.json({ success: true, data: data.data });
    } catch (e) {
      next(e);
    }
  }

  static async downloadVaultDoc(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const { buffer, filename } = await LpPortalVaultService.download(
        req.lpPortal!,
        req.params.documentId
      );
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (e) {
      next(e);
    }
  }

  static async verifyVaultDoc(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalVaultService.verifyIntegrity(req.lpPortal!, req.params.documentId);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async listReports(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const page = parseInt(String(req.query.page || "1"), 10);
      const limit = parseInt(String(req.query.limit || "20"), 10);
      const data = await LpPortalReportsService.listReports(req.lpPortal!, page, limit);
      res.json({ success: true, ...data });
    } catch (e) {
      next(e);
    }
  }

  static async downloadReport(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const { buffer, filename } = await LpPortalReportsService.downloadReport(
        req.lpPortal!,
        req.params.jobId
      );
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (e) {
      next(e);
    }
  }

  static async listColleagues(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalColleagueService.listColleagues(req.lpPortal!);
      res.json({ success: true, data: data.data });
    } catch (e) {
      next(e);
    }
  }

  static async inviteColleague(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalColleagueService.inviteViewer(req.lpPortal!, {
        email: req.body.email,
        invitedById: (req as any).user.id,
      });
      res.status(201).json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async revokeColleague(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalColleagueService.revokeViewer(
        req.lpPortal!,
        req.params.membershipId
      );
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async listAdminMemberships(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalAdminService.listMemberships(req.query.clientId as string);
      res.json({ success: true, data: data.data });
    } catch (e) {
      next(e);
    }
  }

  static async createAdminMembership(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalAdminService.createMembership({
        clientId: req.body.clientId,
        userId: req.body.userId,
        lpRole: req.body.lpRole,
        fundIds: req.body.fundIds,
        invitedById: (req as any).user.id,
      });
      res.status(201).json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async revokeAdminMembership(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalAdminService.revokeMembership(req.params.membershipId);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async publishAdminDocument(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const file = (req as any).file;
      if (!file?.buffer) {
        return res.status(400).json({ success: false, message: "file is required (multipart)" });
      }
      const data = await LpPortalAdminService.publishDocument({
        clientId: req.body.clientId,
        fundId: req.body.fundId,
        category: req.body.category || "MANUAL",
        title: req.body.title || file.originalname,
        fileBuffer: file.buffer,
        mimeType: file.mimetype || "application/pdf",
        publishedById: (req as any).user.id,
      });
      res.status(201).json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async getMfaPolicy(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalAdminService.getMfaPolicy();
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async updateMfaPolicy(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalAdminService.updateMfaPolicy({
        requireMfaForLp: req.body.requireMfaForLp,
        issuerName: req.body.issuerName,
      });
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }
}
