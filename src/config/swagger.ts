import swaggerJsdoc from 'swagger-jsdoc';
import { accountingEndpoints } from './accounting-endpoints';
import { performanceEndpoints } from './performance-endpoints';
import { taskAssignmentEndpoints } from './task-assignment-endpoints';

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
    tags: [
      {
        name: 'Financial Reporting',
        description: 'Endpoints for uploading and reviewing portfolio financial reports'
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
            userDepartment: { type: 'string', example: 'Investments' },
            departmentRole: { type: 'string', example: 'BOARD_MEMBER' },
            roleCode: { type: 'string', example: 'BOARD_MEMBER' },
            votingPower: {
              type: 'number',
              format: 'double',
              nullable: true,
              example: 25,
              description: 'Weighted voting percentage for board roles. Null for non-board users.'
            },
            backgroundImage: { type: 'string', example: 'https://example.com/backgrounds/tech-background.jpg' },
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
          required: ['firstName', 'lastName', 'email', 'department', 'roleCode', 'departmentRole'],
          properties: {
            firstName: { type: 'string', example: 'John', description: "User's first name" },
            lastName: { type: 'string', example: 'Doe', description: "User's last name" },
            email: { type: 'string', format: 'email', example: 'john.doe@nvccz.co.zw', description: 'Valid email address (will be converted to lowercase automatically)' },
            department: { 
              type: 'string', 
              enum: ['Finance', 'Sales', 'Operations', 'Procurement', 'Human Resources', 'Marketing', 'Legal', 'IT', 'Investments'],
              example: 'Finance',
              description: "User's department (must match one of the allowed values)"
            },
            roleCode: { 
              type: 'string', 
              example: 'FIN_OFF',
              description: 'Hardcoded role code (e.g., FIN_MGR, FIN_OFF, SALES_OFF, PROC_MGR, OPS_MGR, etc.)'
            },
            departmentRole: { 
              type: 'string', 
              enum: ['HEAD', 'DEPUTY', 'MEMBER', 'OFFICER', 'SPECIALIST', 'ASSISTANT'],
              example: 'OFFICER',
              description: "User's role within the department"
            }
          }
        },
        UpdateUserRequest: {
          type: 'object',
          properties: {
            firstName: { type: 'string', example: 'John', description: "User's first name" },
            lastName: { type: 'string', example: 'Doe', description: "User's last name" },
            email: { type: 'string', format: 'email', example: 'john.doe@nvccz.co.zw', description: 'Valid email address (will be converted to lowercase automatically)' },
            department: { 
              type: 'string', 
              enum: ['Finance', 'Sales', 'Operations', 'Procurement', 'Human Resources', 'Marketing', 'Legal', 'IT', 'Investments'],
              example: 'Finance',
              description: "User's department (must match one of the allowed values)"
            },
            roleCode: { 
              type: 'string', 
              example: 'FIN_OFF',
              description: 'Hardcoded role code (e.g., FIN_MGR, FIN_OFF, SALES_OFF, PROC_MGR, OPS_MGR, etc.)'
            },
            departmentRole: { 
              type: 'string', 
              enum: ['HEAD', 'DEPUTY', 'MEMBER', 'OFFICER', 'SPECIALIST', 'ASSISTANT'],
              example: 'OFFICER',
              description: "User's role within the department"
            },
            roleId: { 
              type: 'string', 
              example: 'clx1234567890abcdef',
              description: 'Optional: Role ID to assign to user (if provided, will override roleCode)'
            }
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
        },
        // Accounting schemas
        Currency: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clx1234567890abcdef' },
            code: { type: 'string', example: 'ZWL' },
            name: { type: 'string', example: 'Zimbabwean Dollar' },
            symbol: { type: 'string', example: '$' },
            isDefault: { type: 'boolean', example: true },
            isActive: { type: 'boolean', example: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        CreateCurrencyRequest: {
          type: 'object',
          required: ['code', 'name', 'symbol'],
          properties: {
            code: { type: 'string', example: 'USD' },
            name: { type: 'string', example: 'US Dollar' },
            symbol: { type: 'string', example: '$' },
            isDefault: { type: 'boolean', example: false }
          }
        },
        UpdateCurrencyRequest: {
          type: 'object',
          properties: {
            code: { type: 'string', example: 'USD' },
            name: { type: 'string', example: 'US Dollar' },
            symbol: { type: 'string', example: '$' },
            isDefault: { type: 'boolean', example: false },
            isActive: { type: 'boolean', example: true }
          }
        },
        Vendor: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clx1234567890abcdef' },
            name: { type: 'string', example: 'CBZ Bank' },
            contactPerson: { type: 'string', example: 'John Smith' },
            email: { type: 'string', example: 'contact@cbz.co.zw' },
            phone: { type: 'string', example: '+263 4 123456' },
            address: { type: 'string', example: '123 Main Street, Harare' },
            taxNumber: { type: 'string', example: '123456789' },
            isActive: { type: 'boolean', example: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        CreateVendorRequest: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', example: 'CBZ Bank' },
            contactPerson: { type: 'string', example: 'John Smith' },
            email: { type: 'string', example: 'contact@cbz.co.zw' },
            phone: { type: 'string', example: '+263 4 123456' },
            address: { type: 'string', example: '123 Main Street, Harare' },
            taxNumber: { type: 'string', example: '123456789' }
          }
        },
        UpdateVendorRequest: {
          type: 'object',
          properties: {
            name: { type: 'string', example: 'CBZ Bank Updated' },
            contactPerson: { type: 'string', example: 'John Smith Updated' },
            email: { type: 'string', example: 'contact.updated@cbz.co.zw' },
            phone: { type: 'string', example: '+263 4 123456' },
            address: { type: 'string', example: '123 Main Street, Harare' },
            taxNumber: { type: 'string', example: '123456789' },
            isActive: { type: 'boolean', example: true }
          }
        },
        ExpenseCategory: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clx1234567890abcdef' },
            name: { type: 'string', example: 'Professional Services' },
            description: { type: 'string', example: 'Legal, accounting, consulting services' },
            parentId: { type: 'string', nullable: true, example: 'clx1234567890abcdef' },
            isActive: { type: 'boolean', example: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            parent: { $ref: '#/components/schemas/ExpenseCategory' },
            children: {
              type: 'array',
              items: { $ref: '#/components/schemas/ExpenseCategory' }
            }
          }
        },
        CreateExpenseCategoryRequest: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', example: 'Legal Services' },
            description: { type: 'string', example: 'Legal and compliance services' },
            parentId: { type: 'string', nullable: true, example: 'clx1234567890abcdef' }
          }
        },
        UpdateExpenseCategoryRequest: {
          type: 'object',
          properties: {
            name: { type: 'string', example: 'Legal Services Updated' },
            description: { type: 'string', example: 'Updated legal and compliance services' },
            parentId: { type: 'string', nullable: true, example: 'clx1234567890abcdef' },
            isActive: { type: 'boolean', example: true }
          }
        },
        Expense: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clx1234567890abcdef' },
            vendorId: { type: 'string', example: 'clx1234567890abcdef' },
            categoryId: { type: 'string', example: 'clx1234567890abcdef' },
            amount: { type: 'number', example: 300.00 },
            vatAmount: { type: 'number', example: 43.50 },
            totalAmount: { type: 'number', example: 343.50 },
            currencyId: { type: 'string', example: 'clx1234567890abcdef' },
            transactionDate: { type: 'string', format: 'date', example: '2024-12-01' },
            description: { type: 'string', example: 'Legal consultation fees' },
            receiptNumber: { type: 'string', example: 'INV-001' },
            isTaxable: { type: 'boolean', example: true },
            paymentMethod: { 
              type: 'string', 
              enum: ['CASH', 'BANK', 'CREDIT'],
              description: 'Payment method used for the expense',
              example: 'BANK'
            },
            status: { type: 'string', example: 'POSTED' },
            journalEntryId: { type: 'string', example: 'clx1234567890abcdef' },
            isActive: { type: 'boolean', example: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            vendor: { $ref: '#/components/schemas/Vendor' },
            category: { $ref: '#/components/schemas/ExpenseCategory' },
            currency: { $ref: '#/components/schemas/Currency' },
            journalEntry: { $ref: '#/components/schemas/JournalEntry' }
          }
        },
        CreateExpenseRequest: {
          type: 'object',
          required: ['vendorId', 'category', 'amount', 'currencyId', 'transactionDate', 'description'],
          properties: {
            vendorId: { type: 'string', example: 'clx1234567890abcdef' },
            category: { 
              type: 'string', 
              enum: ['Salaries and Wages', 'Travel and Accommodation', 'Operations', 'Branding and Marketing', 'Office Equipment'],
              description: 'Expense category name',
              example: 'Salaries and Wages'
            },
            amount: { type: 'number', example: 300.00 },
            currencyId: { type: 'string', example: 'clx1234567890abcdef' },
            transactionDate: { type: 'string', format: 'date', example: '2024-12-01' },
            description: { type: 'string', example: 'Monthly payroll expense' },
            receiptNumber: { type: 'string', example: 'PAY-2024-001' },
            isTaxable: { type: 'boolean', example: true },
            paymentMethod: { 
              type: 'string', 
              enum: ['CASH', 'BANK', 'CREDIT'],
              default: 'BANK',
              description: 'Payment method used for the expense',
              example: 'BANK'
            }
          }
        },
        UpdateExpenseRequest: {
          type: 'object',
          description: 'Update expense request. Note: Category, vendor, and currency cannot be changed after creation.',
          properties: {
            amount: { 
              type: 'number', 
              example: 300.00,
              description: 'Expense amount (creates reversal + new journal entry if changed)'
            },
            transactionDate: { 
              type: 'string', 
              format: 'date', 
              example: '2024-12-01',
              description: 'Transaction date'
            },
            description: { 
              type: 'string', 
              example: 'Updated expense description',
              description: 'Expense description'
            },
            receiptNumber: { 
              type: 'string', 
              example: 'INV-001',
              description: 'Receipt number'
            },
            isTaxable: { 
              type: 'boolean', 
              example: true,
              description: 'Whether VAT applies (creates reversal + new journal entry if changed)'
            },
            paymentMethod: { 
              type: 'string', 
              enum: ['CASH', 'BANK', 'CREDIT'],
              description: 'Payment method used for the expense',
              example: 'BANK'
            }
          }
        },
        VATCalculationRequest: {
          type: 'object',
          required: ['amount', 'isTaxable'],
          properties: {
            amount: { type: 'number', example: 300.00 },
            isTaxable: { type: 'boolean', example: true }
          }
        },
        VATCalculationResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                amount: { type: 'number', example: 300.00 },
                vatAmount: { type: 'number', example: 43.50 },
                totalAmount: { type: 'number', example: 343.50 },
                vatRate: { type: 'number', example: 0.145 }
              }
            }
          }
        },
        JournalEntry: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clx1234567890abcdef' },
            referenceNumber: { type: 'string', example: 'JE-2024-001' },
            description: { type: 'string', example: 'Expense entry for legal fees' },
            transactionDate: { type: 'string', format: 'date', example: '2024-12-01' },
            status: { 
              type: 'string', 
              enum: ['PENDING', 'POSTED', 'VOID'],
              example: 'PENDING',
              description: 'Journal entry status: PENDING (default), POSTED (after approval), VOID (cancelled)'
            },
            totalAmount: { type: 'number', example: 343.50 },
            currencyId: { type: 'string', example: 'clx1234567890abcdef' },
            currency: {
              type: 'object',
              properties: {
                id: { type: 'string', example: 'clx1234567890abcdef' },
                code: { type: 'string', example: 'ZWL' },
                name: { type: 'string', example: 'Zimbabwe Dollar' }
              }
            },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            createdBy: {
              type: 'object',
              properties: {
                id: { type: 'string', example: 'clx1234567890abcdef' },
                firstName: { type: 'string', example: 'John' },
                lastName: { type: 'string', example: 'Doe' }
              }
            },
            journalEntryLines: {
              type: 'array',
              items: { $ref: '#/components/schemas/JournalEntryLine' }
            }
          }
        },
        JournalEntryLine: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clx1234567890abcdef' },
            journalEntryId: { type: 'string', example: 'clx1234567890abcdef' },
            accountId: { type: 'string', example: 'clx1234567890abcdef' },
            description: { type: 'string', example: 'Legal fees expense' },
            debitAmount: { type: 'number', example: 300.00 },
            creditAmount: { type: 'number', example: 0.00 },
            account: {
              type: 'object',
              properties: {
                id: { type: 'string', example: 'clx1234567890abcdef' },
                code: { type: 'string', example: '5001' },
                name: { type: 'string', example: 'Legal Fees' },
                type: { type: 'string', example: 'EXPENSE' }
              }
            }
          }
        },
        ChartOfAccounts: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clx1234567890abcdef' },
            accountNo: { type: 'string', example: '1000' },
            accountName: { type: 'string', example: 'Cash and Cash Equivalents' },
            accountType: { type: 'string', example: 'Current Asset' },
            financialStatement: { type: 'string', example: 'Balance Sheet' },
            notes: { type: 'string', example: 'Bank balances, petty cash' },
            parentId: { type: 'string', nullable: true, example: null },
            isActive: { type: 'boolean', example: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        Customer: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clx1234567890abcdef' },
            name: { type: 'string', example: 'ABC Investment Fund' },
            taxNumber: { type: 'string', example: 'TAX123456789' },
            contactPerson: { type: 'string', example: 'John Smith' },
            email: { type: 'string', example: 'john@abcfund.com' },
            phone: { type: 'string', example: '+263777123456' },
            address: { type: 'string', example: '123 Investment Street, Harare' },
            paymentTerms: { type: 'string', example: 'Net 30' },
            isActive: { type: 'boolean', example: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        CreateCustomerRequest: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', example: 'ABC Investment Fund' },
            taxNumber: { type: 'string', example: 'TAX123456789' },
            contactPerson: { type: 'string', example: 'John Smith' },
            email: { type: 'string', example: 'john@abcfund.com' },
            phone: { type: 'string', example: '+263777123456' },
            address: { type: 'string', example: '123 Investment Street, Harare' },
            paymentTerms: { type: 'string', example: 'Net 30' }
          }
        },
        UpdateCustomerRequest: {
          type: 'object',
          properties: {
            name: { type: 'string', example: 'ABC Investment Fund Updated' },
            taxNumber: { type: 'string', example: 'TAX123456789' },
            contactPerson: { type: 'string', example: 'John Smith Updated' },
            email: { type: 'string', example: 'john.updated@abcfund.com' },
            phone: { type: 'string', example: '+263777123456' },
            address: { type: 'string', example: '123 Investment Street, Harare' },
            paymentTerms: { type: 'string', example: 'Net 15' },
            isActive: { type: 'boolean', example: true }
          }
        },
        Invoice: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clx1234567890abcdef' },
            customerId: { type: 'string', example: 'clx1234567890abcdef' },
            amount: { type: 'number', example: 1000.00 },
            vatAmount: { type: 'number', example: 145.00 },
            totalAmount: { type: 'number', example: 1145.00 },
            currencyId: { type: 'string', example: 'clx1234567890abcdef' },
            transactionDate: { type: 'string', format: 'date', example: '2025-08-05' },
            description: { type: 'string', example: 'Management Fees Q4 2024' },
            invoiceNumber: { type: 'string', example: 'INV-1754391778855-504' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  description: { type: 'string', example: 'Management Fee Q4 2024' },
                  amount: { type: 'number', example: 1000.00 },
                  category: { type: 'string', example: 'Management Fees' }
                }
              }
            },
            isTaxable: { type: 'boolean', example: true },
            status: { type: 'string', example: 'DRAFT', enum: ['DRAFT', 'SENT', 'PAID', 'VOID'] },
            paymentMethod: { 
              type: 'string', 
              enum: ['CASH', 'BANK', 'CREDIT'],
              description: 'Payment method used when invoice is paid',
              example: 'BANK'
            },
            // Currency conversion fields
            exchangeRateAtCreation: { 
              type: 'number', 
              example: 1.15,
              description: 'Exchange rate when invoice was created (for multi-currency payments)'
            },
            paymentCurrencyId: { 
              type: 'string', 
              example: 'clx1234567890abcdef',
              description: 'Currency used for payment (if different from invoice currency)'
            },
            amountInPaymentCurrency: { 
              type: 'number', 
              example: 1150.00,
              description: 'Amount in payment currency after conversion'
            },

            paymentDate: { 
              type: 'string', 
              format: 'date-time',
              example: '2025-08-05T10:30:00Z',
              description: 'Date when payment was processed'
            },
            journalEntryId: { type: 'string', example: 'clx1234567890abcdef' },
            isActive: { type: 'boolean', example: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            customer: { $ref: '#/components/schemas/Customer' },
            currency: { $ref: '#/components/schemas/Currency' },
            paymentCurrency: { $ref: '#/components/schemas/Currency' },
            journalEntry: { $ref: '#/components/schemas/JournalEntry' }
          }
        },
        CreateInvoiceRequest: {
          type: 'object',
          required: ['customerId', 'amount', 'currencyId', 'transactionDate', 'description'],
          properties: {
            customerId: { type: 'string', example: 'clx1234567890abcdef' },
            amount: { type: 'number', example: 1000.00 },
            currencyId: { type: 'string', example: 'clx1234567890abcdef' },
            transactionDate: { type: 'string', format: 'date', example: '2025-08-05' },
            description: { type: 'string', example: 'Management Fees Q4 2024' },
            invoiceNumber: { type: 'string', example: 'INV-2024-001' },
            isTaxable: { type: 'boolean', example: true },
            exchangeRateAtCreation: { 
              type: 'number', 
              example: 1.15,
              description: 'Exchange rate when invoice was created (for multi-currency payments)'
            },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  description: { type: 'string', example: 'Management Fee Q4 2024' },
                  amount: { type: 'number', example: 1000.00 },
                  category: { type: 'string', example: 'Management Fees' }
                }
              }
            }
          }
        },
        UpdateInvoiceRequest: {
          type: 'object',
          properties: {
            customerId: { type: 'string', example: 'clx1234567890abcdef' },
            amount: { type: 'number', example: 1000.00 },
            currencyId: { type: 'string', example: 'clx1234567890abcdef' },
            transactionDate: { type: 'string', format: 'date', example: '2025-08-05' },
            description: { type: 'string', example: 'Management Fees Q4 2024 Updated' },
            invoiceNumber: { type: 'string', example: 'INV-2024-001' },
            isTaxable: { type: 'boolean', example: true },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  description: { type: 'string', example: 'Management Fee Q4 2024' },
                  amount: { type: 'number', example: 1000.00 },
                  category: { type: 'string', example: 'Management Fees' }
                }
              }
            },
            isActive: { type: 'boolean', example: true }
          }
        },
        // Revenue schemas
        RevenueSource: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clx1234567890abcdef' },
            name: { type: 'string', example: 'Client Services' },
            description: { type: 'string', example: 'Revenue from client services' },
            isActive: { type: 'boolean', example: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        CreateRevenueSourceRequest: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', example: 'Client Services' },
            description: { type: 'string', example: 'Revenue from client services' }
          }
        },
        UpdateRevenueSourceRequest: {
          type: 'object',
          properties: {
            name: { type: 'string', example: 'Client Services Updated' },
            description: { type: 'string', example: 'Updated revenue from client services' },
            isActive: { type: 'boolean', example: true }
          }
        },
        RevenueCategory: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clx1234567890abcdef' },
            name: { type: 'string', example: 'Management Fees' },
            description: { type: 'string', example: 'Management and advisory fees' },
            parentId: { type: 'string', nullable: true, example: 'clx1234567890abcdef' },
            isActive: { type: 'boolean', example: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            parent: { $ref: '#/components/schemas/RevenueCategory' },
            children: {
              type: 'array',
              items: { $ref: '#/components/schemas/RevenueCategory' }
            }
          }
        },
        CreateRevenueCategoryRequest: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', example: 'Management Fees' },
            description: { type: 'string', example: 'Management and advisory fees' },
            parentId: { type: 'string', nullable: true, example: 'clx1234567890abcdef' }
          }
        },
        UpdateRevenueCategoryRequest: {
          type: 'object',
          properties: {
            name: { type: 'string', example: 'Management Fees Updated' },
            description: { type: 'string', example: 'Updated management and advisory fees' },
            parentId: { type: 'string', nullable: true, example: 'clx1234567890abcdef' },
            isActive: { type: 'boolean', example: true }
          }
        },
        Revenue: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clx1234567890abcdef' },
            sourceId: { type: 'string', example: 'clx1234567890abcdef' },
            categoryId: { type: 'string', example: 'clx1234567890abcdef' },
            amount: { type: 'number', example: 1000.00 },
            vatAmount: { type: 'number', example: 145.00 },
            totalAmount: { type: 'number', example: 1145.00 },
            currencyId: { type: 'string', example: 'clx1234567890abcdef' },
            transactionDate: { type: 'string', format: 'date', example: '2024-12-01' },
            description: { type: 'string', example: 'Management fees for Q4 2024' },
            isTaxable: { type: 'boolean', example: true },
            paymentMethod: { 
              type: 'string', 
              enum: ['CASH', 'BANK', 'CREDIT'],
              description: 'Payment method used for the revenue',
              example: 'BANK'
            },
            status: { type: 'string', example: 'POSTED' },
            journalEntryId: { type: 'string', example: 'clx1234567890abcdef' },
            isActive: { type: 'boolean', example: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            source: { $ref: '#/components/schemas/RevenueSource' },
            category: { $ref: '#/components/schemas/RevenueCategory' },
            currency: { $ref: '#/components/schemas/Currency' },
            journalEntry: { $ref: '#/components/schemas/JournalEntry' }
          }
        },
        CreateRevenueRequest: {
          type: 'object',
          required: ['sourceId', 'categoryId', 'amount', 'currencyId', 'transactionDate', 'description'],
          properties: {
            sourceId: { type: 'string', example: 'clx1234567890abcdef' },
            categoryId: { type: 'string', example: 'clx1234567890abcdef' },
            amount: { type: 'number', example: 1000.00 },
            currencyId: { type: 'string', example: 'clx1234567890abcdef' },
            transactionDate: { type: 'string', format: 'date', example: '2024-12-01' },
            description: { type: 'string', example: 'Management fees for Q4 2024' },
            isTaxable: { type: 'boolean', example: true },
            paymentMethod: { 
              type: 'string', 
              enum: ['CASH', 'BANK', 'CREDIT'],
              default: 'BANK',
              description: 'Payment method used for the revenue',
              example: 'BANK'
            }
          }
        },
        UpdateRevenueRequest: {
          type: 'object',
          properties: {
            sourceId: { type: 'string', example: 'clx1234567890abcdef' },
            categoryId: { type: 'string', example: 'clx1234567890abcdef' },
            amount: { type: 'number', example: 1000.00 },
            currencyId: { type: 'string', example: 'clx1234567890abcdef' },
            transactionDate: { type: 'string', format: 'date', example: '2024-12-01' },
            description: { type: 'string', example: 'Management fees for Q4 2024 Updated' },
            isTaxable: { type: 'boolean', example: true },
            isActive: { type: 'boolean', example: true },
            paymentMethod: { 
              type: 'string', 
              enum: ['CASH', 'BANK', 'CREDIT'],
              description: 'Payment method used for the revenue',
              example: 'BANK'
            }
          }
        },
        // Mini-KYC schemas
        MiniKyc: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clx1234567890abcdef' },
            userId: { type: 'string', example: 'clx1234567890abcdef' },
            data: { 
              type: 'object', 
              description: 'Dynamic key-value pairs for KYC data',
              example: {
                businessType: 'Technology',
                companySize: '25-50',
                industry: 'Software Development',
                foundedYear: 2020,
                employeeCount: 35,
                preferredCurrency: 'USD',
                annualRevenue: '2000000-5000000',
                taxId: 'TAX123456789',
                bankAccountNumber: '1234567890',
                businessAddress: '123 Tech Street, Harare',
                contactPerson: 'John Doe',
                phoneNumber: '+263777123456',
                website: 'https://example.com',
                businessLicense: 'LIC123456',
                complianceStatus: 'Compliant',
                riskLevel: 'Low',
                verificationStatus: 'Verified',
                lastReviewDate: '2024-12-01'
              }
            },
            isCompleted: { type: 'boolean', example: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        CreateMiniKycRequest: {
          type: 'object',
          properties: {
            data: { 
              type: 'object', 
              description: 'Dynamic key-value pairs for KYC data',
              example: {
                businessType: 'Technology',
                companySize: '25-50',
                industry: 'Software Development',
                foundedYear: 2020,
                employeeCount: 35,
                preferredCurrency: 'USD',
                annualRevenue: '2000000-5000000',
                taxId: 'TAX123456789',
                bankAccountNumber: '1234567890',
                businessAddress: '123 Tech Street, Harare',
                contactPerson: 'John Doe',
                phoneNumber: '+263777123456',
                website: 'https://example.com',
                businessLicense: 'LIC123456',
                complianceStatus: 'Compliant',
                riskLevel: 'Low',
                verificationStatus: 'Verified',
                lastReviewDate: '2024-12-01'
              }
            },
            isCompleted: { type: 'boolean', example: true }
          }
        },
        UpdateMiniKycRequest: {
          type: 'object',
          properties: {
            data: { 
              type: 'object', 
              description: 'Dynamic key-value pairs for KYC data',
              example: {
                businessType: 'Technology Updated',
                companySize: '50-100',
                industry: 'Software Development',
                foundedYear: 2020,
                employeeCount: 75,
                preferredCurrency: 'USD',
                annualRevenue: '5000000-10000000',
                taxId: 'TAX123456789',
                bankAccountNumber: '1234567890',
                businessAddress: '456 Tech Street, Harare',
                contactPerson: 'John Doe Updated',
                phoneNumber: '+263777123456',
                website: 'https://example.com',
                businessLicense: 'LIC123456',
                complianceStatus: 'Compliant',
                riskLevel: 'Low',
                verificationStatus: 'Verified',
                lastReviewDate: '2024-12-01'
              }
            },
            isCompleted: { type: 'boolean', example: true }
          }
        },
        // Company Profile schemas
        CompanyProfile: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clx1234567890abcdef' },
            twitter: { type: 'string', example: 'https://twitter.com/nvccz' },
            facebook: { type: 'string', example: 'https://facebook.com/nvccz' },
            linkedin: { type: 'string', example: 'https://linkedin.com/company/nvccz' },
            instagram: { type: 'string', example: 'https://instagram.com/nvccz' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        CreateCompanyProfileRequest: {
          type: 'object',
          properties: {
            twitter: { type: 'string', example: 'https://twitter.com/nvccz' },
            facebook: { type: 'string', example: 'https://facebook.com/nvccz' },
            linkedin: { type: 'string', example: 'https://linkedin.com/company/nvccz' },
            instagram: { type: 'string', example: 'https://instagram.com/nvccz' }
          }
        },
        UpdateCompanyProfileRequest: {
          type: 'object',
          properties: {
            twitter: { type: 'string', example: 'https://twitter.com/nvccz_updated' },
            facebook: { type: 'string', example: 'https://facebook.com/nvccz_updated' },
            linkedin: { type: 'string', example: 'https://linkedin.com/company/nvccz_updated' },
            instagram: { type: 'string', example: 'https://instagram.com/nvccz_updated' }
          }
        },
        // Application schemas
        Application: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clx1234567890abcdef' },
            applicantName: { type: 'string', example: 'John Doe' },
            applicantEmail: { type: 'string', example: 'john.doe@example.com' },
            applicantPhone: { type: 'string', example: '+1234567890' },
            applicantAddress: { type: 'string', example: '123 Main Street, City, Country' },
            businessName: { type: 'string', example: 'TechStart Inc.' },
            businessDescription: { type: 'string', example: 'A technology startup focused on AI solutions' },
            industry: { type: 'string', example: 'Technology' },
            businessStage: { type: 'string', example: 'STARTUP' },
            foundingDate: { type: 'string', format: 'date-time', example: '2023-01-15T00:00:00.000Z' },
            requestedAmount: { type: 'number', example: 100000 },
            fundId: { type: 'string', example: 'clx1234567890abcdef' },
            currentStage: { type: 'string', example: 'SHORTLISTED' },
            submittedAt: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00.000Z' },
            initialScreeningScore: { type: 'number', example: 75.5 },
            screeningOutcome: { type: 'string', example: 'PASSED' },
            dueDiligenceScore: { type: 'number', example: 82.0 },
            boardDecision: { type: 'string', example: 'APPROVED' },
            createdAt: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00.000Z' },
            updatedAt: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00.000Z' },
            fund: {
              type: 'object',
              properties: {
                id: { type: 'string', example: 'clx1234567890abcdef' },
                name: { type: 'string', example: 'NVCCZ Seed Fund' },
                status: { type: 'string', example: 'OPEN' }
              }
            },
            documents: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', example: 'clx1234567890abcdef' },
                  documentType: { type: 'string', example: 'BUSINESS_PLAN' },
                  fileName: { type: 'string', example: 'business_plan.pdf' },
                  isRequired: { type: 'boolean', example: true },
                  isSubmitted: { type: 'boolean', example: true }
                }
              }
            }
          }
        },
        // Portfolio Company schemas
        PortfolioCompany: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clx1234567890abcdef' },
            userId: { type: 'string', example: 'clx1234567890abcdef' },
            name: { type: 'string', example: 'TechStartup Inc.' },
            registrationNumber: { type: 'string', example: 'REG123456789' },
            industry: { type: 'string', example: 'Technology' },
            foundingDate: { type: 'string', format: 'date-time', example: '2020-01-15T00:00:00.000Z' },
            address: { type: 'string', example: '123 Innovation Street, Tech City, TC 12345' },
            website: { type: 'string', example: 'https://techstartup.com' },
            description: { type: 'string', example: 'A leading technology startup focused on AI solutions' },
            logoUrl: { type: 'string', example: 'https://example.com/logo.png' },
            status: { type: 'string', example: 'PENDING', enum: ['PENDING', 'APPROVED', 'REJECTED', 'ACTIVE', 'SUSPENDED'] },
            companySize: { type: 'string', example: 'MEDIUM', enum: ['SMALL', 'MEDIUM', 'LARGE'] },
            employeeCount: { type: 'integer', example: 50 },
            annualRevenue: { type: 'number', example: 1000000.00 },
            fundingStage: { type: 'string', example: 'SERIES_A', enum: ['SEED', 'SERIES_A', 'SERIES_B', 'SERIES_C', 'LATE_STAGE'] },
            contactPerson: { type: 'string', example: 'John Doe' },
            contactPhone: { type: 'string', example: '+1234567890' },
            contactEmail: { type: 'string', example: 'contact@techstartup.com' },
            socialMedia: { 
              type: 'object', 
              example: {
                linkedin: 'https://linkedin.com/company/techstartup',
                twitter: 'https://twitter.com/techstartup',
                facebook: 'https://facebook.com/techstartup'
              }
            },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string', example: 'clx1234567890abcdef' },
                firstName: { type: 'string', example: 'John' },
                lastName: { type: 'string', example: 'Doe' },
                email: { type: 'string', example: 'john.doe@techstartup.com' },
                role: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', example: 'clx1234567890abcdef' },
                    name: { type: 'string', example: 'applicant' }
                  }
                }
              }
            }
          }
        },
        CreatePortfolioCompanyRequest: {
          type: 'object',
          required: ['firstName', 'lastName', 'email', 'password', 'name', 'registrationNumber', 'industry', 'foundingDate', 'address'],
          properties: {
            firstName: { type: 'string', example: 'John' },
            lastName: { type: 'string', example: 'Doe' },
            email: { type: 'string', format: 'email', example: 'john.doe@techstartup.com' },
            password: { type: 'string', minLength: 6, example: 'password123' },
            name: { type: 'string', example: 'TechStartup Inc.' },
            registrationNumber: { type: 'string', example: 'REG123456789' },
            industry: { type: 'string', example: 'Technology' },
            foundingDate: { type: 'string', format: 'date', example: '2020-01-15' },
            address: { type: 'string', example: '123 Innovation Street, Tech City, TC 12345' },
            website: { type: 'string', format: 'uri', example: 'https://techstartup.com' },
            description: { type: 'string', example: 'A leading technology startup focused on AI solutions' },
            logoUrl: { type: 'string', format: 'uri', example: 'https://example.com/logo.png' },
            status: { type: 'string', example: 'PENDING', enum: ['PENDING', 'APPROVED', 'REJECTED', 'ACTIVE', 'SUSPENDED'] },
            companySize: { type: 'string', example: 'MEDIUM', enum: ['SMALL', 'MEDIUM', 'LARGE'] },
            employeeCount: { type: 'integer', example: 50 },
            annualRevenue: { type: 'number', example: 1000000.00 },
            fundingStage: { type: 'string', example: 'SERIES_A', enum: ['SEED', 'SERIES_A', 'SERIES_B', 'SERIES_C', 'LATE_STAGE'] },
            contactPerson: { type: 'string', example: 'John Doe' },
            contactPhone: { type: 'string', example: '+1234567890' },
            contactEmail: { type: 'string', example: 'contact@techstartup.com' },
            socialMedia: { 
              type: 'object', 
              example: {
                linkedin: 'https://linkedin.com/company/techstartup',
                twitter: 'https://twitter.com/techstartup',
                facebook: 'https://facebook.com/techstartup'
              }
            }
          }
        },
        UpdatePortfolioCompanyRequest: {
          type: 'object',
          properties: {
            name: { type: 'string', example: 'TechStartup Inc. Updated' },
            industry: { type: 'string', example: 'Technology' },
            foundingDate: { type: 'string', format: 'date', example: '2020-01-15' },
            address: { type: 'string', example: '123 Innovation Street, Tech City, TC 12345' },
            website: { type: 'string', format: 'uri', example: 'https://techstartup.com' },
            description: { type: 'string', example: 'A leading technology startup focused on AI solutions' },
            logoUrl: { type: 'string', format: 'uri', example: 'https://example.com/logo.png' },
            status: { type: 'string', example: 'APPROVED', enum: ['PENDING', 'APPROVED', 'REJECTED', 'ACTIVE', 'SUSPENDED'] },
            companySize: { type: 'string', example: 'MEDIUM', enum: ['SMALL', 'MEDIUM', 'LARGE'] },
            employeeCount: { type: 'integer', example: 50 },
            annualRevenue: { type: 'number', example: 1000000.00 },
            fundingStage: { type: 'string', example: 'SERIES_A', enum: ['SEED', 'SERIES_A', 'SERIES_B', 'SERIES_C', 'LATE_STAGE'] },
            contactPerson: { type: 'string', example: 'John Doe' },
            contactPhone: { type: 'string', example: '+1234567890' },
            contactEmail: { type: 'string', example: 'contact@techstartup.com' },
            socialMedia: { 
              type: 'object', 
              example: {
                linkedin: 'https://linkedin.com/company/techstartup',
                twitter: 'https://twitter.com/techstartup',
                facebook: 'https://facebook.com/techstartup'
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
  apis: ['./src/**/*.ts', './src/routes/**/*.ts', './src/controllers/**/*.ts']
};

let specs: any;
// Create fallback spec with all endpoints
const fallbackSpec = {
  ...options.definition,
  paths: {
    ...accountingEndpoints,
    ...performanceEndpoints,
    ...taskAssignmentEndpoints,
    // Cashbook endpoints for fallback - Complete set
    // Core Transactions
    '/api/cashbook/receipts': {
      post: {
        summary: 'Create cash receipt',
        description: 'Create a new cash receipt transaction',
        tags: ['Cashbook'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['bankId', 'transactionDate', 'description', 'amount', 'counterpartyType'],
                properties: {
                  bankId: { type: 'string', description: 'Bank account ID' },
                  transactionDate: { type: 'string', format: 'date', description: 'Transaction date' },
                  description: { type: 'string', description: 'Transaction description' },
                  amount: { type: 'number', description: 'Transaction amount' },
                  reference: { type: 'string', description: 'Transaction reference' },
                  counterpartyType: { type: 'string', enum: ['GL', 'CUSTOMER', 'SUPPLIER'], description: 'Counterparty type' },
                  glAccountId: { type: 'string', description: 'GL account ID (required for GL transactions)' },
                  customerId: { type: 'string', description: 'Customer ID (required for customer transactions)' },
                  vendorId: { type: 'string', description: 'Vendor ID (required for supplier transactions)' },
                  vatCode: { type: 'string', enum: ['15%', '0%', 'EXEMPT'], default: '15%', description: 'VAT code' },
                  projectCode: { type: 'string', description: 'Project code' },
                  discount: { type: 'number', description: 'Settlement discount' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Cash receipt created successfully' },
          400: { description: 'Bad request - validation errors' },
          401: { description: 'Unauthorized' }
        }
      }
    },
    '/api/cashbook/payments': {
      post: {
        summary: 'Create cash payment',
        description: 'Create a new cash payment transaction',
        tags: ['Cashbook'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['bankId', 'transactionDate', 'description', 'amount', 'counterpartyType'],
                properties: {
                  bankId: { type: 'string', description: 'Bank account ID' },
                  transactionDate: { type: 'string', format: 'date', description: 'Transaction date' },
                  description: { type: 'string', description: 'Transaction description' },
                  amount: { type: 'number', description: 'Transaction amount' },
                  reference: { type: 'string', description: 'Transaction reference' },
                  counterpartyType: { type: 'string', enum: ['GL', 'CUSTOMER', 'SUPPLIER'], description: 'Counterparty type' },
                  glAccountId: { type: 'string', description: 'GL account ID (required for GL transactions)' },
                  customerId: { type: 'string', description: 'Customer ID (required for customer transactions)' },
                  vendorId: { type: 'string', description: 'Vendor ID (required for supplier transactions)' },
                  vatCode: { type: 'string', enum: ['15%', '0%', 'EXEMPT'], default: '15%', description: 'VAT code' },
                  projectCode: { type: 'string', description: 'Project code' },
                  discount: { type: 'number', description: 'Settlement discount' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Cash payment created successfully' },
          400: { description: 'Bad request - validation errors' },
          401: { description: 'Unauthorized' }
        }
      }
    },
    // Batch Operations
    '/api/cashbook/batches/import': {
      post: {
        summary: 'Import CSV batch',
        description: 'Import cashbook transactions from CSV file',
        tags: ['Cashbook'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  file: { type: 'string', format: 'binary', description: 'CSV file to import' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'CSV imported successfully' },
          400: { description: 'Bad request - invalid file format' },
          401: { description: 'Unauthorized' }
        }
      }
    },
    '/api/cashbook/batches': {
      get: {
        summary: 'List batches',
        description: 'Get list of cashbook batches',
        tags: ['Cashbook'],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Batches retrieved successfully' },
          401: { description: 'Unauthorized' }
        }
      },
      post: {
        summary: 'Create batch',
        description: 'Create a new cashbook batch',
        tags: ['Cashbook'],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Batch created successfully' },
          401: { description: 'Unauthorized' }
        }
      }
    },
    '/api/cashbook/batches/{batchId}': {
      get: {
        summary: 'Get batch details',
        description: 'Retrieve details for a specific cashbook batch',
        tags: ['Cashbook'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'batchId', in: 'path', required: true, schema: { type: 'string' }, description: 'Batch ID' }
        ],
        responses: {
          200: { description: 'Batch details retrieved successfully' },
          401: { description: 'Unauthorized' },
          404: { description: 'Batch not found' }
        }
      },
      put: {
        summary: 'Update batch',
        description: 'Update batch details (name, description, status)',
        tags: ['Cashbook'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'batchId', in: 'path', required: true, schema: { type: 'string' }, description: 'Batch ID' }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string',
                    description: 'Batch name'
                  },
                  description: {
                    type: 'string',
                    description: 'Batch description'
                  },
                  status: {
                    type: 'string',
                    enum: ['DRAFT', 'POSTED'],
                    description: 'Batch status'
                  }
                }
              }
            }
          }
        },
        responses: {
          200: { 
            description: 'Batch updated successfully',
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
          400: { description: 'Bad request - validation errors' },
          401: { description: 'Unauthorized' },
          403: { description: 'Forbidden' },
          404: { description: 'Batch not found' }
        }
      },
      delete: {
        summary: 'Delete batch',
        description: 'Delete a specific cashbook batch',
        tags: ['Cashbook'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'batchId', in: 'path', required: true, schema: { type: 'string' }, description: 'Batch ID' }
        ],
        responses: {
          200: { description: 'Batch deleted successfully' },
          401: { description: 'Unauthorized' },
          404: { description: 'Batch not found' }
        }
      }
    },
    '/api/cashbook/batches/{batchId}/post': {
      post: {
        summary: 'Post batch',
        description: 'Post a specific cashbook batch to the General Ledger (GL)',
        tags: ['Cashbook'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'batchId', in: 'path', required: true, schema: { type: 'string' }, description: 'Batch ID' }
        ],
        responses: {
          200: { description: 'Batch posted successfully' },
          401: { description: 'Unauthorized' },
          404: { description: 'Batch not found' }
        }
      }
    },
    '/api/cashbook/batches/{batchId}/export': {
      get: {
        summary: 'Export batch to CSV',
        description: 'Export a single cashbook batch to a CSV file',
        tags: ['Cashbook'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'batchId', in: 'path', required: true, schema: { type: 'string' }, description: 'Batch ID' }
        ],
        responses: {
          200: { description: 'Batch exported successfully' },
          401: { description: 'Unauthorized' },
          404: { description: 'Batch not found' }
        }
      }
    },
    '/api/cashbook/batches/export/all': {
      get: {
        summary: 'Export all batches',
        description: 'Export all cashbook batches to a CSV file',
        tags: ['Cashbook'],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'All batches exported successfully' },
          401: { description: 'Unauthorized' }
        }
      }
    },
    '/api/cashbook/batches/{batchId}/transactions/{transactionId}': {
      post: {
        summary: 'Add transaction to batch',
        description: 'Add a transaction to a specific batch',
        tags: ['Cashbook'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'batchId', in: 'path', required: true, schema: { type: 'string' }, description: 'Batch ID' },
          { name: 'transactionId', in: 'path', required: true, schema: { type: 'string' }, description: 'Transaction ID' }
        ],
        responses: {
          200: { description: 'Transaction added to batch successfully' },
          401: { description: 'Unauthorized' },
          404: { description: 'Batch or transaction not found' }
        }
      }
    },
    // Removed non-existent /api/cashbook/{bankId}/post-batch endpoint
    // Cashbook Entry Operations
    '/api/cashbook/entries': {
      get: {
        summary: 'Get all entries',
        description: 'Retrieve all cashbook entries with support for advanced filtering',
        tags: ['Cashbook'],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Entries retrieved successfully' },
          401: { description: 'Unauthorized' }
        }
      }
    },
    '/api/cashbook/entries/{id}': {
      get: {
        summary: 'Get entry by ID',
        description: 'Retrieve a specific cashbook entry by its ID',
        tags: ['Cashbook'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Entry ID' }
        ],
        responses: {
          200: { description: 'Entry retrieved successfully' },
          401: { description: 'Unauthorized' },
          404: { description: 'Entry not found' }
        }
      },
      put: {
        summary: 'Update entry',
        description: 'Update an existing cashbook entry',
        tags: ['Cashbook'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Entry ID' }
        ],
        responses: {
          200: { description: 'Entry updated successfully' },
          401: { description: 'Unauthorized' },
          404: { description: 'Entry not found' }
        }
      }
    },
    '/api/cashbook/entries/{id}/void': {
      put: {
        summary: 'Void entry',
        description: 'Void a specific cashbook entry',
        tags: ['Cashbook'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Entry ID' }
        ],
        responses: {
          200: { description: 'Entry voided successfully' },
          401: { description: 'Unauthorized' },
          404: { description: 'Entry not found' }
        }
      }
    },
    '/api/cashbook/entries/{id}/reconcile': {
      put: {
        summary: 'Reconcile entry',
        description: 'Mark a cashbook entry as reconciled',
        tags: ['Cashbook'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Entry ID' }
        ],
        responses: {
          200: { description: 'Entry reconciled successfully' },
          401: { description: 'Unauthorized' },
          404: { description: 'Entry not found' }
        }
      }
    },
    // Reference and Configuration
    '/api/cashbook/reference/next': {
      get: {
        summary: 'Get next reference number',
        description: 'Retrieve the next available reference number',
        tags: ['Cashbook'],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: 'query',
            name: 'type',
            required: true,
            schema: {
              type: 'string',
              enum: ['RECEIPT', 'PAYMENT', 'BATCH']
            },
            description: 'Reference type'
          }
        ],
        responses: {
          200: { 
            description: 'Next reference number retrieved successfully',
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
                        referenceNumber: { type: 'string' },
                        config: { type: 'object' }
                      }
                    }
                  }
                }
              }
            }
          },
          400: { description: 'Bad request - invalid type parameter' },
          401: { description: 'Unauthorized' }
        }
      }
    },
    '/api/cashbook/reference/configure': {
      post: {
        summary: 'Configure reference numbers',
        description: 'Configure settings for reference numbers',
        tags: ['Cashbook'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['type', 'prefix', 'currentNumber', 'incrementBy', 'resetPeriod'],
                properties: {
                  type: {
                    type: 'string',
                    enum: ['RECEIPT', 'PAYMENT', 'BATCH'],
                    description: 'Reference type'
                  },
                  prefix: {
                    type: 'string',
                    description: 'Reference prefix',
                    example: 'RCP'
                  },
                  currentNumber: {
                    type: 'integer',
                    description: 'Current reference number',
                    example: 1000
                  },
                  incrementBy: {
                    type: 'integer',
                    description: 'Increment by value',
                    example: 1
                  },
                  resetPeriod: {
                    type: 'string',
                    enum: ['DAILY', 'MONTHLY', 'YEARLY', 'NEVER'],
                    description: 'Reset period'
                  }
                }
              }
            }
          }
        },
        responses: {
          200: { 
            description: 'Reference configuration updated successfully',
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
          400: { description: 'Bad request - validation errors' },
          401: { description: 'Unauthorized' }
        }
      }
    },
    '/api/cashbook/templates': {
      post: {
        summary: 'Create template',
        description: 'Create a new template for cashbook entries',
        tags: ['Cashbook'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'type', 'bankId', 'amount'],
                properties: {
                  name: {
                    type: 'string',
                    description: 'Template name',
                    example: 'Monthly Rent Payment'
                  },
                  type: {
                    type: 'string',
                    enum: ['RECEIPT', 'PAYMENT'],
                    description: 'Transaction type'
                  },
                  bankId: {
                    type: 'string',
                    description: 'Default bank account ID'
                  },
                  amount: {
                    type: 'number',
                    description: 'Default amount'
                  },
                  description: {
                    type: 'string',
                    description: 'Default description'
                  },
                  counterpartyType: {
                    type: 'string',
                    enum: ['GL', 'CUSTOMER', 'SUPPLIER'],
                    description: 'Default counterparty type'
                  },
                  glAccountId: {
                    type: 'string',
                    description: 'Default GL account ID'
                  },
                  customerId: {
                    type: 'string',
                    description: 'Default customer ID'
                  },
                  vendorId: {
                    type: 'string',
                    description: 'Default vendor ID'
                  }
                }
              }
            }
          }
        },
        responses: {
          200: { 
            description: 'Template created successfully',
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
          400: { description: 'Bad request - validation errors' },
          401: { description: 'Unauthorized' }
        }
      }
    },
    '/api/cashbook/discounts/calculate': {
      post: {
        summary: 'Calculate settlement discounts',
        description: 'Calculate settlement discounts',
        tags: ['Cashbook'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['amount', 'paymentDate', 'dueDate', 'counterpartyType'],
                properties: {
                  amount: {
                    type: 'number',
                    description: 'Transaction amount',
                    example: 1000.00
                  },
                  paymentDate: {
                    type: 'string',
                    format: 'date',
                    description: 'Payment date',
                    example: '2024-01-15'
                  },
                  dueDate: {
                    type: 'string',
                    format: 'date',
                    description: 'Due date',
                    example: '2024-01-30'
                  },
                  counterpartyType: {
                    type: 'string',
                    enum: ['CUSTOMER', 'SUPPLIER'],
                    description: 'Counterparty type'
                  },
                  customerId: {
                    type: 'string',
                    description: 'Customer ID (if counterpartyType is CUSTOMER)'
                  },
                  vendorId: {
                    type: 'string',
                    description: 'Vendor ID (if counterpartyType is SUPPLIER)'
                  }
                }
              }
            }
          }
        },
        responses: {
          200: { 
            description: 'Discounts calculated successfully',
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
                        discountAmount: { type: 'number' },
                        netAmount: { type: 'number' },
                        discountRate: { type: 'number' },
                        daysEarly: { type: 'integer' }
                      }
                    }
                  }
                }
              }
            }
          },
          400: { description: 'Bad request - validation errors' },
          401: { description: 'Unauthorized' }
        }
      }
    },
    '/api/cashbook/discounts/configure': {
      post: {
        summary: 'Configure settlement discounts',
        description: 'Configure settlement discounts',
        tags: ['Cashbook'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['counterpartyType', 'counterpartyId', 'discountRate', 'discountDays'],
                properties: {
                  counterpartyType: {
                    type: 'string',
                    enum: ['CUSTOMER', 'SUPPLIER'],
                    description: 'Counterparty type'
                  },
                  counterpartyId: {
                    type: 'string',
                    description: 'Customer or Vendor ID'
                  },
                  discountRate: {
                    type: 'number',
                    minimum: 0,
                    maximum: 100,
                    description: 'Discount rate percentage',
                    example: 2.5
                  },
                  discountDays: {
                    type: 'integer',
                    minimum: 0,
                    description: 'Number of days for discount',
                    example: 10
                  },
                  isActive: {
                    type: 'boolean',
                    default: true,
                    description: 'Whether discount is active'
                  }
                }
              }
            }
          }
        },
        responses: {
          200: { 
            description: 'Discount configuration updated successfully',
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
          400: { description: 'Bad request - validation errors' },
          401: { description: 'Unauthorized' }
        }
      }
    },
    // Summary and Reconciliation - Removed non-existent endpoint
    '/api/cashbook/{bankId}/unreconciled': {
      get: {
        summary: 'Get unreconciled entries',
        description: 'Retrieve unreconciled entries for a specific bank account',
        tags: ['Cashbook'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'bankId', in: 'path', required: true, schema: { type: 'string' }, description: 'Bank ID' }
        ],
        responses: {
          200: { description: 'Unreconciled entries retrieved successfully' },
          401: { description: 'Unauthorized' },
          404: { description: 'Bank not found' }
        }
      }
    },
    // Reference Data
    '/api/cashbook/banks': {
      get: {
        summary: 'List banks',
        description: 'Get list of bank accounts',
        tags: ['Cashbook'],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Banks retrieved successfully' },
          401: { description: 'Unauthorized' }
        }
      },
      post: {
        summary: 'Create bank account',
        description: 'Create a new bank account for cashbook',
        tags: ['Cashbook'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'accountNumber', 'currencyId', 'glAccountId'],
                properties: {
                  name: {
                    type: 'string',
                    description: 'Bank account name',
                    example: 'Main Operating Account'
                  },
                  accountNumber: {
                    type: 'string',
                    description: 'Bank account number',
                    example: '1234567890'
                  },
                  currencyId: {
                    type: 'string',
                    description: 'Currency ID',
                    example: 'cmh3bymy70000una4yk8leusu'
                  },
                  glAccountId: {
                    type: 'string',
                    description: 'GL account ID',
                    example: 'cmh3c1fdt0001unxkqzzihy55'
                  },
                  bankCode: {
                    type: 'string',
                    description: 'Bank code',
                    example: 'CBZ'
                  },
                  branchCode: {
                    type: 'string',
                    description: 'Branch code',
                    example: '001'
                  },
                  isActive: {
                    type: 'boolean',
                    default: true,
                    description: 'Whether account is active'
                  }
                }
              }
            }
          }
        },
        responses: {
          200: { 
            description: 'Bank account created successfully',
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
          400: { description: 'Bad request - validation errors' },
          401: { description: 'Unauthorized' }
        }
      }
    },
    '/api/cashbook/customers': {
      get: {
        summary: 'List customers',
        description: 'Get list of customers',
        tags: ['Cashbook'],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Customers retrieved successfully' },
          401: { description: 'Unauthorized' }
        }
      }
    },
    '/api/cashbook/customers/{id}': {
      get: {
        summary: 'Get customer details',
        description: 'Get customer details by ID',
        tags: ['Cashbook'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Customer ID' }
        ],
        responses: {
          200: { description: 'Customer details retrieved successfully' },
          401: { description: 'Unauthorized' },
          404: { description: 'Customer not found' }
        }
      }
    },
    '/api/cashbook/vendors': {
      get: {
        summary: 'List vendors',
        description: 'Get list of vendors',
        tags: ['Cashbook'],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Vendors retrieved successfully' },
          401: { description: 'Unauthorized' }
        }
      }
    },
    '/api/cashbook/gl-accounts': {
      get: {
        summary: 'Get chart of accounts',
        description: 'Get chart of accounts for cashbook transactions',
        tags: ['Cashbook'],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'GL accounts retrieved successfully' },
          401: { description: 'Unauthorized' }
        }
      }
    },
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
        '/auth/change-password': {
          post: {
            summary: 'Change user password',
            description: 'Change the password for the currently authenticated user. Requires current password verification. Tracks password changes via audit log.',
            tags: ['Authentication'],
            security: [{ bearerAuth: [] }],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['currentPassword', 'newPassword'],
                    properties: {
                      currentPassword: {
                        type: 'string',
                        example: 'oldPassword123',
                        description: 'Current password for verification'
                      },
                      newPassword: {
                        type: 'string',
                        example: 'newPassword456',
                        description: 'New password (must be at least 6 characters)'
                      }
                    }
                  }
                }
              }
            },
            responses: {
              200: {
                description: 'Password changed successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean', example: true },
                        message: { type: 'string', example: 'Password changed successfully' }
                      }
                    }
                  }
                }
              },
              400: {
                description: 'Bad request - missing fields or invalid password',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean', example: false },
                        message: { type: 'string', example: 'Current password and new password are required' }
                      }
                    }
                  }
                }
              },
              401: {
                description: 'Unauthorized - invalid current password or missing token',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean', example: false },
                        message: { type: 'string', example: 'Current password is incorrect' }
                      }
                    }
                  }
                }
              },
              404: {
                description: 'User not found'
              },
              500: {
                description: 'Internal server error'
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
        // Hardcoded Roles Management
        '/hardcoded-roles': {
          get: {
            summary: 'Get all hardcoded roles',
            description: 'Retrieve all 35 hardcoded system roles across all 7 departments as a flat list',
            tags: ['Hardcoded Roles'],
            security: [{ bearerAuth: [] }],
            responses: {
              200: {
                description: 'Roles retrieved successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean', example: true },
                        message: { type: 'string', example: 'Hardcoded roles retrieved successfully' },
                        data: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              code: { type: 'string', example: 'FIN_MGR' },
                              name: { type: 'string', example: 'Finance Manager' },
                              level: { type: 'integer', example: 5 },
                              department: { type: 'string', example: 'Finance' },
                              description: { type: 'string', example: 'Head of finance department, oversees all financial operations' }
                            }
                          }
                        },
                        count: { type: 'integer', example: 35 }
                      }
                    }
                  }
                }
              },
              401: {
                description: 'Unauthorized - missing or invalid token'
              }
            }
          }
        },
        '/hardcoded-roles/departments-with-roles': {
          get: {
            summary: 'Get all departments with their roles (RECOMMENDED)',
            description: 'Retrieve all 7 departments grouped with their respective roles. This is the preferred endpoint for getting the complete role structure organized by department.',
            tags: ['Hardcoded Roles'],
            security: [{ bearerAuth: [] }],
            responses: {
              200: {
                description: 'Departments with roles retrieved successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean', example: true },
                        message: { type: 'string', example: 'All departments with roles retrieved successfully' },
                        data: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              department: { type: 'string', example: 'Finance' },
                              departmentCode: { type: 'string', example: 'FINANCE' },
                              description: { type: 'string', example: 'Finance Department' },
                              roles: {
                                type: 'array',
                                items: {
                                  type: 'object',
                                  properties: {
                                    code: { type: 'string', example: 'FIN_MGR' },
                                    name: { type: 'string', example: 'Finance Manager' },
                                    level: { type: 'integer', example: 5 },
                                    department: { type: 'string', example: 'Finance' },
                                    description: { type: 'string', example: 'Head of finance department, oversees all financial operations' }
                                  }
                                }
                              }
                            }
                          }
                        },
                        count: { type: 'integer', example: 7 }
                      }
                    }
                  }
                }
              },
              401: {
                description: 'Unauthorized - missing or invalid token'
              }
            }
          }
        },
        '/hardcoded-roles/departments': {
          get: {
            summary: 'Get all departments',
            description: 'Retrieve a list of all 7 departments without their roles',
            tags: ['Hardcoded Roles'],
            security: [{ bearerAuth: [] }],
            responses: {
              200: {
                description: 'Departments retrieved successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean', example: true },
                        message: { type: 'string', example: 'All departments retrieved successfully' },
                        data: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              name: { type: 'string', example: 'Finance' },
                              code: { type: 'string', example: 'FINANCE' },
                              description: { type: 'string', example: 'Finance Department' }
                            }
                          }
                        },
                        count: { type: 'integer', example: 7 }
                      }
                    }
                  }
                }
              },
              401: {
                description: 'Unauthorized - missing or invalid token'
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
        },
        // Currency Management
        '/accounting/currencies': {
          get: {
            summary: 'Get all currencies',
            description: 'Retrieve all currencies in the system',
            tags: ['Accounting - Currencies'],
            security: [{ bearerAuth: [] }],
            responses: {
              200: {
                description: 'Currencies retrieved successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/Currency' }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          post: {
            summary: 'Create currency',
            description: 'Create a new currency',
            tags: ['Accounting - Currencies'],
            security: [{ bearerAuth: [] }],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CreateCurrencyRequest' }
                }
              }
            },
            responses: {
              201: {
                description: 'Currency created successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: { $ref: '#/components/schemas/Currency' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        '/accounting/currencies/{id}': {
          get: {
            summary: 'Get currency by ID',
            description: 'Retrieve a specific currency by ID',
            tags: ['Accounting - Currencies'],
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
                description: 'Currency retrieved successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: { $ref: '#/components/schemas/Currency' }
                      }
                    }
                  }
                }
              }
            }
          },
          put: {
            summary: 'Update currency',
            description: 'Update an existing currency',
            tags: ['Accounting - Currencies'],
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
                  schema: { $ref: '#/components/schemas/UpdateCurrencyRequest' }
                }
              }
            },
            responses: {
              200: {
                description: 'Currency updated successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: { $ref: '#/components/schemas/Currency' }
                      }
                    }
                  }
                }
              }
            }
          },
          delete: {
            summary: 'Delete currency',
            description: 'Delete a currency',
            tags: ['Accounting - Currencies'],
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
                description: 'Currency deleted successfully',
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
        // Vendor Management
        '/accounting/vendors': {
          get: {
            summary: 'Get all vendors',
            description: 'Retrieve all vendors in the system',
            tags: ['Accounting - Vendors'],
            security: [{ bearerAuth: [] }],
            parameters: [
              {
                name: 'search',
                in: 'query',
                schema: { type: 'string' },
                description: 'Search vendors by name'
              },
              {
                name: 'isActive',
                in: 'query',
                schema: { type: 'boolean' },
                description: 'Filter by active status'
              }
            ],
            responses: {
              200: {
                description: 'Vendors retrieved successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/Vendor' }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          post: {
            summary: 'Create vendor',
            description: 'Create a new vendor',
            tags: ['Accounting - Vendors'],
            security: [{ bearerAuth: [] }],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CreateVendorRequest' }
                }
              }
            },
            responses: {
              201: {
                description: 'Vendor created successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: { $ref: '#/components/schemas/Vendor' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        '/accounting/vendors/{id}': {
          get: {
            summary: 'Get vendor by ID',
            description: 'Retrieve a specific vendor by ID',
            tags: ['Accounting - Vendors'],
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
                description: 'Vendor retrieved successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: { $ref: '#/components/schemas/Vendor' }
                      }
                    }
                  }
                }
              }
            }
          },
          put: {
            summary: 'Update vendor',
            description: 'Update an existing vendor',
            tags: ['Accounting - Vendors'],
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
                  schema: { $ref: '#/components/schemas/UpdateVendorRequest' }
                }
              }
            },
            responses: {
              200: {
                description: 'Vendor updated successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: { $ref: '#/components/schemas/Vendor' }
                      }
                    }
                  }
                }
              }
            }
          },
          delete: {
            summary: 'Delete vendor',
            description: 'Delete a vendor',
            tags: ['Accounting - Vendors'],
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
                description: 'Vendor deleted successfully',
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
        // Expense Categories Management
        '/accounting/expense-categories': {
          get: {
            summary: 'Get all expense categories',
            description: 'Retrieve all expense categories in the system. The system supports 5 hardcoded categories: Salaries and Wages (Account 5030), Travel and Accommodation (Account 5070), Operations (Account 5090), Branding and Marketing (Account 5060), and Office Equipment (Account 1100 - Fixed Asset).',
            tags: ['Accounting - Expense Categories'],
            security: [{ bearerAuth: [] }],
            parameters: [
              {
                name: 'search',
                in: 'query',
                schema: { type: 'string' },
                description: 'Search categories by name'
              },
              {
                name: 'isActive',
                in: 'query',
                schema: { type: 'boolean' },
                description: 'Filter by active status'
              }
            ],
            responses: {
              200: {
                description: 'Expense categories retrieved successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/ExpenseCategory' }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          post: {
            summary: 'Create expense category',
            description: 'Create a new expense category',
            tags: ['Accounting - Expense Categories'],
            security: [{ bearerAuth: [] }],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CreateExpenseCategoryRequest' }
                }
              }
            },
            responses: {
              201: {
                description: 'Expense category created successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: { $ref: '#/components/schemas/ExpenseCategory' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        '/accounting/expense-categories/{id}': {
          get: {
            summary: 'Get expense category by ID',
            description: 'Retrieve a specific expense category by ID',
            tags: ['Accounting - Expense Categories'],
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
                description: 'Expense category retrieved successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: { $ref: '#/components/schemas/ExpenseCategory' }
                      }
                    }
                  }
                }
              }
            }
          },
          put: {
            summary: 'Update expense category',
            description: 'Update an existing expense category',
            tags: ['Accounting - Expense Categories'],
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
                  schema: { $ref: '#/components/schemas/UpdateExpenseCategoryRequest' }
                }
              }
            },
            responses: {
              200: {
                description: 'Expense category updated successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: { $ref: '#/components/schemas/ExpenseCategory' }
                      }
                    }
                  }
                }
              }
            }
          },
          delete: {
            summary: 'Delete expense category',
            description: 'Delete an expense category',
            tags: ['Accounting - Expense Categories'],
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
                description: 'Expense category deleted successfully',
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
        // Expenses Management
        '/accounting/expenses': {
          get: {
            summary: 'Get all expenses',
            description: 'Retrieve all expenses in the system',
            tags: ['Accounting - Expenses'],
            security: [{ bearerAuth: [] }],
            parameters: [
              {
                name: 'search',
                in: 'query',
                schema: { type: 'string' },
                description: 'Search expenses by description'
              },
              {
                name: 'isActive',
                in: 'query',
                schema: { type: 'boolean' },
                description: 'Filter by active status'
              },
              {
                name: 'status',
                in: 'query',
                schema: { type: 'string' },
                description: 'Filter by status (DRAFT, POSTED, VOID)'
              }
            ],
            responses: {
              200: {
                description: 'Expenses retrieved successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/Expense' }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          post: {
            summary: 'Create expense',
            description: 'Create a new expense with automatic VAT calculation and journal entry generation. Uses category names directly (Salaries and Wages, Travel and Accommodation, Operations, Branding and Marketing, Office Equipment).',
            tags: ['Accounting - Expenses'],
            security: [{ bearerAuth: [] }],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CreateExpenseRequest' },
                  examples: {
                    'Salaries and Wages': {
                      summary: 'Salaries and Wages Expense',
                      description: 'Example of creating a salaries expense',
                      value: {
                        vendorId: 'cmg97iu9b0000ung8h8u3bg02',
                        category: 'Salaries and Wages',
                        amount: 5000,
                        currencyId: 'usd_currency_id',
                        transactionDate: '2024-01-15',
                        description: 'Monthly payroll expense',
                        isTaxable: true,
                        paymentMethod: 'BANK',
                        receiptNumber: 'PAY-2024-001'
                      }
                    },
                    'Office Equipment': {
                      summary: 'Office Equipment Purchase',
                      description: 'Example of purchasing office equipment (treated as Fixed Asset)',
                      value: {
                        vendorId: 'cmg97iu9b0000ung8h8u3bg02',
                        category: 'Office Equipment',
                        amount: 2500,
                        currencyId: 'usd_currency_id',
                        transactionDate: '2024-01-15',
                        description: 'Computer purchase',
                        isTaxable: true,
                        paymentMethod: 'BANK'
                      }
                    },
                    'Travel Expense': {
                      summary: 'Travel and Accommodation',
                      description: 'Example of travel expense',
                      value: {
                        vendorId: 'cmg97iu9b0000ung8h8u3bg02',
                        category: 'Travel and Accommodation',
                        amount: 1200,
                        currencyId: 'usd_currency_id',
                        transactionDate: '2024-01-15',
                        description: 'Business travel expenses',
                        isTaxable: true,
                        paymentMethod: 'BANK'
                      }
                    }
                  }
                }
              }
            },
            responses: {
              201: {
                description: 'Expense created successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: { $ref: '#/components/schemas/Expense' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        '/accounting/expenses/{id}': {
          get: {
            summary: 'Get expense by ID',
            description: 'Retrieve a specific expense by ID',
            tags: ['Accounting - Expenses'],
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
                description: 'Expense retrieved successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: { $ref: '#/components/schemas/Expense' }
                      }
                    }
                  }
                }
              }
            }
          },
          put: {
            summary: 'Update expense',
            description: 'Update an existing expense. Note: Category, vendor, and currency cannot be changed after creation. Amount and VAT changes will create reversal journal entries.',
            tags: ['Accounting - Expenses'],
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
                  schema: { $ref: '#/components/schemas/UpdateExpenseRequest' }
                }
              }
            },
            responses: {
              200: {
                description: 'Expense updated successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: { $ref: '#/components/schemas/Expense' }
                      }
                    }
                  }
                }
              }
            }
          },
          delete: {
            summary: 'Delete expense',
            description: 'Soft delete an expense',
            tags: ['Accounting - Expenses'],
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
                description: 'Expense deleted successfully',
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
        '/accounting/expenses/vat-calculation': {
          post: {
            summary: 'Calculate VAT',
            description: 'Calculate VAT for an expense amount',
            tags: ['Accounting - Expenses'],
            security: [{ bearerAuth: [] }],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/VATCalculationRequest' }
                }
              }
            },
            responses: {
              200: {
                description: 'VAT calculated successfully',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/VATCalculationResponse' }
                  }
                }
              }
            }
          }
        },
        // Chart of Accounts Management
        '/accounting/chart-of-accounts': {
          get: {
            summary: 'Get all chart of accounts',
            description: 'Retrieve all chart of accounts entries with optional filtering',
            tags: ['Accounting - Chart of Accounts'],
            security: [{ bearerAuth: [] }],
            parameters: [
              {
                name: 'accountType',
                in: 'query',
                schema: { type: 'string', enum: ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'] },
                description: 'Filter by account type'
              },
              {
                name: 'isActive',
                in: 'query',
                schema: { type: 'boolean' },
                description: 'Filter by active status'
              },
              {
                name: 'parentId',
                in: 'query',
                schema: { type: 'string' },
                description: 'Filter by parent account ID'
              }
            ],
            responses: {
              200: {
                description: 'Chart of accounts retrieved successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/ChartOfAccounts' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        '/accounting/chart-of-accounts/{id}': {
          get: {
            summary: 'Get chart of accounts by ID',
            description: 'Retrieve a specific chart of accounts entry by ID',
            tags: ['Accounting - Chart of Accounts'],
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
                description: 'Chart of accounts retrieved successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: { $ref: '#/components/schemas/ChartOfAccounts' }
                      }
                    }
                  }
                }
              },
              404: {
                description: 'Chart of accounts entry not found',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean', example: false },
                        message: { type: 'string', example: 'Chart of accounts entry not found' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        // Journal Entries Management
        '/accounting/journal-entries': {
          get: {
            summary: 'Get all journal entries',
            description: 'Retrieve all journal entries in the system with optional filtering',
            tags: ['Accounting - Journal Entries'],
            security: [{ bearerAuth: [] }],
            parameters: [
              {
                name: 'search',
                in: 'query',
                schema: { type: 'string' },
                description: 'Search journal entries by reference number'
              },
              {
                name: 'status',
                in: 'query',
                schema: { 
                  type: 'string',
                  enum: ['PENDING', 'POSTED', 'VOID']
                },
                description: 'Filter by status (PENDING, POSTED, VOID)'
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
                        data: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/JournalEntry' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        '/accounting/journal-entries/by-date-range': {
          get: {
            summary: 'Get journal entries by date range',
            description: 'Retrieve journal entries within a specific date range',
            tags: ['Accounting - Journal Entries'],
            security: [{ bearerAuth: [] }],
            parameters: [
              {
                name: 'startDate',
                in: 'query',
                required: true,
                schema: { 
                  type: 'string',
                  format: 'date'
                },
                description: 'Start date (YYYY-MM-DD)'
              },
              {
                name: 'endDate',
                in: 'query',
                required: true,
                schema: { 
                  type: 'string',
                  format: 'date'
                },
                description: 'End date (YYYY-MM-DD)'
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
                        data: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/JournalEntry' }
                        }
                      }
                    }
                  }
                }
              },
              400: {
                description: 'Bad request - missing date parameters',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean', example: false },
                        message: { type: 'string', example: 'Start date and end date are required' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        '/accounting/journal-entries/{id}': {
          get: {
            summary: 'Get journal entry by ID',
            description: 'Retrieve a specific journal entry by ID with all lines',
            tags: ['Accounting - Journal Entries'],
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
                description: 'Journal entry retrieved successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: { $ref: '#/components/schemas/JournalEntry' }
                      }
                    }
                  }
                }
              },
              404: {
                description: 'Journal entry not found',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean', example: false },
                        message: { type: 'string', example: 'Journal entry not found' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        '/accounting/journal-entries/{id}/post': {
          patch: {
            summary: 'Post journal entry',
            description: 'Change journal entry status from PENDING to POSTED. Validates that the entry is balanced before posting.',
            tags: ['Accounting - Journal Entries'],
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
                description: 'Journal entry posted successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        message: { type: 'string', example: 'Journal entry posted successfully' },
                        data: { $ref: '#/components/schemas/JournalEntry' }
                      }
                    }
                  }
                }
              },
              400: {
                description: 'Bad request - validation failed',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean', example: false },
                        message: { 
                          type: 'string', 
                          example: 'Journal entry is not balanced. Debits must equal credits.' 
                        }
                      }
                    }
                  }
                }
              },
              404: {
                description: 'Journal entry not found',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean', example: false },
                        message: { type: 'string', example: 'Journal entry not found' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        '/accounting/journal-entries/{id}/void': {
          patch: {
            summary: 'Void journal entry',
            description: 'Change journal entry status to VOID',
            tags: ['Accounting - Journal Entries'],
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
                description: 'Journal entry voided successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        message: { type: 'string', example: 'Journal entry voided successfully' },
                        data: { $ref: '#/components/schemas/JournalEntry' }
                      }
                    }
                  }
                }
              },
              400: {
                description: 'Bad request - validation failed',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean', example: false },
                        message: { 
                          type: 'string', 
                          example: 'Journal entry is already voided' 
                        }
                      }
                    }
                  }
                }
              },
              404: {
                description: 'Journal entry not found',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean', example: false },
                        message: { type: 'string', example: 'Journal entry not found' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        // Invoices Management
        '/accounting/invoices': {
          get: {
            summary: 'Get all invoices',
            description: 'Retrieve all invoices with optional filtering and pagination',
            tags: ['Accounting - Invoices'],
            security: [{ bearerAuth: [] }],
            parameters: [
              {
                name: 'page',
                in: 'query',
                schema: { type: 'integer', default: 1 },
                description: 'Page number for pagination'
              },
              {
                name: 'limit',
                in: 'query',
                schema: { type: 'integer', default: 10 },
                description: 'Number of items per page'
              },
              {
                name: 'customerId',
                in: 'query',
                schema: { type: 'string' },
                description: 'Filter by customer ID'
              },
              {
                name: 'currencyId',
                in: 'query',
                schema: { type: 'string' },
                description: 'Filter by currency ID'
              },
              {
                name: 'startDate',
                in: 'query',
                schema: { type: 'string', format: 'date' },
                description: 'Filter by start date'
              },
              {
                name: 'endDate',
                in: 'query',
                schema: { type: 'string', format: 'date' },
                description: 'Filter by end date'
              },
              {
                name: 'status',
                in: 'query',
                schema: { type: 'string', enum: ['DRAFT', 'SENT', 'PAID', 'VOID'] },
                description: 'Filter by invoice status'
              }
            ],
            responses: {
              200: {
                description: 'Invoices retrieved successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/Invoice' }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          post: {
            summary: 'Create invoice',
            description: 'Create a new invoice with automatic VAT calculation and journal entry generation',
            tags: ['Accounting - Invoices'],
            security: [{ bearerAuth: [] }],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CreateInvoiceRequest' }
                }
              }
            },
            responses: {
              201: {
                description: 'Invoice created successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        message: { type: 'string' },
                        data: { $ref: '#/components/schemas/Invoice' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        '/accounting/invoices/{id}': {
          get: {
            summary: 'Get invoice by ID',
            description: 'Retrieve a specific invoice by ID',
            tags: ['Accounting - Invoices'],
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
                description: 'Invoice retrieved successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: { $ref: '#/components/schemas/Invoice' }
                      }
                    }
                  }
                }
              }
            }
          },
          put: {
            summary: 'Update invoice',
            description: 'Update an existing invoice',
            tags: ['Accounting - Invoices'],
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
                  schema: { $ref: '#/components/schemas/UpdateInvoiceRequest' }
                }
              }
            },
            responses: {
              200: {
                description: 'Invoice updated successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: { $ref: '#/components/schemas/Invoice' }
                      }
                    }
                  }
                }
              }
            }
          },
          delete: {
            summary: 'Delete invoice',
            description: 'Soft delete an invoice',
            tags: ['Accounting - Invoices'],
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
                description: 'Invoice deleted successfully',
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
        '/accounting/invoices/summary': {
          get: {
            summary: 'Get invoice summary',
            description: 'Get invoice summary statistics',
            tags: ['Accounting - Invoices'],
            security: [{ bearerAuth: [] }],
            parameters: [
              {
                name: 'startDate',
                in: 'query',
                schema: { type: 'string', format: 'date' },
                description: 'Start date for summary'
              },
              {
                name: 'endDate',
                in: 'query',
                schema: { type: 'string', format: 'date' },
                description: 'End date for summary'
              },
              {
                name: 'currencyId',
                in: 'query',
                schema: { type: 'string' },
                description: 'Filter by currency ID'
              }
            ],
            responses: {
              200: {
                description: 'Invoice summary retrieved successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: {
                          type: 'object',
                          properties: {
                            totalInvoices: { type: 'number' },
                            totalAmount: { type: 'number' },
                            totalVAT: { type: 'number' },
                            averageAmount: { type: 'number' }
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
        '/accounting/invoices/{id}/send': {
          patch: {
            summary: 'Send invoice to customer',
            description: 'Change invoice status from DRAFT to SENT',
            tags: ['Accounting - Invoices'],
            security: [{ bearerAuth: [] }],
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'string' },
                description: 'Invoice ID'
              }
            ],
            responses: {
              200: {
                description: 'Invoice sent successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: { $ref: '#/components/schemas/Invoice' }
                      }
                    }
                  }
                }
              },
              400: {
                description: 'Bad request - invoice not in DRAFT status',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean', example: false },
                        message: { type: 'string' }
                      }
                    }
                  }
                }
              },
              404: {
                description: 'Invoice not found',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean', example: false },
                        message: { type: 'string' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        '/accounting/invoices/{id}/mark-as-paid': {
          patch: {
            summary: 'Mark invoice as paid',
            description: 'Change invoice status from SENT to PAID with payment method',
            tags: ['Accounting - Invoices'],
            security: [{ bearerAuth: [] }],
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'string' },
                description: 'Invoice ID'
              }
            ],
            requestBody: {
              required: false,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      paymentMethod: {
                        type: 'string',
                        enum: ['CASH', 'BANK', 'CREDIT'],
                        default: 'BANK',
                        description: 'Payment method used'
                      },
                      paymentCurrencyId: {
                        type: 'string',
                        description: 'Currency used for payment (if different from invoice currency)'
                      },

                    }
                  }
                }
              }
            },
            responses: {
              200: {
                description: 'Invoice marked as paid successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: { $ref: '#/components/schemas/Invoice' }
                      }
                    }
                  }
                }
              },
              400: {
                description: 'Bad request - invoice not in SENT status',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean', example: false },
                        message: { type: 'string' }
                      }
                    }
                  }
                }
              },
              404: {
                description: 'Invoice not found',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean', example: false },
                        message: { type: 'string' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        '/accounting/invoices/{id}/void': {
          patch: {
            summary: 'Void invoice',
            description: 'Change invoice status to VOID with optional reason',
            tags: ['Accounting - Invoices'],
            security: [{ bearerAuth: [] }],
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'string' },
                description: 'Invoice ID'
              }
            ],
            requestBody: {
              required: false,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      reason: {
                        type: 'string',
                        description: 'Reason for voiding the invoice'
                      }
                    }
                  }
                }
              }
            },
            responses: {
              200: {
                description: 'Invoice voided successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: { $ref: '#/components/schemas/Invoice' }
                      }
                    }
                  }
                }
              },
              404: {
                description: 'Invoice not found',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean', example: false },
                        message: { type: 'string' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        // Customers Management
        '/accounting/customers': {
          get: {
            summary: 'Get all customers',
            description: 'Retrieve all customers',
            tags: ['Accounting - Customers'],
            security: [{ bearerAuth: [] }],
            responses: {
              200: {
                description: 'Customers retrieved successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/Customer' }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          post: {
            summary: 'Create customer',
            description: 'Create a new customer',
            tags: ['Accounting - Customers'],
            security: [{ bearerAuth: [] }],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CreateCustomerRequest' }
                }
              }
            },
            responses: {
              201: {
                description: 'Customer created successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: { $ref: '#/components/schemas/Customer' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        '/accounting/customers/{id}': {
          get: {
            summary: 'Get customer by ID',
            description: 'Retrieve a specific customer by ID',
            tags: ['Accounting - Customers'],
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
                description: 'Customer retrieved successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: { $ref: '#/components/schemas/Customer' }
                      }
                    }
                  }
                }
              }
            }
          },
          put: {
            summary: 'Update customer',
            description: 'Update an existing customer',
            tags: ['Accounting - Customers'],
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
                  schema: { $ref: '#/components/schemas/UpdateCustomerRequest' }
                }
              }
            },
            responses: {
              200: {
                description: 'Customer updated successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: { $ref: '#/components/schemas/Customer' }
                      }
                    }
                  }
                }
              }
            }
          },
          delete: {
            summary: 'Delete customer',
            description: 'Delete a customer',
            tags: ['Accounting - Customers'],
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
                description: 'Customer deleted successfully',
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
                  },
        // Revenue Sources Management
        '/accounting/revenue-sources': {
          get: {
            summary: 'Get all revenue sources',
            description: 'Retrieve all revenue sources in the system',
            tags: ['Accounting - Revenue Sources'],
            security: [{ bearerAuth: [] }],
            parameters: [
              {
                name: 'search',
                in: 'query',
                schema: { type: 'string' },
                description: 'Search revenue sources by name'
              },
              {
                name: 'isActive',
                in: 'query',
                schema: { type: 'boolean' },
                description: 'Filter by active status'
              }
            ],
            responses: {
              200: {
                description: 'Revenue sources retrieved successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/RevenueSource' }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          post: {
            summary: 'Create revenue source',
            description: 'Create a new revenue source',
            tags: ['Accounting - Revenue Sources'],
            security: [{ bearerAuth: [] }],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CreateRevenueSourceRequest' }
                }
              }
            },
            responses: {
              201: {
                description: 'Revenue source created successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: { $ref: '#/components/schemas/RevenueSource' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        '/accounting/revenue-sources/{id}': {
          get: {
            summary: 'Get revenue source by ID',
            description: 'Retrieve a specific revenue source by ID',
            tags: ['Accounting - Revenue Sources'],
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
                description: 'Revenue source retrieved successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: { $ref: '#/components/schemas/RevenueSource' }
                      }
                    }
                  }
                }
              }
            }
          },
          put: {
            summary: 'Update revenue source',
            description: 'Update an existing revenue source',
            tags: ['Accounting - Revenue Sources'],
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
                  schema: { $ref: '#/components/schemas/UpdateRevenueSourceRequest' }
                }
              }
            },
            responses: {
              200: {
                description: 'Revenue source updated successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: { $ref: '#/components/schemas/RevenueSource' }
                      }
                    }
                  }
                }
              }
            }
          },
          delete: {
            summary: 'Delete revenue source',
            description: 'Soft delete a revenue source (only if not in use)',
            tags: ['Accounting - Revenue Sources'],
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
                description: 'Revenue source deleted successfully',
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
              },
              400: {
                description: 'Bad request - revenue source is in use',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean', example: false },
                        message: { type: 'string', example: 'Cannot delete revenue source that is in use' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        // Revenue Categories Management
        '/accounting/revenue-categories': {
          get: {
            summary: 'Get all revenue categories',
            description: 'Retrieve all revenue categories in the system',
            tags: ['Accounting - Revenue Categories'],
            security: [{ bearerAuth: [] }],
            parameters: [
              {
                name: 'search',
                in: 'query',
                schema: { type: 'string' },
                description: 'Search categories by name'
              },
              {
                name: 'isActive',
                in: 'query',
                schema: { type: 'boolean' },
                description: 'Filter by active status'
              }
            ],
            responses: {
              200: {
                description: 'Revenue categories retrieved successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/RevenueCategory' }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          post: {
            summary: 'Create revenue category',
            description: 'Create a new revenue category',
            tags: ['Accounting - Revenue Categories'],
            security: [{ bearerAuth: [] }],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CreateRevenueCategoryRequest' }
                }
              }
            },
            responses: {
              201: {
                description: 'Revenue category created successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: { $ref: '#/components/schemas/RevenueCategory' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        '/accounting/revenue-categories/{id}': {
          get: {
            summary: 'Get revenue category by ID',
            description: 'Retrieve a specific revenue category by ID',
            tags: ['Accounting - Revenue Categories'],
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
                description: 'Revenue category retrieved successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: { $ref: '#/components/schemas/RevenueCategory' }
                      }
                    }
                  }
                }
              }
            }
          },
          put: {
            summary: 'Update revenue category',
            description: 'Update an existing revenue category',
            tags: ['Accounting - Revenue Categories'],
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
                  schema: { $ref: '#/components/schemas/UpdateRevenueCategoryRequest' }
                }
              }
            },
            responses: {
              200: {
                description: 'Revenue category updated successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: { $ref: '#/components/schemas/RevenueCategory' }
                      }
                    }
                  }
                }
              }
            }
          },
          delete: {
            summary: 'Delete revenue category',
            description: 'Soft delete a revenue category (only if not in use and has no children)',
            tags: ['Accounting - Revenue Categories'],
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
                description: 'Revenue category deleted successfully',
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
              },
              400: {
                description: 'Bad request - category is in use or has children',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean', example: false },
                        message: { type: 'string', example: 'Cannot delete category that is in use or has child categories' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        // Revenues Management
        '/accounting/revenues': {
          get: {
            summary: 'Get all revenues',
            description: 'Retrieve all revenues in the system',
            tags: ['Accounting - Revenues'],
            security: [{ bearerAuth: [] }],
            parameters: [
              {
                name: 'search',
                in: 'query',
                schema: { type: 'string' },
                description: 'Search revenues by description'
              },
              {
                name: 'isActive',
                in: 'query',
                schema: { type: 'boolean' },
                description: 'Filter by active status'
              },
              {
                name: 'status',
                in: 'query',
                schema: { type: 'string' },
                description: 'Filter by status (DRAFT, POSTED, VOID)'
              }
            ],
            responses: {
              200: {
                description: 'Revenues retrieved successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/Revenue' }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          post: {
            summary: 'Create revenue',
            description: 'Create a new revenue with automatic VAT calculation and journal entry generation',
            tags: ['Accounting - Revenues'],
            security: [{ bearerAuth: [] }],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CreateRevenueRequest' }
                }
              }
            },
            responses: {
              201: {
                description: 'Revenue created successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: { $ref: '#/components/schemas/Revenue' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        '/accounting/revenues/{id}': {
          get: {
            summary: 'Get revenue by ID',
            description: 'Retrieve a specific revenue by ID',
            tags: ['Accounting - Revenues'],
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
                description: 'Revenue retrieved successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: { $ref: '#/components/schemas/Revenue' }
                      }
                    }
                  }
                }
              }
            }
          },
          put: {
            summary: 'Update revenue',
            description: 'Update an existing revenue (creates reversal entries for POSTED revenues)',
            tags: ['Accounting - Revenues'],
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
                  schema: { $ref: '#/components/schemas/UpdateRevenueRequest' }
                }
              }
            },
            responses: {
              200: {
                description: 'Revenue updated successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: { $ref: '#/components/schemas/Revenue' }
                      }
                    }
                  }
                }
              }
            }
          },
          delete: {
            summary: 'Delete revenue',
            description: 'Soft delete a revenue (creates reversal entries for POSTED revenues)',
            tags: ['Accounting - Revenues'],
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
                description: 'Revenue deleted successfully',
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
        }
      },

      // ============================================================================
      // ADVANCED CASHBOOK FEATURES - OPEN ITEM MATCHING
      // ============================================================================
      '/api/cashbook/open-items/customers/{customerId}': {
        get: {
          summary: 'Get open invoices for customer',
          description: 'Get all open invoices for a specific customer that can be matched with payments',
          tags: ['Open Item Matching'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: 'path',
              name: 'customerId',
            required: true,
              schema: { type: 'string' },
              description: 'Customer ID'
              }
          ],
          responses: {
            200: {
              description: 'Open invoices retrieved successfully',
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
            },
            400: { description: 'Bad request' },
            401: { description: 'Unauthorized' }
          }
        }
      },
      '/api/cashbook/open-items/suppliers/{supplierId}': {
        get: {
          summary: 'Get open invoices for supplier',
          description: 'Get all open invoices for a specific supplier that can be matched with payments',
          tags: ['Open Item Matching'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: 'path',
              name: 'supplierId',
              required: true,
              schema: { type: 'string' },
              description: 'Supplier ID'
            }
          ],
          responses: {
            200: {
              description: 'Open invoices retrieved successfully',
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
            },
            400: { description: 'Bad request' },
            401: { description: 'Unauthorized' }
            }
          }
        },
      '/api/cashbook/open-items/match/{paymentId}': {
        post: {
          summary: 'Match payment to invoices',
          description: 'Match a payment to specific invoices with allocation amounts',
          tags: ['Open Item Matching'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: 'path',
              name: 'paymentId',
              required: true,
              schema: { type: 'string' },
              description: 'Payment ID'
            }
          ],
          requestBody: {
            required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                  required: ['allocations'],
                    properties: {
                    allocations: {
                      type: 'array',
                      items: {
                        type: 'object',
                        required: ['openItemId', 'allocatedAmount'],
                        properties: {
                          openItemId: { type: 'string', description: 'Invoice ID to allocate payment to' },
                          allocatedAmount: { type: 'number', description: 'Amount to allocate to this invoice' },
                          discountAmount: { type: 'number', description: 'Discount amount applied' },
                          description: { type: 'string', description: 'Allocation description' }
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
              description: 'Payment matched successfully',
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
            401: { description: 'Unauthorized' }
            }
          }
        },

      // ============================================================================
      // ADVANCED CASHBOOK FEATURES - TRANSACTION REVERSAL
      // ============================================================================
      '/api/cashbook/transactions/{transactionId}/reverse': {
        post: {
          summary: 'Reverse a posted transaction',
          description: 'Create a reversal transaction for a posted cashbook entry',
          tags: ['Transaction Reversal'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: 'path',
              name: 'transactionId',
              required: true,
              schema: { type: 'string' },
              description: 'Transaction ID to reverse'
            }
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['reason'],
                  properties: {
                    reason: { type: 'string', description: 'Reason for reversal', example: 'Data entry error' },
                    description: { type: 'string', description: 'Additional description for reversal' },
                    reverseDate: { type: 'string', format: 'date', description: 'Date for reversal (defaults to current date)' }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Transaction reversed successfully',
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
            400: { description: 'Bad request - transaction cannot be reversed' },
            401: { description: 'Unauthorized' }
          }
        }
      },
      '/api/cashbook/transactions/{transactionId}/reversal-history': {
        get: {
          summary: 'Get reversal history for a transaction',
          description: 'Get all reversal transactions for a specific original transaction',
          tags: ['Transaction Reversal'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: 'path',
              name: 'transactionId',
              required: true,
              schema: { type: 'string' },
              description: 'Original transaction ID'
            }
          ],
          responses: {
            200: {
              description: 'Reversal history retrieved successfully',
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
            },
            400: { description: 'Bad request' },
            401: { description: 'Unauthorized' }
          }
        }
      },
      '/api/cashbook/reversals': {
        get: {
          summary: 'Get all reversals for a user',
          description: 'Get paginated list of all reversal transactions created by the user',
          tags: ['Transaction Reversal'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: 'query',
              name: 'page',
              schema: { type: 'integer', default: 1 },
              description: 'Page number'
            },
            {
              in: 'query',
              name: 'limit',
              schema: { type: 'integer', default: 50 },
              description: 'Number of items per page'
            }
          ],
          responses: {
            200: {
              description: 'Reversals retrieved successfully',
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
                          reversals: { type: 'array', items: { type: 'object' } },
                          pagination: { type: 'object' }
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
      },
      '/api/cashbook/transactions/{transactionId}/can-reverse': {
        get: {
          summary: 'Check if transaction can be reversed',
          description: 'Check if a transaction is eligible for reversal',
          tags: ['Transaction Reversal'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: 'path',
              name: 'transactionId',
              required: true,
              schema: { type: 'string' },
              description: 'Transaction ID to check'
            }
          ],
          responses: {
            200: {
              description: 'Reversal eligibility checked successfully',
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
                          canReverse: { type: 'boolean' },
                          reason: { type: 'string', enum: ['OK', 'Not posted', 'Already reversed', 'Period locked'] }
                      }
                    }
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
      // ============================================================================
      // ADVANCED CASHBOOK FEATURES - CASHBOOK TRANSFERS
      // ============================================================================
      '/api/cashbook/transfers': {
        post: {
          summary: 'Create cashbook transfer',
          description: 'Create a transfer between two bank accounts',
          tags: ['Cashbook Transfers'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['fromBankId', 'toBankId', 'amount', 'description'],
                  properties: {
                    fromBankId: { type: 'string', description: 'Source bank account ID' },
                    toBankId: { type: 'string', description: 'Destination bank account ID' },
                    amount: { type: 'number', description: 'Transfer amount' },
                    transferDate: { type: 'string', format: 'date', description: 'Transfer date (defaults to current date)' },
                    description: { type: 'string', description: 'Transfer description' },
                    reference: { type: 'string', description: 'Transfer reference (auto-generated if not provided)' },
                    projectCode: { type: 'string', description: 'Project code' }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Transfer created successfully',
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
            401: { description: 'Unauthorized' }
          }
        },
        get: {
          summary: 'List transfers',
          description: 'Get paginated list of transfers for the authenticated user',
          tags: ['Cashbook Transfers'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: 'query',
              name: 'page',
              schema: { type: 'integer', default: 1 },
              description: 'Page number'
            },
            {
              in: 'query',
              name: 'limit',
              schema: { type: 'integer', default: 50 },
              description: 'Number of items per page'
            },
            {
              in: 'query',
              name: 'fromBankId',
              schema: { type: 'string' },
              description: 'Filter by source bank ID'
            },
            {
              in: 'query',
              name: 'toBankId',
              schema: { type: 'string' },
              description: 'Filter by destination bank ID'
            },
            {
              in: 'query',
              name: 'dateFrom',
              schema: { type: 'string', format: 'date' },
              description: 'Filter from date'
            },
            {
              in: 'query',
              name: 'dateTo',
              schema: { type: 'string', format: 'date' },
              description: 'Filter to date'
            }
          ],
          responses: {
            200: {
              description: 'Transfers retrieved successfully',
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
                          transfers: { type: 'array', items: { type: 'object' } },
                          pagination: { type: 'object' }
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
      },
      '/api/cashbook/transfers/{transferId}': {
        get: {
          summary: 'Get transfer details',
          description: 'Get detailed information about a specific transfer',
          tags: ['Cashbook Transfers'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: 'path',
              name: 'transferId',
            required: true,
              schema: { type: 'string' },
              description: 'Transfer ID'
              }
          ],
          responses: {
            200: {
              description: 'Transfer details retrieved successfully',
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
            401: { description: 'Unauthorized' }
          }
        }
      },
      '/api/cashbook/transfers/summary': {
        get: {
          summary: 'Get transfer summary',
          description: 'Get summary statistics for transfers',
          tags: ['Cashbook Transfers'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: 'query',
              name: 'dateFrom',
              schema: { type: 'string', format: 'date' },
              description: 'Filter from date'
            },
            {
              in: 'query',
              name: 'dateTo',
              schema: { type: 'string', format: 'date' },
              description: 'Filter to date'
            }
          ],
          responses: {
            200: {
              description: 'Transfer summary retrieved successfully',
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
            401: { description: 'Unauthorized' }
          }
        }
      },

      // ============================================================================
      // ADVANCED CASHBOOK FEATURES - ENTRY TYPES MANAGEMENT
      // ============================================================================
      '/api/cashbook/entry-types': {
        post: {
          summary: 'Create entry type',
          description: 'Create a new cashbook entry type with D/C designation and account access control',
          tags: ['Entry Types Management'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'transactionType', 'counterpartyType'],
                  properties: {
                    name: { type: 'string', description: 'Entry type name', example: 'Customer Receipt' },
                    description: { type: 'string', description: 'Entry type description', example: 'Receipt from customer payment' },
                    transactionType: { type: 'string', enum: ['RECEIPT', 'PAYMENT'], description: 'Transaction type' },
                    counterpartyType: { type: 'string', enum: ['GL', 'CUSTOMER', 'SUPPLIER', 'ANY'], description: 'Allowed counterparty type' },
                    defaultGlAccountId: { type: 'string', description: 'Default GL account ID' },
                    isActive: { type: 'boolean', default: true, description: 'Whether entry type is active' },
                    requiresProjectCode: { type: 'boolean', default: false, description: 'Whether project code is required' },
                    requiresReference: { type: 'boolean', default: false, description: 'Whether reference is required' },
                    autoGenerateReference: { type: 'boolean', default: false, description: 'Whether to auto-generate reference' },
                    referencePrefix: { type: 'string', description: 'Reference prefix for auto-generation', example: 'CR' },
                    debitCreditLogic: { type: 'string', enum: ['AUTO', 'MANUAL'], default: 'AUTO', description: 'Debit/credit logic' },
                    defaultDebitCredit: { type: 'string', enum: ['DEBIT', 'CREDIT'], default: 'DEBIT', description: 'Default debit/credit designation' }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Entry type created successfully',
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
            401: { description: 'Unauthorized' }
          }
        },
        get: {
          summary: 'Get all entry types',
          description: 'Get all cashbook entry types with optional filtering',
          tags: ['Entry Types Management'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: 'query',
              name: 'transactionType',
              schema: { type: 'string', enum: ['RECEIPT', 'PAYMENT'] },
              description: 'Filter by transaction type'
            },
            {
              in: 'query',
              name: 'isActive',
              schema: { type: 'boolean' },
              description: 'Filter by active status'
            }
          ],
          responses: {
            200: {
              description: 'Entry types retrieved successfully',
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
            },
            401: { description: 'Unauthorized' }
          }
        }
      },
      '/api/cashbook/entry-types/{entryTypeId}': {
        get: {
          summary: 'Get entry type by ID',
          description: 'Get detailed information about a specific entry type',
          tags: ['Entry Types Management'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: 'path',
              name: 'entryTypeId',
            required: true,
              schema: { type: 'string' },
              description: 'Entry type ID'
            }
          ],
          responses: {
            200: {
              description: 'Entry type retrieved successfully',
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
            401: { description: 'Unauthorized' }
          }
        },
        put: {
          summary: 'Update entry type',
          description: 'Update an existing entry type',
          tags: ['Entry Types Management'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: 'path',
              name: 'entryTypeId',
              required: true,
              schema: { type: 'string' },
              description: 'Entry type ID'
            }
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', description: 'Entry type name' },
                    description: { type: 'string', description: 'Entry type description' },
                    transactionType: { type: 'string', enum: ['RECEIPT', 'PAYMENT'], description: 'Transaction type' },
                    counterpartyType: { type: 'string', enum: ['GL', 'CUSTOMER', 'SUPPLIER', 'ANY'], description: 'Allowed counterparty type' },
                    defaultGlAccountId: { type: 'string', description: 'Default GL account ID' },
                    isActive: { type: 'boolean', description: 'Whether entry type is active' },
                    requiresProjectCode: { type: 'boolean', description: 'Whether project code is required' },
                    requiresReference: { type: 'boolean', description: 'Whether reference is required' },
                    autoGenerateReference: { type: 'boolean', description: 'Whether to auto-generate reference' },
                    referencePrefix: { type: 'string', description: 'Reference prefix for auto-generation' },
                    debitCreditLogic: { type: 'string', enum: ['AUTO', 'MANUAL'], description: 'Debit/credit logic' },
                    defaultDebitCredit: { type: 'string', enum: ['DEBIT', 'CREDIT'], description: 'Default debit/credit designation' }
                  }
                }
              }
            }
          },
          responses: {
            200: { description: 'Entry type updated successfully' },
            400: { description: 'Bad request' },
            401: { description: 'Unauthorized' }
          }
        }
      },

      // ============================================================================
      // ADVANCED CASHBOOK FEATURES - PERIOD LOCKOUT
      // ============================================================================
      '/api/cashbook/periods/lock': {
        post: {
          summary: 'Lock/unlock accounting period',
          description: 'Lock or unlock an accounting period to prevent transactions',
          tags: ['Period Lockout'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['period', 'isLocked'],
                  properties: {
                    period: { type: 'string', pattern: '^\\d{4}-\\d{2}$', description: 'Accounting period in YYYY-MM format', example: '2024-01' },
                    isLocked: { type: 'boolean', description: 'Whether to lock or unlock the period' },
                    reason: { type: 'string', description: 'Reason for locking/unlocking the period' }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Period locked/unlocked successfully',
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
            400: { description: 'Bad request - Invalid period format or missing fields' },
            401: { description: 'Unauthorized' },
            500: { description: 'Internal server error' }
          }
        }
      },
      '/api/cashbook/periods/{period}/status': {
        get: {
          summary: 'Get period lockout status',
          description: 'Check if a specific accounting period is locked',
          tags: ['Period Lockout'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: 'path',
              name: 'period',
              required: true,
              schema: { type: 'string', pattern: '^\\d{4}-\\d{2}$' },
              description: 'Accounting period in YYYY-MM format',
              example: '2024-01'
            }
          ],
          responses: {
            200: {
              description: 'Period status retrieved successfully',
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
                          period: { type: 'string' },
                          isLocked: { type: 'boolean' },
                          lockedAt: { type: 'string', format: 'date-time' },
                          lockedBy: { type: 'object' },
                          reason: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      },
            400: { description: 'Bad request - Invalid period format' },
            401: { description: 'Unauthorized' },
            500: { description: 'Internal server error' }
          }
        }
      },
      '/api/cashbook/periods': {
        get: {
          summary: 'Get all periods with lockout status',
          description: 'Retrieve all accounting periods with their lockout status',
          tags: ['Period Lockout'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: 'query',
              name: 'year',
              schema: { type: 'integer' },
              description: 'Filter by year',
              example: 2024
            },
            {
              in: 'query',
              name: 'isLocked',
              schema: { type: 'boolean' },
              description: 'Filter by lockout status'
            }
          ],
          responses: {
            200: {
              description: 'Periods retrieved successfully',
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
        },
            400: { description: 'Bad request' },
            401: { description: 'Unauthorized' },
            500: { description: 'Internal server error' }
          }
        }
      },
      '/api/cashbook/periods/validate-date': {
        post: {
          summary: 'Validate transaction date against period lockout',
          description: 'Check if a transaction can be created on a specific date',
          tags: ['Period Lockout'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                  required: ['transactionDate'],
                    properties: {
                    transactionDate: { type: 'string', format: 'date-time', description: 'Transaction date to validate' }
                }
              }
            }
          }
        },
          responses: {
            200: {
              description: 'Transaction date is valid',
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
      },
            403: {
              description: 'Forbidden - Period is locked',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: false },
                      message: { type: 'string', example: 'Cannot create transaction in locked period: 2024-01' }
                    }
                  }
                }
              }
            },
            400: { description: 'Bad request - Invalid date format' },
            401: { description: 'Unauthorized' },
            500: { description: 'Internal server error' }
          }
        }
      },
      '/api/cashbook/periods/{period}/history': {
        get: {
          summary: 'Get lockout history for a period',
          description: 'Retrieve the lockout/unlock history for a specific period',
          tags: ['Period Lockout'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: 'path',
              name: 'period',
              required: true,
              schema: { type: 'string', pattern: '^\\d{4}-\\d{2}$' },
              description: 'Accounting period in YYYY-MM format',
              example: '2024-01'
            }
          ],
          responses: {
            200: {
              description: 'Lockout history retrieved successfully',
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
            },
            400: { description: 'Bad request - Invalid period format' },
            401: { description: 'Unauthorized' },
            500: { description: 'Internal server error' }
          }
        }
      },

      // ============================================================================
      // ADVANCED CASHBOOK FEATURES - CONTRA ENTRIES
      // ============================================================================
      '/api/cashbook/contra/configure': {
        post: {
          summary: 'Configure contra entry settings',
          description: 'Configure contra entry settings for specific entry types and GL accounts',
          tags: ['Contra Entries'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['entryType', 'glAccountId', 'contraType'],
                  properties: {
                    entryType: { type: 'string', enum: ['RECEIPT', 'PAYMENT'], description: 'Type of cashbook entry' },
                    glAccountId: { type: 'string', description: 'GL Account ID for contra configuration' },
                    contraType: { type: 'string', enum: ['DETAILED', 'SUMMARY'], description: 'Type of contra entry (detailed or summary)' },
                    isEnabled: { type: 'boolean', default: true, description: 'Whether contra entry is enabled' }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Contra entry configuration updated successfully',
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
            400: { description: 'Bad request - Missing required fields' },
            401: { description: 'Unauthorized - Authentication required' },
            500: { description: 'Internal server error' }
            }
          }
        },
      '/api/cashbook/contra/configs': {
        get: {
          summary: 'Get contra entry configurations',
          description: 'Retrieve contra entry configurations with optional filtering',
          tags: ['Contra Entries'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: 'query',
              name: 'entryType',
              schema: { type: 'string', enum: ['RECEIPT', 'PAYMENT'] },
              description: 'Filter by entry type'
            },
            {
              in: 'query',
              name: 'glAccountId',
              schema: { type: 'string' },
              description: 'Filter by GL Account ID'
            },
            {
              in: 'query',
              name: 'isEnabled',
              schema: { type: 'boolean' },
              description: 'Filter by enabled status'
            }
          ],
          responses: {
            200: {
              description: 'Contra entry configurations retrieved successfully',
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
            },
            400: { description: 'Bad request' },
            401: { description: 'Unauthorized' },
            500: { description: 'Internal server error' }
          }
        }
      },
      '/api/cashbook/contra/generate': {
        post: {
          summary: 'Generate contra entry for cashbook transaction',
          description: 'Generate contra entry for a specific cashbook transaction',
          tags: ['Contra Entries'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                  required: ['cashbookEntryId'],
                    properties: {
                    cashbookEntryId: { type: 'string', description: 'ID of the cashbook entry' }
                }
              }
            }
          }
        },
          responses: {
            200: {
              description: 'Contra entry generated successfully',
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
            400: { description: 'Bad request - Missing required fields' },
            401: { description: 'Unauthorized' },
            500: { description: 'Internal server error' }
          }
        }
      },
      '/api/cashbook/contra/entries/{cashbookEntryId}': {
        get: {
          summary: 'Get contra entries for cashbook entry',
          description: 'Retrieve all contra entries for a specific cashbook entry',
          tags: ['Contra Entries'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: 'path',
              name: 'cashbookEntryId',
            required: true,
              schema: { type: 'string' },
              description: 'ID of the cashbook entry'
              }
          ],
          responses: {
            200: {
              description: 'Contra entries retrieved successfully',
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
            },
            400: { description: 'Bad request' },
            401: { description: 'Unauthorized' },
            500: { description: 'Internal server error' }
          }
        }
      },
      // ==========================================
      // PORTFOLIO WORKFLOW - STAGE 1: APPLICATION SUBMISSION
      // ==========================================
      '/applications': {
        post: {
          tags: ['🏢 Portfolio Management'],
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
                      description: 'Document files (PDF, DOCX, XLSX, images). Must match documentTypes order if provided.'
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
        },
        get: {
          tags: ['📝 Stage 1: Application Submission'],
          summary: 'Get all applications (Investor)',
          description: 'Get all applications with filtering and pagination. Admin/Fund Manager access required.',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
            { name: 'stage', in: 'query', schema: { type: 'string' } },
            { name: 'fundId', in: 'query', schema: { type: 'string' } }
          ],
          responses: {
            200: { description: 'Applications retrieved successfully' },
            401: { description: 'Unauthorized' }
          }
        }
      },
      '/api/applications/upload-documents': {
        post: {
          tags: ['📝 Stage 1: Application Submission'],
          summary: 'Upload application documents (PUBLIC)',
          description: 'Upload documents for an application. Files are uploaded to Firebase Storage. Can be used before or after application creation.',
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    files: {
                      type: 'array',
                      items: { type: 'string', format: 'binary' },
                      description: 'Document files (PDF, DOCX, XLSX, images)'
                    },
                    applicationId: { type: 'string', description: 'Application ID (optional)' },
                    documentTypes: {
                      type: 'string',
                      description: 'JSON array of document types matching files order',
                      example: '["BUSINESS_PLAN", "PROOF_OF_CONCEPT", "MARKET_RESEARCH", "PROJECTED_CASH_FLOWS"]'
                    }
                  }
                }
              }
            }
          },
          responses: {
            201: { description: 'Documents uploaded successfully' },
            400: { description: 'Bad request - no files or invalid format' },
            500: { description: 'Internal server error' }
          }
        }
      },
      '/api/applications/{id}': {
        get: {
          tags: ['📝 Stage 1: Application Submission'],
          summary: 'Get application by ID (Investor)',
          description: 'Get detailed information about an application. Admin/Fund Manager access required.',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'Application retrieved successfully' },
            404: { description: 'Application not found' },
            401: { description: 'Unauthorized' }
          }
        },
        put: {
          tags: ['📝 Stage 1: Application Submission'],
          summary: 'Update application (Investor)',
          description: 'Update an application. Admin/Fund Manager access required.',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    applicantName: { type: 'string' },
                    applicantEmail: { type: 'string' },
                    businessName: { type: 'string' },
                    requestedAmount: { type: 'number' },
                    fundId: { type: 'string' }
                  }
                }
              }
            }
          },
          responses: {
            200: { description: 'Application updated successfully' },
            400: { description: 'Bad request' },
            404: { description: 'Application not found' },
            401: { description: 'Unauthorized' }
          }
        },
        delete: {
          tags: ['📝 Stage 1: Application Submission'],
          summary: 'Delete application (Investor)',
          description: 'Delete an application. Admin access required.',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'Application deleted successfully' },
            404: { description: 'Application not found' },
            401: { description: 'Unauthorized' }
          }
        }
      },
      '/api/applications/{id}/status': {
        get: {
          tags: ['📝 Stage 1: Application Submission'],
          summary: 'Get application status (PUBLIC)',
          description: 'Get the current status of an application. No authentication required.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'Application status retrieved successfully' },
            404: { description: 'Application not found' }
          }
        }
      },
      '/api/applications/{id}/change-stage': {
        post: {
          tags: ['📝 Stage 1: Application Submission'],
          summary: 'Change application stage (Investor)',
          description: 'Change the stage of an application. Admin/Fund Manager access required.',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['newStage'],
                  properties: {
                    newStage: {
                      type: 'string',
                      enum: ['UNDER_DUE_DILIGENCE', 'DUE_DILIGENCE_COMPLETED', 'UNDER_BOARD_REVIEW', 'BOARD_APPROVED', 'BOARD_REJECTED', 'BOARD_CONDITIONAL', 'TERM_SHEET_NEGOTIATION', 'IMPLEMENTATION', 'FUNDED', 'REJECTED']
                    },
                    notes: { type: 'string' }
                  }
                }
              }
            }
          },
          responses: {
            200: { description: 'Application stage changed successfully' },
            400: { description: 'Bad request - invalid stage transition' },
            404: { description: 'Application not found' },
            401: { description: 'Unauthorized' }
          }
        }
      },
      // ==========================================
      // PORTFOLIO WORKFLOW - STAGE 2: DUE DILIGENCE
      // ==========================================
      '/api/applications/{id}/due-diligence/initiate': {
        post: {
          tags: ['🔍 Stage 2: Due Diligence'],
          summary: 'Initiate due diligence (Investor)',
          description: 'Start the due diligence process for an application. Admin/Fund Manager access required.',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'Due diligence initiated successfully' },
            400: { description: 'Bad request - application not in correct stage' },
            404: { description: 'Application not found' },
            401: { description: 'Unauthorized' }
          }
        }
      },
      '/api/applications/{id}/due-diligence': {
        get: {
          tags: ['🔍 Stage 2: Due Diligence'],
          summary: 'Get due diligence report (Investor)',
          description: 'Get the due diligence report for an application. Admin/Fund Manager access required.',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'Due diligence report retrieved successfully' },
            404: { description: 'Due diligence report not found' },
            401: { description: 'Unauthorized' }
          }
        },
        put: {
          tags: ['🔍 Stage 2: Due Diligence'],
          summary: 'Update due diligence data (Investor)',
          description: 'Update the due diligence assessment data. Admin/Fund Manager access required.',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    marketResearchViable: { type: 'boolean' },
                    financialViable: { type: 'boolean' },
                    competitiveOpportunities: { type: 'boolean' },
                    managementTeamQualified: { type: 'boolean' },
                    legalCompliant: { type: 'boolean' },
                    riskTolerable: { type: 'boolean' },
                    overallScore: { type: 'number' },
                    recommendation: { type: 'string', enum: ['APPROVE', 'REJECT', 'CONDITIONAL'] },
                    finalComments: { type: 'string' }
                  }
                }
              }
            }
          },
          responses: {
            200: { description: 'Due diligence updated successfully' },
            400: { description: 'Bad request' },
            404: { description: 'Application not found' },
            401: { description: 'Unauthorized' }
          }
        }
      },
      '/api/applications/{id}/due-diligence/complete': {
        post: {
          tags: ['🔍 Stage 2: Due Diligence'],
          summary: 'Complete due diligence (Investor)',
          description: 'Mark due diligence as completed and move application to next stage. Admin/Fund Manager access required.',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'Due diligence completed successfully' },
            400: { description: 'Bad request - missing required fields' },
            404: { description: 'Due diligence not found' },
            401: { description: 'Unauthorized' }
          }
        }
      },
      '/api/applications/due-diligence': {
        get: {
          tags: ['🔍 Stage 2: Due Diligence'],
          summary: 'Get all due diligence reviews (Investor)',
          description: 'Get all due diligence reviews with pagination and filtering. Admin/Fund Manager access required.',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
            { name: 'status', in: 'query', schema: { type: 'string', enum: ['IN_PROGRESS', 'COMPLETED'] } }
          ],
          responses: {
            200: { description: 'Due diligence reviews retrieved successfully' },
            401: { description: 'Unauthorized' }
          }
        }
      },
      // ==========================================
      // PORTFOLIO WORKFLOW - STAGE 3: BOARD REVIEW
      // ==========================================
      '/board-reviews/voting-members': {
        get: {
          tags: ['🗳️ Voting Process'],
          summary: 'List board voting members',
          description: 'Retrieve board members eligible to vote along with their configured voting power.',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'Board voting members retrieved successfully' },
            401: { description: 'Unauthorized' },
            403: { description: 'Forbidden' }
          }
        }
      },
      '/board-reviews/voting-members/{userId}/voting-power': {
        put: {
          tags: ['🗳️ Voting Process'],
          summary: 'Configure voting power for a board member',
          description: 'Set or clear the weighted voting percentage for a board member. The total voting power across members cannot exceed 100%.',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'userId', in: 'path', required: true, schema: { type: 'string' } }
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    votingPower: {
                      type: 'number',
                      format: 'double',
                      nullable: true,
                      minimum: 0,
                      maximum: 100,
                      example: 25
                    }
                  }
                }
              }
            }
          },
          responses: {
            200: { description: 'Voting power updated successfully' },
            400: { description: 'Validation error' },
            401: { description: 'Unauthorized' },
            403: { description: 'Forbidden' },
            404: { description: 'User not found' }
          }
        }
      },
      '/board-reviews/{applicationId}': {
        post: {
          tags: ['🗳️ Voting Process'],
          summary: 'Create board review (Investor)',
          description: 'Create a board review for an application that has completed due diligence',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'applicationId', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    investmentApproved: { type: 'boolean' },
                    investmentRejected: { type: 'boolean' },
                    conditionalApproval: { type: 'boolean' },
                    recommendationReport: { type: 'string' },
                    decisionReason: { type: 'string' },
                    overallScore: { type: 'number' },
                    finalComments: { type: 'string' }
                  }
                }
              }
            }
          },
          responses: {
            201: { description: 'Board review created successfully' },
            400: { description: 'Bad request' },
            401: { description: 'Unauthorized' }
          }
        },
        get: {
          tags: ['🗳️ Voting Process'],
          summary: 'Get board review by application ID (Investor)',
          description: 'Retrieve board review details for a specific application',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'applicationId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'Board review retrieved successfully' },
            404: { description: 'Board review not found' },
            401: { description: 'Unauthorized' }
          }
        },
        put: {
          tags: ['🗳️ Voting Process'],
          summary: 'Update board review (Investor)',
          description: 'Update an existing board review',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'applicationId', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    investmentApproved: { type: 'boolean' },
                    investmentRejected: { type: 'boolean' },
                    conditionalApproval: { type: 'boolean' },
                    recommendationReport: { type: 'string' },
                    decisionReason: { type: 'string' },
                    overallScore: { type: 'number' },
                    finalComments: { type: 'string' }
                  }
                }
              }
            }
          },
          responses: {
            200: { description: 'Board review updated successfully' },
            404: { description: 'Board review not found' },
            401: { description: 'Unauthorized' }
          }
        }
      },
      '/board-reviews/{applicationId}/complete': {
        post: {
          tags: ['🗳️ Voting Process'],
          summary: 'Complete board review (Investor)',
          description: 'Complete a board review and update application stage',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'applicationId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'Board review completed successfully' },
            404: { description: 'Board review not found' },
            401: { description: 'Unauthorized' }
          }
        }
      },
      '/board-reviews/{applicationId}/votes': {
        post: {
          tags: ['🗳️ Voting Process'],
          summary: 'Cast board review vote',
          description: 'Submit your weighted vote (approve or reject) for a board review. Only authorized board members can vote.',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'applicationId', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['vote'],
                  properties: {
                    vote: { type: 'string', enum: ['APPROVE', 'REJECT'], example: 'APPROVE' },
                    comment: { type: 'string', example: 'Strong fundamentals, I support this deal.' }
                  }
                }
              }
            }
          },
          responses: {
            200: { description: 'Vote recorded successfully (response includes anonymized progress and your vote)' },
            400: { description: 'Bad request' },
            401: { description: 'Unauthorized' },
            403: { description: 'Forbidden - User not eligible to vote' }
          }
        }
      },
      '/board-reviews/{applicationId}/votes/summary': {
        get: {
          tags: ['🗳️ Voting Process'],
          summary: 'Get board vote summary',
          description: 'Retrieve the weighted voting progress and outcome. Individual votes remain hidden until the board review is completed.',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'applicationId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'Vote summary retrieved successfully' },
            400: { description: 'Bad request' },
            401: { description: 'Unauthorized' },
            403: { description: 'Forbidden - User not permitted to view voting summary' }
          }
        }
      },
      '/board-reviews': {
        get: {
          tags: ['🗳️ Voting Process'],
          summary: 'Get all board reviews (Investor)',
          description: 'Retrieve all board reviews with pagination and filtering',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
            { name: 'status', in: 'query', schema: { type: 'string', enum: ['IN_PROGRESS', 'COMPLETED'] } }
          ],
          responses: {
            200: { description: 'Board reviews retrieved successfully' },
            401: { description: 'Unauthorized' }
          }
        }
      },
      '/board-reviews/my': {
        get: {
          tags: ['🗳️ Voting Process'],
          summary: 'Get my board reviews (Investor)',
          description: 'Retrieve board reviews assigned to the current user',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } }
          ],
          responses: {
            200: { description: 'My board reviews retrieved successfully' },
            401: { description: 'Unauthorized' }
          }
        }
      },
      '/board-reviews/summary': {
        get: {
          tags: ['🗳️ Voting Process'],
          summary: 'Get board review summary (Investor)',
          description: 'Get summary statistics for board reviews',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'Board review summary retrieved successfully' },
            401: { description: 'Unauthorized' }
          }
        }
      },
      // ==========================================
      // PORTFOLIO WORKFLOW - STAGE 4: TERM SHEET
      // ==========================================
      '/api/term-sheets/{applicationId}': {
        post: {
          tags: ['📋 Stage 4: Term Sheet'],
          summary: 'Create term sheet (Investor)',
          description: 'Create a new term sheet for an application',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'applicationId', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['title', 'investmentAmount'],
                  properties: {
                    title: { type: 'string', example: 'Investment Term Sheet v1.0' },
                    investmentAmount: { type: 'number', example: 500000 },
                    equityPercentage: { type: 'number', example: 15.5 },
                    valuation: { type: 'number', example: 3200000 },
                    keyTerms: { type: 'string' },
                    conditions: { type: 'string' },
                    timeline: { type: 'string' },
                    documentUrl: { type: 'string' },
                    documentFileName: { type: 'string' },
                    documentSize: { type: 'number' }
                  }
                }
              }
            }
          },
          responses: {
            201: { description: 'Term sheet created successfully' },
            400: { description: 'Bad request' },
            401: { description: 'Unauthorized' },
            403: { description: 'Forbidden' }
          }
        },
        get: {
          tags: ['📋 Stage 4: Term Sheet'],
          summary: 'Get term sheet by application ID (Investor)',
          description: 'Retrieve term sheet details for a specific application',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'applicationId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'Term sheet retrieved successfully' },
            404: { description: 'Term sheet not found' },
            401: { description: 'Unauthorized' }
          }
        },
        put: {
          tags: ['📋 Stage 4: Term Sheet'],
          summary: 'Update term sheet (Investor)',
          description: 'Update an existing term sheet',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'applicationId', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    investmentAmount: { type: 'number' },
                    equityPercentage: { type: 'number' },
                    valuation: { type: 'number' },
                    keyTerms: { type: 'string' },
                    conditions: { type: 'string' },
                    timeline: { type: 'string' },
                    status: { type: 'string', enum: ['DRAFT', 'FINAL', 'SIGNED'] }
                  }
                }
              }
            }
          },
          responses: {
            200: { description: 'Term sheet updated successfully' },
            400: { description: 'Bad request' },
            401: { description: 'Unauthorized' },
            403: { description: 'Forbidden' }
          }
        }
      },
      '/api/term-sheets/{applicationId}/finalize': {
        post: {
          tags: ['📋 Stage 4: Term Sheet'],
          summary: 'Finalize term sheet (Investor)',
          description: 'Mark term sheet as final (ready for signing)',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'applicationId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'Term sheet marked as final successfully' },
            400: { description: 'Bad request' },
            401: { description: 'Unauthorized' },
            403: { description: 'Forbidden' }
          }
        }
      },
      '/api/term-sheets': {
        get: {
          tags: ['📋 Stage 4: Term Sheet'],
          summary: 'Get all term sheets (Investor)',
          description: 'Retrieve all term sheets with pagination and filtering',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
            { name: 'status', in: 'query', schema: { type: 'string', enum: ['DRAFT', 'FINAL', 'SIGNED'] } }
          ],
          responses: {
            200: { description: 'Term sheets retrieved successfully' },
            401: { description: 'Unauthorized' },
            403: { description: 'Forbidden' }
          }
        }
      },
      // ==========================================
      // PORTFOLIO WORKFLOW - STAGE 5: INVESTMENT IMPLEMENTATION
      // ==========================================
      '/api/investment-implementations/signed-term-sheets': {
        get: {
          tags: ['💼 Stage 5: Investment Implementation'],
          summary: 'Get applications with signed term sheets (Investor)',
          description: 'Get all applications that have signed term sheets and are ready for implementation',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } }
          ],
          responses: {
            200: { description: 'Applications with signed term sheets retrieved successfully' },
            401: { description: 'Unauthorized' }
          }
        }
      },
      '/api/investment-implementations/initiate': {
        post: {
          tags: ['💼 Stage 5: Investment Implementation'],
          summary: 'Initiate investment implementation (Investor)',
          description: 'Start the investment implementation process for an approved application',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['portfolioCompanyId', 'applicationId', 'fundId'],
                  properties: {
                    portfolioCompanyId: { type: 'string' },
                    applicationId: { type: 'string' },
                    fundId: { type: 'string' },
                    implementationPlan: { type: 'string' },
                    notes: { type: 'string' }
                  }
                }
              }
            }
          },
          responses: {
            201: { description: 'Investment implementation initiated successfully' },
            400: { description: 'Bad request' },
            401: { description: 'Unauthorized' }
          }
        }
      },
      '/api/investment-implementations/{portfolioCompanyId}': {
        get: {
          tags: ['💼 Stage 5: Investment Implementation'],
          summary: 'Get investment implementation by portfolio company (Investor)',
          description: 'Retrieve investment implementation details for a portfolio company',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'portfolioCompanyId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'Investment implementation retrieved successfully' },
            404: { description: 'Investment implementation not found' },
            401: { description: 'Unauthorized' }
          }
        }
      },
      '/api/investment-implementations/{portfolioCompanyId}/checklist': {
        put: {
          tags: ['💼 Stage 5: Investment Implementation'],
          summary: 'Update implementation checklist (Investor)',
          description: 'Update the implementation checklist items',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'portfolioCompanyId', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    finalDueDiligence: { type: 'boolean' },
                    contractsSigned: { type: 'boolean' },
                    fundsDisbursed: { type: 'boolean' },
                    notes: { type: 'string' }
                  }
                }
              }
            }
          },
          responses: {
            200: { description: 'Implementation checklist updated successfully' },
            401: { description: 'Unauthorized' }
          }
        }
      },
      '/api/investment-implementations/{portfolioCompanyId}/milestones': {
        post: {
          tags: ['💼 Stage 5: Investment Implementation'],
          summary: 'Add milestone to implementation (Investor)',
          description: 'Add a milestone to the investment implementation',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'portfolioCompanyId', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['title', 'description', 'amount', 'dueDate'],
                  properties: {
                    title: { type: 'string' },
                    description: { type: 'string' },
                    amount: { type: 'number' },
                    dueDate: { type: 'string', format: 'date-time' },
                    deliverables: { type: 'string' }
                  }
                }
              }
            }
          },
          responses: {
            201: { description: 'Milestone added successfully' },
            401: { description: 'Unauthorized' }
          }
        }
      },
      '/api/investment-implementations/milestones/{milestoneId}/complete': {
        post: {
          tags: ['💼 Stage 5: Investment Implementation'],
          summary: 'Complete milestone (Investor)',
          description: 'Mark a milestone as completed',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'milestoneId', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    notes: { type: 'string' }
                  }
                }
              }
            }
          },
          responses: {
            200: { description: 'Milestone completed successfully' },
            401: { description: 'Unauthorized' }
          }
        }
      },
      '/api/investment-implementations/disbursements': {
        post: {
          tags: ['💼 Stage 5: Investment Implementation'],
          summary: 'Create fund disbursement (Investor)',
          description: 'Create a fund disbursement for an investment implementation',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['investmentImplementationId', 'amount', 'disbursementDate', 'disbursementType'],
                  properties: {
                    investmentImplementationId: { type: 'string' },
                    milestoneId: { type: 'string' },
                    amount: { type: 'number' },
                    disbursementDate: { type: 'string', format: 'date-time' },
                    disbursementType: { type: 'string', enum: ['INITIAL', 'MILESTONE', 'FINAL'] },
                    notes: { type: 'string' }
                  }
                }
              }
            }
          },
          responses: {
            201: { description: 'Fund disbursement created successfully' },
            401: { description: 'Unauthorized' }
          }
        }
      },
      '/api/investment-implementations/disbursements/{disbursementId}/approve': {
        post: {
          tags: ['💼 Stage 5: Investment Implementation'],
          summary: 'Approve fund disbursement (Investor)',
          description: 'Approve a fund disbursement',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'disbursementId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'Fund disbursement approved successfully' },
            401: { description: 'Unauthorized' }
          }
        }
      },
      '/api/investment-implementations/disbursements/{disbursementId}/disburse': {
        post: {
          tags: ['💼 Stage 5: Investment Implementation'],
          summary: 'Mark disbursement as disbursed (Investor)',
          description: 'Mark a fund disbursement as disbursed',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'disbursementId', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    transactionReference: { type: 'string' }
                  }
                }
              }
            }
          },
          responses: {
            200: { description: 'Fund disbursement marked as disbursed successfully' },
            401: { description: 'Unauthorized' }
          }
        }
      },
      '/api/investment-implementations': {
        get: {
          tags: ['💼 Stage 5: Investment Implementation'],
          summary: 'Get all investment implementations (Investor)',
          description: 'Retrieve all investment implementations with pagination and filtering',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
            { name: 'status', in: 'query', schema: { type: 'string' } }
          ],
          responses: {
            200: { description: 'Investment implementations retrieved successfully' },
            401: { description: 'Unauthorized' }
          }
        }
      },
      // ==========================================
      // PORTFOLIO WORKFLOW - STAGE 6: PORTFOLIO MANAGEMENT
      // ==========================================
      '/api/portfolio-companies': {
        post: {
          tags: ['🏢 Stage 6: Portfolio Management'],
          summary: 'Create portfolio company (Investor)',
          description: 'Create a new portfolio company with user account',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['firstName', 'lastName', 'email', 'password', 'name', 'registrationNumber', 'industry', 'foundingDate', 'address'],
                  properties: {
                    firstName: { type: 'string' },
                    lastName: { type: 'string' },
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string', minLength: 6 },
                    name: { type: 'string' },
                    registrationNumber: { type: 'string' },
                    industry: { type: 'string' },
                    foundingDate: { type: 'string', format: 'date' },
                    address: { type: 'string' },
                    website: { type: 'string', format: 'uri' },
                    description: { type: 'string' },
                    logoUrl: { type: 'string', format: 'uri' }
                  }
                }
              }
            }
          },
          responses: {
            201: { description: 'Portfolio company created successfully' },
            400: { description: 'Bad request' },
            401: { description: 'Unauthorized' }
          }
        },
        get: {
          tags: ['🏢 Stage 6: Portfolio Management'],
          summary: 'Get all portfolio companies (Investor)',
          description: 'Retrieve all portfolio companies',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'Portfolio companies retrieved successfully' },
            401: { description: 'Unauthorized' }
          }
        }
      },
      '/api/portfolio-companies/admin': {
        post: {
          tags: ['🏢 Stage 6: Portfolio Management'],
          summary: 'Create portfolio company by admin (Investor)',
          description: 'Create a new portfolio company from admin side with enhanced fields',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    userId: { type: 'string' },
                    firstName: { type: 'string' },
                    lastName: { type: 'string' },
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string', minLength: 6 },
                    name: { type: 'string' },
                    registrationNumber: { type: 'string' },
                    industry: { type: 'string' },
                    fundId: { type: 'string' },
                    capTable: { type: 'object' },
                    financialKpis: { type: 'object' }
                  }
                }
              }
            }
          },
          responses: {
            201: { description: 'Portfolio company created successfully' },
            400: { description: 'Bad request' },
            401: { description: 'Unauthorized' },
            403: { description: 'Forbidden' }
          }
        }
      },
      '/api/portfolio-companies/{id}': {
        get: {
          tags: ['🏢 Stage 6: Portfolio Management'],
          summary: 'Get portfolio company by ID (Investor + Applicant)',
          description: 'Retrieve portfolio company details',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'Portfolio company retrieved successfully' },
            404: { description: 'Portfolio company not found' },
            401: { description: 'Unauthorized' }
          }
        },
        put: {
          tags: ['🏢 Stage 6: Portfolio Management'],
          summary: 'Update portfolio company (Investor + Applicant)',
          description: 'Update portfolio company details',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    industry: { type: 'string' },
                    address: { type: 'string' },
                    website: { type: 'string', format: 'uri' },
                    description: { type: 'string' },
                    logoUrl: { type: 'string', format: 'uri' },
                    status: { type: 'string', enum: ['PENDING', 'APPROVED', 'REJECTED', 'ACTIVE', 'SUSPENDED'] },
                    fundId: { type: 'string' },
                    capTable: { type: 'object' },
                    financialKpis: { type: 'object' }
                  }
                }
              }
            }
          },
          responses: {
            200: { description: 'Portfolio company updated successfully' },
            401: { description: 'Unauthorized' }
          }
        },
        delete: {
          tags: ['🏢 Stage 6: Portfolio Management'],
          summary: 'Delete portfolio company (Investor)',
          description: 'Delete a portfolio company',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'Portfolio company deleted successfully' },
            401: { description: 'Unauthorized' },
            403: { description: 'Forbidden' }
          }
        }
      },
      '/api/portfolio-companies/me': {
        get: {
          tags: ['🏢 Stage 6: Portfolio Management'],
          summary: 'Get my portfolio company (Applicant)',
          description: 'Get current user\'s portfolio company',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'Portfolio company retrieved successfully' },
            404: { description: 'No portfolio company found' },
            401: { description: 'Unauthorized' }
          }
        },
        put: {
          tags: ['🏢 Stage 6: Portfolio Management'],
          summary: 'Update my portfolio company (Applicant)',
          description: 'Update current user\'s portfolio company',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    industry: { type: 'string' },
                    address: { type: 'string' },
                    website: { type: 'string', format: 'uri' },
                    description: { type: 'string' }
                  }
                }
              }
            }
          },
          responses: {
            200: { description: 'Portfolio company updated successfully' },
            401: { description: 'Unauthorized' }
          }
        }
      },
      '/api/portfolio-valuations': {
        post: {
          tags: ['🏢 Stage 6: Portfolio Management'],
          summary: 'Create portfolio valuation (Investor)',
          description: 'Create a new portfolio valuation process',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['title', 'valuationPeriod'],
                  properties: {
                    title: { type: 'string' },
                    description: { type: 'string' },
                    valuationPeriod: { type: 'string' },
                    quarter: { type: 'integer' },
                    year: { type: 'integer' },
                    targetCompletionDate: { type: 'string', format: 'date' },
                    assignedToId: { type: 'string' }
                  }
                }
              }
            }
          },
          responses: {
            201: { description: 'Portfolio valuation created successfully' },
            401: { description: 'Unauthorized' },
            403: { description: 'Forbidden' }
          }
        },
        get: {
          tags: ['🏢 Stage 6: Portfolio Management'],
          summary: 'Get all portfolio valuations (Investor)',
          description: 'Get all portfolio valuations with filtering',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'quarter', in: 'query', schema: { type: 'integer' } },
            { name: 'year', in: 'query', schema: { type: 'integer' } },
            { name: 'assignedToId', in: 'query', schema: { type: 'string' } },
            { name: 'status', in: 'query', schema: { type: 'string' } }
          ],
          responses: {
            200: { description: 'Portfolio valuations retrieved successfully' },
            401: { description: 'Unauthorized' }
          }
        }
      },
      '/api/portfolio-valuations/{id}': {
        get: {
          tags: ['🏢 Stage 6: Portfolio Management'],
          summary: 'Get portfolio valuation by ID (Investor)',
          description: 'Get specific portfolio valuation with activities',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'Portfolio valuation retrieved successfully' },
            404: { description: 'Portfolio valuation not found' },
            401: { description: 'Unauthorized' }
          }
        },
        put: {
          tags: ['🏢 Stage 6: Portfolio Management'],
          summary: 'Update portfolio valuation (Investor)',
          description: 'Update portfolio valuation details',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    totalPortfolioValue: { type: 'number' },
                    previousValue: { type: 'number' },
                    status: { type: 'string' },
                    currentStep: { type: 'string' },
                    capTablesObtained: { type: 'boolean' },
                    financialsReconciled: { type: 'boolean' }
                  }
                }
              }
            }
          },
          responses: {
            200: { description: 'Portfolio valuation updated successfully' },
            401: { description: 'Unauthorized' }
          }
        },
        delete: {
          tags: ['🏢 Stage 6: Portfolio Management'],
          summary: 'Delete portfolio valuation (Investor)',
          description: 'Delete a portfolio valuation',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'Portfolio valuation deleted successfully' },
            401: { description: 'Unauthorized' },
            403: { description: 'Forbidden' }
          }
        }
      },
      '/api/portfolio-valuations/{id}/activities': {
        post: {
          tags: ['🏢 Stage 6: Portfolio Management'],
          summary: 'Create portfolio valuation activity (Investor)',
          description: 'Log a portfolio valuation activity',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['activityType', 'title'],
                  properties: {
                    activityType: { type: 'string' },
                    title: { type: 'string' },
                    description: { type: 'string' },
                    companiesProcessed: { type: 'integer' },
                    reconciliationStatus: { type: 'object' }
                  }
                }
              }
            }
          },
          responses: {
            201: { description: 'Portfolio valuation activity created successfully' },
            401: { description: 'Unauthorized' }
          }
        },
        get: {
          tags: ['🏢 Stage 6: Portfolio Management'],
          summary: 'Get portfolio valuation activities (Investor)',
          description: 'Get all activities for a portfolio valuation',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'Portfolio valuation activities retrieved successfully' },
            401: { description: 'Unauthorized' }
          }
        }
      },
      '/api/portfolio-valuations/summary/quarterly': {
        get: {
          tags: ['🏢 Stage 6: Portfolio Management'],
          summary: 'Get quarterly valuation summary (Investor)',
          description: 'Get quarterly portfolio valuation summary',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'quarter', in: 'query', schema: { type: 'integer' } },
            { name: 'year', in: 'query', schema: { type: 'integer' } }
          ],
          responses: {
            200: { description: 'Quarterly valuation summary retrieved successfully' },
            401: { description: 'Unauthorized' }
          }
        }
      },
      '/api/portfolio-valuations/analytics/summary': {
        get: {
          tags: ['🏢 Stage 6: Portfolio Management'],
          summary: 'Get valuation analytics (Investor)',
          description: 'Get portfolio valuation analytics and insights',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'Valuation analytics retrieved successfully' },
            401: { description: 'Unauthorized' }
          }
        }
      },
      // ==========================================
      // PORTFOLIO WORKFLOW - APPLICANT ENDPOINTS
      // ==========================================
      '/term-sheets/{applicationId}/sign': {
        post: {
          tags: ['📋 Stage 4: Term Sheet'],
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
      '/api/term-sheets/my': {
        get: {
          tags: ['📋 Stage 4: Term Sheet'],
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
    }
  };

try {
  specs = swaggerJsdoc(options);
  
  // Check if specs has paths - if not, use fallback
  if (!specs || !specs.paths || Object.keys(specs.paths).length === 0) {
    console.log('Swagger-jsdoc returned empty spec, using fallback');
    console.log(`Fallback spec includes ${Object.keys(fallbackSpec.paths).length} endpoints (accounting + performance + task assignment + cashbook)`);
    specs = fallbackSpec;
  } else {
    console.log(`Swagger-jsdoc generated ${Object.keys(specs.paths).length} endpoints`);
    // Merge accounting, cashbook, performance, and task assignment endpoints with generated spec
    specs.paths = { ...specs.paths, ...accountingEndpoints, ...performanceEndpoints, ...taskAssignmentEndpoints };
    console.log(`Added accounting, cashbook, performance, and task assignment endpoints, total: ${Object.keys(specs.paths).length} endpoints`);
  }
} catch (error) {
  console.error('Error generating Swagger spec:', error);
  console.log('Using fallback spec due to error');
  console.log(`Fallback spec includes ${Object.keys(fallbackSpec.paths).length} endpoints (accounting + performance + task assignment + cashbook)`);
  specs = fallbackSpec;
}

export { specs }; 