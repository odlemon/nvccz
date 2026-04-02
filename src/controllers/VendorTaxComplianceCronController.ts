// @ts-nocheck
import { Request, Response } from "express";
import { processVendorTaxRevalidationAlerts } from "../services/VendorTaxComplianceService";

export class VendorTaxComplianceCronController {
  private static isLoopbackSocket(req: Request): boolean {
    const a = req.socket?.remoteAddress ?? "";
    return a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1";
  }

  /**
   * Daily cron: notify procurement/finance users for vendors whose 30-day re-validation window has started.
   * - If VENDOR_TAX_CLEARANCE_CRON_SECRET is set: require X-Vendor-Tax-Cron-Secret.
   * - If unset: only loopback (local dev).
   */
  static async postTaxClearanceRevalidationCron(req: Request, res: Response): Promise<void> {
    try {
      const secret = process.env.VENDOR_TAX_CLEARANCE_CRON_SECRET?.trim();

      let authMode: "shared-secret" | "loopback-local" = "shared-secret";

      if (secret) {
        const headerSecret = String(
          req.headers["x-vendor-tax-cron-secret"] ||
            req.headers["X-Vendor-Tax-Cron-Secret"] ||
            ""
        );
        if (headerSecret !== secret) {
          res.status(401).json({ success: false, error: "Unauthorized" });
          return;
        }
        authMode = "shared-secret";
      } else {
        if (!VendorTaxComplianceCronController.isLoopbackSocket(req)) {
          res.status(403).json({
            success: false,
            error:
              "Vendor tax cron is not allowed from this host without VENDOR_TAX_CLEARANCE_CRON_SECRET.",
          });
          return;
        }
        authMode = "loopback-local";
      }

      const result = await processVendorTaxRevalidationAlerts(new Date());

      res.json({
        success: true,
        message: "Vendor tax clearance re-validation alert run completed",
        data: result,
        meta: { authMode },
      });
    } catch (error: any) {
      console.error("[vendor-tax-cron]", error);
      res.status(500).json({
        success: false,
        error: error?.message || "Cron failed",
      });
    }
  }
}
