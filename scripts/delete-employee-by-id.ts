/**
 * Permanently delete a payroll employee row and related payroll data.
 * Does NOT delete the linked User account.
 *
 * Dry run:  npx ts-node --transpile-only -r dotenv/config scripts/delete-employee-by-id.ts cmpglaaas0003unisxutstjtg
 * Execute:   ... --execute
 *
 * npm run db:delete:employee -- cmpglaaas0003unisxutstjtg --execute
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const EXECUTE = process.argv.includes("--execute");
const employeeId = process.argv.slice(2).find((a) => !a.startsWith("--"));

async function main() {
  if (!employeeId || employeeId.startsWith("--")) {
    console.error("Usage: npx ts-node scripts/delete-employee-by-id.ts <employeeId> [--execute]");
    process.exit(1);
  }

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: {
      user: { select: { id: true, email: true, firstName: true, lastName: true } },
    },
  });

  if (!employee) {
    console.error(`Employee not found: ${employeeId}`);
    process.exit(1);
  }

  const [payrolls, payslips, structures, leaves, deductions] = await Promise.all([
    prisma.employeePayroll.count({ where: { employeeId } }),
    prisma.payslip.count({ where: { employeeId } }),
    prisma.salaryStructure.count({ where: { employeeId } }),
    prisma.leaveBalance.count({ where: { employeeId } }),
    prisma.employeeDeduction.count({ where: { employeeId } }),
  ]);

  console.log("\nEmployee to delete:");
  console.log(`  id:             ${employee.id}`);
  console.log(`  employeeNumber: ${employee.employeeNumber}`);
  console.log(`  user:           ${employee.user.email} (${employee.user.id})`);
  console.log(`  terminated:     ${employee.terminated}`);
  console.log("\nRelated rows:");
  console.log(`  employeePayrolls:   ${payrolls}`);
  console.log(`  payslips:           ${payslips}`);
  console.log(`  salaryStructures:   ${structures}`);
  console.log(`  leaveBalances:      ${leaves}`);
  console.log(`  employeeDeductions: ${deductions}`);
  console.log(`  reimbursementVendorId: ${employee.reimbursementVendorId ?? "(none)"}`);

  if (!EXECUTE) {
    console.log("\nDry run — re-run with --execute to delete.\n");
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.employeeDeduction.deleteMany({ where: { employeeId } });
      await tx.employeePayroll.deleteMany({ where: { employeeId } });
      await tx.payslip.deleteMany({ where: { employeeId } });
      await tx.salaryStructure.deleteMany({ where: { employeeId } });
      await tx.leaveBalance.deleteMany({ where: { employeeId } });
      await tx.employee.delete({ where: { id: employeeId } });
    },
    { maxWait: 15_000, timeout: 60_000 }
  );

  console.log(`\nDeleted employee ${employeeId}. User ${employee.user.email} was kept.\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
