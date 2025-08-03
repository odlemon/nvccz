import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
             title: 'NVCCZ API Documentation',
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
            imageUrl: { type: 'string', nullable: true, example: 'https://lysp.s3.amazonaws.com/newsletters/1234567890-image.jpg' },
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
  apis: process.env.NODE_ENV === 'production' 
    ? ['./dist/**/*.js'] 
    : ['./src/**/*.ts']
};

let specs: any;

try {
  specs = swaggerJsdoc(options);
  
  // If no paths are found, create a comprehensive fallback spec
  if (!specs.paths || Object.keys(specs.paths).length === 0) {
    console.warn('No API paths found in JSDoc comments, using comprehensive fallback spec');
    specs = {
      ...options.definition,
      paths: {
        // Authentication
        '/auth/login': {
          post: {
            summary: 'User login',
            description: 'Authenticate user with email and password',
            tags: ['Authentication'],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/LoginRequest' }
                }
              }
            },
            responses: {
              200: {
                description: 'Login successful',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/LoginResponse' }
                  }
                }
              }
            }
          }
        },
        '/auth/me': {
          get: {
            summary: 'Get current user information',
            description: 'Retrieve information about the currently authenticated user',
            tags: ['Authentication'],
            security: [{ bearerAuth: [] }],
            responses: {
              200: {
                description: 'User information retrieved successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: { $ref: '#/components/schemas/User' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        // User Management
        '/users': {
          get: {
            summary: 'Get all users',
            description: 'Retrieve all users in the system',
            tags: ['Users'],
            security: [{ bearerAuth: [] }],
            responses: {
              200: {
                description: 'Users retrieved successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/User' }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          post: {
            summary: 'Create user',
            description: 'Create a new user',
            tags: ['Users'],
            security: [{ bearerAuth: [] }],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CreateUserRequest' }
                }
              }
            },
            responses: {
              201: {
                description: 'User created successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: { $ref: '#/components/schemas/User' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        '/users/{id}': {
          get: {
            summary: 'Get user by ID',
            description: 'Retrieve a specific user by ID',
            tags: ['Users'],
            security: [{ bearerAuth: [] }],
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'string' }
              }
            ],
            responses: {
              200: {
                description: 'User retrieved successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: { $ref: '#/components/schemas/User' }
                      }
                    }
                  }
                }
              }
            }
          },
          put: {
            summary: 'Update user',
            description: 'Update an existing user',
            tags: ['Users'],
            security: [{ bearerAuth: [] }],
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'string' }
              }
            ],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/UpdateUserRequest' }
                }
              }
            },
            responses: {
              200: {
                description: 'User updated successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: { $ref: '#/components/schemas/User' }
                      }
                    }
                  }
                }
              }
            }
          },
          delete: {
            summary: 'Delete user',
            description: 'Delete a user',
            tags: ['Users'],
            security: [{ bearerAuth: [] }],
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'string' }
              }
            ],
            responses: {
              200: {
                description: 'User deleted successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        message: { type: 'string' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        // Role Management
        '/roles': {
          get: {
            summary: 'Get all roles',
            description: 'Retrieve all roles in the system',
            tags: ['Roles'],
            security: [{ bearerAuth: [] }],
            responses: {
              200: {
                description: 'Roles retrieved successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/Role' }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          post: {
            summary: 'Create role',
            description: 'Create a new role',
            tags: ['Roles'],
            security: [{ bearerAuth: [] }],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CreateRoleRequest' }
                }
              }
            },
            responses: {
              201: {
                description: 'Role created successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: { $ref: '#/components/schemas/Role' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        '/roles/{id}': {
          get: {
            summary: 'Get role by ID',
            description: 'Retrieve a specific role by ID',
            tags: ['Roles'],
            security: [{ bearerAuth: [] }],
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'string' }
              }
            ],
            responses: {
              200: {
                description: 'Role retrieved successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: { $ref: '#/components/schemas/Role' }
                      }
                    }
                  }
                }
              }
            }
          },
          put: {
            summary: 'Update role',
            description: 'Update an existing role',
            tags: ['Roles'],
            security: [{ bearerAuth: [] }],
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'string' }
              }
            ],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/UpdateRoleRequest' }
                }
              }
            },
            responses: {
              200: {
                description: 'Role updated successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: { $ref: '#/components/schemas/Role' }
                      }
                    }
                  }
                }
              }
            }
          },
          delete: {
            summary: 'Delete role',
            description: 'Delete a role',
            tags: ['Roles'],
            security: [{ bearerAuth: [] }],
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'string' }
              }
            ],
            responses: {
              200: {
                description: 'Role deleted successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        message: { type: 'string' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        // Posts Management
        '/posts': {
          get: {
            summary: 'Get all posts',
            description: 'Retrieve all posts',
            tags: ['Posts'],
            security: [{ bearerAuth: [] }],
            responses: {
              200: {
                description: 'Posts retrieved successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/Post' }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          post: {
            summary: 'Create post',
            description: 'Create a new post',
            tags: ['Posts'],
            security: [{ bearerAuth: [] }],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CreatePostRequest' }
                }
              }
            },
            responses: {
              201: {
                description: 'Post created successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: { $ref: '#/components/schemas/Post' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        '/posts/{id}': {
          get: {
            summary: 'Get post by ID',
            description: 'Retrieve a specific post by ID',
            tags: ['Posts'],
            security: [{ bearerAuth: [] }],
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'string' }
              }
            ],
            responses: {
              200: {
                description: 'Post retrieved successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: { $ref: '#/components/schemas/Post' }
                      }
                    }
                  }
                }
              }
            }
          },
          put: {
            summary: 'Update post',
            description: 'Update an existing post',
            tags: ['Posts'],
            security: [{ bearerAuth: [] }],
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'string' }
              }
            ],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/UpdatePostRequest' }
                }
              }
            },
            responses: {
              200: {
                description: 'Post updated successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: { $ref: '#/components/schemas/Post' }
                      }
                    }
                  }
                }
              }
            }
          },
          delete: {
            summary: 'Delete post',
            description: 'Delete a post',
            tags: ['Posts'],
            security: [{ bearerAuth: [] }],
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'string' }
              }
            ],
            responses: {
              200: {
                description: 'Post deleted successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        message: { type: 'string' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        // Newsletters Management
        '/newsletters': {
          get: {
            summary: 'Get all newsletters',
            description: 'Retrieve all newsletters',
            tags: ['Newsletters'],
            security: [{ bearerAuth: [] }],
            responses: {
              200: {
                description: 'Newsletters retrieved successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/Newsletter' }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          post: {
            summary: 'Create newsletter',
            description: 'Create a new newsletter',
            tags: ['Newsletters'],
            security: [{ bearerAuth: [] }],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CreateNewsletterRequest' }
                }
              }
            },
            responses: {
              201: {
                description: 'Newsletter created successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: { $ref: '#/components/schemas/Newsletter' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        '/newsletters/{id}': {
          get: {
            summary: 'Get newsletter by ID',
            description: 'Retrieve a specific newsletter by ID',
            tags: ['Newsletters'],
            security: [{ bearerAuth: [] }],
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'string' }
              }
            ],
            responses: {
              200: {
                description: 'Newsletter retrieved successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: { $ref: '#/components/schemas/Newsletter' }
                      }
                    }
                  }
                }
              }
            }
          },
          put: {
            summary: 'Update newsletter',
            description: 'Update an existing newsletter with optional image upload',
            tags: ['Newsletters'],
            security: [{ bearerAuth: [] }],
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'string' }
              }
            ],
            requestBody: {
              required: true,
              content: {
                'multipart/form-data': {
                  schema: {
                    type: 'object',
                    required: ['title', 'content'],
                    properties: {
                      title: {
                        type: 'string',
                        description: 'Newsletter title',
                        example: 'Updated Monthly Company Update'
                      },
                      content: {
                        type: 'string',
                        description: 'Newsletter content',
                        example: 'This month we achieved great milestones...'
                      },
                      image: {
                        type: 'string',
                        format: 'binary',
                        description: 'Newsletter image (optional)'
                      }
                    }
                  }
                }
              }
            },
            responses: {
              200: {
                description: 'Newsletter updated successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        message: { type: 'string' },
                        data: { $ref: '#/components/schemas/Newsletter' }
                      }
                    }
                  }
                }
              },
              400: {
                description: 'Bad request - validation error',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/ErrorResponse' }
                  }
                }
              },
              401: {
                description: 'Unauthorized',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/ErrorResponse' }
                  }
                }
              },
              403: {
                description: 'Forbidden - can only edit your own newsletters',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/ErrorResponse' }
                  }
                }
              },
              404: {
                description: 'Newsletter not found',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/ErrorResponse' }
                  }
                }
              }
            }
          },
          delete: {
            summary: 'Delete newsletter',
            description: 'Delete a newsletter',
            tags: ['Newsletters'],
            security: [{ bearerAuth: [] }],
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'string' }
              }
            ],
            responses: {
              200: {
                description: 'Newsletter deleted successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        message: { type: 'string' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        // Events Management
        '/events': {
          get: {
            summary: 'Get all events',
            description: 'Retrieve all events',
            tags: ['Events'],
            security: [{ bearerAuth: [] }],
            responses: {
              200: {
                description: 'Events retrieved successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/Event' }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          post: {
            summary: 'Create event',
            description: 'Create a new event',
            tags: ['Events'],
            security: [{ bearerAuth: [] }],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CreateEventRequest' }
                }
              }
            },
            responses: {
              201: {
                description: 'Event created successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: { $ref: '#/components/schemas/Event' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        '/events/{id}': {
          get: {
            summary: 'Get event by ID',
            description: 'Retrieve a specific event by ID',
            tags: ['Events'],
            security: [{ bearerAuth: [] }],
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'string' }
              }
            ],
            responses: {
              200: {
                description: 'Event retrieved successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: { $ref: '#/components/schemas/Event' }
                      }
                    }
                  }
                }
              }
            }
          },
          put: {
            summary: 'Update event',
            description: 'Update an existing event',
            tags: ['Events'],
            security: [{ bearerAuth: [] }],
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'string' }
              }
            ],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/UpdateEventRequest' }
                }
              }
            },
            responses: {
              200: {
                description: 'Event updated successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: { $ref: '#/components/schemas/Event' }
                      }
                    }
                  }
                }
              }
            }
          },
          delete: {
            summary: 'Delete event',
            description: 'Delete an event',
            tags: ['Events'],
            security: [{ bearerAuth: [] }],
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'string' }
              }
            ],
            responses: {
              200: {
                description: 'Event deleted successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        message: { type: 'string' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        '/events/upcoming': {
          get: {
            summary: 'Get upcoming events',
            description: 'Retrieve upcoming events',
            tags: ['Events'],
            security: [{ bearerAuth: [] }],
            responses: {
              200: {
                description: 'Upcoming events retrieved successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/Event' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        // Homepage
        '/homepage': {
          get: {
            summary: 'Get homepage data',
            description: 'Retrieve aggregated homepage data including posts, newsletters, events, and online users',
            tags: ['Homepage'],
            security: [{ bearerAuth: [] }],
            responses: {
              200: {
                description: 'Homepage data retrieved successfully',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/HomepageData' }
                  }
                }
              }
            }
          }
        },
        '/homepage/online-activity': {
          get: {
            summary: 'Get online activity',
            description: 'Retrieve online user activity',
            tags: ['Homepage'],
            security: [{ bearerAuth: [] }],
            responses: {
              200: {
                description: 'Online activity retrieved successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              id: { type: 'string' },
                              firstName: { type: 'string' },
                              lastName: { type: 'string' },
                              email: { type: 'string' },
                              lastSeen: { type: 'string', format: 'date-time' },
                              isOnline: { type: 'boolean' }
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
        '/homepage/notifications': {
          get: {
            summary: 'Get user notifications',
            description: 'Retrieve user notifications with pagination',
            tags: ['Homepage'],
            security: [{ bearerAuth: [] }],
            parameters: [
              {
                name: 'limit',
                in: 'query',
                schema: { type: 'number', default: 50 }
              },
              {
                name: 'offset',
                in: 'query',
                schema: { type: 'number', default: 0 }
              }
            ],
            responses: {
              200: {
                description: 'Notifications retrieved successfully',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/NotificationResponse' }
                  }
                }
              }
            }
          }
        }
      }
    };
  }
} catch (error) {
  console.error('Error generating Swagger spec:', error);
  // Fallback to comprehensive spec
  specs = {
    ...options.definition,
    paths: {
      // Authentication
      '/auth/login': {
        post: {
          summary: 'User login',
          description: 'Authenticate user with email and password',
          tags: ['Authentication'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/LoginRequest' }
              }
            }
          },
          responses: {
            200: {
              description: 'Login successful',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/LoginResponse' }
                }
              }
            }
          }
        }
      },
      '/auth/me': {
        get: {
          summary: 'Get current user information',
          description: 'Retrieve information about the currently authenticated user',
          tags: ['Authentication'],
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: 'User information retrieved successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: { $ref: '#/components/schemas/User' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      // User Management
      '/users': {
        get: {
          summary: 'Get all users',
          description: 'Retrieve all users in the system',
          tags: ['Users'],
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: 'Users retrieved successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/User' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        post: {
          summary: 'Create user',
          description: 'Create a new user',
          tags: ['Users'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateUserRequest' }
              }
            }
          },
          responses: {
            201: {
              description: 'User created successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: { $ref: '#/components/schemas/User' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      // Role Management
      '/roles': {
        get: {
          summary: 'Get all roles',
          description: 'Retrieve all roles in the system',
          tags: ['Roles'],
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: 'Roles retrieved successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/Role' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        post: {
          summary: 'Create role',
          description: 'Create a new role',
          tags: ['Roles'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateRoleRequest' }
              }
            }
          },
          responses: {
            201: {
              description: 'Role created successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: { $ref: '#/components/schemas/Role' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      // Posts Management
      '/posts': {
        get: {
          summary: 'Get all posts',
          description: 'Retrieve all posts',
          tags: ['Posts'],
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: 'Posts retrieved successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/Post' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        post: {
          summary: 'Create post',
          description: 'Create a new post',
          tags: ['Posts'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreatePostRequest' }
              }
            }
          },
          responses: {
            201: {
              description: 'Post created successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: { $ref: '#/components/schemas/Post' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      // Newsletters Management
      '/newsletters': {
        get: {
          summary: 'Get all newsletters',
          description: 'Retrieve all newsletters',
          tags: ['Newsletters'],
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: 'Newsletters retrieved successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/Newsletter' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        post: {
          summary: 'Create newsletter',
          description: 'Create a new newsletter with optional image upload',
          tags: ['Newsletters'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  required: ['title', 'content'],
                  properties: {
                    title: {
                      type: 'string',
                      description: 'Newsletter title',
                      example: 'Monthly Company Update'
                    },
                    content: {
                      type: 'string',
                      description: 'Newsletter content',
                      example: 'This month we achieved great milestones...'
                    },
                    image: {
                      type: 'string',
                      format: 'binary',
                      description: 'Newsletter image (optional)'
                    }
                  }
                }
              }
            }
          },
          responses: {
            201: {
              description: 'Newsletter created successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      message: { type: 'string' },
                      data: { $ref: '#/components/schemas/Newsletter' }
                    }
                  }
                }
              }
            },
            400: {
              description: 'Bad request - validation error',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' }
                }
              }
            },
            401: {
              description: 'Unauthorized',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' }
                }
              }
            }
          }
        }
      },
      // Events Management
      '/events': {
        get: {
          summary: 'Get all events',
          description: 'Retrieve all events',
          tags: ['Events'],
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: 'Events retrieved successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/Event' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        post: {
          summary: 'Create event',
          description: 'Create a new event',
          tags: ['Events'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateEventRequest' }
              }
            }
          },
          responses: {
            201: {
              description: 'Event created successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: { $ref: '#/components/schemas/Event' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      // Homepage
      '/homepage': {
        get: {
          summary: 'Get homepage data',
          description: 'Retrieve aggregated homepage data including posts, newsletters, events, and online users',
          tags: ['Homepage'],
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: 'Homepage data retrieved successfully',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/HomepageData' }
                }
              }
            }
          }
        }
      }
    }
  };
}

export { specs }; 