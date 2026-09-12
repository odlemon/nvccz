/**
 * Performance collaboration + notifications (backend) — UAT docs E.01–E.10.
 *
 * NOTE: Swagger `servers[].url` in `swagger.ts` already ends with `/api`,
 * so paths here MUST NOT include a second `/api` prefix.
 */

const JSON_401 = { description: 'Missing or invalid JWT' };
const JSON_400 = { description: 'Validation or business-rule error' };
const JSON_404 = { description: 'Not found' };

const TASK_CHAT_ROW_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    taskId: { type: 'string' },
    storagePath: {
      type: 'string',
      example: 'tasks/TASK_ID/chats/MSG_ID',
      description:
        'Logical storage key (DB-backed). Mirrors the UAT doc path shape; not Firestore in this implementation.'
    },
    activityType: { type: 'string', example: 'task_comment' },
    title: { type: 'string', nullable: true },
    content: { type: 'string', nullable: true },
    isDeleted: { type: 'boolean', example: false },
    deletedAt: { type: 'string', format: 'date-time', nullable: true },
    deletedById: { type: 'string', nullable: true },
    mentions: {
      type: 'array',
      items: { type: 'object', properties: { userId: { type: 'string' }, name: { type: 'string' } } }
    },
    attachments: {
      type: 'array',
      description: 'Uploaded files for the message/comment (if any)',
      items: {
        type: 'object',
        properties: {
          fileName: { type: 'string' },
          url: { type: 'string' },
          mimeType: { type: 'string', nullable: true },
          sizeBytes: { type: 'number', nullable: true }
        }
      }
    },
    eventType: { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    author: {
      type: 'object',
      nullable: true,
      properties: {
        id: { type: 'string' },
        fullName: { type: 'string' },
        email: { type: 'string', nullable: true }
      }
    }
  }
};

export const performanceCollaborationNotificationsEndpoints = {
  // ==========================
  // Task collaboration (E.01–E.04, E.08–E.09)
  // ==========================

  '/tasks/{id}/mention-suggestions': {
    get: {
      summary: 'Mention dropdown suggestions (E.01)',
      description:
        'Returns mention candidates scoped to the task (team + creator), optionally filtered by query `q`. Used by the @mention dropdown in the task chat UI.',
      tags: ['Performance collaboration and notifications'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Task ID' },
        { in: 'query', name: 'q', required: false, schema: { type: 'string' }, description: 'Search (first/last/email)' }
      ],
      responses: {
        200: {
          description: 'Mention candidates',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  users: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        name: { type: 'string' },
                        email: { type: 'string', nullable: true }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        401: JSON_401
      }
    }
  },

  '/tasks/{id}/comments': {
    get: {
      summary: 'List task chat comments + system messages (E.03/E.04/E.09)',
      description:
        'Returns the task chat feed (user comments + system messages). Realtime events are emitted to Socket.IO room `task:{taskId}` using event `task_message` and `task_comment_created`.',
      tags: ['Performance collaboration and notifications'],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Task ID' }],
      responses: {
        200: {
          description: 'Chat feed',
          content: {
            'application/json': {
              schema: { type: 'array', items: TASK_CHAT_ROW_SCHEMA }
            }
          }
        },
        401: JSON_401,
        404: JSON_404
      }
    },
    post: {
      summary: 'Post a chat comment with optional mentions/attachments (E.02/E.04)',
      description:
        'Creates a task comment. If `mentionUserIds` includes valid candidates, the server creates `TASK_MENTION` notifications and emits `notification_created` to those users. Also emits `task_comment_created` + `task_message` to Socket.IO room `task:{taskId}`.',
      tags: ['Performance collaboration and notifications'],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Task ID' }],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['content'],
              properties: {
                content: { type: 'string', example: 'Status update needed — @ManagerUser please review.' },
                mentionUserIds: {
                  type: 'string',
                  description: 'JSON array string of user IDs, e.g. `[\"user1\",\"user2\"]`'
                },
                attachments: {
                  type: 'array',
                  items: { type: 'string', format: 'binary' },
                  description: 'Optional files'
                }
              }
            }
          }
        }
      },
      responses: {
        201: {
          description: 'Comment created',
          content: {
            'application/json': {
              schema: TASK_CHAT_ROW_SCHEMA
            }
          }
        },
        400: JSON_400,
        401: JSON_401,
        404: JSON_404
      }
    }
  },

  '/tasks/{id}/comments/{commentId}': {
    delete: {
      summary: 'Delete your own chat comment (E.08)',
      description:
        'Soft-deletes the comment payload and emits `task_comment_deleted` + `task_message` to Socket.IO room `task:{taskId}`. Other users should remove the row from UI by id.',
      tags: ['Performance collaboration and notifications'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Task ID' },
        { in: 'path', name: 'commentId', required: true, schema: { type: 'string' }, description: 'Comment ID' }
      ],
      responses: {
        200: {
          description: 'Deleted',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { success: { type: 'boolean', example: true }, message: { type: 'string' } }
              }
            }
          }
        },
        400: JSON_400,
        401: JSON_401,
        404: JSON_404
      }
    }
  },

  '/tasks/{id}/chats/{msgId}': {
    get: {
      summary: 'Get single chat message by id (E.03)',
      description:
        'Fetch one chat row (comment/system message) by id. Includes `storagePath` in the UAT shape `tasks/{taskId}/chats/{msgId}`.',
      tags: ['Performance collaboration and notifications'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Task ID' },
        { in: 'path', name: 'msgId', required: true, schema: { type: 'string' }, description: 'Message ID' }
      ],
      responses: {
        200: { description: 'Chat row', content: { 'application/json': { schema: TASK_CHAT_ROW_SCHEMA } } },
        401: JSON_401,
        404: JSON_404
      }
    }
  },

  '/tasks/{id}/messages': {
    get: {
      summary: 'List task chat messages (alias endpoint)',
      description:
        'Returns the same underlying chat feed as `/tasks/{id}/comments` for legacy clients.',
      tags: ['Performance collaboration and notifications'],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Task ID' }],
      responses: {
        200: { description: 'Chat rows', content: { 'application/json': { schema: { type: 'array', items: TASK_CHAT_ROW_SCHEMA } } } },
        401: JSON_401,
        404: JSON_404
      }
    },
    post: {
      summary: 'Create task chat message (JSON-only)',
      description:
        'Creates a task chat message (no attachments). Emits `task_message` to Socket.IO room `task:{taskId}`.',
      tags: ['Performance collaboration and notifications'],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Task ID' }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['content'],
              properties: {
                content: { type: 'string', example: 'Status update needed.' }
              }
            }
          }
        }
      },
      responses: {
        201: { description: 'Message created', content: { 'application/json': { schema: TASK_CHAT_ROW_SCHEMA } } },
        400: JSON_400,
        401: JSON_401,
        404: JSON_404
      }
    }
  },

  '/tasks/{id}/messages/{msgId}': {
    delete: {
      summary: 'Delete your own task chat message',
      description:
        'Deletes/marks message deleted and emits realtime events (same semantics as comment deletion).',
      tags: ['Performance collaboration and notifications'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Task ID' },
        { in: 'path', name: 'msgId', required: true, schema: { type: 'string' }, description: 'Message ID' }
      ],
      responses: {
        200: { description: 'Deleted', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean', example: true }, message: { type: 'string' } } } } } },
        400: JSON_400,
        401: JSON_401,
        404: JSON_404
      }
    }
  },

  // ==========================
  // Notifications (E.06, E.10)
  // ==========================

  '/homepage/notifications': {
    get: {
      summary: 'Get user notifications + unread count (E.06/E.10)',
      description:
        'Returns notifications for the current user. Task notifications (`TASK_ASSIGNED`, `TASK_MENTION`, `TASK_RED_ZONE`) are normalized with deep-link fields (e.g. `path`, `taskId`, `dealId`) so the client can route directly.',
      tags: ['Performance collaboration and notifications'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'query', name: 'limit', schema: { type: 'integer', default: 50 } },
        { in: 'query', name: 'offset', schema: { type: 'integer', default: 0 } }
      ],
      responses: {
        200: {
          description: 'Notifications returned',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      notifications: { type: 'array', items: { type: 'object' } },
                      unreadCount: { type: 'number', example: 3 },
                      totalCount: { type: 'number', example: 25 }
                    }
                  }
                }
              }
            }
          }
        },
        401: JSON_401
      }
    }
  },

  '/homepage/notifications/{id}/read': {
    put: {
      summary: 'Mark notification as read (E.06)',
      tags: ['Performance collaboration and notifications'],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Notification ID' }],
      responses: {
        200: { description: 'Marked read', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean', example: true }, message: { type: 'string' } } } } } },
        401: JSON_401,
        404: JSON_404
      }
    }
  },

  '/homepage/notifications/read-all': {
    put: {
      summary: 'Mark all notifications as read (E.06)',
      tags: ['Performance collaboration and notifications'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'All marked read', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean', example: true }, message: { type: 'string' } } } } } },
        401: JSON_401
      }
    }
  }
};

