import { prisma } from "../../utils/database";
import { CompliancePermissionService } from "./CompliancePermissionService";

function daysUntil(date: Date): number {
  const ms = date.getTime() - Date.now();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export class ComplianceExpiryCronService {
  static async runExpiryCheck(): Promise<{
    expiringNotified: number;
    expiredRevoked: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let expiringNotified = 0;
    let expiredRevoked = 0;

    const activeCerts = await prisma.employeeCertification.findMany({
      where: { status: { in: ["VALID", "EXPIRING"] } },
      include: { course: true, employee: { include: { user: true } } },
    });

    for (const cert of activeCerts) {
      const days = daysUntil(cert.expirationDate);

      try {
        if (days < 0) {
          await CompliancePermissionService.revokeForCertification(cert.id);
          expiredRevoked++;
          console.log(
            `[compliance-cron] EXPIRED cert ${cert.id} employee ${cert.employeeId} course ${cert.course.code}`
          );
        } else if (days <= 30) {
          if (cert.status !== "EXPIRING") {
            await prisma.employeeCertification.update({
              where: { id: cert.id },
              data: { status: "EXPIRING" },
            });
          }
          expiringNotified++;
          console.log(
            `[compliance-cron] EXPIRING in ${days}d cert ${cert.id} employee ${cert.employee.user?.email}`
          );
        }
      } catch (e: any) {
        errors.push(`${cert.id}: ${e?.message || e}`);
      }
    }

    return { expiringNotified, expiredRevoked, errors };
  }
}
