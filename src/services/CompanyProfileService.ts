// @ts-nocheck
import { PrismaClient } from "@prisma/client";
import { prisma } from "../utils/database";

export interface CreateCompanyProfileRequest {
  legalName?: string;
  registrationNumber?: string;
  taxNumber?: string;
  email?: string;
  phone?: string;
  website?: string;
  logoUrl?: string;
  twitter?: string;
  facebook?: string;
  linkedin?: string;
  instagram?: string;
}

export interface UpdateCompanyProfileRequest {
  legalName?: string;
  registrationNumber?: string;
  taxNumber?: string;
  email?: string;
  phone?: string;
  website?: string;
  logoUrl?: string;
  twitter?: string;
  facebook?: string;
  linkedin?: string;
  instagram?: string;
}

export class CompanyProfileService {
  // Create company profile
  static async createCompanyProfile(request: CreateCompanyProfileRequest) {
    try {
      // Check if a company profile already exists
      const existingProfile = await prisma.companyProfile.findFirst();
      
      if (existingProfile) {
        throw new Error("Company profile already exists. Use update instead.");
      }

      const companyProfile = await prisma.companyProfile.create({
        data: {
          legalName: request.legalName,
          registrationNumber: request.registrationNumber,
          taxNumber: request.taxNumber,
          email: request.email,
          phone: request.phone,
          website: request.website,
          logoUrl: request.logoUrl,
          twitter: request.twitter,
          facebook: request.facebook,
          linkedin: request.linkedin,
          instagram: request.instagram
        }
      });

      return companyProfile;
    } catch (error) {
      throw error;
    }
  }

  // Get company profile
  static async getCompanyProfile() {
    try {
      const companyProfile = await prisma.companyProfile.findFirst();
      
      if (!companyProfile) {
        return null;
      }

      return companyProfile;
    } catch (error) {
      throw error;
    }
  }

  // Update company profile
  static async updateCompanyProfile(request: UpdateCompanyProfileRequest) {
    try {
      // Get the existing profile
      const existingProfile = await prisma.companyProfile.findFirst();
      
      if (!existingProfile) {
        throw new Error("Company profile not found. Create one first.");
      }

      const updatedProfile = await prisma.companyProfile.update({
        where: { id: existingProfile.id },
        data: {
          legalName: request.legalName !== undefined ? request.legalName : undefined,
          registrationNumber:
            request.registrationNumber !== undefined ? request.registrationNumber : undefined,
          taxNumber: request.taxNumber !== undefined ? request.taxNumber : undefined,
          email: request.email !== undefined ? request.email : undefined,
          phone: request.phone !== undefined ? request.phone : undefined,
          website: request.website !== undefined ? request.website : undefined,
          logoUrl: request.logoUrl !== undefined ? request.logoUrl : undefined,
          twitter: request.twitter !== undefined ? request.twitter : undefined,
          facebook: request.facebook !== undefined ? request.facebook : undefined,
          linkedin: request.linkedin !== undefined ? request.linkedin : undefined,
          instagram: request.instagram !== undefined ? request.instagram : undefined
        }
      });

      return updatedProfile;
    } catch (error) {
      throw error;
    }
  }

  // Delete company profile
  static async deleteCompanyProfile() {
    try {
      const existingProfile = await prisma.companyProfile.findFirst();
      
      if (!existingProfile) {
        throw new Error("Company profile not found.");
      }

      await prisma.companyProfile.delete({
        where: { id: existingProfile.id }
      });

      return { message: "Company profile deleted successfully" };
    } catch (error) {
      throw error;
    }
  }

  // Create or update company profile (upsert)
  static async createOrUpdateCompanyProfile(request: CreateCompanyProfileRequest) {
    try {
      const existingProfile = await prisma.companyProfile.findFirst();
      
      if (existingProfile) {
        // Update existing profile
        return await this.updateCompanyProfile(request);
      } else {
        // Create new profile
        return await this.createCompanyProfile(request);
      }
    } catch (error) {
      throw error;
    }
  }
} 