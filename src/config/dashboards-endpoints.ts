// Dashboard endpoints for fallback Swagger spec
export const dashboardsEndpoints = {
  // ========== ACCOUNTING DASHBOARD ==========
  '/accounting/dashboard': {
    get: {
      summary: 'Get accounting dashboard data',
      description:
        'Returns comprehensive accounting dashboard data including key metrics (Revenue, COGS, Gross Profit, Net Profit), monthly chart data, expense breakdowns, and assets/liabilities breakdowns. All calculations match the Income Statement and Balance Sheet reports. Assets `summary` rows are mutually exclusive buckets (cash vs non-cash current assets are split so amounts sum to `assets.total` together with fixed, other, VAT disclosure, and any supplemental register/STI lines).',
      tags: ['Dashboards'],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'query',
          name: 'period',
          schema: { type: 'string', enum: ['MTD', 'YTD'], default: 'YTD' },
          description: 'Period type (Month to Date or Year to Date)'
        },
        {
          in: 'query',
          name: 'benchmark',
          schema: { type: 'string', enum: ['LAST_MONTH', 'LAST_YEAR'], default: 'LAST_YEAR' },
          description: 'Benchmark period for comparison'
        },
        {
          in: 'query',
          name: 'startDate',
          schema: { type: 'string', format: 'date', example: '2025-01-01' },
          description: 'Custom start date (YYYY-MM-DD). If provided, overrides period parameter.'
        },
        {
          in: 'query',
          name: 'endDate',
          schema: { type: 'string', format: 'date', example: '2025-12-31' },
          description: 'Custom end date (YYYY-MM-DD). If provided, overrides period parameter.'
        },
        {
          in: 'query',
          name: 'currencyId',
          schema: { type: 'string' },
          description: 'Currency ID. If not provided, uses default active currency.'
        }
      ],
      responses: {
        200: {
          description: 'Dashboard data retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Accounting dashboard data retrieved successfully' },
                  data: {
                    type: 'object',
                    properties: {
                      metrics: {
                        type: 'object',
                        properties: {
                          revenue: {
                            type: 'object',
                            properties: {
                              value: { type: 'number', example: 1500000 },
                              change: { type: 'number', example: 130000 },
                              changePercent: { type: 'number', example: 4.5 }
                            }
                          },
                          cogs: {
                            type: 'object',
                            properties: {
                              value: { type: 'number', example: 500000 },
                              change: { type: 'number', example: -50000 },
                              changePercent: { type: 'number', example: -4.5 }
                            }
                          },
                          grossProfit: {
                            type: 'object',
                            properties: {
                              value: { type: 'number', example: 1000000 },
                              change: { type: 'number', example: 110000 },
                              changePercent: { type: 'number', example: 4.5 },
                              grossProfitPercent: { type: 'number', example: 66.67 }
                            }
                          },
                          netProfit: {
                            type: 'object',
                            properties: {
                              value: { type: 'number', example: 800000 },
                              change: { type: 'number', example: -22000 },
                              changePercent: { type: 'number', example: -4.5 }
                            }
                          }
                        }
                      },
                      monthlyData: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            month: { type: 'string', example: 'Jan' },
                            monthNumber: { type: 'number', example: 1 },
                            revenue: { type: 'number' },
                            cogs: { type: 'number' },
                            grossProfit: { type: 'number' },
                            netProfit: { type: 'number' }
                          }
                        }
                      },
                      expenses: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            category: { type: 'string', example: 'Salaries & Benefits' },
                            amount: { type: 'number', example: 504435 },
                            percent: { type: 'number', example: 25.5 }
                          }
                        }
                      },
                      assets: {
                        type: 'object',
                        properties: {
                          summary: { type: 'array', items: { type: 'object' } },
                          detailed: { type: 'array', items: { type: 'object' } },
                          total: { type: 'number', example: 25000000 }
                        }
                      },
                      liabilitiesEquity: {
                        type: 'object',
                        properties: {
                          summary: { type: 'array', items: { type: 'object' } },
                          detailed: { type: 'array', items: { type: 'object' } },
                          total: { type: 'number' }
                        }
                      },
                      generatedAt: { type: 'string', format: 'date-time' }
                    }
                  }
                }
              }
            }
          }
        },
        401: { description: 'Unauthorized' },
        500: { description: 'Server error' }
      }
    }
  },

  // ========== PAYROLL DASHBOARD ==========
  '/payroll/dashboard': {
    get: {
      summary: 'Get payroll dashboard data',
      description: 'Returns comprehensive payroll dashboard data including key metrics, monthly trends, department distribution, and payroll list',
      tags: ['Dashboards'],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'query',
          name: 'month',
          schema: { type: 'integer', minimum: 1, maximum: 12 },
          description: 'Month number (1-12). Defaults to current month.'
        },
        {
          in: 'query',
          name: 'year',
          schema: { type: 'integer' },
          description: 'Year. Defaults to current year.'
        },
        {
          in: 'query',
          name: 'currencyId',
          schema: { type: 'string' },
          description: 'Currency ID filter'
        }
      ],
      responses: {
        200: {
          description: 'Dashboard data retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Payroll dashboard data retrieved successfully' },
                  data: {
                    type: 'object',
                    properties: {
                      alert: {
                        type: 'object',
                        properties: {
                          message: { type: 'string', example: 'Heads up! Payroll is due in 3 days.' },
                          dueDate: { type: 'string', format: 'date-time' },
                          daysUntilDue: { type: 'number', example: 3 },
                          showAlert: { type: 'boolean', example: true }
                        }
                      },
                      metrics: {
                        type: 'object',
                        properties: {
                          totalPayrollThisMonth: {
                            type: 'object',
                            properties: {
                              value: { type: 'number', example: 273500 },
                              change: { type: 'number', example: 25000 },
                              changePercent: { type: 'number', example: 8.2 }
                            }
                          },
                          totalEmployeesPaid: {
                            type: 'object',
                            properties: {
                              value: { type: 'number', example: 134 },
                              change: { type: 'number', example: 3 }
                            }
                          },
                          averageSalary: {
                            type: 'object',
                            properties: {
                              value: { type: 'number', example: 3632 },
                              change: { type: 'number', example: 94 }
                            }
                          }
                        }
                      },
                      monthlyTrend: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            month: { type: 'string', example: 'Oct' },
                            monthNumber: { type: 'number', example: 10 },
                            year: { type: 'number', example: 2024 },
                            totalPayroll: { type: 'number' },
                            employeeCount: { type: 'number' },
                            averageSalary: { type: 'number' }
                          }
                        }
                      },
                      departmentDistribution: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            department: { type: 'string', example: 'IT' },
                            salary: { type: 'number', example: 50000 },
                            bonus: { type: 'number', example: 5000 },
                            total: { type: 'number', example: 55000 },
                            employeeCount: { type: 'number', example: 15 }
                          }
                        }
                      },
                      payrollList: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            employeeId: { type: 'string' },
                            name: { type: 'string', example: 'John Doe' },
                            pictureUrl: { type: 'string', nullable: true },
                            department: { type: 'string', example: 'Marketing' },
                            payDate: { type: 'string', format: 'date-time' },
                            status: { type: 'string', enum: ['Paid', 'Pending', 'Draft'], example: 'Paid' },
                            baseSalary: { type: 'number', example: 4000 },
                            bonuses: { type: 'number', example: 500 },
                            totalSalary: { type: 'number', example: 4500 }
                          }
                        }
                      },
                      generatedAt: { type: 'string', format: 'date-time' }
                    }
                  }
                }
              }
            }
          }
        },
        401: { description: 'Unauthorized' },
        500: { description: 'Server error' }
      }
    }
  },

  // ========== PERFORMANCE DASHBOARD ==========
  '/performance/dashboard': {
    get: {
      summary: 'Get performance dashboard data',
      description: 'Returns comprehensive performance dashboard data including task metrics, monthly productivity, performance distribution, worker insights, budget tracker, and employee of the month',
      tags: ['Dashboards'],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'query',
          name: 'month',
          schema: { type: 'integer', minimum: 1, maximum: 12 },
          description: 'Month number (1-12). Defaults to current month.'
        },
        {
          in: 'query',
          name: 'year',
          schema: { type: 'integer' },
          description: 'Year. Defaults to current year.'
        }
      ],
      responses: {
        200: {
          description: 'Dashboard data retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Performance dashboard data retrieved successfully' },
                  data: {
                    type: 'object',
                    properties: {
                      summaryCards: {
                        type: 'object',
                        properties: {
                          pendingTasks: {
                            type: 'object',
                            properties: {
                              value: { type: 'number', example: 21 },
                              change: { type: 'number', example: 2 },
                              changePercent: { type: 'number', example: 11 },
                              progress: { type: 'number', example: 0.42 },
                              total: { type: 'number', example: 50 }
                            }
                          },
                          inProgress: {
                            type: 'object',
                            properties: {
                              value: { type: 'number', example: 18 },
                              change: { type: 'number', example: 1 },
                              changePercent: { type: 'number', example: 9 },
                              progress: { type: 'number', example: 0.36 },
                              total: { type: 'number', example: 50 }
                            }
                          },
                          completed: {
                            type: 'object',
                            properties: {
                              value: { type: 'number', example: 33 },
                              change: { type: 'number', example: -5 },
                              changePercent: { type: 'number', example: -16 },
                              progress: { type: 'number', example: 0.66 },
                              total: { type: 'number', example: 50 }
                            }
                          },
                          completionRate: {
                            type: 'object',
                            properties: {
                              value: { type: 'number', example: 26 },
                              change: { type: 'number', example: 3 },
                              changePercent: { type: 'number', example: 12 }
                            }
                          }
                        }
                      },
                      monthlyProductivity: {
                        type: 'object',
                        properties: {
                          currentValue: { type: 'number', example: 45 },
                          changeFromLastYear: { type: 'number', example: 5 },
                          changePercent: { type: 'number', example: 12.5 },
                          data: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                month: { type: 'string', example: 'Jan' },
                                monthNumber: { type: 'number', example: 1 },
                                year: { type: 'number', example: 2025 },
                                taskCompletedRate: { type: 'number', example: 45 }
                              }
                            }
                          }
                        }
                      },
                      performanceDistribution: {
                        type: 'object',
                        properties: {
                          highPerformers: { type: 'number', example: 30 },
                          average: { type: 'number', example: 25 },
                          needImprovement: { type: 'number', example: 45 }
                        }
                      },
                      workerPerformance: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            userId: { type: 'string' },
                            name: { type: 'string', example: 'John Doe' },
                            pictureUrl: { type: 'string', nullable: true },
                            role: { type: 'string', example: 'Full Time' },
                            department: { type: 'string', example: 'Marketing' },
                            taskCount: { type: 'number', example: 12 },
                            progressPercentage: { type: 'number', example: 85.5 }
                          }
                        }
                      },
                      budgetTracker: {
                        type: 'object',
                        properties: {
                          totalBudget: { type: 'number', example: 80000 },
                          totalSpend: { type: 'number', example: 60000 },
                          remaining: { type: 'number', example: 20000 },
                          percentageUsed: { type: 'number', example: 75 }
                        }
                      },
                      employeeOfTheMonth: {
                        type: 'object',
                        nullable: true,
                        properties: {
                          userId: { type: 'string' },
                          name: { type: 'string', example: 'Eva Chowdary' },
                          role: { type: 'string', example: 'UI/UX Designer' },
                          department: { type: 'string', example: 'IT' },
                          email: { type: 'string', example: 'example@gmail.com' },
                          taskCount: { type: 'number', example: 15, description: 'Total tasks the user was on this month' },
                          tasksCompleted: { type: 'number', example: 12 },
                          tasksInProgress: { type: 'number', example: 2 },
                          tasksPending: { type: 'number', example: 1 },
                          completionRate: { type: 'number', example: 80, description: 'tasksCompleted / taskCount * 100' }
                        }
                      },
                      generatedAt: { type: 'string', format: 'date-time' }
                    }
                  }
                }
              }
            }
          }
        },
        401: { description: 'Unauthorized' },
        500: { description: 'Server error' }
      }
    }
  },

  // ========== PORTFOLIO DASHBOARD ==========
  '/portfolio/dashboard': {
    get: {
      summary: 'Get portfolio management dashboard data',
      description:
        'Portfolio dashboard: metrics, performance overview, J curve, deal allocation, IRR, portfolio summary. Includes comparisonChart (cross-company bar metrics) and netProfitWaterfall (prior→current net profit bridge).',
      tags: ['Dashboards'],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'query',
          name: 'fundId',
          schema: { type: 'string' },
          description: 'Optional fund ID to filter by specific fund. If not provided, aggregates data across all funds.'
        },
        {
          in: 'query',
          name: 'portfolioCompanyId',
          schema: { type: 'string' },
          description: 'Optional single investee slice; fundId resolved from company when omitted'
        },
        {
          in: 'query',
          name: 'year',
          schema: { type: 'integer' },
          description:
            'Optional — filters J-curve and IRR-by-quarter only; does not drop rows from portfolioSummary.'
        },
        {
          in: 'query',
          name: 'currencyId',
          schema: { type: 'string' },
          description: 'Optional currency ID filter'
        },
        {
          in: 'query',
          name: 'asOfDate',
          schema: { type: 'string', format: 'date' },
          description:
            'Optional YYYY-MM-DD — disbursed capital counted up to end of that UTC day; IRR holding period ends this date.'
        },
        {
          in: 'query',
          name: 'search',
          schema: { type: 'string' },
          description: 'Substring match on investee name, industry, or id (case-insensitive). Alias: q'
        },
        {
          in: 'query',
          name: 'q',
          schema: { type: 'string' },
          description: 'Same as search'
        },
        {
          in: 'query',
          name: 'scope',
          schema: { type: 'string', enum: ['full', 'aum'] },
          description:
            'aum = faster/minimal (no analyst rollup, comparison/waterfall charts, shorter irrByQuarter); full = default'
        }
      ],
      responses: {
        200: {
          description: 'Dashboard data retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Portfolio dashboard data retrieved successfully' },
                  data: {
                    type: 'object',
                    properties: {
                      metrics: {
                        type: 'object',
                        properties: {
                          totalInvested: { type: 'number', example: 234900000 },
                          availableForDrawdown: { type: 'number', example: 47500000 },
                          fundGrossIRR: { type: 'number', example: 16.32 },
                          lpNetIRR: { type: 'number', example: 11.47 },
                          tvpi: { type: 'number', example: 1.29 },
                          dpi: { type: 'number', nullable: true },
                          moicOnCost: { type: 'number', nullable: true },
                          portfolioRoi: { type: 'number', nullable: true, description: '(total value − deployed) / deployed' }
                        }
                      },
                      performanceOverview: {
                        type: 'object',
                        properties: {
                          paidIn: { type: 'number', example: 350000000 },
                          totalInvestment: { type: 'number', example: 234900000 },
                          managementExpenses: { type: 'number', example: 5000000 },
                          otherExpenses: { type: 'number', example: 2000000 },
                          realizedProceedsAndIncome: { type: 'number', example: 70000000 },
                          fmvUnrealizedPortfolio: { type: 'number', example: 289690000 }
                        }
                      },
                      jCurve: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            year: { type: 'number', example: 2025 },
                            contribution: { type: 'number', example: 50000000 },
                            distribution: { type: 'number', example: 10000000 },
                            cumulativeAmount: { type: 'number', example: -250000000 }
                          }
                        }
                      },
                      dealAllocation: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            sector: { type: 'string', example: 'Software & Services' },
                            investmentCost: { type: 'number', example: 143300000 },
                            percentage: { type: 'number', example: 61.0 }
                          }
                        }
                      },
                      irrByQuarter: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            quarter: { type: 'string', example: 'Q1 2025' },
                            quarterNumber: { type: 'number', example: 1 },
                            year: { type: 'number', example: 2025 },
                            investorNetIRR: { type: 'number', example: 11.47 },
                            fundNetIRR: { type: 'number', example: 14.34 },
                            fundGrossIRR: { type: 'number', example: 16.32 }
                          }
                        }
                      },
                      portfolioSummary: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            companyId: { type: 'string' },
                            name: { type: 'string', example: 'Genesys' },
                            initialInvestment: { type: 'string', format: 'date', nullable: true, example: '2016-12-01' },
                            mainIndustry: { type: 'string', example: 'Software' },
                            commitReserves: { type: 'number', example: 0 },
                            currentOwnership: { type: 'number', nullable: true, example: 13.30 },
                            totalInvestmentCost: { type: 'number', example: 4000000 },
                            currentInvestmentCost: { type: 'number', example: 4000000 },
                            realized: { type: 'number', example: 0 },
                            fairMarketValue: { type: 'number', example: 4000000 },
                            totalValue: { type: 'number', example: 4000000 },
                            multiplesOfCost: { type: 'number', example: 1.00 },
                            grossIRR: { type: 'number', example: 2.00 }
                          }
                        }
                      },
                      comparisonChart: {
                        type: 'array',
                        description:
                          'Revenue growth, EBITDA margin, net margin per company (same order as portfolioSummary); rates decimal, *Pct 0–100',
                        items: {
                          type: 'object',
                          properties: {
                            companyId: { type: 'string' },
                            name: { type: 'string' },
                            revenueGrowthRatePct: { type: 'number', nullable: true },
                            ebitdaMarginPct: { type: 'number', nullable: true },
                            netProfitMarginPct: { type: 'number', nullable: true }
                          }
                        }
                      },
                      netProfitWaterfall: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            companyId: { type: 'string' },
                            name: { type: 'string' },
                            startNetProfit: { type: 'number', nullable: true },
                            endNetProfit: { type: 'number', nullable: true },
                            complete: { type: 'boolean' },
                            steps: {
                              type: 'array',
                              items: {
                                type: 'object',
                                properties: {
                                  id: { type: 'string' },
                                  label: { type: 'string' },
                                  value: { type: 'number' }
                                }
                              }
                            }
                          }
                        }
                      },
                      aumKpis: {
                        type: 'object',
                        description:
                          'Holdings AUM tiles: sectorDistribution, topSectors, diversification, YoY+YTD growth, deployment, IRR/ROI; no pipeline or disbursement lists',
                      },
                      portfolioComposition: {
                        type: 'object',
                        description:
                          'Value-weighted AUM breakdown, growth (YoY/CAGR/historySeries), utilization, performance; risk fields reserved',
                        properties: {
                          headline: {
                            type: 'object',
                            properties: {
                              totalPortfolioAum: { type: 'number' },
                              totalRealizedValue: { type: 'number' },
                              totalUnrealizedValue: { type: 'number' },
                              numberOfHoldings: { type: 'number' },
                            },
                          },
                          aumBySector: { type: 'array', items: { type: 'object' } },
                          aumByAssetClass: { type: 'array', items: { type: 'object' } },
                          diversification: { type: 'object' },
                          aumGrowth: { type: 'object' },
                          utilization: { type: 'object' },
                          performance: { type: 'object' },
                          riskAdjustedReturns: { type: 'object' },
                        },
                      },
                      totals: {
                        type: 'object',
                        properties: {
                          totalInvestmentCost: { type: 'number', example: 234990000 },
                          currentInvestmentCost: { type: 'number', example: 219890000 },
                          realized: { type: 'number', example: 70000000 },
                          fairMarketValue: { type: 'number', example: 289690000 },
                          totalValue: { type: 'number', example: 359690000 },
                          multiplesOfCost: { type: 'number', example: 1.53 },
                          grossIRR: { type: 'number', example: 16.32 }
                        }
                      },
                      period: {
                        type: 'object',
                        properties: {
                          asOfDate: { type: 'string', format: 'date-time' },
                          fundName: { type: 'string', nullable: true, example: 'USD Fund I' },
                          year: { type: 'number', nullable: true, example: 2025 },
                          scope: { type: 'string', enum: ['full', 'aum'] }
                        }
                      },
                      generatedAt: { type: 'string', format: 'date-time' }
                    }
                  }
                }
              }
            }
          }
        },
        401: { description: 'Unauthorized' },
        500: { description: 'Server error' }
      }
    }
  }
};
