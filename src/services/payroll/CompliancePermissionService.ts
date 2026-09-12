// @ts-nocheck
import { prisma } from "../../utils/database";

export class CompliancePermissionService {
  static async getBlockedPermissions(employeeId: string): Promise<string[]> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { complianceBlockedPermissions: true },
    });
    const raw = employee?.complianceBlockedPermissions;
    if (!raw || !Array.isArray(raw)) return [];
    return raw.map(String);
  }

  static async getBlockedPermissionsForUser(userId: string): Promise<string[]> {
    const employee = await prisma.employee.findUnique({
      where: { userId },
      select: { id: true, complianceBlockedPermissions: true },
    });
    if (!employee) return [];
    return this.getBlockedPermissions(employee.id);
  }

  static async revokeForCertification(certificationId: string): Promise<string[]> {
    const cert = await prisma.employeeCertification.findUnique({
      where: { id: certificationId },
      include: { course: true, employee: true },
    });
    if (!cert) throw new Error("Certification not found");

    const codes = Array.isArray(cert.course.requiredPermissionCodes)
      ? (cert.course.requiredPermissionCodes as string[])
      : [];

    if (!codes.length) return [];

    const existing = await this.getBlockedPermissions(cert.employeeId);
    const merged = Array.from(new Set([...existing, ...codes]));

    await prisma.employee.update({
      where: { id: cert.employeeId },
      data: { complianceBlockedPermissions: merged },
    });

    await prisma.employeeCertification.update({
      where: { id: certificationId },
      data: { status: "EXPIRED" },
    });

    return merged;
  }

  static async restoreForCertification(certificationId: string): Promise<void> {
    const cert = await prisma.employeeCertification.findUnique({
      where: { id: certificationId },
      include: { course: true },
    });
    if (!cert) return;

    const codes = Array.isArray(cert.course.requiredPermissionCodes)
      ? (cert.course.requiredPermissionCodes as string[])
      : [];

    const existing = await this.getBlockedPermissions(cert.employeeId);
    const remaining = existing.filter((c) => !codes.includes(c));

    await prisma.employee.update({
      where: { id: cert.employeeId },
      data: {
        complianceBlockedPermissions: remaining.length ? remaining : null,
      },
    });
  }
}

export function filterPermissionsByCompliance(
  permissions: Array<{ name: string; value: boolean }>,
  blocked: string[]
): Array<{ name: string; value: boolean }> {
  if (!blocked.length) return permissions;
  const blockedSet = new Set(blocked);
  return permissions.map((p) =>
    blockedSet.has(p.name) ? { ...p, value: false } : p
  );
}
