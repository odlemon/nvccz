// @ts-nocheck
import { Request, Response } from "express";
import { VendorSelfRegistrationService } from "../services/VendorSelfRegistrationService";
import { VendorKycService } from "../services/VendorKycService";
import { maybeSendImmediateTaxAlertForNewVendor } from "../services/VendorTaxComplianceService";

export class VendorPublicRegistrationController {
  /**
   * Public: full registration in one request (profile + banks). Returns token for KYC uploads only.
   */
  static async registerFull(req: Request, res: Response) {
    try {
      const { vendor, token, banks } = await VendorSelfRegistrationService.registerFromPublicPortal(
        req.body
      );
      if (vendor.taxComplianceStatus === "ACTIVE") {
        await maybeSendImmediateTaxAlertForNewVendor({
          id: vendor.id,
          name: vendor.name,
          taxClearanceExpiryDate: vendor.taxClearanceExpiryDate,
          taxRevalidationAlertDueAt: vendor.taxRevalidationAlertDueAt,
        });
      }
      const base = process.env.PUBLIC_APP_URL || process.env.APP_BASE_URL || "";
      const root = String(base).replace(/\/$/, "");
      const kycUrl = `${root}/api/public/vendor-registration/${token}/kyc-documents`;
      res.status(201).json({
        success: true,
        message:
          "Registration submitted for review. Save your kycUploadToken — it is required to upload KYC documents and is shown only once.",
        data: {
          vendorId: vendor.id,
          kycUploadToken: token,
          kycDocumentsUrl: kycUrl,
          bankIds: banks.map((b) => b.id),
          registrationStatus: vendor.registrationStatus,
        },
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
  static async getByToken(req: Request, res: Response) {
    try {
      const { token } = req.params;
      const row = await VendorSelfRegistrationService.getByToken(token);
      if (!row) {
        return res.status(404).json({ success: false, message: "Invalid or expired link" });
      }
      const base =
        process.env.PUBLIC_APP_URL || process.env.APP_BASE_URL || "";
      const kycBase = `${String(base).replace(/\/$/, "")}/api/public/vendor-registration/${token}/kyc-documents`;
      res.status(200).json({
        success: true,
        data: {
          ...row,
          portalKycUploadUrl: kycBase,
          portalKycListUrl: kycBase,
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async submit(req: Request, res: Response) {
    try {
      const { token } = req.params;
      const vendor = await VendorSelfRegistrationService.submitProfile(token, req.body);
      res.status(200).json({
        success: true,
        message: "Profile submitted. Your registration is pending review by procurement/finance.",
        data: vendor,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Lists allowed KYC “slots” (code + label + required), current uploads, and missing required types.
   * Same token as registration; use each upload’s `documentType` = one of the `code` values.
   */
  static async getKycRequirements(req: Request, res: Response) {
    try {
      const { token } = req.params;
      const data = await VendorKycService.getPortalKycRequirements(token);
      res.status(200).json({ success: true, data });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Multipart KYC upload (see GET …/kyc-requirements).
   * Either: (A) one or more files with field name = document code (e.g. CR14, BANK_LETTER), or
   * (B) field name `file` + text `documentType`. At most one `file` field per request.
   */
  static async uploadKyc(req: Request, res: Response) {
    try {
      const { token } = req.params;
      const files = (req as any).files as Express.Multer.File[] | undefined;
      const one = (req as any).file as Express.Multer.File | undefined;
      const list: Express.Multer.File[] =
        Array.isArray(files) && files.length ? files : one ? [one] : [];
      if (!list.length) {
        return res.status(400).json({
          success: false,
          message:
            "Add at least one file. Name each file field with the document code (e.g. CR14, CERTIFICATE_OF_INCORPORATION), or use a single field named `file` plus text field `documentType`. See GET …/kyc-requirements.",
        });
      }

      const genericFileFields = list.filter((f) => f.fieldname === "file" || f.fieldname === "kycFile");
      if (genericFileFields.length > 1) {
        return res.status(400).json({
          success: false,
          message:
            "Only one file may use the field name `file`. For multiple documents, either send separate requests or name each field with the document code (CR14, BANK_LETTER, …).",
        });
      }

      const bodyDocType =
        req.body.documentType ||
        req.body.document_type ||
        req.body.type ||
        req.body.kycDocumentType;

      const rows: any[] = [];
      for (const file of list) {
        let documentType: string;
        if (file.fieldname === "file" || file.fieldname === "kycFile") {
          if (!bodyDocType) {
            return res.status(400).json({
              success: false,
              message:
                "When the file field is named `file`, send a text field `documentType` (e.g. CR14). Or rename the file field to the code (e.g. CR14) instead.",
            });
          }
          documentType = bodyDocType;
        } else {
          documentType = file.fieldname;
        }

        try {
          VendorKycService.assertDocumentType(documentType);
        } catch (e: any) {
          return res.status(400).json({
            success: false,
            message: `Invalid file field name "${file.fieldname}". Use a KYC code as the field name (e.g. CR14) or use field \`file\` with text \`documentType\`. ${e.message || ""}`,
          });
        }

        const row = await VendorKycService.uploadEncryptedViaPortalToken({
          token,
          documentType,
          file,
        });
        const formatted = VendorKycService.formatKycDocumentResponse(row as Record<string, unknown>);
        rows.push({
          ...formatted,
          documentTypeLabel: VendorKycService.documentTypeLabel(row.documentType),
        });
      }

      if (rows.length === 1) {
        res.status(201).json({ success: true, data: rows[0] });
      } else {
        res.status(201).json({
          success: true,
          data: { documents: rows, count: rows.length },
        });
      }
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async listKyc(req: Request, res: Response) {
    try {
      const { token } = req.params;
      const rows = await VendorKycService.listForPortalToken(token);
      const data = rows.map((r) => VendorKycService.formatKycDocumentResponse(r as Record<string, unknown>));
      res.status(200).json({ success: true, data });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async downloadKyc(req: Request, res: Response) {
    try {
      const { token, documentId } = req.params;
      const { buffer, fileName, mimeType } = await VendorKycService.getDecryptedBufferForPortalToken(
        token,
        documentId
      );
      res.setHeader("Content-Type", mimeType || "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}"`);
      res.send(buffer);
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
}
