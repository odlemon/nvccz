// @ts-nocheck
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../utils/database";
import { resolvePayrollUsdZigRate } from "./PayrollFxService";
import {
  calculateStatutoryLeg,
  splitGrossByContract,
  type StatutoryLegResult,
} from "./ZimraStatutoryEngine";

export interface DualPayrollCalculation {
  basicSalary: Decimal;
  totalAllowances: Decimal;
  grossPay: Decimal;
  totalDeductions: Decimal;
  netPay: Decimal;
  allowances: Array<{ type: string; amount: Decimal; isTaxable: boolean }>;
  deductions: Array<{
    type: string;
    amount: Decimal;
    isStatutory: boolean;
    deductionTypeId?: string;
  }>;
  legs: StatutoryLegResult[];
}

/**
 * Convert a leg amount into the USD reporting currency.
 * USD legs pass through; ZiG legs are divided by the run's USD->ZiG rate.
 */
function toUsd(amount: Decimal, currencyCode: string, fxRateUsdZig: Decimal): Decimal {
  if (currencyCode !== "ZIG") return amount
  if (fxRateUsdZig.lte(0)) return new Decimal(0)
  return amount.div(fxRateUsdZig)
}

export async function calculateEmployeePayrollWithLegs(
  employee: any,
  effectiveDate: Date,
  fxRateUsdZig: Decimal
): Promise<DualPayrollCalculation> {
  const usdPct = new Decimal(employee.salarySplitUsdPct?.toString() || "1");
  const zigPct = new Decimal(employee.salarySplitZigPct?.toString() || "0");
  const basicSalary = new Decimal(employee.basicSalary?.toString() || "0");

  // Allowances used to be dropped entirely on this path (`totalAllowances: 0`,
  // `allowances: []`), so any employee on a split contract silently lost their
  // housing/transport/medical lines while single-currency employees kept theirs.
  // Load the same active salary structures the single-currency path uses.
  const structures = await prisma.salaryStructure.findMany({
    where: {
      employeeId: employee.id,
      isActive: true,
      effectiveDate: { lte: effectiveDate },
      OR: [{ endDate: null }, { endDate: { gte: effectiveDate } }],
    },
    include: { allowanceType: true },
  });

  const allowances = structures.map((s: any) => ({
    type: s.allowanceType?.name ?? "Allowance",
    amount: new Decimal(s.amount?.toString() || "0"),
    isTaxable: s.allowanceType?.isTaxable !== false,
  }));
  const totalAllowances = allowances.reduce(
    (sum, a) => sum.add(a.amount),
    new Decimal(0)
  );

  // Allowances are contractual pay and are split across the same currency
  // proportions as the basic, so statutory tax is assessed on the full package.
  const packageGross = basicSalary.add(totalAllowances);
  const { usdGross, zigGross } = splitGrossByContract(packageGross, usdPct, zigPct, fxRateUsdZig);

  const legs: StatutoryLegResult[] = [];

  if (usdPct.gt(0)) {
    legs.push(await calculateStatutoryLeg(usdGross, "USD", effectiveDate));
  }
  if (zigPct.gt(0)) {
    legs.push(await calculateStatutoryLeg(zigGross, "ZIG", effectiveDate));
  }

  if (!legs.length) {
    legs.push(await calculateStatutoryLeg(packageGross, "USD", effectiveDate));
  }

  // The employee-level scalars are REPORTING values in USD. They previously
  // added a USD leg to a ZiG leg as if they were the same unit, which produced
  // figures roughly 4x too large (a 2,975 basic reported a 25,849 gross) and
  // made run totals meaningless. The true per-currency amounts stay on `legs`,
  // which is what payslips and bank files read.
  const grossPay = legs.reduce(
    (s, l) => s.add(toUsd(l.grossPay, l.currencyCode, fxRateUsdZig)),
    new Decimal(0)
  );
  const totalDeductions = legs.reduce(
    (s, l) => s.add(toUsd(l.totalDeductions, l.currencyCode, fxRateUsdZig)),
    new Decimal(0)
  );
  const netPay = legs.reduce(
    (s, l) => s.add(toUsd(l.netPay, l.currencyCode, fxRateUsdZig)),
    new Decimal(0)
  );

  const deductions = legs.flatMap((leg) => [
    { type: `PAYE (${leg.currencyCode})`, amount: leg.payeAmount, isStatutory: true },
    { type: `AIDS Levy (${leg.currencyCode})`, amount: leg.aidsLevyAmount, isStatutory: true },
    { type: `NSSA (${leg.currencyCode})`, amount: leg.nssaAmount, isStatutory: true },
    { type: `SDL (${leg.currencyCode})`, amount: leg.sdlAmount, isStatutory: true },
  ]);

  return {
    basicSalary,
    totalAllowances,
    grossPay,
    totalDeductions,
    netPay,
    allowances,
    deductions,
    legs,
  };
}

export async function persistPayrollLegs(employeePayrollId: string, legs: StatutoryLegResult[]) {
  for (const leg of legs) {
    await prisma.employeePayrollLeg.upsert({
      where: {
        employeePayrollId_currencyCode: {
          employeePayrollId,
          currencyCode: leg.currencyCode,
        },
      },
      create: {
        employeePayrollId,
        currencyCode: leg.currencyCode,
        grossPay: leg.grossPay,
        payeAmount: leg.payeAmount,
        aidsLevyAmount: leg.aidsLevyAmount,
        nssaAmount: leg.nssaAmount,
        sdlAmount: leg.sdlAmount,
        otherDeductions: leg.otherDeductions,
        totalDeductions: leg.totalDeductions,
        netPay: leg.netPay,
      },
      update: {
        grossPay: leg.grossPay,
        payeAmount: leg.payeAmount,
        aidsLevyAmount: leg.aidsLevyAmount,
        nssaAmount: leg.nssaAmount,
        sdlAmount: leg.sdlAmount,
        otherDeductions: leg.otherDeductions,
        totalDeductions: leg.totalDeductions,
        netPay: leg.netPay,
      },
    });
  }
}

export async function resolveRunFxRate(payrollRun: { fxRateUsdZig?: any }): Promise<Decimal> {
  if (payrollRun.fxRateUsdZig) {
    return new Decimal(payrollRun.fxRateUsdZig.toString());
  }
  return resolvePayrollUsdZigRate();
}

export function usesDualCurrency(employee: any, payrollRun: any): boolean {
  if (payrollRun?.dualCurrency) return true;
  const zigPct = new Decimal(employee.salarySplitZigPct?.toString() || "0");
  return zigPct.gt(0);
}
