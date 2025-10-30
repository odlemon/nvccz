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

  '/api/tasks/my': {
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
                            category: { type: 'string' },
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

  '/api/activities': {
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

  '/api/activities/task/{taskId}': {
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

  '/api/activities/goal/{goalId}': {
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

  '/api/activities/department/{department}/goals': {
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
            enum: ['Finance', 'Sales', 'Operations', 'Procurement', 'Human Resources', 'Marketing', 'Legal', 'IT']
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
                        category: { type: 'string' },
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

  '/api/activities/manager/tasks': {
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
                            category: { type: 'string' }
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
  },

  // ==========================================
  // 📈 ROLL-UP CALCULATIONS
  // ==========================================

  '/api/performance/rollup/{goalId}': {
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
                          category: { type: 'string' },
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

  '/api/performance/rollup/{goalId}/recalculate': {
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

  '/api/performance/scorecards/user': {
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

  '/api/performance/scorecards/department/{department}': {
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
          schema: { type: 'string', enum: ['Finance', 'Sales', 'Operations', 'Procurement', 'Human Resources', 'Marketing', 'Legal', 'IT'] },
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

  '/api/performance/analytics/kpi': {
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
          schema: { type: 'string', enum: ['Finance', 'Sales', 'Operations', 'Procurement', 'Human Resources', 'Marketing', 'Legal', 'IT'] },
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

  '/api/performance/analytics/dashboard': {
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

  '/api/performance/analytics/reports': {
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
          schema: { type: 'string', enum: ['Finance', 'Sales', 'Operations', 'Procurement', 'Human Resources', 'Marketing', 'Legal', 'IT'] },
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

  '/api/performance/analytics/departments/comparison': {
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
  }
};
