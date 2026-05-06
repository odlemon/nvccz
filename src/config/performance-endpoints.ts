/**
 * Performance Module Swagger Endpoints Configuration
 * Based on Enhanced Performance Module Manual Breakdown Testing Guide
 * Organized by 5-Stage Workflow
 */

export const performanceEndpoints = {
  // ==========================================
  // STAGE 1: GOAL SETTING (Cascade)
  // ==========================================
  
  '/performance/goals': {
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
              required: ['title', 'type', 'targetValue', 'targetUnit'],
              properties: {
                title: { type: 'string', example: 'Achieve $5M Fund I AUM by Q4' },
                type: { type: 'string', enum: ['company'], example: 'company' },
                scorecardPillar: {
                  type: 'string',
                  description: 'Required for company goals (BSC pillar). Optional for other types; can be inherited from backing KPI.'
                },
                targetValue: { type: 'number', example: 5000000 },
                targetUnit: { type: 'string', example: 'USD' },
                kpiName: { 
                  type: 'string', 
                  example: 'Total Revenue',
                  description: 'KPI name to link to this goal (optional for financial goals)'
                },
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
          schema: { type: 'string', enum: ['Finance', 'Sales', 'Operations', 'Procurement', 'Human Resources', 'Marketing', 'Legal', 'IT', 'Investments'] },
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

  '/performance/goals/by-kpi/{kpiId}': {
    get: {
      tags: ['Performance Goals'],
      summary: 'Get performance goals for a KPI',
      description:
        'Returns all goals where `performance_goals.kpiId = kpiId` (same shape as GET /performance/goals).',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'kpiId',
          in: 'path',
          required: true,
          schema: { type: 'string' },
          description: 'KPI id (kpis.id)'
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
                  success: { type: 'boolean', example: true },
                  count: { type: 'number', example: 2 },
                  goals: { type: 'array', items: { type: 'object' } }
                }
              }
            }
          }
        },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' }
      }
    }
  },

  '/performance/breakdown/departments/available': {
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


  '/performance/breakdown/departments': {
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
                  items: { type: 'string', enum: ['Finance', 'Sales', 'Operations', 'Procurement', 'Human Resources', 'Marketing', 'Legal', 'IT', 'Investments'] },
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

  '/performance/breakdown/users/{department}': {
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
          schema: { type: 'string', enum: ['Finance', 'Sales', 'Operations', 'Procurement', 'Human Resources', 'Marketing', 'Legal', 'IT', 'Investments'] },
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

  '/performance/breakdown/individuals': {
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

  '/performance/goal-tracking/check-all-due-goals': {
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

  '/performance/goal-tracking/stats': {
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

  '/performance/goals/{goalId}': {
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


  // ==========================================
  // STAGE 4: PERFORMANCE REVIEW
  // ==========================================
  //
  // NOTE: Review cycles + independent evaluation endpoints are documented under
  // `Reviews UAT (Review cycles & independent evaluation)` (see
  // `reviews-uat-review-cycles-independent-eval-endpoints.ts`).
  // We intentionally do not duplicate them here to avoid Swagger showing
  // multiple “review cycle” endpoint groups.

  // ==========================================
  // STAGE 5: DATA SYNCHRONIZATION (ETL)
  // ==========================================

  '/performance/enhanced-etl/run-pipeline': {
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

  '/performance/enhanced-etl/metrics': {
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


  '/performance/individual-goals/users/{userId}/performance-tasks': {
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

  '/performance/individual-goals/departments/{department}/performance-tasks': {
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
          schema: { type: 'string', enum: ['Finance', 'Sales', 'Operations', 'Procurement', 'Human Resources', 'Marketing', 'Legal', 'IT', 'Investments'] },
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

  '/tasks/my': {
    get: {
      tags: ['📋 Task Management Integration'],
      summary: 'Get My Tasks',
      description: 'Get all tasks assigned to the current user with filtering options',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'stage',
          in: 'query',
          schema: { type: 'string', enum: ['todo', 'in_progress', 'completed', 'overdue'] },
          description: 'Filter by task stage'
        },
        {
          name: 'priority',
          in: 'query',
          schema: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
          description: 'Filter by task priority'
        },
        {
          name: 'department',
          in: 'query',
          schema: { type: 'string' },
          description: 'Filter by department'
        },
        {
          name: 'performanceCategory',
          in: 'query',
          schema: { type: 'string', enum: ['business', 'performance', 'operational'] },
          description: 'Filter by performance category'
        },
        {
          name: 'isPerformanceTask',
          in: 'query',
          schema: { type: 'boolean' },
          description: 'Filter by performance task flag'
        },
        {
          name: 'goalId',
          in: 'query',
          schema: { type: 'string' },
          description: 'Filter by performance goal ID'
        },
        {
          name: 'isOverdue',
          in: 'query',
          schema: { type: 'boolean' },
          description: 'Filter by overdue status'
        },
        {
          name: 'search',
          in: 'query',
          schema: { type: 'string' },
          description: 'Search in title, stage, and priority'
        }
      ],
      responses: {
        200: {
          description: 'User tasks retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Your tasks retrieved successfully' },
                  count: { type: 'number', example: 5 },
                  tasks: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        title: { type: 'string' },
                        description: { type: 'string' },
                        stage: { type: 'string', enum: ['todo', 'in_progress', 'completed', 'overdue'] },
                        priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
                        isOverdue: { type: 'boolean' },
                        targetValue: { type: 'string' },
                        targetUnit: { type: 'string' },
                        currentValue: { type: 'string' },
                        goal: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            title: { type: 'string' },
                            type: { type: 'string' },
                            scorecardPillar: { type: 'string' },
                            parentGoal: {
                              type: 'object',
                              properties: {
                                id: { type: 'string' },
                                title: { type: 'string' },
                                parentGoal: {
                                  type: 'object',
                                  properties: {
                                    id: { type: 'string' },
                                    title: { type: 'string' }
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
            }
          }
        },
        401: {
          description: 'Unauthorized'
        },
        400: {
          description: 'Bad request'
        }
      }
    }
  },

  // ==========================================
  // ACTIVITY MANAGEMENT (Task & Goal Progress Tracking)
  // ==========================================

  '/activities': {
    post: {
      tags: ['📋 Task Management Integration'],
      summary: 'Create Activity - Track Progress on Task or Goal',
      description: `**Who uses this:** All users (individuals and managers)\n\n**What it does:** Create an activity to track progress on a task or departmental goal. Automatically updates task/goal stage based on value collected vs target.\n\n**For Individual Tasks:** Use type='task' - Updates task progress and automatically marks task as 'completed' if valueCollected >= target. Goal is automatically found from the task.\n\n**For Department Goals:** Use type='goal' - Updates goal progress and automatically updates stage based on currentValue vs targetValue.\n\n**Example Request Body:**\n\`\`\`json\n{\n  "title": "Completed client meeting",\n  "description": "Met with 3 potential clients to discuss investment opportunities",\n  "activityType": "task",\n  "taskId": "cmhbzxtvo0003jm04lt2q8htu",\n  "valueCollected": 50000\n}\n\`\`\``,
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['title', 'activityType'],
              properties: {
                title: {
                  type: 'string',
                  example: 'Completed client meeting',
                  description: 'Title of the activity'
                },
                description: {
                  type: 'string',
                  example: 'Met with 3 potential clients to discuss investment opportunities',
                  description: 'Detailed description of what was accomplished'
                },
                activityType: {
                  type: 'string',
                  enum: ['task', 'goal'],
                  example: 'task',
                  description: "'task' for individual task updates, 'goal' for departmental goal updates"
                },
                taskId: {
                  type: 'string',
                  example: 'cmhbzxtvo0003jm04lt2q8htu',
                  description: "Required if activityType is 'task' - The ID of the task being updated. Goal will be automatically found from the task."
                },
                goalId: {
                  type: 'string',
                  example: 'cmhbzxqxz0001jm04vgtxkmvx',
                  description: "Required if activityType is 'goal' - The ID of the departmental goal being updated"
                },
                valueCollected: {
                  type: 'number',
                  example: 50000,
                  description: 'Value collected/achieved in this activity (e.g., $50,000 in revenue). Used to automatically update progress and stage.'
                }
              }
            }
          }
        }
      },
      responses: {
        201: {
          description: 'Activity created successfully. Task/goal stage automatically updated if target is met.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Activity created successfully' },
                  data: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      title: { type: 'string' },
                      description: { type: 'string' },
                      activityType: { type: 'string' },
                      monetaryValueAchieved: { type: 'string' },
                      createdAt: { type: 'string', format: 'date-time' },
                      user: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          firstName: { type: 'string' },
                          lastName: { type: 'string' },
                          email: { type: 'string' }
                        }
                      },
                      task: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          title: { type: 'string' },
                          stage: { type: 'string', description: 'Automatically updated if valueCollected >= target' }
                        }
                      },
                      goal: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          title: { type: 'string' },
                          currentValue: { type: 'string' },
                          stage: { type: 'string', description: 'Automatically updated based on progress' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        400: {
          description: 'Bad request - validation error (missing required fields or incorrect activityType)'
        },
        401: {
          description: 'Unauthorized'
        },
        500: {
          description: 'Internal server error'
        }
      }
    }
  },

  '/activities/task/{taskId}': {
    get: {
      tags: ['📋 Task Management Integration'],
      summary: 'Get Task Activities - View Progress History',
      description: `**Who uses this:** All users (individuals and managers)\n\n**What it does:** Retrieve all activities/progress updates associated with a specific task. Shows the complete history of progress tracking for a task.`,
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'taskId',
          in: 'path',
          required: true,
          schema: { type: 'string' },
          description: 'Task ID to get activities for'
        }
      ],
      responses: {
        200: {
          description: 'Task activities retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Task activities retrieved successfully' },
                  data: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        title: { type: 'string' },
                        description: { type: 'string' },
                        activityType: { type: 'string', example: 'task_completion' },
                        monetaryValueAchieved: { type: 'string' },
                        createdAt: { type: 'string', format: 'date-time' },
                        user: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            firstName: { type: 'string' },
                            lastName: { type: 'string' },
                            email: { type: 'string' }
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
        400: {
          description: 'Bad request - taskId is required'
        },
        401: {
          description: 'Unauthorized'
        },
        500: {
          description: 'Internal server error'
        }
      }
    }
  },

  '/activities/goal/{goalId}': {
    get: {
      tags: ['📋 Task Management Integration'],
      summary: 'Get Goal Activities - View Progress History',
      description: `**Who uses this:** Department managers, officers, and admins\n\n**What it does:** Retrieve all activities/progress updates associated with a specific departmental goal. Shows the complete history of progress tracking for a goal.`,
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'goalId',
          in: 'path',
          required: true,
          schema: { type: 'string' },
          description: 'Goal ID to get activities for'
        }
      ],
      responses: {
        200: {
          description: 'Goal activities retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Goal activities retrieved successfully' },
                  data: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        title: { type: 'string' },
                        description: { type: 'string' },
                        activityType: { type: 'string', example: 'goal_update' },
                        monetaryValueAchieved: { type: 'string' },
                        createdAt: { type: 'string', format: 'date-time' },
                        user: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            firstName: { type: 'string' },
                            lastName: { type: 'string' },
                            email: { type: 'string' }
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
        400: {
          description: 'Bad request - goalId is required'
        },
        401: {
          description: 'Unauthorized'
        },
        500: {
          description: 'Internal server error'
        }
      }
    }
  },

  '/activities/department/{department}/goals': {
    get: {
      tags: ['📋 Task Management Integration'],
      summary: 'Get Department Goals - For Managers and Officers',
      description: `**Who uses this:** Department managers (_MGR role code), officers (_OFF role code), and admins\n\n**What it does:** Retrieve all departmental goals for a specific department. Only users who are managers or officers in that department can access this endpoint.\n\n**Authorization:** User must be in the same department AND have role code ending in '_MGR' (Manager) or '_OFF' (Officer), or be an admin.`,
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'department',
          in: 'path',
          required: true,
          schema: {
            type: 'string',
            enum: ['Finance', 'Sales', 'Operations', 'Procurement', 'Human Resources', 'Marketing', 'Legal', 'IT', 'Investments']
          },
          description: 'Department name (must match your assigned department)'
        }
      ],
      responses: {
        200: {
          description: 'Department goals retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Department goals retrieved successfully' },
                  data: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        title: { type: 'string' },
                        description: { type: 'string' },
                        type: { type: 'string', example: 'department' },
                        scorecardPillar: { type: 'string' },
                        targetValue: { type: 'string' },
                        currentValue: { type: 'string' },
                        stage: { type: 'string' },
                        departmentName: { type: 'string' },
                        createdBy: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            firstName: { type: 'string' },
                            lastName: { type: 'string' },
                            email: { type: 'string' }
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
        400: {
          description: 'Bad request - department name is required'
        },
        401: {
          description: 'Unauthorized'
        },
        403: {
          description: 'Forbidden - You do not have permission to view this department\'s goals. Only department managers, officers, or admins can access this.'
        },
        500: {
          description: 'Internal server error'
        }
      }
    }
  },

  '/activities/manager/tasks': {
    get: {
      tags: ['📋 Task Management Integration'],
      summary: 'Get Manager Created Tasks - View Tasks You Created',
      description: `**Who uses this:** Department managers (_MGR role code), officers (_OFF role code), and admins\n\n**What it does:** Retrieve all performance tasks that you created for your department. Shows tasks you assigned to individuals in your department during goal breakdown.\n\n**Authorization:** User must have role code ending in '_MGR' (Manager) or '_OFF' (Officer), or be an admin.`,
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'Manager created tasks retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Manager created tasks retrieved successfully' },
                  data: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        title: { type: 'string' },
                        description: { type: 'string' },
                        stage: { type: 'string' },
                        priority: { type: 'string' },
                        department: { type: 'string' },
                        isPerformanceTask: { type: 'boolean', example: true },
                        monetaryValue: { type: 'string' },
                        monetaryValueAchieved: { type: 'string' },
                        goal: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            title: { type: 'string' },
                            type: { type: 'string' },
                            scorecardPillar: { type: 'string' }
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
        401: {
          description: 'Unauthorized'
        },
        403: {
          description: 'Forbidden - You do not have permission to view created tasks. Only department managers, officers, or admins can access this.'
        },
        500: {
          description: 'Internal server error'
        }
      }
    }
  },

  // ==========================================
  // HARDCODED KPIs (via existing KPI routes)
  // ==========================================

  '/performance/kpis': {
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

  '/performance/kpis/department/{department}': {
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
          schema: { type: 'string', enum: ['Finance', 'Sales', 'Operations', 'Procurement', 'Human Resources', 'Marketing', 'Legal', 'IT', 'Investments'] },
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

  '/performance/kpis/code/{code}': {
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

  '/performance/kpis/financial': {
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

  '/performance/kpis/account-type/{accountType}': {
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

  '/performance/kpis/statistics': {
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

  '/accounting/journal-entries': {
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
  },

  // ==========================================
  // 📈 ROLL-UP CALCULATIONS
  // ==========================================

  '/performance/rollup/{goalId}': {
    get: {
      tags: ['📈 Roll-up Calculations'],
      summary: 'Get Goal with Roll-up Data',
      description: 'Retrieve goal details with comprehensive roll-up calculations from all child goals',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'goalId',
          in: 'path',
          required: true,
          schema: { type: 'string' },
          description: 'Goal ID to get roll-up data for'
        }
      ],
      responses: {
        200: {
          description: 'Goal roll-up data retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Goal roll-up data retrieved successfully' },
                  data: {
                    type: 'object',
                    properties: {
                      goal: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          title: { type: 'string' },
                          type: { type: 'string' },
                          scorecardPillar: { type: 'string' },
                          targetValue: { type: 'string' },
                          currentValue: { type: 'string' },
                          progressPercentage: { type: 'string' },
                          stage: { type: 'string' },
                          kpi: { type: 'object' }
                        }
                      },
                      rollup: {
                        type: 'object',
                        properties: {
                          totalSubGoals: { type: 'number' },
                          completedSubGoals: { type: 'number' },
                          inProgressSubGoals: { type: 'number' },
                          notStartedSubGoals: { type: 'number' },
                          totalTargetValue: { type: 'number' },
                          totalCurrentValue: { type: 'number' },
                          overallProgressPercentage: { type: 'string' },
                          departmentBreakdown: { type: 'array', items: { type: 'object' } },
                          individualBreakdown: { type: 'array', items: { type: 'object' } }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        400: { description: 'Bad request - goalId is required' },
        401: { description: 'Unauthorized' },
        500: { description: 'Internal server error' }
      }
    }
  },

  '/performance/rollup/{goalId}/recalculate': {
    post: {
      tags: ['📈 Roll-up Calculations'],
      summary: 'Recalculate All Roll-up Data',
      description: 'Recalculate roll-up data for a goal hierarchy from bottom up',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'goalId',
          in: 'path',
          required: true,
          schema: { type: 'string' },
          description: 'Goal ID to recalculate roll-up data for'
        }
      ],
      responses: {
        200: {
          description: 'Roll-up data recalculated successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Roll-up data recalculated successfully' },
                  data: { type: 'object' }
                }
              }
            }
          }
        },
        400: { description: 'Bad request - goalId is required' },
        401: { description: 'Unauthorized' },
        500: { description: 'Internal server error' }
      }
    }
  },

  // ==========================================
  // 📊 PERFORMANCE SCORECARDS
  // ==========================================

  '/performance/scorecards/user': {
    get: {
      tags: ['📊 Performance Scorecards'],
      summary: 'Get User Performance Scorecard',
      description: 'Retrieve comprehensive performance scorecard for the current user including goals, tasks, and metrics',
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'User scorecard retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'User scorecard retrieved successfully' },
                  data: {
                    type: 'object',
                    properties: {
                      user: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          name: { type: 'string' },
                          email: { type: 'string' },
                          department: { type: 'string' },
                          role: { type: 'string' },
                          roleCode: { type: 'string' }
                        }
                      },
                      goals: { type: 'array', items: { type: 'object' } },
                      tasks: { type: 'array', items: { type: 'object' } },
                      metrics: {
                        type: 'object',
                        properties: {
                          goals: {
                            type: 'object',
                            properties: {
                              total: { type: 'number' },
                              completed: { type: 'number' },
                              inProgress: { type: 'number' },
                              notStarted: { type: 'number' },
                              completionRate: { type: 'string' }
                            }
                          },
                          tasks: {
                            type: 'object',
                            properties: {
                              total: { type: 'number' },
                              completed: { type: 'number' },
                              overdue: { type: 'number' },
                              completionRate: { type: 'string' }
                            }
                          },
                          progress: {
                            type: 'object',
                            properties: {
                              totalTargetValue: { type: 'number' },
                              totalCurrentValue: { type: 'number' },
                              progressPercentage: { type: 'string' }
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
        401: { description: 'Unauthorized' },
        500: { description: 'Internal server error' }
      }
    }
  },

  '/performance/scorecards/department/{department}': {
    get: {
      tags: ['📊 Performance Scorecards'],
      summary: 'Get Department Performance Scorecard',
      description: 'Retrieve comprehensive performance scorecard for a specific department including goals, users, and metrics',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'department',
          in: 'path',
          required: true,
          schema: { type: 'string', enum: ['Finance', 'Sales', 'Operations', 'Procurement', 'Human Resources', 'Marketing', 'Legal', 'IT', 'Investments'] },
          description: 'Department name'
        }
      ],
      responses: {
        200: {
          description: 'Department scorecard retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Department scorecard retrieved successfully' },
                  data: {
                    type: 'object',
                    properties: {
                      department: { type: 'string' },
                      goals: { type: 'array', items: { type: 'object' } },
                      users: { type: 'array', items: { type: 'object' } },
                      metrics: {
                        type: 'object',
                        properties: {
                          goals: {
                            type: 'object',
                            properties: {
                              total: { type: 'number' },
                              completed: { type: 'number' },
                              inProgress: { type: 'number' },
                              completionRate: { type: 'string' }
                            }
                          },
                          individualGoals: {
                            type: 'object',
                            properties: {
                              total: { type: 'number' },
                              completed: { type: 'number' },
                              completionRate: { type: 'string' }
                            }
                          },
                          users: {
                            type: 'object',
                            properties: {
                              total: { type: 'number' },
                              managers: { type: 'number' },
                              officers: { type: 'number' },
                              members: { type: 'number' }
                            }
                          },
                          progress: {
                            type: 'object',
                            properties: {
                              totalTargetValue: { type: 'number' },
                              totalCurrentValue: { type: 'number' },
                              progressPercentage: { type: 'string' }
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
        400: { description: 'Bad request - department name is required' },
        401: { description: 'Unauthorized' },
        500: { description: 'Internal server error' }
      }
    }
  },

  // ==========================================
  // 📊 PERFORMANCE ANALYTICS
  // ==========================================

  '/performance/analytics/kpi': {
    get: {
      tags: ['📊 Performance Analytics'],
      summary: 'Get KPI Performance Analysis',
      description: 'Analyze KPI performance across goals with detailed metrics and trends',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'kpiId',
          in: 'query',
          schema: { type: 'string' },
          description: 'Filter by specific KPI ID'
        },
        {
          name: 'department',
          in: 'query',
          schema: { type: 'string', enum: ['Finance', 'Sales', 'Operations', 'Procurement', 'Human Resources', 'Marketing', 'Legal', 'IT', 'Investments'] },
          description: 'Filter by department'
        },
        {
          name: 'startDate',
          in: 'query',
          schema: { type: 'string', format: 'date' },
          description: 'Start date for analysis period'
        },
        {
          name: 'endDate',
          in: 'query',
          schema: { type: 'string', format: 'date' },
          description: 'End date for analysis period'
        },
        {
          name: 'currencyId',
          in: 'query',
          schema: { type: 'string' },
          description: 'Currency ID for filtering accounting data (required for accurate KPI values matching accounting module)'
        }
      ],
      responses: {
        200: {
          description: 'KPI analysis retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'KPI analysis retrieved successfully' },
                  data: {
                    type: 'object',
                    properties: {
                      kpiAnalytics: { type: 'array', items: { type: 'object' } },
                      summary: {
                        type: 'object',
                        properties: {
                          totalKPIs: { type: 'number' },
                          totalGoals: { type: 'number' },
                          averageProgress: { type: 'string' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        401: { description: 'Unauthorized' },
        500: { description: 'Internal server error' }
      }
    }
  },

  '/performance/analytics/dashboard': {
    get: {
      tags: ['📊 Performance Analytics'],
      summary: 'Get Performance Dashboard Data',
      description: 'Retrieve comprehensive performance dashboard with key metrics and overview',
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'Performance dashboard retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Performance dashboard retrieved successfully' },
                  data: {
                    type: 'object',
                    properties: {
                      overview: {
                        type: 'object',
                        properties: {
                          totalCompanyGoals: { type: 'number' },
                          totalDepartments: { type: 'number' },
                          totalUsers: { type: 'number' },
                          totalTasks: { type: 'number' },
                          completedTasks: { type: 'number' },
                          overallProgress: { type: 'string' }
                        }
                      },
                      companyGoals: { type: 'array', items: { type: 'object' } },
                      departmentBreakdown: { type: 'array', items: { type: 'object' } },
                      userBreakdown: { type: 'array', items: { type: 'object' } },
                      taskBreakdown: { type: 'array', items: { type: 'object' } }
                    }
                  }
                }
              }
            }
          }
        },
        401: { description: 'Unauthorized' },
        500: { description: 'Internal server error' }
      }
    }
  },

  '/performance/analytics/reports': {
    get: {
      tags: ['📊 Performance Analytics'],
      summary: 'Get Goal Progress Reports',
      description: 'Generate comprehensive goal progress reports with filtering options',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'type',
          in: 'query',
          schema: { type: 'string', enum: ['company', 'department', 'individual'] },
          description: 'Filter by goal type'
        },
        {
          name: 'department',
          in: 'query',
          schema: { type: 'string', enum: ['Finance', 'Sales', 'Operations', 'Procurement', 'Human Resources', 'Marketing', 'Legal', 'IT', 'Investments'] },
          description: 'Filter by department'
        },
        {
          name: 'stage',
          in: 'query',
          schema: { type: 'string', enum: ['planning', 'in_progress', 'completed'] },
          description: 'Filter by goal stage'
        },
        {
          name: 'startDate',
          in: 'query',
          schema: { type: 'string', format: 'date' },
          description: 'Start date for report period'
        },
        {
          name: 'endDate',
          in: 'query',
          schema: { type: 'string', format: 'date' },
          description: 'End date for report period'
        }
      ],
      responses: {
        200: {
          description: 'Goal progress reports retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Goal progress reports retrieved successfully' },
                  data: {
                    type: 'object',
                    properties: {
                      reports: { type: 'array', items: { type: 'object' } },
                      summary: {
                        type: 'object',
                        properties: {
                          total: { type: 'number' },
                          completed: { type: 'number' },
                          inProgress: { type: 'number' },
                          planning: { type: 'number' },
                          averageProgress: { type: 'string' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        401: { description: 'Unauthorized' },
        500: { description: 'Internal server error' }
      }
    }
  },

  '/performance/analytics/departments/comparison': {
    get: {
      tags: ['📊 Performance Analytics'],
      summary: 'Get Department Performance Comparison',
      description: 'Compare performance metrics across all departments',
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'Department comparison retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Department comparison retrieved successfully' },
                  data: {
                    type: 'object',
                    properties: {
                      departments: { type: 'array', items: { type: 'object' } },
                      summary: {
                        type: 'object',
                        properties: {
                          totalDepartments: { type: 'number' },
                          averageProgress: { type: 'string' },
                          bestPerformingDepartment: { type: 'object' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        401: { description: 'Unauthorized' },
        500: { description: 'Internal server error' }
      }
    }
  },

  // ==========================================
  // APPLICANT PORTAL ENDPOINTS
  // ==========================================

  '/applications': {
    post: {
      tags: ['🏢 Portfolio Management', 'Updated investment flow'],
      summary: 'Create a new investment application (PUBLIC)',
      description: 'Create a new investment application with document uploads. Files are automatically uploaded to Firebase Storage. No authentication required.',
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['applicantName', 'applicantEmail', 'businessName', 'requestedAmount', 'files'],
              properties: {
                applicantName: { type: 'string', example: 'John Doe', description: 'Full name of the applicant' },
                applicantEmail: { type: 'string', format: 'email', example: 'john.doe@example.com', description: 'Email address of the applicant' },
                applicantPhone: { type: 'string', example: '+1234567890', description: 'Phone number of the applicant' },
                applicantAddress: { type: 'string', example: '123 Main Street, City, Country', description: 'Address of the applicant' },
                businessName: { type: 'string', example: 'TechStart Inc.', description: 'Name of the business' },
                businessDescription: { type: 'string', example: 'A technology startup focused on AI solutions', description: 'Description of the business' },
                industry: { type: 'string', example: 'Technology', description: 'Industry sector' },
                businessStage: { type: 'string', enum: ['IDEA', 'STARTUP', 'OPERATIONAL'], example: 'STARTUP', description: 'Current stage of the business' },
                foundingDate: { type: 'string', format: 'date', example: '2023-01-15', description: 'Date when the business was founded' },
                requestedAmount: { type: 'string', example: '75000', description: 'Amount of investment requested' },
                fundId: { type: 'string', example: 'clx1234567890abcdef', description: 'ID of the fund (optional)' },
                documentTypes: { 
                  type: 'string', 
                  example: '["BUSINESS_PLAN", "PROOF_OF_CONCEPT", "MARKET_RESEARCH", "PROJECTED_CASH_FLOWS"]',
                  description: 'Optional JSON array of document types. Must contain exactly 4 document types (one for each file uploaded). Valid document types: BUSINESS_PLAN (required - comprehensive business strategy document), PROOF_OF_CONCEPT (required - working prototype or demo evidence), MARKET_RESEARCH (required - industry analysis and market size study), PROJECTED_CASH_FLOWS (required - financial projections for 3-5 years), HISTORICAL_FINANCIALS (optional - past financial performance if available). The array order must match the order of files uploaded. If not provided, types will be auto-detected from filenames. Example format: ["BUSINESS_PLAN", "PROOF_OF_CONCEPT", "MARKET_RESEARCH", "PROJECTED_CASH_FLOWS"]'
                },
                files: {
                  type: 'array',
                  items: {
                    type: 'string',
                    format: 'binary'
                  },
                  description: 'Document files to upload. Required: 4 files minimum (BUSINESS_PLAN, PROOF_OF_CONCEPT, MARKET_RESEARCH, PROJECTED_CASH_FLOWS). Supported formats: PDF, DOCX, XLSX, images (JPG, JPEG, PNG). Maximum file size: 50MB per file. Files must be uploaded in the same order as documentTypes array if provided. Example: Upload 4 PDF files representing your business plan, proof of concept, market research, and projected cash flows.'
                }
              }
            }
          }
        }
      },
      responses: {
        201: { description: 'Application created successfully' },
        400: { description: 'Bad request - validation error' },
        500: { description: 'Internal server error' }
      }
    }
  },

  '/applicant/profile': {
    get: {
      tags: ['🏢 Portfolio Management'],
      summary: 'Get applicant profile',
      description: 'Retrieve the profile information of the authenticated applicant',
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'Profile retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Profile retrieved successfully' },
                  data: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', example: 'cmhbqqk430001l204f71u6t2w' },
                      firstName: { type: 'string', example: 'John' },
                      lastName: { type: 'string', example: 'Doe' },
                      email: { type: 'string', example: 'john.doe@example.com' },
                      userDepartment: { type: 'string', example: 'Finance' },
                      roleCode: { type: 'string', example: 'APPLICANT' },
                      createdAt: { type: 'string', format: 'date-time' },
                      updatedAt: { type: 'string', format: 'date-time' }
                    }
                  }
                }
              }
            }
          }
        },
        401: { description: 'Unauthorized' },
        404: { description: 'User not found' }
      }
    },
    put: {
      tags: ['🏢 Portfolio Management'],
      summary: 'Update applicant profile',
      description: 'Update the profile information of the authenticated applicant',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                firstName: { type: 'string', example: 'John' },
                lastName: { type: 'string', example: 'Doe' },
                email: { type: 'string', format: 'email', example: 'john.doe@example.com' }
              }
            }
          }
        }
      },
      responses: {
        200: {
          description: 'Profile updated successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Profile updated successfully' },
                  data: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      firstName: { type: 'string' },
                      lastName: { type: 'string' },
                      email: { type: 'string' },
                      userDepartment: { type: 'string' },
                      roleCode: { type: 'string' },
                      updatedAt: { type: 'string', format: 'date-time' }
                    }
                  }
                }
              }
            }
          }
        },
        401: { description: 'Unauthorized' },
        404: { description: 'User not found' }
      }
    }
  },

  '/applicant/application': {
    get: {
      tags: ['🏢 Portfolio Management'],
      summary: 'Get applicant\'s application details',
      description: 'Retrieve the application details of the authenticated applicant',
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'Application retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Application retrieved successfully' },
                  data: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', example: 'cmhcqiww30009l804sj0rjt2k' },
                      businessName: { type: 'string', example: 'Tech Startup Ltd' },
                      applicantName: { type: 'string', example: 'John Doe' },
                      applicantEmail: { type: 'string', example: 'john.doe@example.com' },
                      currentStage: { 
                        type: 'string', 
                        enum: ['SUBMITTED', 'UNDER_REVIEW', 'DUE_DILIGENCE', 'BOARD_REVIEW', 'TERM_SHEET', 'APPROVED', 'REJECTED'],
                        example: 'UNDER_REVIEW' 
                      },
                      submittedAt: { type: 'string', format: 'date-time' },
                      requestedAmount: { type: 'number', example: 500000 },
                      industry: { type: 'string', example: 'Technology' },
                      businessStage: { type: 'string', example: 'Early Stage' },
                      fund: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          name: { type: 'string' },
                          description: { type: 'string' }
                        }
                      },
                      documents: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            documentType: { type: 'string' },
                            fileName: { type: 'string' },
                            fileUrl: { type: 'string' },
                            isRequired: { type: 'boolean' },
                            isSubmitted: { type: 'boolean' },
                            uploadedAt: { type: 'string', format: 'date-time' }
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
        401: { description: 'Unauthorized' },
        404: { description: 'No application found for this user' }
      }
    }
  },

  '/applicant/application/timeline': {
    get: {
      tags: ['🏢 Portfolio Management'],
      summary: 'Get application timeline',
      description: 'Retrieve the timeline of events for the applicant\'s application',
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'Application timeline retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Application timeline retrieved successfully' },
                  data: {
                    type: 'object',
                    properties: {
                      applicationId: { type: 'string' },
                      currentStage: { type: 'string' },
                      timeline: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            event: { type: 'string', example: 'Application Submitted' },
                            date: { type: 'string', format: 'date-time' },
                            status: { type: 'string', enum: ['completed', 'in_progress', 'pending'], example: 'completed' },
                            description: { type: 'string', example: 'Your application was successfully submitted for review' }
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
        401: { description: 'Unauthorized' },
        404: { description: 'No application found for this user' }
      }
    }
  },

  '/applicant/company': {
    get: {
      tags: ['🏢 Portfolio Management'],
      summary: 'Get applicant\'s portfolio company',
      description: 'Retrieve the portfolio company details of the authenticated applicant (if approved)',
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'Company retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Company retrieved successfully' },
                  data: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', example: 'cmhcqiww30009l804sj0rjt2k' },
                      name: { type: 'string', example: 'Tech Startup Ltd' },
                      industry: { type: 'string', example: 'Technology' },
                      status: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'EXITED'], example: 'ACTIVE' },
                      foundingDate: { type: 'string', format: 'date' },
                      address: { type: 'string' },
                      website: { type: 'string' },
                      description: { type: 'string' },
                      logoUrl: { type: 'string' },
                      companySize: { type: 'string' },
                      employeeCount: { type: 'number' },
                      annualRevenue: { type: 'number' },
                      fundingStage: { type: 'string' },
                      contactPerson: { type: 'string' },
                      contactPhone: { type: 'string' },
                      contactEmail: { type: 'string' },
                      socialMedia: { type: 'object' },
                      fund: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          name: { type: 'string' },
                          description: { type: 'string' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        401: { description: 'Unauthorized' },
        404: { description: 'No portfolio company found for this user' }
      }
    },
    put: {
      tags: ['🏢 Portfolio Management'],
      summary: 'Update applicant\'s portfolio company',
      description: 'Update the portfolio company details of the authenticated applicant',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string', example: 'Tech Startup Ltd' },
                industry: { type: 'string', example: 'Technology' },
                foundingDate: { type: 'string', format: 'date' },
                address: { type: 'string' },
                website: { type: 'string' },
                description: { type: 'string' },
                logoUrl: { type: 'string' },
                companySize: { type: 'string' },
                employeeCount: { type: 'number' },
                annualRevenue: { type: 'number' },
                fundingStage: { type: 'string' },
                contactPerson: { type: 'string' },
                contactPhone: { type: 'string' },
                contactEmail: { type: 'string' },
                socialMedia: { type: 'object' }
              }
            }
          }
        }
      },
      responses: {
        200: {
          description: 'Company updated successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Company updated successfully' },
                  data: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                      industry: { type: 'string' },
                      status: { type: 'string' },
                      updatedAt: { type: 'string', format: 'date-time' }
                    }
                  }
                }
              }
            }
          }
        },
        401: { description: 'Unauthorized' },
        404: { description: 'No portfolio company found for this user' }
      }
    }
  },

  '/applicant/dashboard': {
    get: {
      tags: ['🏢 Portfolio Management'],
      summary: 'Get applicant dashboard',
      description: 'Retrieve the dashboard summary for the authenticated applicant',
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'Dashboard retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Dashboard retrieved successfully' },
                  data: {
                    type: 'object',
                    properties: {
                      application: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          currentStage: { type: 'string' },
                          submittedAt: { type: 'string', format: 'date-time' },
                          businessName: { type: 'string' },
                          requestedAmount: { type: 'number' },
                          industry: { type: 'string' },
                          businessStage: { type: 'string' }
                        }
                      },
                      portfolioCompany: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          name: { type: 'string' },
                          status: { type: 'string' },
                          industry: { type: 'string' },
                          fundingStage: { type: 'string' }
                        }
                      },
                      recentActivities: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            notificationType: { type: 'string' },
                            title: { type: 'string' },
                            message: { type: 'string' },
                            createdAt: { type: 'string', format: 'date-time' }
                          }
                        }
                      },
                      summary: {
                        type: 'object',
                        properties: {
                          hasApplication: { type: 'boolean' },
                          hasPortfolioCompany: { type: 'boolean' },
                          applicationStage: { type: 'string' },
                          companyStatus: { type: 'string' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        401: { description: 'Unauthorized' },
        404: { description: 'User not found' }
      }
    }
  },

  '/applicant/investment': {
    get: {
      tags: ['🏢 Portfolio Management'],
      summary: 'Get investment details',
      description: 'Retrieve the investment details for the authenticated applicant (if approved)',
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'Investment details retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Investment details retrieved successfully' },
                  data: {
                    type: 'object',
                    properties: {
                      portfolioCompany: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          name: { type: 'string' },
                          industry: { type: 'string' },
                          status: { type: 'string' }
                        }
                      },
                      termSheet: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          status: { type: 'string' },
                          isSigned: { type: 'boolean' },
                          signedAt: { type: 'string', format: 'date-time' },
                          investmentAmount: { type: 'number' },
                          createdBy: {
                            type: 'object',
                            properties: {
                              id: { type: 'string' },
                              firstName: { type: 'string' },
                              lastName: { type: 'string' },
                              email: { type: 'string' }
                            }
                          }
                        }
                      },
                      investment: {
                        type: 'object',
                        properties: {
                          fund: { type: 'object' },
                          startDate: { type: 'string', format: 'date' },
                          endDate: { type: 'string', format: 'date' },
                          capTable: { type: 'object' },
                          financialKpis: { type: 'object' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        401: { description: 'Unauthorized' },
        404: { description: 'No portfolio company found for this user' }
      }
    }
  },

  '/applicant/valuations': {
    get: {
      tags: ['🏢 Portfolio Management'],
      summary: 'Get portfolio valuations',
      description: 'Retrieve the portfolio valuations for the authenticated applicant (if approved)',
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'Portfolio valuations retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Portfolio valuations retrieved successfully' },
                  data: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        valuationDate: { type: 'string', format: 'date' },
                        valuationAmount: { type: 'number' },
                        valuationMethod: { type: 'string' },
                        status: { type: 'string' },
                        assignedTo: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            firstName: { type: 'string' },
                            lastName: { type: 'string' },
                            email: { type: 'string' }
                          }
                        },
                        valuationActivities: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              id: { type: 'string' },
                              activityType: { type: 'string' },
                              title: { type: 'string' },
                              description: { type: 'string' },
                              createdAt: { type: 'string', format: 'date-time' }
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
        401: { description: 'Unauthorized' },
        404: { description: 'No portfolio company found for this user' }
      }
    }
  },

  '/applicant/reports': {
    get: {
      tags: ['🏢 Portfolio Management'],
      summary: 'Get performance reports',
      description: 'Retrieve the performance reports for the authenticated applicant (if approved)',
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'Performance reports retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Performance reports retrieved successfully' },
                  data: {
                    type: 'object',
                    properties: {
                      portfolioCompany: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          name: { type: 'string' },
                          industry: { type: 'string' }
                        }
                      },
                      reports: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            title: { type: 'string', example: 'Q1 2025 Performance Report' },
                            type: { type: 'string', enum: ['quarterly', 'annual', 'monthly'], example: 'quarterly' },
                            period: { type: 'string', example: 'Q1 2025' },
                            status: { type: 'string', enum: ['completed', 'in_progress', 'pending'], example: 'completed' },
                            generatedAt: { type: 'string', format: 'date-time' },
                            downloadUrl: { type: 'string', example: '#' }
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
        401: { description: 'Unauthorized' },
        404: { description: 'No portfolio company found for this user' }
      }
    }
  },

  // ==========================================
  // APPLICANT TERM SHEET ENDPOINTS
  // ==========================================

  '/term-sheets/{applicationId}/sign': {
    post: {
      tags: ['🏢 Portfolio Management'],
      summary: 'Sign term sheet (Applicant)',
      description: 'Sign the term sheet for an application. This endpoint is available to applicants only. The term sheet must be in FINAL status before it can be signed.',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'applicationId',
          in: 'path',
          required: true,
          schema: { type: 'string' },
          description: 'Application ID'
        }
      ],
      responses: {
        200: {
          description: 'Term sheet signed successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Term sheet signed successfully' },
                  data: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      applicationId: { type: 'string' },
                      status: { type: 'string', example: 'SIGNED' },
                      isSigned: { type: 'boolean', example: true },
                      signedAt: { type: 'string', format: 'date-time' },
                      investmentAmount: { type: 'number' },
                      equityPercentage: { type: 'number' },
                      valuation: { type: 'number' }
                    }
                  }
                }
              }
            }
          }
        },
        400: { description: 'Bad request - term sheet must be in FINAL status or already signed' },
        401: { description: 'Unauthorized' },
        403: { description: 'Forbidden - you are not authorized to sign this term sheet' },
        404: { description: 'Term sheet not found' }
      }
    }
  },

  '/term-sheets/my': {
    get: {
      tags: ['🏢 Portfolio Management'],
      summary: 'Get my term sheets (Applicant)',
      description: 'Retrieve all term sheets associated with the authenticated applicant\'s applications',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'page',
          in: 'query',
          schema: { type: 'integer', default: 1 },
          description: 'Page number'
        },
        {
          name: 'limit',
          in: 'query',
          schema: { type: 'integer', default: 10 },
          description: 'Number of items per page'
        }
      ],
      responses: {
        200: {
          description: 'My term sheets retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'My term sheets retrieved successfully' },
                  data: {
                    type: 'object',
                    properties: {
                      termSheets: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            applicationId: { type: 'string' },
                            title: { type: 'string', example: 'Investment Term Sheet v1.0' },
                            version: { type: 'string', example: '1.0' },
                            status: { type: 'string', enum: ['DRAFT', 'FINAL', 'SIGNED'], example: 'FINAL' },
                            investmentAmount: { type: 'number', example: 500000 },
                            equityPercentage: { type: 'number', example: 15.5 },
                            valuation: { type: 'number', example: 3200000 },
                            isDraft: { type: 'boolean', example: false },
                            isFinal: { type: 'boolean', example: true },
                            isSigned: { type: 'boolean', example: false },
                            signedAt: { type: 'string', format: 'date-time' },
                            createdAt: { type: 'string', format: 'date-time' },
                            application: {
                              type: 'object',
                              properties: {
                                id: { type: 'string' },
                                businessName: { type: 'string' },
                                applicantName: { type: 'string' },
                                currentStage: { type: 'string' }
                              }
                            }
                          }
                        }
                      },
                      total: { type: 'integer', example: 1 },
                      page: { type: 'integer', example: 1 },
                      totalPages: { type: 'integer', example: 1 }
                    }
                  }
                }
              }
            }
          }
        },
        401: { description: 'Unauthorized' }
      }
    }
  }
};


