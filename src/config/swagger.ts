import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Role-Based Access Control API',
      version: '1.0.0',
      description: 'A comprehensive API for managing users, roles, and permissions with role-based access control.',
      contact: {
        name: 'API Support',
        email: 'support@nvccz.co.zw'
      },
      license: {
        name: 'ISC',
        url: 'https://opensource.org/licenses/ISC'
      }
    },
    servers: [
      {
        url: 'https://nvccz-pi.vercel.app/api',
        description: 'Production server'
      },
      {
        url: 'http://localhost:3000/api',
        description: 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clx1234567890abcdef' },
            firstName: { type: 'string', example: 'John' },
            lastName: { type: 'string', example: 'Doe' },
            email: { type: 'string', format: 'email', example: 'john@example.com' },
            roleId: { type: 'string', example: 'clx1234567890abcdef' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        Role: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clx1234567890abcdef' },
            name: { type: 'string', example: 'admin' },
            description: { type: 'string', example: 'Full access administrator' },
            permissions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', example: 'view_dashboard' },
                  value: { type: 'boolean', example: true }
                }
              }
            },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        Permission: {
          type: 'object',
          properties: {
            name: { type: 'string', example: 'view_dashboard' },
            value: { type: 'boolean', example: true }
          }
        },
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email', example: 'admin@nvccz.co.zw' },
            password: { type: 'string', example: 'admin123' }
          }
        },
        LoginResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Logged in successfully' },
            token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string', example: 'clx1234567890abcdef' },
                email: { type: 'string', example: 'admin@nvccz.co.zw' },
                firstName: { type: 'string', example: 'Admin' },
                lastName: { type: 'string', example: 'User' },
                role: { type: 'string', example: 'admin' },
                permissions: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Permission' }
                }
              }
            }
          }
        },
        CreateUserRequest: {
          type: 'object',
          required: ['firstName', 'lastName', 'email', 'password', 'roleId'],
          properties: {
            firstName: { type: 'string', example: 'John' },
            lastName: { type: 'string', example: 'Doe' },
            email: { type: 'string', format: 'email', example: 'john@example.com' },
            password: { type: 'string', example: 'password123' },
            roleId: { type: 'string', example: 'clx1234567890abcdef' }
          }
        },
        UpdateUserRequest: {
          type: 'object',
          properties: {
            firstName: { type: 'string', example: 'John Updated' },
            lastName: { type: 'string', example: 'Doe Updated' },
            email: { type: 'string', format: 'email', example: 'john.updated@example.com' },
            roleId: { type: 'string', example: 'clx1234567890abcdef' }
          }
        },
        ChangePasswordRequest: {
          type: 'object',
          required: ['currentPassword', 'newPassword'],
          properties: {
            currentPassword: { type: 'string', example: 'oldpassword' },
            newPassword: { type: 'string', example: 'newpassword123' }
          }
        },
        CreateRoleRequest: {
          type: 'object',
          required: ['name', 'permissions'],
          properties: {
            name: { type: 'string', example: 'moderator' },
            description: { type: 'string', example: 'Moderator with limited admin access' },
            permissions: {
              type: 'array',
              items: { $ref: '#/components/schemas/Permission' }
            }
          }
        },
        UpdateRoleRequest: {
          type: 'object',
          properties: {
            name: { type: 'string', example: 'senior_moderator' },
            description: { type: 'string', example: 'Senior moderator with more permissions' },
            permissions: {
              type: 'array',
              items: { $ref: '#/components/schemas/Permission' }
            }
          }
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Error message' }
          }
        },
        ValidationError: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Validation error' },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string', example: 'email' },
                  message: { type: 'string', example: 'Email is required' }
                }
              }
            }
          }
        },
        UnauthorizedError: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Unauthorized access' }
          }
        },
        ForbiddenError: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Access denied' }
          }
        },
        NotFoundError: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Resource not found' }
          }
        },
        ConflictError: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Resource already exists' }
          }
        },
        // Post schemas
        Post: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clx1234567890abcdef' },
            title: { type: 'string', example: 'Important Company Announcement' },
            content: { type: 'string', example: 'This is the content of the post...' },
            authorId: { type: 'string', example: 'clx1234567890abcdef' },
            author: {
              type: 'object',
              properties: {
                id: { type: 'string', example: 'clx1234567890abcdef' },
                firstName: { type: 'string', example: 'John' },
                lastName: { type: 'string', example: 'Doe' },
                email: { type: 'string', example: 'john@example.com' }
              }
            },
            expiresAt: { type: 'string', format: 'date-time', nullable: true, example: '2024-12-31T23:59:59.000Z' },
            isNotified: { type: 'boolean', example: true },
            isActive: { type: 'boolean', example: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            replies: {
              type: 'array',
              items: { $ref: '#/components/schemas/Reply' }
            }
          }
        },
        CreatePostRequest: {
          type: 'object',
          required: ['title', 'content'],
          properties: {
            title: { type: 'string', maxLength: 200, example: 'Important Company Announcement' },
            content: { type: 'string', example: 'This is the content of the post...' },
            expiresAt: { type: 'string', format: 'date-time', nullable: true, example: '2024-12-31T23:59:59.000Z' },
            isNotified: { type: 'boolean', example: true }
          }
        },
        UpdatePostRequest: {
          type: 'object',
          required: ['title', 'content'],
          properties: {
            title: { type: 'string', maxLength: 200, example: 'Updated Company Announcement' },
            content: { type: 'string', example: 'This is the updated content...' },
            expiresAt: { type: 'string', format: 'date-time', nullable: true, example: '2024-12-31T23:59:59.000Z' },
            isNotified: { type: 'boolean', example: false }
          }
        },
        // Reply schemas
        Reply: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clx1234567890abcdef' },
            content: { type: 'string', example: 'This is a reply to the post...' },
            postId: { type: 'string', example: 'clx1234567890abcdef' },
            authorId: { type: 'string', example: 'clx1234567890abcdef' },
            author: {
              type: 'object',
              properties: {
                id: { type: 'string', example: 'clx1234567890abcdef' },
                firstName: { type: 'string', example: 'Jane' },
                lastName: { type: 'string', example: 'Smith' },
                email: { type: 'string', example: 'jane@example.com' }
              }
            },
            parentReplyId: { type: 'string', nullable: true, example: 'clx1234567890abcdef' },
            parentReply: { $ref: '#/components/schemas/Reply' },
            replies: {
              type: 'array',
              items: { $ref: '#/components/schemas/Reply' }
            },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        CreateReplyRequest: {
          type: 'object',
          required: ['content'],
          properties: {
            content: { type: 'string', example: 'This is a reply to the post...' }
          }
        },
        UpdateReplyRequest: {
          type: 'object',
          required: ['content'],
          properties: {
            content: { type: 'string', example: 'This is an updated reply...' }
          }
        },
        // Newsletter schemas
        Newsletter: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clx1234567890abcdef' },
            title: { type: 'string', example: 'Monthly Company Newsletter' },
            content: { type: 'string', example: 'This is the newsletter content...' },
            authorId: { type: 'string', example: 'clx1234567890abcdef' },
            author: {
              type: 'object',
              properties: {
                id: { type: 'string', example: 'clx1234567890abcdef' },
                firstName: { type: 'string', example: 'John' },
                lastName: { type: 'string', example: 'Doe' },
                email: { type: 'string', example: 'john@example.com' }
              }
            },
            isActive: { type: 'boolean', example: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        CreateNewsletterRequest: {
          type: 'object',
          required: ['title', 'content'],
          properties: {
            title: { type: 'string', example: 'Monthly Company Newsletter' },
            content: { type: 'string', example: 'This is the newsletter content...' }
          }
        },
        UpdateNewsletterRequest: {
          type: 'object',
          required: ['title', 'content'],
          properties: {
            title: { type: 'string', example: 'Updated Company Newsletter' },
            content: { type: 'string', example: 'This is the updated newsletter content...' }
          }
        },
        // Event schemas
        Event: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clx1234567890abcdef' },
            title: { type: 'string', example: 'Company Annual Meeting' },
            description: { type: 'string', example: 'Annual company meeting for all employees' },
            startDate: { type: 'string', format: 'date-time', example: '2024-12-25T09:00:00.000Z' },
            endDate: { type: 'string', format: 'date-time', example: '2024-12-25T17:00:00.000Z' },
            location: { type: 'string', example: 'Main Conference Room' },
            authorId: { type: 'string', example: 'clx1234567890abcdef' },
            author: {
              type: 'object',
              properties: {
                id: { type: 'string', example: 'clx1234567890abcdef' },
                firstName: { type: 'string', example: 'John' },
                lastName: { type: 'string', example: 'Doe' },
                email: { type: 'string', example: 'john@example.com' }
              }
            },
            isActive: { type: 'boolean', example: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        CreateEventRequest: {
          type: 'object',
          required: ['title', 'description', 'startDate', 'endDate'],
          properties: {
            title: { type: 'string', example: 'Company Annual Meeting' },
            description: { type: 'string', example: 'Annual company meeting for all employees' },
            startDate: { type: 'string', format: 'date-time', example: '2024-12-25T09:00:00.000Z' },
            endDate: { type: 'string', format: 'date-time', example: '2024-12-25T17:00:00.000Z' },
            location: { type: 'string', example: 'Main Conference Room' }
          }
        },
        UpdateEventRequest: {
          type: 'object',
          required: ['title', 'description', 'startDate', 'endDate'],
          properties: {
            title: { type: 'string', example: 'Updated Company Annual Meeting' },
            description: { type: 'string', example: 'Updated annual company meeting' },
            startDate: { type: 'string', format: 'date-time', example: '2024-12-25T09:00:00.000Z' },
            endDate: { type: 'string', format: 'date-time', example: '2024-12-25T17:00:00.000Z' },
            location: { type: 'string', example: 'Updated Conference Room' }
          }
        },
        // Notification schemas
        Notification: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clx1234567890abcdef' },
            title: { type: 'string', example: 'New Company Post' },
            message: { type: 'string', example: 'A new post has been created by John Doe' },
            type: { type: 'string', example: 'post', enum: ['post', 'newsletter', 'event', 'system'] },
            userId: { type: 'string', example: 'clx1234567890abcdef' },
            isRead: { type: 'boolean', example: false },
            data: {
              type: 'object',
              properties: {
                postId: { type: 'string', example: 'clx1234567890abcdef' },
                authorId: { type: 'string', example: 'clx1234567890abcdef' },
                authorName: { type: 'string', example: 'John Doe' }
              }
            },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            timeAgo: { type: 'string', example: '2 hours ago' }
          }
        },
        NotificationResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                notifications: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Notification' }
                },
                pagination: {
                  type: 'object',
                  properties: {
                    total: { type: 'number', example: 15 },
                    unread: { type: 'number', example: 8 },
                    limit: { type: 'number', example: 50 },
                    offset: { type: 'number', example: 0 },
                    hasMore: { type: 'boolean', example: false }
                  }
                }
              }
            }
          }
        },
        // Homepage schemas
        HomepageData: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                posts: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Post' }
                },
                newsletters: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Newsletter' }
                },
                events: {
                  type: 'object',
                  properties: {
                    upcoming: {
                      type: 'array',
                      description: 'Events with start date >= current date',
                      items: { $ref: '#/components/schemas/Event' }
                    },
                    all: {
                      type: 'array',
                      description: 'All active events regardless of date',
                      items: { $ref: '#/components/schemas/Event' }
                    }
                  }
                },
                onlineUsers: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', example: 'clx1234567890abcdef' },
                      firstName: { type: 'string', example: 'John' },
                      lastName: { type: 'string', example: 'Doe' },
                      email: { type: 'string', example: 'john@example.com' },
                      lastSeen: { type: 'string', format: 'date-time' },
                      isOnline: { type: 'boolean', example: true }
                    }
                  }
                },
                summary: {
                  type: 'object',
                  properties: {
                    totalPosts: { type: 'number', example: 5 },
                    totalNewsletters: { type: 'number', example: 3 },
                    upcomingEvents: { type: 'number', example: 2 },
                    totalEvents: { type: 'number', example: 8 },
                    onlineUsers: { type: 'number', example: 8 }
                  }
                }
              }
            }
          }
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  apis: ['./src/routes/*.ts', './src/controllers/*.ts']
};

export const specs = swaggerJsdoc(options); 