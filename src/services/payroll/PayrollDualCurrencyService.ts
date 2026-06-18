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

export async function calculateEmployeePayrollWithLegs(
  employee: any,
  effectiveDate: Date,
  fxRateUsdZig: Decimal
): Promise<DualPayrollCalculation> {
  const usdPct = new Decimal(employee.salarySplitUsdPct?.toString() || "1");
  const zigPct = new Decimal(employee.salarySplitZigPct?.toString() || "0");
  const basicSalary = new Decimal(employee.basicSalary?.toString() || "0");

  const { usdGross, zigGross } = splitGrossByContract(basicSalary, usdPct, zigPct, fxRateUsdZig);

  const legs: StatutoryLegResult[] = [];

  if (usdPct.gt(0)) {
    legs.push(await calculateStatutoryLeg(usdGross, "USD", effectiveDate));
  }
  if (zigPct.gt(0)) {
    legs.push(await calculateStatutoryLeg(zigGross, "ZIG", effectiveDate));
  }

  if (!legs.length) {
    legs.push(await calculateStatutoryLeg(basicSalary, "USD", effectiveDate));
  }

  const grossPay = legs.reduce((s, l) => s.add(l.grossPay), new Decimal(0));
  const totalDeductions = legs.reduce((s, l) => s.add(l.totalDeductions), new Decimal(0));
  const netPay = legs.reduce((s, l) => s.add(l.netPay), new Decimal(0));

  const deductions = legs.flatMap((leg) => [
    { type: `PAYE (${leg.currencyCode})`, amount: leg.payeAmount, isStatutory: true },
    { type: `AIDS Levy (${leg.currencyCode})`, amount: leg.aidsLevyAmount, isStatutory: true },
    { type: `NSSA (${leg.currencyCode})`, amount: leg.nssaAmount, isStatutory: true },
    { type: `SDL (${leg.currencyCode})`, amount: leg.sdlAmount, isStatutory: true },
  ]);

  return {
    basicSalary,
    totalAllowances: new Decimal(0),
    grossPay,
    totalDeductions,
    netPay,
    allowances: [],
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
