import swaggerJsdoc from 'swagger-jsdoc';
import { accountingEndpoints } from './accounting-endpoints';

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
          required: ['firstName', 'lastName', 'email', 'password', 'roleId'],
          properties: {
            firstName: { type: 'string', example: 'John' },
            lastName: { type: 'string', example: 'Doe' },
            email: { type: 'string', format: 'email', example: 'john@example.com' },
            password: { type: 'string', example: 'password123' },
            roleId: { type: 'string', example: 'clx1234567890abcdef' },
            backgroundImage: { type: 'string', example: 'https://example.com/backgrounds/tech-background.jpg' }
          }
        },
        UpdateUserRequest: {
          type: 'object',
          properties: {
            firstName: { type: 'string', example: 'John Updated' },
            lastName: { type: 'string', example: 'Doe Updated' },
            email: { type: 'string', format: 'email', example: 'john.updated@example.com' },
            roleId: { type: 'string', example: 'clx1234567890abcdef' },
            backgroundImage: { type: 'string', example: 'https://example.com/backgrounds/tech-background.jpg' }
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
      }
    }
  };

try {
  specs = swaggerJsdoc(options);
  
  // Check if specs has paths - if not, use fallback
  if (!specs || !specs.paths || Object.keys(specs.paths).length === 0) {
    console.log('Swagger-jsdoc returned empty spec, using fallback');
    specs = fallbackSpec;
  } else {
    console.log(`Swagger-jsdoc generated ${Object.keys(specs.paths).length} endpoints`);
    // Merge accounting and cashbook endpoints with generated spec
    specs.paths = { ...specs.paths, ...accountingEndpoints };
    console.log(`Added accounting and cashbook endpoints, total: ${Object.keys(specs.paths).length} endpoints`);
  }
} catch (error) {
  console.error('Error generating Swagger spec:', error);
  // Fallback to comprehensive spec
  specs = {
    ...options.definition,
    paths: {
      ...accountingEndpoints,
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
      // Income Statement
      '/accounting/income-statement/generate': {
        post: {
          summary: 'Generate income statement for a specific period',
          description: 'Generate a basic income statement showing revenue, expenses, and net income',
          tags: ['Accounting - Income Statement'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['startDate', 'endDate'],
                  properties: {
                    startDate: { type: 'string', format: 'date', example: '2025-01-01' },
                    endDate: { type: 'string', format: 'date', example: '2025-12-31' },
                    currencyId: { type: 'string', example: 'clx1234567890abcdef' }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Income statement generated successfully',
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
      '/accounting/income-statement/detailed': {
        post: {
          summary: 'Get detailed income statement with transaction breakdown',
          description: 'Get income statement with detailed transaction information for each account',
          tags: ['Accounting - Income Statement'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['startDate', 'endDate'],
                  properties: {
                    startDate: { type: 'string', format: 'date', example: '2025-01-01' },
                    endDate: { type: 'string', format: 'date', example: '2025-12-31' },
                    currencyId: { type: 'string', example: 'clx1234567890abcdef' }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Detailed income statement retrieved successfully',
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
      '/accounting/income-statement/summary': {
        post: {
          summary: 'Get income statement summary (high-level totals)',
          description: 'Get a summary view of income statement with totals only',
          tags: ['Accounting - Income Statement'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['startDate', 'endDate'],
                  properties: {
                    startDate: { type: 'string', format: 'date', example: '2025-01-01' },
                    endDate: { type: 'string', format: 'date', example: '2025-12-31' },
                    currencyId: { type: 'string', example: 'clx1234567890abcdef' }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Income statement summary retrieved successfully',
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
      '/accounting/income-statement/comprehensive': {
        post: {
          summary: 'Get comprehensive detailed income statement with all transaction details',
          description: 'Get comprehensive income statement with complete transaction details, statistics, and grouped data',
          tags: ['Accounting - Income Statement'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['startDate', 'endDate'],
                  properties: {
                    startDate: { type: 'string', format: 'date', example: '2025-01-01' },
                    endDate: { type: 'string', format: 'date', example: '2025-12-31' },
                    currencyId: { type: 'string', example: 'clx1234567890abcdef' }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Comprehensive detailed income statement retrieved successfully',
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
      '/accounting/income-statement/comparative': {
        post: {
          summary: 'Get comparative income statement for multiple periods',
          description: 'Get income statement comparing multiple periods side by side',
          tags: ['Accounting - Income Statement'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['periods'],
                  properties: {
                    periods: {
                      type: 'array',
                      minItems: 2,
                      items: {
                        type: 'object',
                        required: ['startDate', 'endDate'],
                        properties: {
                          startDate: { type: 'string', format: 'date', example: '2025-01-01' },
                          endDate: { type: 'string', format: 'date', example: '2025-12-31' },
                          currencyId: { type: 'string', example: 'clx1234567890abcdef' }
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
              description: 'Comparative income statement retrieved successfully',
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
      '/accounting/income-statement/vertical': {
        post: {
          summary: 'Get vertical income statement with traditional format',
          description: 'Get income statement in traditional vertical format with detailed breakdowns',
          tags: ['Accounting - Income Statement'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['startDate', 'endDate'],
                  properties: {
                    startDate: { type: 'string', format: 'date', example: '2025-01-01' },
                    endDate: { type: 'string', format: 'date', example: '2025-12-31' },
                    currencyId: { type: 'string', example: 'clx1234567890abcdef' }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Vertical income statement retrieved successfully',
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
      '/accounting/income-statement': {
        get: {
          summary: 'Get income statement by query parameters',
          description: 'Get income statement using query parameters (for GET requests)',
          tags: ['Accounting - Income Statement'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: 'query',
              name: 'startDate',
              required: true,
              schema: { type: 'string', format: 'date' },
              description: 'Start date of the period'
            },
            {
              in: 'query',
              name: 'endDate',
              required: true,
              schema: { type: 'string', format: 'date' },
              description: 'End date of the period'
            },
            {
              in: 'query',
              name: 'currencyId',
              schema: { type: 'string' },
              description: 'Currency ID (optional)'
            },
            {
              in: 'query',
              name: 'type',
              schema: { type: 'string', enum: ['summary', 'detailed'], default: 'summary' },
              description: 'Type of income statement to return'
            }
          ],
          responses: {
            200: {
              description: 'Income statement retrieved successfully',
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
      // Mini-KYC Management
      '/api/mini-kyc': {
        post: {
          summary: 'Create or update mini-KYC',
          description: 'Create or update mini-KYC for the authenticated user',
          tags: ['Mini-KYC'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateMiniKycRequest' }
              }
            }
          },
          responses: {
            200: {
              description: 'Mini-KYC created/updated successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      message: { type: 'string' },
                      data: { $ref: '#/components/schemas/MiniKyc' }
                    }
                  }
                }
              }
            }
          }
        },
        get: {
          summary: 'Get mini-KYC',
          description: 'Get mini-KYC for the authenticated user',
          tags: ['Mini-KYC'],
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: 'Mini-KYC retrieved successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: { $ref: '#/components/schemas/MiniKyc' }
                    }
                  }
                }
              }
            }
          }
        },
        put: {
          summary: 'Update mini-KYC',
          description: 'Update mini-KYC for the authenticated user',
          tags: ['Mini-KYC'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UpdateMiniKycRequest' }
              }
            }
          },
          responses: {
            200: {
              description: 'Mini-KYC updated successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      message: { type: 'string' },
                      data: { $ref: '#/components/schemas/MiniKyc' }
                    }
                  }
                }
              }
            }
          }
        },
        delete: {
          summary: 'Delete mini-KYC',
          description: 'Delete mini-KYC for the authenticated user',
          tags: ['Mini-KYC'],
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: 'Mini-KYC deleted successfully',
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
      '/api/mini-kyc/status': {
        get: {
          summary: 'Get KYC status',
          description: 'Check if user has completed mini-KYC',
          tags: ['Mini-KYC'],
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: 'KYC status retrieved successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'object',
                        properties: {
                          isCompleted: { type: 'boolean' }
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
      '/api/mini-kyc/all': {
        get: {
          summary: 'Get all mini-KYC records',
          description: 'Get all mini-KYC records (admin only)',
          tags: ['Mini-KYC'],
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: 'All mini-KYC records retrieved successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/MiniKyc' }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      // Company Profile Management
      '/api/company-profile': {
        post: {
          summary: 'Create company profile',
          description: 'Create a new company profile with social media URLs (Admin only)',
          tags: ['Company Profile'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateCompanyProfileRequest' }
              }
            }
          },
          responses: {
            201: {
              description: 'Company profile created successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      message: { type: 'string' },
                      data: { $ref: '#/components/schemas/CompanyProfile' }
                    }
                  }
                }
              }
            }
          }
        },
        get: {
          summary: 'Get company profile',
          description: 'Retrieve the company profile with social media URLs',
          tags: ['Company Profile'],
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: 'Company profile retrieved successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: { $ref: '#/components/schemas/CompanyProfile' }
                    }
                  }
                }
              }
            }
          }
        },
        put: {
          summary: 'Update company profile',
          description: 'Update the company profile with social media URLs (Admin only)',
          tags: ['Company Profile'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UpdateCompanyProfileRequest' }
              }
            }
          },
          responses: {
            200: {
              description: 'Company profile updated successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      message: { type: 'string' },
                      data: { $ref: '#/components/schemas/CompanyProfile' }
                    }
                  }
                }
              }
            }
          }
        },
        delete: {
          summary: 'Delete company profile',
          description: 'Delete the company profile (Admin only)',
          tags: ['Company Profile'],
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: 'Company profile deleted successfully',
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
      '/api/company-profile/upsert': {
        post: {
          summary: 'Create or update company profile',
          description: 'Create a new company profile or update existing one (Admin only)',
          tags: ['Company Profile'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateCompanyProfileRequest' }
              }
            }
          },
          responses: {
            200: {
              description: 'Company profile created or updated successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      message: { type: 'string' },
                      data: { $ref: '#/components/schemas/CompanyProfile' }
                    }
                  }
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