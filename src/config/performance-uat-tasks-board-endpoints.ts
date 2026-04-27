/**
 * Performance UAT — Kanban / task board (backend) endpoints.
 *
 * NOTE: Swagger `servers[].url` in `swagger.ts` already ends with `/api`,
 * so paths here MUST NOT include a second `/api` prefix.
 */

const TASK_STAGE_ENUM = ['todo', 'in_progress', 'completed', 'overdue', 'delayed', 'amber', 'red'] as const;
const TASK_PRIORITY_ENUM = ['low', 'medium', 'high', 'critical'] as const;
const PERFORMANCE_CATEGORY_ENUM = ['business', 'performance', 'operational'] as const;

const JSON_200 = {
  description: 'OK',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string' }
        }
      }
    }
  }
};

export const performanceUatTasksBoardEndpoints = {
  '/tasks': {
    post: {
      summary: 'Create a new task (assign to team)',
      description:
        'Creates a task and assigns it to `team` (array of user IDs). New assignees receive `TASK_ASSIGNED` notifications (title: "New task assigned") and a `notification_created` WebSocket event for instant UI updates.',
      tags: ['Performance UAT (Tasks & board)'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['title', 'team', 'date'],
              properties: {
                title: { type: 'string', example: 'Prepare April KPI pack' },
                description: { type: 'string', example: 'Compile KPI narrative and upload evidence' },
                team: { type: 'array', items: { type: 'string' }, example: ['userAId'] },
                stage: { type: 'string', enum: TASK_STAGE_ENUM, example: 'todo' },
                date: { type: 'string', format: 'date-time', example: '2026-04-30T00:00:00.000Z' },
                priority: { type: 'string', enum: TASK_PRIORITY_ENUM, example: 'high' },
                assets: { type: 'string', nullable: true },
                branch: { type: 'string', nullable: true },
                department: { type: 'string', nullable: true },
                ruleset: { type: 'string', nullable: true },
                goalId: { type: 'string', nullable: true, description: 'Optional performance goal link' },
                performanceCategory: { type: 'string', enum: PERFORMANCE_CATEGORY_ENUM, nullable: true },
                isPerformanceTask: { type: 'boolean', nullable: true },
                targetValue: { type: 'number', nullable: true, description: 'Alias for monetary target value (stored in monetaryValue)' },
                kpi: { type: 'object', nullable: true, description: 'KPI reference object; server resolves/validates if id is provided' },
                applicationId: { type: 'string', nullable: true, description: 'Optional deal/application id for deep-linking to `/deals/{id}`' },
                fromDueDiligence: { type: 'boolean', nullable: true },
                category: { type: 'string', nullable: true },
                taskMetadata: { type: 'object', nullable: true }
              }
            }
          }
        }
      },
      responses: {
        201: {
          description: 'Task created',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string' },
                  task: { type: 'object' }
                }
              }
            }
          }
        },
        400: { description: 'Validation or business-rule error' },
        401: { description: 'Missing or invalid JWT' }
      }
    }
  },

  '/tasks/my': {
    get: {
      summary: "Get current user's tasks (my board)",
      description:
        'Returns tasks where the current user appears in `team`. After reassignment via `PUT /tasks/{id}` (changing `team`), removed users no longer see the task here; newly added users see it on next fetch or via real-time refresh triggered by `notification_created`.',
      tags: ['Performance UAT (Tasks & board)'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'query', name: 'stage', schema: { type: 'string', enum: TASK_STAGE_ENUM } },
        { in: 'query', name: 'priority', schema: { type: 'string', enum: TASK_PRIORITY_ENUM } },
        { in: 'query', name: 'department', schema: { type: 'string' } },
        { in: 'query', name: 'performanceCategory', schema: { type: 'string', enum: PERFORMANCE_CATEGORY_ENUM } },
        { in: 'query', name: 'isPerformanceTask', schema: { type: 'boolean' } },
        { in: 'query', name: 'goalId', schema: { type: 'string' } },
        { in: 'query', name: 'isOverdue', schema: { type: 'boolean' } },
        { in: 'query', name: 'search', schema: { type: 'string' } }
      ],
      responses: {
        200: {
          description: 'User tasks returned',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string' },
                  count: { type: 'number', example: 5 },
                  tasks: { type: 'array', items: { type: 'object' } }
                }
              }
            }
          }
        },
        401: { description: 'Missing or invalid JWT' }
      }
    }
  },

  '/tasks/{id}': {
    get: {
      summary: 'Get task details by id (open task details)',
      description:
        'Fetch task details for viewing/editing. Use this before reassignment (changing `team`) so the client can show the current assignees.',
      tags: ['Performance UAT (Tasks & board)'],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Task returned' },
        404: { description: 'Task not found' },
        401: { description: 'Missing or invalid JWT' }
      }
    },
    put: {
      summary: 'Update task (reassign via team, or edit fields)',
      description:
        '**Reassign:** send `team` as the FULL list of assignee user IDs. Each newly added user gets a `TASK_ASSIGNED` notification and `notification_created` (WebSocket). Users removed from `team` lose the task from `/tasks/my`.',
      tags: ['Performance UAT (Tasks & board)'],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                description: { type: 'string', nullable: true },
                team: { type: 'array', items: { type: 'string' }, description: 'Full list of assignee user IDs' },
                stage: { type: 'string', enum: TASK_STAGE_ENUM },
                date: { type: 'string', format: 'date-time' },
                priority: { type: 'string', enum: TASK_PRIORITY_ENUM },
                assets: { type: 'string', nullable: true },
                branch: { type: 'string', nullable: true },
                department: { type: 'string', nullable: true },
                category: { type: 'string', nullable: true },
                ruleset: { type: 'string', nullable: true },
                applicationId: { type: 'string', nullable: true },
                fromDueDiligence: { type: 'boolean', nullable: true },
                taskMetadata: { type: 'object', nullable: true },
                goalId: {
                  type: 'string',
                  nullable: true,
                  description: 'Set to null / empty to clear; when present rolls up progress'
                },
                performanceCategory: { type: 'string', enum: PERFORMANCE_CATEGORY_ENUM, nullable: true },
                isPerformanceTask: { type: 'boolean', nullable: true },
                targetValue: { type: 'number', nullable: true },
                targetUnit: { type: 'string', nullable: true },
                currentValue: { type: 'number', nullable: true },
                monetaryValueAchieved: { type: 'number', nullable: true },
                percentValueAchieved: { type: 'number', nullable: true },
                kpi: { type: 'object', nullable: true }
              }
            },
            example: {
              team: ['userBId'],
              priority: 'high'
            }
          }
        }
      },
      responses: {
        200: JSON_200,
        400: { description: 'Validation or business-rule error' },
        404: { description: 'Task not found' },
        401: { description: 'Missing or invalid JWT' }
      }
    },
    delete: {
      summary: 'Delete a task (soft-delete)',
      description:
        'Soft-deletes the task by setting `isTrashed: true`. If the task is linked to a performance goal, the goal progress is recalculated from remaining (non-trashed) tasks and rollups are refreshed.',
      tags: ['Performance UAT (Tasks & board)'],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
      responses: {
        200: {
          description: 'Task deleted',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Task deleted successfully' },
                  data: {
                    type: 'object',
                    properties: {
                      trashedTaskIds: { type: 'array', items: { type: 'string' } },
                      affectedGoalIds: { type: 'array', items: { type: 'string' } }
                    }
                  }
                }
              }
            }
          }
        },
        400: { description: 'Validation or business-rule error' },
        401: { description: 'Missing or invalid JWT' }
      }
    }
  },

  '/tasks/{id}/attachments': {
    post: {
      summary: 'Upload one or more attachments to a task (multipart)',
      description:
        'Uploads files and associates them with the task. The uploaded files are written to the server storage path and the task response (e.g. `/tasks/my`, `/tasks/{id}`) includes `attachments[]` entries with download links.',
      tags: ['Performance UAT (Tasks & board)'],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              properties: {
                attachments: {
                  type: 'array',
                  items: { type: 'string', format: 'binary' },
                  description: 'One or more files (e.g. PDF up to 5MB each)'
                }
              }
            }
          }
        }
      },
      responses: {
        200: {
          description: 'Attachments uploaded',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Task attachments uploaded successfully' },
                  result: { type: 'object' }
                }
              }
            }
          }
        },
        400: { description: 'Validation or upload error' },
        401: { description: 'Missing or invalid JWT' }
      }
    }
  },

  '/tasks/{id}/attachments/base64': {
    post: {
      summary: 'Upload a single attachment to a task (base64 JSON)',
      description:
        'Alternative upload path used by some clients. Body includes `fileName`, `contentBase64`, and optional `mimeType`.',
      tags: ['Performance UAT (Tasks & board)'],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['fileName', 'contentBase64'],
              properties: {
                fileName: { type: 'string', example: 'evidence.pdf' },
                contentBase64: { type: 'string', description: 'Base64 string (optionally data: URL)' },
                mimeType: { type: 'string', nullable: true, example: 'application/pdf' }
              }
            }
          }
        }
      },
      responses: {
        200: {
          description: 'Attachment uploaded',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Task attachment uploaded successfully' },
                  result: { type: 'object' }
                }
              }
            }
          }
        },
        400: { description: 'Validation or upload error' },
        401: { description: 'Missing or invalid JWT' }
      }
    }
  },

  '/tasks/{id}/stage': {
    put: {
      summary: 'Update a single task stage (move one card)',
      tags: ['Performance UAT (Tasks & board)'],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['stage'],
              properties: {
                stage: { type: 'string', enum: TASK_STAGE_ENUM, example: 'completed' },
                monetaryValueAchieved: { type: 'number', nullable: true, example: 5000 },
                percentValueAchieved: { type: 'number', nullable: true, example: 20 }
              }
            }
          }
        }
      },
      responses: {
        200: JSON_200,
        400: { description: 'Validation or business-rule error' },
        404: { description: 'Task not found' },
        401: { description: 'Missing or invalid JWT' }
      }
    }
  },

  '/tasks/bulk/stage': {
    put: {
      summary: 'Bulk update task stage (multi-select)',
      description:
        'Moves multiple tasks to a new stage. Same underlying service as bulk status-update; this variant returns a shorter response (no affectedGoalIds rollup).',
      tags: ['Performance UAT (Tasks & board)'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['taskIds', 'stage'],
              properties: {
                taskIds: { type: 'array', items: { type: 'string' }, minItems: 1 },
                stage: { type: 'string', enum: TASK_STAGE_ENUM },
                monetaryValueAchieved: { type: 'number', nullable: true },
                percentValueAchieved: { type: 'number', nullable: true }
              }
            },
            example: { taskIds: ['task1', 'task2'], stage: 'in_progress' }
          }
        }
      },
      responses: {
        200: JSON_200,
        400: { description: 'Validation or business-rule error' },
        401: { description: 'Missing or invalid JWT' }
      }
    }
  },

  '/tasks/bulk/status-update': {
    put: {
      summary: 'Bulk status update (multi-select, includes affected goals)',
      description:
        'Moves multiple tasks to a new stage and returns `affectedGoalIds` / `affectedGoalCount` for downstream refresh of rolled-up performance goals.',
      tags: ['Performance UAT (Tasks & board)'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['taskIds', 'stage'],
              properties: {
                taskIds: { type: 'array', items: { type: 'string' }, minItems: 1 },
                stage: { type: 'string', enum: TASK_STAGE_ENUM },
                monetaryValueAchieved: { type: 'number', nullable: true },
                percentValueAchieved: { type: 'number', nullable: true }
              }
            },
            example: { taskIds: ['task1', 'task2', 'task3'], stage: 'completed', monetaryValueAchieved: 15000 }
          }
        }
      },
      responses: {
        200: {
          description: 'Bulk status update completed',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Bulk status update completed successfully' },
                  count: { type: 'number' },
                  affectedGoalCount: { type: 'number' },
                  affectedGoalIds: { type: 'array', items: { type: 'string' } },
                  tasks: { type: 'array', items: { type: 'object' } }
                }
              }
            }
          }
        },
        400: { description: 'Validation or business-rule error' },
        401: { description: 'Missing or invalid JWT' }
      }
    }
  }
};

