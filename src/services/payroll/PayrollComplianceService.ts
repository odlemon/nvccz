import { createHash } from "crypto";
import { prisma } from "../../utils/database";
import { remoteUploadService } from "../RemoteUploadService";
import { CompliancePermissionService } from "./CompliancePermissionService";

function daysUntil(date: Date): number {
  const ms = date.getTime() - Date.now();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

function deriveCertStatus(expirationDate: Date, current?: string): string {
  if (current === "REVOKED") return "REVOKED";
  const days = daysUntil(expirationDate);
  if (days < 0) return "EXPIRED";
  if (days <= 30) return "EXPIRING";
  return "VALID";
}

export class PayrollComplianceService {
  // --- Courses ---
  static async createCourse(data: {
    code: string;
    title: string;
    description?: string;
    renewalPeriodMonths?: number;
    requiredPermissionCodes?: string[];
  }) {
    return prisma.trainingCourse.create({
      data: {
        code: data.code,
        title: data.title,
        description: data.description,
        renewalPeriodMonths: data.renewalPeriodMonths ?? 12,
        requiredPermissionCodes: data.requiredPermissionCodes || [],
      },
    });
  }

  static async listCourses(activeOnly = true) {
    return prisma.trainingCourse.findMany({
      where: activeOnly ? { isActive: true } : {},
      orderBy: { code: "asc" },
    });
  }

  static async updateCourse(id: string, data: Partial<{
    title: string;
    description: string;
    renewalPeriodMonths: number;
    requiredPermissionCodes: string[];
    isActive: boolean;
  }>) {
    return prisma.trainingCourse.update({ where: { id }, data });
  }

  static async deleteCourse(id: string) {
    return prisma.trainingCourse.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // --- Assignments ---
  static async createAssignment(data: {
    courseId: string;
    scopeType: string;
    scopeValue?: string;
  }) {
    return prisma.trainingAssignment.create({ data });
  }

  static async listAssignments(filters?: { courseId?: string; scopeType?: string }) {
    return prisma.trainingAssignment.findMany({
      where: {
        isActive: true,
        ...(filters?.courseId ? { courseId: filters.courseId } : {}),
        ...(filters?.scopeType ? { scopeType: filters.scopeType } : {}),
      },
      include: { course: true },
    });
  }

  static async deleteAssignment(id: string) {
    return prisma.trainingAssignment.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // --- Certifications ---
  static async createCertification(
    data: {
      employeeId: string;
      courseId: string;
      issuedDate: Date;
      expirationDate: Date;
      verifiedById?: string;
    },
    file?: Express.Multer.File
  ) {
    let storagePath: string | null = null;
    let fileUrl: string | null = null;
    let sha256Checksum: string | null = null;

    if (file?.buffer) {
      sha256Checksum = createHash("sha256").update(file.buffer).digest("hex");
      const upload = await remoteUploadService.uploadFiles(file, "payroll-compliance-certs");
      if (upload.success && upload.files?.[0]) {
        storagePath = upload.files[0].filename || null;
        fileUrl = upload.files[0].url || null;
      }
    }

    const status = deriveCertStatus(data.expirationDate);
    const cert = await prisma.employeeCertification.create({
      data: {
        ...data,
        storagePath,
        fileUrl,
        sha256Checksum,
        status,
      },
      include: { course: true, employee: { include: { user: true } } },
    });

    if (status === "VALID" || status === "EXPIRING") {
      await CompliancePermissionService.restoreForCertification(cert.id);
    }

    return cert;
  }

  static async listCertifications(filters?: {
    employeeId?: string;
    courseId?: string;
    status?: string;
  }) {
    return prisma.employeeCertification.findMany({
      where: {
        ...(filters?.employeeId ? { employeeId: filters.employeeId } : {}),
        ...(filters?.courseId ? { courseId: filters.courseId } : {}),
        ...(filters?.status ? { status: filters.status } : {}),
      },
      include: {
        course: true,
        employee: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } },
      },
      orderBy: { expirationDate: "asc" },
    });
  }

  static async getCertification(id: string) {
    return prisma.employeeCertification.findUnique({
      where: { id },
      include: { course: true, employee: true, verifiedBy: true },
    });
  }

  static async renewCertification(
    id: string,
    data: { issuedDate: Date; expirationDate: Date; verifiedById?: string },
    file?: Express.Multer.File
  ) {
    let storagePath: string | undefined;
    let fileUrl: string | undefined;
    let sha256Checksum: string | undefined;

    if (file?.buffer) {
      sha256Checksum = createHash("sha256").update(file.buffer).digest("hex");
      const upload = await remoteUploadService.uploadFiles(file, "payroll-compliance-certs");
      if (upload.success && upload.files?.[0]) {
        storagePath = upload.files[0].filename;
        fileUrl = upload.files[0].url;
      }
    }

    const status = deriveCertStatus(data.expirationDate);
    const cert = await prisma.employeeCertification.update({
      where: { id },
      data: {
        issuedDate: data.issuedDate,
        expirationDate: data.expirationDate,
        verifiedById: data.verifiedById,
        status,
        ...(storagePath ? { storagePath } : {}),
        ...(fileUrl ? { fileUrl } : {}),
        ...(sha256Checksum ? { sha256Checksum } : {}),
      },
      include: { course: true },
    });

    await CompliancePermissionService.restoreForCertification(cert.id);
    return cert;
  }

  static async revokeCertification(id: string) {
    await CompliancePermissionService.revokeForCertification(id);
    return prisma.employeeCertification.update({
      where: { id },
      data: { status: "REVOKED" },
    });
  }

  static async expiringDashboard() {
    const now = new Date();
    const d30 = new Date(now);
    d30.setDate(d30.getDate() + 30);
    const d60 = new Date(now);
    d60.setDate(d60.getDate() + 60);
    const d90 = new Date(now);
    d90.setDate(d90.getDate() + 90);

    const certs = await prisma.employeeCertification.findMany({
      where: {
        status: { in: ["VALID", "EXPIRING"] },
        expirationDate: { lte: d90 },
      },
      include: {
        course: true,
        employee: { include: { user: { select: { firstName: true, lastName: true, email: true } } } },
      },
      orderBy: { expirationDate: "asc" },
    });

    const bucket = (maxDays: number) =>
      certs.filter((c) => {
        const d = daysUntil(c.expirationDate);
        return d >= 0 && d <= maxDays;
      });

    return {
      within30Days: bucket(30),
      within60Days: bucket(60),
      within90Days: bucket(90),
      total: certs.length,
    };
  }
}
