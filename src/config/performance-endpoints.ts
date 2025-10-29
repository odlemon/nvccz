/**
 * Performance Module Swagger Endpoints Configuration
 * Based on Enhanced Performance Module Manual Breakdown Testing Guide
 * Organized by 5-Stage Workflow
 */

export const performanceEndpoints = {
  // ==========================================
  // STAGE 1: GOAL SETTING (Cascade)
  // ==========================================
  
  '/api/performance/goals': {
    post: {
      tags: ['🎯 Stage 1: Goal Setting'],
      summary: 'Create Organizational Goal',
      description: 'Create a new organizational goal (no automatic cascading)',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['title', 'type', 'category', 'targetValue', 'targetUnit'],
              properties: {
                title: { type: 'string', example: 'Achieve $5M Fund I AUM by Q4' },
                type: { type: 'string', enum: ['company'], example: 'company' },
                category: { type: 'string', enum: ['financial', 'operational', 'strategic'], example: 'financial' },
                targetValue: { type: 'number', example: 5000000 },
                targetUnit: { type: 'string', example: 'USD' },
                dataSourceModule: { type: 'string', example: 'PortfolioManagement' },
                dataSourceField: { type: 'string', example: 'Fund.CurrentAUM' },
                description: { type: 'string', example: 'Strategic goal to achieve $5M AUM by Q4' },
                startDate: { type: 'string', format: 'date', example: '2025-01-01' },
                endDate: { type: 'string', format: 'date', example: '2025-12-31' }
              }
            }
          }
        }
      },
      responses: {
        200: {
          description: 'Organizational goal created successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { type: 'string' },
                  data: { type: 'object' }
                }
              }
            }
          }
        },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' },
        500: { description: 'Internal server error' }
      }
    },
    get: {
      tags: ['🎯 Stage 1: Goal Setting'],
      summary: 'Get Goals by Type',
      description: 'Retrieve goals filtered by type (company, department, individual)',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'type',
          in: 'query',
          schema: { type: 'string', enum: ['company', 'department', 'individual'] },
          description: 'Goal type filter'
        },
        {
          name: 'department',
          in: 'query',
          schema: { type: 'string', enum: ['Finance', 'Sales', 'Operations', 'Procurement', 'Human Resources', 'Marketing', 'Legal', 'IT'] },
          description: 'Department filter for departmental goals'
        }
      ],
      responses: {
        200: {
          description: 'Goals retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { type: 'string' },
                  data: { type: 'array', items: { type: 'object' } }
                }
              }
            }
          }
        }
      }
    }
  },

  '/api/performance/breakdown/departments/available': {
    get: {
      tags: ['🏢 Hardcoded Departments'],
      summary: 'Get All Hardcoded Departments',
      description: 'Get complete list of all 8 hardcoded departments with their details',
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'Departments retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { type: 'string' },
                  data: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string', example: 'Finance' },
                        description: { type: 'string', example: 'Financial management and accounting' },
                        roles: {
                          type: 'array',
                          items: { type: 'string' },
                          example: ['Manager', 'Officer', 'Coordinator', 'Assistant', 'Member']
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  },


  '/api/performance/breakdown/departments/available': {
    get: {
      tags: ['🎯 Stage 1: Goal Setting'],
      summary: 'Get Available Departments for Breakdown',
      description: 'Get list of hardcoded departments available for goal breakdown',
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'Available departments retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { type: 'string' },
                  data: {
                    type: 'array',
                    items: { type: 'string' },
                    example: ['Finance', 'Sales', 'Operations', 'Procurement', 'Human Resources', 'Marketing', 'Legal', 'IT']
                  }
                }
              }
            }
          }
        }
      }
    }
  },

  '/api/performance/breakdown/departments': {
    post: {
      tags: ['🎯 Stage 1: Goal Setting'],
      summary: 'Manual Department Breakdown',
      description: 'Manually break down organizational goal into departmental goals',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['parentGoalId', 'selectedDepartments', 'breakdownData'],
              properties: {
                parentGoalId: { type: 'string', example: 'ORG_GOAL_ID' },
                selectedDepartments: {
                  type: 'array',
                  items: { type: 'string', enum: ['Finance', 'Sales', 'Operations', 'Procurement', 'Human Resources', 'Marketing', 'Legal', 'IT'] },
                  example: ['Finance', 'Sales', 'Operations']
                },
                breakdownData: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['title', 'targetValue', 'targetUnit'],
                    properties: {
                      title: { type: 'string', example: 'Finance Department: AUM Growth Support' },
                      targetValue: { type: 'number', example: 1500000 },
                      targetUnit: { type: 'string', example: 'USD' },
                      dataSourceModule: { type: 'string', example: 'Accounting' },
                      dataSourceField: { type: 'string', example: 'IncomeStatement.TotalRevenue' },
                      description: { type: 'string', example: 'Finance department contribution to AUM growth' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      responses: {
        200: {
          description: 'Departmental goals created successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { type: 'string' },
                  data: { type: 'array', items: { type: 'object' } }
                }
              }
            }
          }
        }
      }
    }
  },

  '/api/performance/breakdown/users/{department}': {
    get: {
      tags: ['🎯 Stage 1: Goal Setting'],
      summary: 'Get Users by Department',
      description: 'Get list of users in a specific department for individual goal assignment',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'department',
          in: 'path',
          required: true,
          schema: { type: 'string', enum: ['Finance', 'Sales', 'Operations', 'Procurement', 'Human Resources', 'Marketing', 'Legal', 'IT'] },
          description: 'Department name'
        }
      ],
      responses: {
        200: {
          description: 'Department users retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { type: 'string' },
                  data: { type: 'array', items: { type: 'object' } }
                }
              }
            }
          }
        }
      }
    }
  },

  '/api/performance/breakdown/individuals': {
    post: {
      tags: ['🎯 Stage 1: Goal Setting'],
      summary: 'Manual Individual Breakdown',
      description: 'Manually break down departmental goal into individual goals',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['departmentGoalId', 'selectedUsers', 'breakdownData'],
              properties: {
                departmentGoalId: { type: 'string', example: 'DEPT_GOAL_ID' },
                selectedUsers: {
                  type: 'array',
                  items: { type: 'string' },
                  example: ['USER_ID_1', 'USER_ID_2']
                },
                breakdownData: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['title', 'targetValue', 'targetUnit'],
                    properties: {
                      title: { type: 'string', example: 'Finance Manager: Revenue Target' },
                      targetValue: { type: 'number', example: 750000 },
                      targetUnit: { type: 'string', example: 'USD' },
                      dataSourceModule: { type: 'string', example: 'Accounting' },
                      dataSourceField: { type: 'string', example: 'IncomeStatement.Revenue' },
                      description: { type: 'string', example: 'Individual revenue target for Finance Manager' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      responses: {
        200: {
          description: 'Individual goals created successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { type: 'string' },
                  data: { type: 'array', items: { type: 'object' } }
                }
              }
            }
          }
        }
      }
    }
  },

  // ==========================================
  // STAGE 2: PROGRESS TRACKING
  // ==========================================

  '/api/performance/goal-tracking/check-goal': {
    post: {
      tags: ['📊 Stage 2: Progress Tracking'],
      summary: 'Check Individual Goal Progress',
      description: 'Check and update progress for a specific individual goal',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['goalId'],
              properties: {
                goalId: { type: 'string', example: 'INDIVIDUAL_GOAL_ID' },
                forceUpdate: { type: 'boolean', example: false }
              }
            }
          }
        }
      },
      responses: {
        200: {
          description: 'Goal progress checked successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { type: 'string' },
                  data: { type: 'object' }
                }
              }
            }
          }
        }
      }
    }
  },

  '/api/performance/goal-tracking/check-all-due-goals': {
    post: {
      tags: ['📊 Stage 2: Progress Tracking'],
      summary: 'Check All Due Goals',
      description: 'Check and update progress for all goals that are due for review',
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'All due goals checked successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { type: 'string' },
                  data: { type: 'object' }
                }
              }
            }
          }
        }
      }
    }
  },

  '/api/performance/goal-tracking/stats': {
    get: {
      tags: ['📊 Stage 2: Progress Tracking'],
      summary: 'Get Goal Tracking Statistics',
      description: 'Get overall statistics for goal tracking and progress',
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'Goal tracking statistics retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { type: 'string' },
                  data: { type: 'object' }
                }
              }
            }
          }
        }
      }
    }
  },

  // ==========================================
  // STAGE 3: ROLL-UP CALCULATION
  // ==========================================

  '/api/performance/goals/{goalId}': {
    get: {
      tags: ['📈 Stage 3: Roll-up Calculation'],
      summary: 'Get Goal with Roll-up Data',
      description: 'Get goal details including roll-up calculations from child goals',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'goalId',
          in: 'path',
          required: true,
          schema: { type: 'string' },
          description: 'Goal ID'
        }
      ],
      responses: {
        200: {
          description: 'Goal with roll-up data retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { type: 'string' },
                  data: { type: 'object' }
                }
              }
            }
          }
        }
      }
    }
  },

  '/api/performance-scorecards/users': {
    get: {
      tags: ['📈 Stage 3: Roll-up Calculation'],
      summary: 'Get User Performance Scorecards',
      description: 'Get performance scorecards for individual users with roll-up calculations',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'userId',
          in: 'query',
          schema: { type: 'string' },
          description: 'User ID filter'
        },
        {
          name: 'department',
          in: 'query',
          schema: { type: 'string', enum: ['Finance', 'Sales', 'Operations', 'Procurement', 'Human Resources', 'Marketing', 'Legal', 'IT'] },
          description: 'Department filter'
        }
      ],
      responses: {
        200: {
          description: 'User performance scorecards retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { type: 'string' },
                  data: { type: 'array', items: { type: 'object' } }
                }
              }
            }
          }
        }
      }
    }
  },

  '/api/performance-scorecards/departments': {
    get: {
      tags: ['📈 Stage 3: Roll-up Calculation'],
      summary: 'Get Department Performance Scorecards',
      description: 'Get performance scorecards for departments with roll-up calculations',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'department',
          in: 'query',
          schema: { type: 'string', enum: ['Finance', 'Sales', 'Operations', 'Procurement', 'Human Resources', 'Marketing', 'Legal', 'IT'] },
          description: 'Department filter'
        }
      ],
      responses: {
        200: {
          description: 'Department performance scorecards retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { type: 'string' },
                  data: { type: 'array', items: { type: 'object' } }
                }
              }
            }
          }
        }
      }
    }
  },

  // ==========================================
  // STAGE 4: PERFORMANCE REVIEW
  // ==========================================

  '/api/performance/review-cycles': {
    get: {
      tags: ['🔄 Stage 4: Performance Review'],
      summary: 'Get Performance Review Cycles',
      description: 'Get all performance review cycles and their status',
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'Performance review cycles retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { type: 'string' },
                  data: { type: 'array', items: { type: 'object' } }
                }
              }
            }
          }
        }
      }
    }
  },

  // ==========================================
  // STAGE 5: DATA SYNCHRONIZATION (ETL)
  // ==========================================

  '/api/performance/enhanced-etl/run-pipeline': {
    post: {
      tags: ['🔄 Stage 5: Data Synchronization'],
      summary: 'Run ETL Pipeline',
      description: 'Run the enhanced ETL pipeline to synchronize data across modules',
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'ETL pipeline executed successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { type: 'string' },
                  data: { type: 'object' }
                }
              }
            }
          }
        }
      }
    }
  },

  '/api/performance/enhanced-etl/metrics': {
    get: {
      tags: ['🔄 Stage 5: Data Synchronization'],
      summary: 'Get ETL Metrics',
      description: 'Get metrics and statistics from the ETL pipeline execution',
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'ETL metrics retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { type: 'string' },
                  data: { type: 'object' }
                }
              }
            }
          }
        }
      }
    }
  },

  // ==========================================
  // TASK MANAGEMENT INTEGRATION
  // ==========================================

  '/api/performance/individual-goals/{individualGoalId}/convert-to-tasks': {
    post: {
      tags: ['📋 Task Management Integration'],
      summary: 'Convert Individual Goal to Tasks',
      description: 'Convert a specific individual goal into actionable tasks',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'individualGoalId',
          in: 'path',
          required: true,
          schema: { type: 'string' },
          description: 'Individual goal ID'
        }
      ],
      responses: {
        200: {
          description: 'Individual goal converted to tasks successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { type: 'string' },
                  data: { type: 'object' }
                }
              }
            }
          }
        }
      }
    }
  },

  '/api/performance/individual-goals/users/{userId}/convert-goals-to-tasks': {
    post: {
      tags: ['📋 Task Management Integration'],
      summary: 'Convert All User Goals to Tasks',
      description: 'Convert all individual goals for a user to tasks',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'userId',
          in: 'path',
          required: true,
          schema: { type: 'string' },
          description: 'User ID'
        }
      ],
      responses: {
        200: {
          description: 'User individual goals converted to tasks successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { type: 'string' },
                  data: { type: 'object' }
                }
              }
            }
          }
        }
      }
    }
  },

  '/api/performance/individual-goals/departments/{department}/convert-goals-to-tasks': {
    post: {
      tags: ['📋 Task Management Integration'],
      summary: 'Convert Department Goals to Tasks',
      description: 'Convert all individual goals for a department to tasks',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'department',
          in: 'path',
          required: true,
          schema: { type: 'string', enum: ['Finance', 'Sales', 'Operations', 'Procurement', 'Human Resources', 'Marketing', 'Legal', 'IT'] },
          description: 'Department name'
        }
      ],
      responses: {
        200: {
          description: 'Department individual goals converted to tasks successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { type: 'string' },
                  data: { type: 'object' }
                }
              }
            }
          }
        }
      }
    }
  },

  '/api/performance/individual-goals/users/{userId}/performance-tasks': {
    get: {
      tags: ['📋 Task Management Integration'],
      summary: 'Get User Performance Tasks',
      description: 'Get all performance tasks for a user (linked to goals)',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'userId',
          in: 'path',
          required: true,
          schema: { type: 'string' },
          description: 'User ID'
        }
      ],
      responses: {
        200: {
          description: 'User performance tasks retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { type: 'string' },
                  tasks: { type: 'array', items: { type: 'object' } }
                }
              }
            }
          }
        }
      }
    }
  },

  '/api/performance/individual-goals/departments/{department}/performance-tasks': {
    get: {
      tags: ['📋 Task Management Integration'],
      summary: 'Get Department Performance Tasks',
      description: 'Get all performance tasks for a department',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'department',
          in: 'path',
          required: true,
          schema: { type: 'string', enum: ['Finance', 'Sales', 'Operations', 'Procurement', 'Human Resources', 'Marketing', 'Legal', 'IT'] },
          description: 'Department name'
        }
      ],
      responses: {
        200: {
          description: 'Department performance tasks retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { type: 'string' },
                  tasks: { type: 'array', items: { type: 'object' } }
                }
              }
            }
          }
        }
      }
    }
  },

  // ==========================================
  // HARDCODED KPIs (via existing KPI routes)
  // ==========================================

  '/api/performance/kpis': {
    get: {
      tags: ['📊 Hardcoded KPIs'],
      summary: 'Get All Hardcoded KPIs',
      description: 'Get all 25 hardcoded KPIs with accounting integration details',
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'Hardcoded KPIs retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { type: 'string' },
                  data: { type: 'array', items: { type: 'object' } },
                  total: { type: 'number' }
                }
              }
            }
          }
        }
      }
    }
  },

  '/api/performance/kpis/department/{department}': {
    get: {
      tags: ['📊 Hardcoded KPIs'],
      summary: 'Get KPIs by Department',
      description: 'Get all KPIs for a specific department',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'department',
          in: 'path',
          required: true,
          schema: { type: 'string', enum: ['Finance', 'Sales', 'Operations', 'Procurement', 'Human Resources', 'Marketing', 'Legal', 'IT'] },
          description: 'Department name'
        }
      ],
      responses: {
        200: {
          description: 'Department KPIs retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { type: 'string' },
                  data: { type: 'array', items: { type: 'object' } },
                  total: { type: 'number' },
                  department: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  },

  '/api/performance/kpis/code/{code}': {
    get: {
      tags: ['📊 Hardcoded KPIs'],
      summary: 'Get KPI by Code',
      description: 'Get a specific KPI by its code',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'code',
          in: 'path',
          required: true,
          schema: { type: 'string' },
          description: 'KPI code (e.g., TOTAL_REVENUE)'
        }
      ],
      responses: {
        200: {
          description: 'KPI retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { type: 'string' },
                  data: { type: 'object' }
                }
              }
            }
          }
        }
      }
    }
  },

  '/api/performance/kpis/financial': {
    get: {
      tags: ['📊 Hardcoded KPIs'],
      summary: 'Get Financial KPIs',
      description: 'Get all 22 financial KPIs that affect financial statements',
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'Financial KPIs retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { type: 'string' },
                  data: { type: 'array', items: { type: 'object' } },
                  total: { type: 'number' }
                }
              }
            }
          }
        }
      }
    }
  },

  '/api/performance/kpis/account-type/{accountType}': {
    get: {
      tags: ['📊 Hardcoded KPIs'],
      summary: 'Get KPIs by Account Type',
      description: 'Get KPIs filtered by chart of accounts account type',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'accountType',
          in: 'path',
          required: true,
          schema: { type: 'string', enum: ['Revenue', 'Expense', 'Asset', 'Liability', 'Equity'] },
          description: 'Chart of accounts account type'
        }
      ],
      responses: {
        200: {
          description: 'KPIs by account type retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { type: 'string' },
                  data: { type: 'array', items: { type: 'object' } },
                  total: { type: 'number' },
                  accountType: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  },

  '/api/performance/kpis/statistics': {
    get: {
      tags: ['📊 Hardcoded KPIs'],
      summary: 'Get KPI Statistics',
      description: 'Get comprehensive statistics about hardcoded KPIs',
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'KPI statistics retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { type: 'string' },
                  data: {
                    type: 'object',
                    properties: {
                      total: { type: 'number' },
                      financial: { type: 'number' },
                      nonFinancial: { type: 'number' },
                      byDepartment: { type: 'array', items: { type: 'object' } },
                      byAccountType: { type: 'array', items: { type: 'object' } }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  },

  // ==========================================
  // ACCOUNTING INTEGRATION
  // ==========================================

  '/api/accounting/journal-entries': {
    get: {
      tags: ['💰 Accounting Integration'],
      summary: 'Get Journal Entries from Performance KPIs',
      description: 'Get journal entries generated from performance KPI completions',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'performanceKPI',
          in: 'query',
          schema: { type: 'boolean' },
          description: 'Filter for performance KPI generated entries'
        },
        {
          name: 'dateFrom',
          in: 'query',
          schema: { type: 'string', format: 'date' },
          description: 'Start date filter'
        },
        {
          name: 'dateTo',
          in: 'query',
          schema: { type: 'string', format: 'date' },
          description: 'End date filter'
        }
      ],
      responses: {
        200: {
          description: 'Journal entries retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { type: 'string' },
                  data: { type: 'array', items: { type: 'object' } }
                }
              }
            }
          }
        }
      }
    }
  }
};
