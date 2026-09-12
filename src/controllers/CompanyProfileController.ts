// @ts-nocheck
import { Request, Response, NextFunction } from "express";
import { CompanyProfileService, CreateCompanyProfileRequest, UpdateCompanyProfileRequest } from "../services/CompanyProfileService";
import { RemoteUploadService } from "../services/RemoteUploadService";
import { prisma } from "../utils/database";

export class CompanyProfileController {
  // Create company profile
  static async createCompanyProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        legalName,
        registrationNumber,
        taxNumber,
        email,
        phone,
        website,
        logoUrl,
        fiscalTimezone,
        twitter,
        facebook,
        linkedin,
        instagram
      } = req.body;

      const request: CreateCompanyProfileRequest = {
        fiscalTimezone,
        legalName,
        registrationNumber,
        taxNumber,
        email,
        phone,
        website,
        logoUrl,
        twitter,
        facebook,
        linkedin,
        instagram
      };

      const companyProfile = await CompanyProfileService.createCompanyProfile(request);

      res.status(201).json({
        success: true,
        message: "Company profile created successfully",
        data: companyProfile
      });
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({
          success: false,
          message: error.message
        });
      } else {
        next(error);
      }
    }
  }

  // Get company profile
  static async getCompanyProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const companyProfile = await CompanyProfileService.getCompanyProfile();

      if (!companyProfile) {
        res.status(404).json({
          success: false,
          message: "Company profile not found"
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: companyProfile
      });
    } catch (error) {
      next(error);
    }
  }

  // Update company profile
  static async updateCompanyProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        legalName,
        registrationNumber,
        taxNumber,
        email,
        phone,
        website,
        logoUrl,
        fiscalTimezone,
        twitter,
        facebook,
        linkedin,
        instagram
      } = req.body;

      const request: UpdateCompanyProfileRequest = {
        fiscalTimezone,
        legalName,
        registrationNumber,
        taxNumber,
        email,
        phone,
        website,
        logoUrl,
        twitter,
        facebook,
        linkedin,
        instagram
      };

      const companyProfile = await CompanyProfileService.updateCompanyProfile(request);

      res.status(200).json({
        success: true,
        message: "Company profile updated successfully",
        data: companyProfile
      });
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({
          success: false,
          message: error.message
        });
      } else {
        next(error);
      }
    }
  }

  // Delete company profile
  static async deleteCompanyProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await CompanyProfileService.deleteCompanyProfile();

      res.status(200).json({
        success: true,
        message: result.message
      });
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({
          success: false,
          message: error.message
        });
      } else {
        next(error);
      }
    }
  }

  // Create or update company profile (upsert)
  static async createOrUpdateCompanyProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        legalName,
        registrationNumber,
        taxNumber,
        email,
        phone,
        website,
        logoUrl,
        fiscalTimezone,
        twitter,
        facebook,
        linkedin,
        instagram
      } = req.body;

      const request: CreateCompanyProfileRequest = {
        fiscalTimezone,
        legalName,
        registrationNumber,
        taxNumber,
        email,
        phone,
        website,
        logoUrl,
        twitter,
        facebook,
        linkedin,
        instagram
      };

      const companyProfile = await CompanyProfileService.createOrUpdateCompanyProfile(request);

      const isUpdate = await CompanyProfileService.getCompanyProfile();
      const message = isUpdate ? "Company profile updated successfully" : "Company profile created successfully";

      res.status(200).json({
        success: true,
        message,
        data: companyProfile
      });
    } catch (error) {
      next(error);
    }
  }

  static async uploadCompanyLogo(req: any, res: Response) {
    try {
      if (!req.file?.buffer?.length) {
        return res.status(400).json({ success: false, message: "logo file is required (multipart field: logo)" });
      }

      const upload = await new RemoteUploadService().uploadFiles(req.file, "company-profile-logos");
      if (!upload?.success || !upload.files?.length) {
        return res.status(400).json({ success: false, message: upload?.error || "Logo upload failed" });
      }
      const logoUrl = upload.files[0].url;

      const existing = await prisma.companyProfile.findFirst({ select: { id: true } });
      const profile = existing
        ? await prisma.companyProfile.update({ where: { id: existing.id }, data: { logoUrl } })
        : await prisma.companyProfile.create({ data: { logoUrl } });

      return res.status(200).json({
        success: true,
        message: "Logo uploaded successfully",
        data: { logoUrl: profile.logoUrl }
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: "Failed to upload logo", error: error.message });
    }
  }
} 