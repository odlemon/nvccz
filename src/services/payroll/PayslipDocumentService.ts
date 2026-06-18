// @ts-nocheck
import { createHash } from "crypto";
import { prisma } from "../../utils/database";
import { buildPayslipPdfBuffer, safePayslipPdfFileBaseName } from "../../utils/payslipPdf";
import { loadCapitalCallAccountingLetterhead } from "../../utils/capitalCallAccountingLetterhead";
import { remoteUploadService } from "../RemoteUploadService";

export class PayslipDocumentService {
  static sha256(buffer: Buffer): string {
    return createHash("sha256").update(buffer).digest("hex");
  }

  static async buildPdfForPayslip(employeeId: string, payrollRunId: string): Promise<Buffer> {
    const payslip = await prisma.payslip.findUnique({
      where: { employeeId_payrollRunId: { employeeId, payrollRunId } },
      include: {
        employee: {
          include: {
            user: { select: { firstName: true, lastName: true, email: true } },
            currency: true,
          },
        },
        payrollRun: true,
        currency: true,
      },
    });
    if (!payslip) throw new Error("Payslip not found");

    const employeePayroll = await prisma.employeePayroll.findFirst({
      where: { payrollRunId, employeeId },
      include: {
        allowances: { include: { allowanceType: true } },
        deductions: { include: { deductionType: true } },
        legs: true,
      },
    });

    const letterhead = await loadCapitalCallAccountingLetterhead().catch(() => null);
    const employeeName = `${payslip.employee.user.firstName} ${payslip.employee.user.lastName}`;
    const ccy = String(payslip.currency?.code || payslip.currency?.symbol || "USD").toUpperCase();
    const paymentDateLabel = new Date(payslip.payrollRun.endDate).toISOString().slice(0, 10);

    const allowances =
      employeePayroll?.allowances?.map((a) => ({
        name: a.allowanceType?.name || "Allowance",
        amount: Number(a.amount || 0),
      })) || [];

    let deductions =
      employeePayroll?.deductions?.map((d) => ({
        name: d.deductionType?.name || "Deduction",
        amount: Number(d.amount || 0),
      })) || [];

    if (employeePayroll?.legs?.length) {
      deductions = employeePayroll.legs.flatMap((leg) => [
        { name: `PAYE (${leg.currencyCode})`, amount: Number(leg.payeAmount) },
        { name: `AIDS Levy (${leg.currencyCode})`, amount: Number(leg.aidsLevyAmount) },
        { name: `NSSA (${leg.currencyCode})`, amount: Number(leg.nssaAmount) },
        { name: `SDL (${leg.currencyCode})`, amount: Number(leg.sdlAmount) },
      ]);
    }

    return buildPayslipPdfBuffer({
      payslipNumber: payslip.id,
      payPeriod: String(payslip.payrollRun.payPeriod || ""),
      paymentDateLabel,
      currencyCode: ccy,
      employeeName,
      employeeNumber: payslip.employee.employeeNumber || null,
      employeeEmail: payslip.employee.user.email || null,
      bankName: payslip.employee.bankName || null,
      bankAccountNumber: payslip.employee.accountNumber || null,
      bankBranchCode: payslip.employee.branchCode || null,
      grossPay: Number(payslip.grossPay || 0),
      totalDeductions: Number(payslip.totalDeductions || 0),
      netPay: Number(payslip.netPay || 0),
      basicSalary: payslip.employee.basicSalary ? Number(payslip.employee.basicSalary) : null,
      allowances,
      deductions,
      letterhead,
    });
  }

  static async generateAndStore(employeeId: string, payrollRunId: string) {
    const payslip = await prisma.payslip.findUnique({
      where: { employeeId_payrollRunId: { employeeId, payrollRunId } },
    });
    if (!payslip) throw new Error("Payslip record not found");

    const pdfBuffer = await this.buildPdfForPayslip(employeeId, payrollRunId);
    const sha256 = this.sha256(pdfBuffer);

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: true },
    });
    const payrollRun = await prisma.payrollRun.findUnique({ where: { id: payrollRunId } });
    const employeeName = employee?.user
      ? `${employee.user.firstName} ${employee.user.lastName}`
      : "employee";
    const pdfFilename = `Payslip-${safePayslipPdfFileBaseName(employeeName)}-${safePayslipPdfFileBaseName(
      String(payrollRun?.payPeriod || "period")
    )}.pdf`;

    let storagePath: string | null = null;
    let fileUrl: string | null = null;

    const upload = await remoteUploadService.uploadFiles(
      {
        buffer: pdfBuffer,
        originalname: pdfFilename,
        mimetype: "application/pdf",
      },
      "payroll-payslips"
    );

    if (upload.success && upload.files?.[0]) {
      storagePath = upload.files[0].filename || null;
      fileUrl = upload.files[0].url || null;
    }

    const updated = await prisma.payslip.update({
      where: { id: payslip.id },
      data: {
        sha256Checksum: sha256,
        storagePath,
        fileUrl,
        pdfPath: fileUrl || storagePath,
        isGenerated: true,
        generatedAt: new Date(),
      },
    });

    return { payslipId: updated.id, sha256, fileUrl };
  }

  static async verify(payslipId: string) {
    const payslip = await prisma.payslip.findUnique({ where: { id: payslipId } });
    if (!payslip?.sha256Checksum) {
      return { valid: false, sha256: null };
    }
    return { valid: true, sha256: payslip.sha256Checksum };
  }

  static async getPdfBuffer(payslipId: string): Promise<Buffer> {
    const payslip = await prisma.payslip.findUnique({ where: { id: payslipId } });
    if (!payslip) throw new Error("Payslip not found");

    if (payslip.storagePath || payslip.fileUrl) {
      const path = payslip.storagePath || payslip.fileUrl!;
      try {
        const downloaded = await remoteUploadService.downloadFile(path);
        if (downloaded?.length) return downloaded;
      } catch {
        // regenerate below
      }
    }

    return this.buildPdfForPayslip(payslip.employeeId, payslip.payrollRunId);
  }
}
