// @ts-nocheck
import { Request, Response } from "express";
import { CompanyProfileAddressService } from "../services/CompanyProfileAddressService";
import { RemoteUploadService } from "../services/RemoteUploadService";

export class CompanyProfileAddressController {
  static async list(req: Request, res: Response) {
    const data = await CompanyProfileAddressService.list();
    return res.json({ success: true, data });
  }

  static async create(req: Request, res: Response) {
    try {
      const body: any = req.body || {};
      let logoUrl: string | null = null;

      // multipart/form-data supports a logo file alongside fields
      const anyReq: any = req as any;
      if (anyReq.file?.buffer?.length) {
        const upload = await new RemoteUploadService().uploadFiles(anyReq.file, "company-profile-logos");
        if (!upload?.success || !upload.files?.length) {
          return res.status(400).json({ success: false, message: upload?.error || "Logo upload failed" });
        }
        logoUrl = upload.files[0].url;
      }

      const data = await CompanyProfileAddressService.create({
        label: body.label ?? null,
        logoUrl,
        line1: body.line1,
        line2: body.line2 ?? null,
        city: body.city ?? null,
        state: body.state ?? null,
        postalCode: body.postalCode ?? null,
        country: body.country ?? null,
        isActive: String(body.isActive ?? "").toLowerCase() === "true" || body.isActive === true
      });
      return res.status(201).json({ success: true, message: "Address created", data });
    } catch (e: any) {
      return res.status(400).json({ success: false, message: e?.message || "Failed to create address" });
    }
  }

  static async update(req: Request, res: Response) {
    try {
      const body: any = req.body || {};
      const anyReq: any = req as any;
      let logoUrl: string | undefined = undefined;

      if (anyReq.file?.buffer?.length) {
        const upload = await new RemoteUploadService().uploadFiles(anyReq.file, "company-profile-logos");
        if (!upload?.success || !upload.files?.length) {
          return res.status(400).json({ success: false, message: upload?.error || "Logo upload failed" });
        }
        logoUrl = upload.files[0].url;
      }

      const patch: any = {};
      if (body.label !== undefined) patch.label = body.label ?? null;
      if (body.line1 !== undefined) patch.line1 = body.line1;
      if (body.line2 !== undefined) patch.line2 = body.line2 ?? null;
      if (body.city !== undefined) patch.city = body.city ?? null;
      if (body.state !== undefined) patch.state = body.state ?? null;
      if (body.postalCode !== undefined) patch.postalCode = body.postalCode ?? null;
      if (body.country !== undefined) patch.country = body.country ?? null;
      if (body.isActive !== undefined) patch.isActive = String(body.isActive).toLowerCase() === "true" || body.isActive === true;
      if (logoUrl !== undefined) patch.logoUrl = logoUrl;

      const data = await CompanyProfileAddressService.update(req.params.id, patch);
      return res.json({ success: true, message: "Address updated", data });
    } catch (e: any) {
      return res.status(400).json({ success: false, message: e?.message || "Failed to update address" });
    }
  }

  static async setActive(req: Request, res: Response) {
    try {
      const data = await CompanyProfileAddressService.setActive(req.params.id);
      return res.json({ success: true, message: "Active address updated", data });
    } catch (e: any) {
      return res.status(400).json({ success: false, message: e?.message || "Failed to set active address" });
    }
  }

  static async remove(req: Request, res: Response) {
    try {
      await CompanyProfileAddressService.remove(req.params.id);
      return res.json({ success: true, message: "Address deleted" });
    } catch (e: any) {
      return res.status(400).json({ success: false, message: e?.message || "Failed to delete address" });
    }
  }
}

