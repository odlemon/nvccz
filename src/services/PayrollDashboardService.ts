// @ts-nocheck
import { prisma } from "../utils/database";
import { Decimal } from "decimal.js";

export interface PayrollDashboardParams {
  month?: number; // 1-12, defaults to current month
  year?: number; // defaults to current year
  currencyId?: string;
}

export interface PayrollDashboardData {
  // Alert Banner
  alert: {
    message: string;
    dueDate: Date | null;
    daysUntilDue: number | null;
    showAlert: boolean;
  };
  
  // Key Metrics
  metrics: {
    totalPayrollThisMonth: {
      value: number;
      change: number;
      changePercent: number;
    };
    totalEmployeesPaid: {
      value: number;
      change: number;
    };
    averageSalary: {
      value: number;
      change: number;
    };
  };
  
  // Monthly Trend Data (Last 6 months)
  monthlyTrend: Array<{
    month: string; // "Oct", "Nov", etc.
    monthNumber: number;
    year: number;
    totalPayroll: number;
    employeeCount: number;
    averageSalary: number;
  }>;
  
  // Department Distribution
  departmentDistribution: Array<{
    department: string;
    salary: number;
    bonus: number;
    total: number;
    employeeCount: number;
  }>;
  
  // Payroll List
  payrollList: Array<{
    employeeId: string;
    name: string;
    pictureUrl: string | null;
    department: string;
    payDate: Date | null;
    status: "Paid" | "Pending" | "Draft";
    baseSalary: number;
    bonuses: number;
    totalSalary: number;
    payrollRunId: string | null;
  }>;
  
  // Period Information
  period: {
    currentMonth: number;
    currentYear: number;
    startDate: Date;
    endDate: Date;
  };
  
  generatedAt: Date;
}

export class PayrollDashboardService {
  /**
   * Get comprehensive payroll dashboard data
   */
  static async getDashboardData(params: PayrollDashboardParams = {}): Promise<PayrollDashboardData> {
    try {
      const now = new Date();
      const currentMonth = params.month || now.getMonth() + 1;
      const currentYear = params.year || now.getFullYear();
      
      // Calculate date ranges
      const currentMonthStart = new Date(currentYear, currentMonth - 1, 1);
      const currentMonthEnd = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);
      
      const lastMonth = currentMonth === 1 ? 12 : currentMonth - 1;
      const lastMonthYear = currentMonth === 1 ? currentYear - 1 : currentYear;
      const lastMonthStart = new Date(lastMonthYear, lastMonth - 1, 1);
      const lastMonthEnd = new Date(lastMonthYear, lastMonth, 0, 23, 59, 59, 999);
      
      // Get current month payroll runs (COMPLETED status)
      const currentMonthPayrollRuns = await prisma.payrollRun.findMany({
        where: {
          status: 'COMPLETED',
          endDate: {
            gte: currentMonthStart,
            lte: currentMonthEnd
          },
          ...(params.currencyId && { currencyId: params.currencyId })
        },
        include: {
          employeePayrolls: {
            include: {
              employee: {
                select: {
                  id: true,
                  pictureUrl: true,
                  user: {
                    select: {
                      firstName: true,
                      lastName: true,
                      departmentId: true,
                      userDepartment: true,
                      department: {
                        select: {
                          name: true
                        }
                      }
                    }
                  }
                }
              },
              allowances: {
                include: {
                  allowanceType: true
                }
              }
            }
          }
        }
      });
      
      // Get last month payroll runs for comparison
      const lastMonthPayrollRuns = await prisma.payrollRun.findMany({
        where: {
          status: 'COMPLETED',
          endDate: {
            gte: lastMonthStart,
            lte: lastMonthEnd
          },
          ...(params.currencyId && { currencyId: params.currencyId })
        },
        include: {
          employeePayrolls: true
        }
      });
      
      // Calculate current month metrics
      const currentMonthTotal = currentMonthPayrollRuns.reduce((sum, run) => 
        sum + parseFloat(run.totalNetPay.toString()), 0
      );
      const currentMonthEmployeeCount = new Set(
        currentMonthPayrollRuns.flatMap(run => 
          run.employeePayrolls.map(ep => ep.employeeId)
        )
      ).size;
      
      // Calculate last month metrics
      const lastMonthTotal = lastMonthPayrollRuns.reduce((sum, run) => 
        sum + parseFloat(run.totalNetPay.toString()), 0
      );
      const lastMonthEmployeeCount = new Set(
        lastMonthPayrollRuns.flatMap(run => 
          run.employeePayrolls.map(ep => ep.employeeId)
        )
      ).size;
      
      // Calculate metrics
      const totalPayrollChange = currentMonthTotal - lastMonthTotal;
      const totalPayrollChangePercent = lastMonthTotal !== 0 
        ? (totalPayrollChange / lastMonthTotal) * 100 
        : 0;
      
      const employeeCountChange = currentMonthEmployeeCount - lastMonthEmployeeCount;
      
      const currentMonthAverage = currentMonthEmployeeCount > 0 
        ? currentMonthTotal / currentMonthEmployeeCount 
        : 0;
      const lastMonthAverage = lastMonthEmployeeCount > 0 
        ? lastMonthTotal / lastMonthEmployeeCount 
        : 0;
      const averageSalaryChange = currentMonthAverage - lastMonthAverage;
      
      // Get next payroll run due date (DRAFT or PROCESSING status)
      const nextPayrollRun = await prisma.payrollRun.findFirst({
        where: {
          status: {
            in: ['DRAFT', 'PROCESSING']
          }
        },
        orderBy: {
          endDate: 'asc'
        }
      });
      
      const alert = this.calculateAlert(nextPayrollRun);
      
      // Get monthly trend (last 6 months)
      const monthlyTrend = await this.getMonthlyTrend(currentYear, currentMonth, params.currencyId);
      
      // Get department distribution
      const departmentDistribution = await this.getDepartmentDistribution(
        currentMonthPayrollRuns
      );
      
      // Get payroll list
      const payrollList = await this.getPayrollList(currentMonthPayrollRuns);
      
      return {
        alert,
        metrics: {
          totalPayrollThisMonth: {
            value: currentMonthTotal,
            change: totalPayrollChange,
            changePercent: totalPayrollChangePercent
          },
          totalEmployeesPaid: {
            value: currentMonthEmployeeCount,
            change: employeeCountChange
          },
          averageSalary: {
            value: currentMonthAverage,
            change: averageSalaryChange
          }
        },
        monthlyTrend,
        departmentDistribution,
        payrollList,
        period: {
          currentMonth,
          currentYear,
          startDate: currentMonthStart,
          endDate: currentMonthEnd
        },
        generatedAt: new Date()
      };
    } catch (error) {
      console.error("Error generating payroll dashboard:", error);
      if (error instanceof Error) throw error;
      throw new Error("Failed to generate payroll dashboard. Please try again.");
    }
  }
  
  /**
   * Calculate alert message for upcoming payroll due date
   */
  private static calculateAlert(nextPayrollRun: any): {
    message: string;
    dueDate: Date | null;
    daysUntilDue: number | null;
    showAlert: boolean;
  } {
    if (!nextPayrollRun || !nextPayrollRun.endDate) {
      return {
        message: "",
        dueDate: null,
        daysUntilDue: null,
        showAlert: false
      };
    }
    
    const dueDate = new Date(nextPayrollRun.endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    dueDate.setHours(0, 0, 0, 0);
    
    const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysUntilDue <= 0) {
      return {
        message: `Payroll is overdue! Please process payroll immediately.`,
        dueDate,
        daysUntilDue: 0,
        showAlert: true
      };
    }
    
    if (daysUntilDue <= 7) {
      const formattedDate = dueDate.toLocaleDateString('en-US', { 
        month: 'long', 
        day: 'numeric', 
        year: 'numeric' 
      });
      
      return {
        message: `Heads up! Payroll is due in ${daysUntilDue} day${daysUntilDue !== 1 ? 's' : ''}. Please ensure all employee data, attendance logs, and bonuses are finalized before ${formattedDate} to avoid delays in payment processing.`,
        dueDate,
        daysUntilDue,
        showAlert: true
      };
    }
    
    return {
      message: "",
      dueDate,
      daysUntilDue,
      showAlert: false
    };
  }
  
  /**
   * Get monthly trend data (last 6 months)
   */
  private static async getMonthlyTrend(
    currentYear: number,
    currentMonth: number,
    currencyId?: string
  ): Promise<Array<{
    month: string;
    monthNumber: number;
    year: number;
    totalPayroll: number;
    employeeCount: number;
    averageSalary: number;
  }>> {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const trend: Array<{
      month: string;
      monthNumber: number;
      year: number;
      totalPayroll: number;
      employeeCount: number;
      averageSalary: number;
    }> = [];
    
    for (let i = 5; i >= 0; i--) {
      let month = currentMonth - i;
      let year = currentYear;
      
      if (month <= 0) {
        month += 12;
        year -= 1;
      }
      
      const monthStart = new Date(year, month - 1, 1);
      const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);
      
      const payrollRuns = await prisma.payrollRun.findMany({
        where: {
          status: 'COMPLETED',
          endDate: {
            gte: monthStart,
            lte: monthEnd
          },
          ...(currencyId && { currencyId })
        },
        include: {
          employeePayrolls: true
        }
      });
      
      const totalPayroll = payrollRuns.reduce((sum, run) => 
        sum + parseFloat(run.totalNetPay.toString()), 0
      );
      
      const employeeCount = new Set(
        payrollRuns.flatMap(run => 
          run.employeePayrolls.map(ep => ep.employeeId)
        )
      ).size;
      
      const averageSalary = employeeCount > 0 ? totalPayroll / employeeCount : 0;
      
      trend.push({
        month: monthNames[month - 1],
        monthNumber: month,
        year,
        totalPayroll,
        employeeCount,
        averageSalary
      });
    }
    
    return trend;
  }
  
  /**
   * Get department distribution (Salary vs Bonus)
   */
  private static async getDepartmentDistribution(
    payrollRuns: any[]
  ): Promise<Array<{
    department: string;
    salary: number;
    bonus: number;
    total: number;
    employeeCount: number;
  }>> {
    const departmentMap = new Map<string, {
      salary: number;
      bonus: number;
      employeeIds: Set<string>;
    }>();
    
    for (const run of payrollRuns) {
      for (const employeePayroll of run.employeePayrolls) {
        const employee = employeePayroll.employee;
        const user = employee.user;
        
        // Get department name
        const department = user.department?.name || user.userDepartment || 'Unassigned';
        
        if (!departmentMap.has(department)) {
          departmentMap.set(department, {
            salary: 0,
            bonus: 0,
            employeeIds: new Set()
          });
        }
        
        const deptData = departmentMap.get(department)!;
        
        // Add base salary
        deptData.salary += parseFloat(employeePayroll.basicSalary.toString());
        
        // Calculate bonuses (from allowances where type might be "Bonus")
        let bonusAmount = 0;
        for (const allowance of employeePayroll.allowances || []) {
          const allowanceTypeName = allowance.allowanceType?.name?.toLowerCase() || '';
          if (allowanceTypeName.includes('bonus')) {
            bonusAmount += parseFloat(allowance.amount.toString());
          }
        }
        deptData.bonus += bonusAmount;
        deptData.employeeIds.add(employeePayroll.employeeId);
      }
    }
    
    // Convert to array format
    const distribution = Array.from(departmentMap.entries()).map(([department, data]) => ({
      department,
      salary: data.salary,
      bonus: data.bonus,
      total: data.salary + data.bonus,
      employeeCount: data.employeeIds.size
    }));
    
    // Sort by total descending
    distribution.sort((a, b) => b.total - a.total);
    
    return distribution;
  }
  
  /**
   * Get payroll list with employee details - shows ALL active employees
   */
  private static async getPayrollList(
    payrollRuns: any[]
  ): Promise<Array<{
    employeeId: string;
    name: string;
    pictureUrl: string | null;
    department: string;
    payDate: Date | null;
    status: "Paid" | "Pending" | "Draft";
    baseSalary: number;
    bonuses: number;
    totalSalary: number;
    payrollRunId: string | null;
  }>> {
    // Get ALL active employees
    const allEmployees = await prisma.employee.findMany({
      where: { isActive: true },
      select: {
        id: true,
        pictureUrl: true,
        basicSalary: true,
        user: {
          select: {
            firstName: true,
            lastName: true,
            departmentId: true,
            userDepartment: true,
            department: {
              select: {
                name: true
              }
            }
          }
        }
      }
    });
    
    // Create a map of employee payroll entries from current month runs
    const payrollMap = new Map<string, {
      payDate: Date;
      status: "Paid" | "Pending" | "Draft";
      baseSalary: number;
      bonuses: number;
      totalSalary: number;
      payrollRunId: string;
    }>();
    
    for (const run of payrollRuns) {
      for (const employeePayroll of run.employeePayrolls) {
        // Calculate bonuses
        let bonusAmount = 0;
        for (const allowance of employeePayroll.allowances || []) {
          const allowanceTypeName = allowance.allowanceType?.name?.toLowerCase() || '';
          if (allowanceTypeName.includes('bonus')) {
            bonusAmount += parseFloat(allowance.amount.toString());
          }
        }
        
        // Determine status based on payroll run status
        let status: "Paid" | "Pending" | "Draft" = "Pending";
        if (run.status === 'COMPLETED') {
          status = "Paid";
        } else if (run.status === 'DRAFT') {
          status = "Draft";
        }
        
        payrollMap.set(employeePayroll.employeeId, {
          payDate: run.endDate,
          status,
          baseSalary: parseFloat(employeePayroll.basicSalary.toString()),
          bonuses: bonusAmount,
          totalSalary: parseFloat(employeePayroll.netPay.toString()),
          payrollRunId: run.id
        });
      }
    }
    
    // Build payroll list for ALL employees
    const payrollList: Array<{
      employeeId: string;
      name: string;
      pictureUrl: string | null;
      department: string;
      payDate: Date | null;
      status: "Paid" | "Pending" | "Draft";
      baseSalary: number;
      bonuses: number;
      totalSalary: number;
      payrollRunId: string | null;
    }> = [];
    
    for (const employee of allEmployees) {
      const user = employee.user;
      const payrollEntry = payrollMap.get(employee.id);
      
      if (payrollEntry) {
        // Employee has payroll entry
        payrollList.push({
          employeeId: employee.id,
          name: `${user.firstName} ${user.lastName}`,
          pictureUrl: employee.pictureUrl,
          department: user.department?.name || user.userDepartment || 'Unassigned',
          payDate: payrollEntry.payDate,
          status: payrollEntry.status,
          baseSalary: payrollEntry.baseSalary,
          bonuses: payrollEntry.bonuses,
          totalSalary: payrollEntry.totalSalary,
          payrollRunId: payrollEntry.payrollRunId
        });
      } else {
        // Employee doesn't have payroll entry yet - show as Pending
        payrollList.push({
          employeeId: employee.id,
          name: `${user.firstName} ${user.lastName}`,
          pictureUrl: employee.pictureUrl,
          department: user.department?.name || user.userDepartment || 'Unassigned',
          payDate: null,
          status: "Pending",
          baseSalary: parseFloat(employee.basicSalary.toString()),
          bonuses: 0,
          totalSalary: parseFloat(employee.basicSalary.toString()),
          payrollRunId: null
        });
      }
    }
    
    // Sort by name (alphabetically) for better UX
    payrollList.sort((a, b) => a.name.localeCompare(b.name));
    
    return payrollList;
  }
}
