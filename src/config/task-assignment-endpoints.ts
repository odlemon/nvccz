/**
 * Task Assignment Endpoints for Due Diligence Workflow
 * Fallback Swagger spec for Task Assignment endpoints
 */

export const taskAssignmentEndpoints = {
  // ==========================================
  // TASK ASSIGNMENT - DUE DILIGENCE WORKFLOW
  // ==========================================

  '/applications/due-diligence/investments-users': {
    get: {
      summary: 'Get users from Investments department only',
      description: 'Retrieve all users from the Investments department for task assignment',
      tags: ['Task assignment'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'Investments department users retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Investments department users retrieved successfully' },
                  data: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string', example: 'clx1234567890abcdef' },
                        firstName: { type: 'string', example: 'John' },
                        lastName: { type: 'string', example: 'Doe' },
                        email: { type: 'string', example: 'john.doe@nvccz.co.zw' },
                        role: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            name: { type: 'string', example: 'Investment Analyst' }
                          }
                        },
                        department: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            name: { type: 'string', example: 'Investments' }
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

  '/applications/{id}/due-diligence/assign-task': {
    post: {
      summary: 'Assign task from due diligence (creates task in background, syncs with performance module)',
      description: 'Assign a task to an Investments department user. The task is automatically created in the performance module and the assignee receives an email notification.',
      tags: ['Task assignment'],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'path',
          name: 'id',
          required: true,
          schema: { type: 'string' },
          description: 'Application ID'
        }
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['assigneeId', 'title'],
              properties: {
                assigneeId: {
                  type: 'string',
                  description: 'ID of the user to assign the task to (must be from Investments department)',
                  example: 'clx1234567890abcdef'
                },
                title: {
                  type: 'string',
                  description: 'Task title',
                  example: 'Review financial statements'
                },
                description: {
                  type: 'string',
                  description: 'Task description',
                  example: 'Review and analyze the financial statements for the due diligence process'
                },
                priority: {
                  type: 'string',
                  enum: ['low', 'medium', 'high', 'critical'],
                  default: 'high',
                  example: 'high'
                },
                dueDate: {
                  type: 'string',
                  format: 'date-time',
                  description: 'Task due date',
                  example: '2025-12-31T23:59:59Z'
                }
              }
            }
          }
        }
      },
      responses: {
        200: {
          description: 'Task assigned successfully and synced with performance module',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Task assigned successfully and synced with performance module' },
                  data: {
                    type: 'object',
                    properties: {
                      task: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', example: 'clx1234567890abcdef' },
                          title: { type: 'string', example: 'Review financial statements' },
                          description: { type: 'string' },
                          stage: { type: 'string', example: 'todo' },
                          priority: { type: 'string', example: 'high' },
                          isPerformanceTask: { type: 'boolean', example: true }
                        }
                      },
                      dueDiligence: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          applicationId: { type: 'string' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' },
        500: { description: 'Internal server error' }
      }
    }
  },

  '/activities/task/{taskId}': {
    post: {
      summary: 'Create activity for task with optional document upload',
      description: 'Create a new activity for a specific task. Documents are optional as some activities are not metric-based. This creates a new activity each time (does not update existing activities).',
      tags: ['Task assignment'],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'path',
          name: 'taskId',
          required: true,
          schema: { type: 'string' },
          description: 'Task ID'
        }
      ],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              properties: {
                title: {
                  type: 'string',
                  description: 'Activity title (optional, defaults to task title if not provided)',
                  example: 'Completed financial review'
                },
                description: {
                  type: 'string',
                  description: 'Updated activity description',
                  example: 'Reviewed all financial statements and identified key findings'
                },
                valueCollected: {
                  type: 'number',
                  description: 'Value collected/achieved (optional)',
                  example: 100
                },
                documents: {
                  type: 'array',
                  items: {
                    type: 'string',
                    format: 'binary'
                  },
                  description: 'Optional document files to upload (PDF, DOCX, XLSX, images)'
                }
              }
            }
          }
        }
      },
      responses: {
        200: {
          description: 'Activity created successfully',
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
                      monetaryValueAchieved: { type: 'number' }
                    }
                  }
                }
              }
            }
          }
        },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' },
        500: { description: 'Internal server error' }
      }
    }
  },

  '/activities/{activityId}/approval': {
    get: {
      summary: 'Get activity for approval (view documents)',
      description: 'Retrieve an activity with its documents for approval. Only the task creator (CIO) can view activities for approval.',
      tags: ['Task assignment'],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'path',
          name: 'activityId',
          required: true,
          schema: { type: 'string' },
          description: 'Activity ID'
        }
      ],
      responses: {
        200: {
          description: 'Activity retrieved successfully with documents',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Activity retrieved successfully' },
                  data: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      title: { type: 'string' },
                      description: { type: 'string' },
                      documents: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            fileName: { type: 'string', example: 'financial-review.pdf' },
                            fileUrl: { type: 'string', example: 'https://firebase...' },
                            fileSize: { type: 'number', example: 1024000 }
                          }
                        }
                      },
                      approvalStatus: { type: 'string', example: 'PENDING', enum: ['PENDING', 'APPROVED', 'REJECTED'] },
                      task: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          title: { type: 'string' }
                        }
                      },
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
        },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' },
        403: { description: 'Forbidden - only task creator can view for approval' },
        500: { description: 'Internal server error' }
      }
    }
  },

  '/activities/{activityId}/approve': {
    post: {
      summary: 'Approve activity (view documents and approve)',
      description: 'Approve or reject an activity. Only the task creator (CIO) can approve activities. The assignee receives an email notification about the approval decision.',
      tags: ['Task assignment'],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'path',
          name: 'activityId',
          required: true,
          schema: { type: 'string' },
          description: 'Activity ID'
        }
      ],
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                approved: {
                  type: 'boolean',
                  default: true,
                  description: 'Whether to approve (true) or reject (false) the activity',
                  example: true
                },
                comments: {
                  type: 'string',
                  description: 'Optional comments about the approval decision',
                  example: 'Great work! All documents reviewed and approved.'
                }
              }
            }
          }
        }
      },
      responses: {
        200: {
          description: 'Activity approved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Activity approved successfully' },
                  data: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      approvalStatus: { type: 'string', example: 'APPROVED' },
                      approvedBy: { type: 'string' },
                      approvedAt: { type: 'string', format: 'date-time' },
                      documents: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            fileName: { type: 'string' },
                            fileUrl: { type: 'string' },
                            fileSize: { type: 'number' }
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
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' },
        403: { description: 'Forbidden - only task creator can approve' },
        500: { description: 'Internal server error' }
      }
    }
  }
};



