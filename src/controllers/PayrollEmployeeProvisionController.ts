// @ts-nocheck
/**
 * Payroll V6 — create an employee and the user account behind it, together.
 *
 * `Employee.userId` is required and unique: an employee IS a user account with
 * payroll data attached. The module's "Add employee" form collects a person's
 * details and has no user id to give, so `POST /payroll/employees` could never
 * be driven from it — the control looked live and could not work.
 *
 * This provisions both rows in one transaction. The user is created with a
 * random password they can never guess; onboarding is expected to run the
 * normal password-reset flow, and no password is ever accepted from or returned
 * to the caller.
 *
 * Guarded by payroll.employees.manage on the route.
 */
import type { Request, Response } from "express"
import bcrypt from "bcryptjs"
import { randomBytes } from "crypto"
import { prisma } from "../utils/database"
import { PayrollAuditService } from "../services/payroll/PayrollAuditService"
import { resolveEmployeePictureUrl } from "../services/payrollEmployeePictureUpload"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export class PayrollEmployeeProvisionController {
  static async createWithUser(req: Request, res: Response) {
    try {
      const {
        firstName,
        lastName,
        email,
        employeeNumber,
        roleId,
        roleName,
        departmentCode,
        basicSalary,
        currencyId,
        bankName,
        branchCode,
        accountNumber,
        idNumber,
        zimraBpNumber,
        salarySplitUsdPct,
        salarySplitZigPct,
        contractEffectiveDate,
      } = req.body ?? {}

      // --- validate up front, with messages the UI can show ------------------
      const problems: string[] = []
      if (!firstName || !String(firstName).trim()) problems.push("First name is required")
      if (!lastName || !String(lastName).trim()) problems.push("Last name is required")
      if (!email || !EMAIL_RE.test(String(email))) problems.push("A valid email address is required")
      if (!employeeNumber || !String(employeeNumber).trim()) {
        problems.push("Employee number is required")
      }
      const basic = Number(basicSalary)
      if (!Number.isFinite(basic) || basic < 0) problems.push("Basic salary must be a number")
      if (problems.length) {
        return res.status(400).json({
          success: false,
          message: problems[0],
          error: problems.join("; "),
        })
      }

      const normalisedEmail = String(email).trim().toLowerCase()

      const [existingUser, existingEmployee] = await Promise.all([
        prisma.user.findUnique({ where: { email: normalisedEmail }, select: { id: true } }),
        prisma.employee.findUnique({
          where: { employeeNumber: String(employeeNumber).trim() },
          select: { id: true },
        }),
      ])
      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: `A user already exists for ${normalisedEmail}`,
          error: "Use the existing account rather than creating a second one.",
        })
      }
      if (existingEmployee) {
        return res.status(409).json({
          success: false,
          message: `Employee number ${employeeNumber} is already in use`,
        })
      }

      // --- resolve the role --------------------------------------------------
      let role = null
      if (roleId) {
        role = await prisma.role.findUnique({ where: { id: String(roleId) } })
      } else if (roleName) {
        const all = await prisma.role.findMany({ select: { id: true, name: true } })
        role =
          all.find((r) => r.name.toLowerCase() === String(roleName).toLowerCase()) ?? null
      }
      if (!role) {
        // Default to the least-privileged internal role rather than guessing
        // something with authority.
        const all = await prisma.role.findMany({ select: { id: true, name: true } })
        role =
          all.find((r) => r.name === "Operations Member") ??
          all.find((r) => /member$/i.test(r.name)) ??
          null
      }
      if (!role) {
        return res.status(400).json({
          success: false,
          message: "No role could be resolved for the new employee",
          error: "Pass roleId or roleName.",
        })
      }

      // The account is unusable until the person resets it; no caller-supplied
      // password is accepted and none is returned.
      const provisionalPassword = randomBytes(24).toString("base64url")
      const hashed = await bcrypt.hash(provisionalPassword, 10)

      // Upload the optional photo before the transaction: a slow or failed upload shouldn't hold DB locks, and a
      // failure here rejects the request before any user or employee row exists.
      let pictureUrl: string | null = null
      try {
        pictureUrl = await resolveEmployeePictureUrl(req)
      } catch (uploadErr) {
        return res.status(400).json({
          success: false,
          message: uploadErr instanceof Error ? uploadErr.message : "Picture upload failed",
        })
      }

      const created = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            firstName: String(firstName).trim(),
            lastName: String(lastName).trim(),
            email: normalisedEmail,
            password: hashed,
            roleId: role.id,
            roleCode: (role as any).roleCode ?? null,
          },
          select: { id: true, firstName: true, lastName: true, email: true },
        })

        const employee = await tx.employee.create({
          data: {
            pictureUrl,
            userId: user.id,
            employeeNumber: String(employeeNumber).trim(),
            basicSalary: basic,
            currencyId: currencyId || null,
            bankName: bankName || null,
            branchCode: branchCode || null,
            accountNumber: accountNumber || null,
            idNumber: idNumber || null,
            zimraBpNumber: zimraBpNumber || null,
            departmentCode: departmentCode || null,
            salarySplitUsdPct:
              salarySplitUsdPct === undefined || salarySplitUsdPct === null
                ? 1
                : Number(salarySplitUsdPct),
            salarySplitZigPct:
              salarySplitZigPct === undefined || salarySplitZigPct === null
                ? 0
                : Number(salarySplitZigPct),
            contractEffectiveDate: contractEffectiveDate
              ? new Date(contractEffectiveDate)
              : new Date(),
            isActive: true,
            lifecycleStatus: "ACTIVE",
          },
          include: { user: { select: { firstName: true, lastName: true, email: true } } },
        })

        return { user, employee }
      })

      await PayrollAuditService.record({
        action: "EMPLOYEE_CREATED",
        eventClass: "Change",
        entityType: "employee",
        entityId: created.employee.id,
        entityLabel: created.employee.employeeNumber,
        detail: `Created ${created.user.firstName} ${created.user.lastName} (${created.user.email}) with role ${role.name}`,
        actor: (req as any).user,
      })

      // the same optional Performance new-hire counter as POST /payroll/employees (this is the path the Add employee form
      // uses, so a hire made here was never counted)
      const counterGoalId = (req.body ?? {}).bscNewHireCounterGoalId
      if (counterGoalId != null && String(counterGoalId).trim()) {
        const { PerformancePayrollBscHookService } = await import("../services/PerformancePayrollBscHookService")
        PerformancePayrollBscHookService.onEmployeeCreated({
          bscNewHireCounterGoalId: String(counterGoalId).trim(),
          createdByUserId: (req as any).user?.id ?? null,
        }).catch((err) => console.warn("[payroll-bsc-hook] new hire KPI skipped:", err?.message || err))
      }

      return res.status(201).json({
        success: true,
        message: "Employee and user account created",
        data: created.employee,
      })
    } catch (error) {
      console.error("Error provisioning payroll employee:", error)
      return res.status(500).json({
        success: false,
        message: "Failed to create the employee",
        error: error instanceof Error ? error.message : "Unknown error",
      })
    }
  }
}
