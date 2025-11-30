// Comprehensive Events Management endpoints for fallback Swagger spec
export const eventsEndpoints = {
  // ========== EVENTS MANAGEMENT - CORE EVENTS ==========
  '/events': {
    post: {
      summary: 'Create a new event',
      description: '**Required Role:** Any authenticated user (Event Organizer). Create a new company event with enhanced features including event type, RSVP requirements, budget planning, and Google Calendar integration. All users are notified when a new event is created.',
      tags: ['Events Management - Core Events'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['title', 'description', 'startDate', 'endDate'],
              properties: {
                title: { type: 'string', example: 'Annual Company Conference' },
                description: { type: 'string', example: 'Our annual company-wide conference with keynote speakers and networking opportunities' },
                startDate: { type: 'string', format: 'date-time', example: '2024-12-15T09:00:00.000Z' },
                endDate: { type: 'string', format: 'date-time', example: '2024-12-15T17:00:00.000Z' },
                location: { type: 'string', example: 'Convention Center, Harare' },
                eventType: { type: 'string', enum: ['CONFERENCE', 'MEETING', 'WORKSHOP', 'SOCIAL', 'SEMINAR', 'TRAINING', 'OTHER'], example: 'CONFERENCE' },
                maxAttendees: { type: 'integer', example: 500, description: 'Maximum number of attendees allowed' },
                isPublic: { type: 'boolean', default: false, example: false, description: 'Whether the event is public or private' },
                requiresRSVP: { type: 'boolean', default: true, example: true, description: 'Whether RSVP is required' },
                rsvpDeadline: { type: 'string', format: 'date-time', example: '2024-12-10T23:59:59.000Z', description: 'Deadline for RSVP responses' },
                estimatedBudget: { type: 'number', example: 50000, description: 'Estimated budget for the event' },
                checkInRequired: { type: 'boolean', default: false, example: true, description: 'Whether check-in is required for attendees' },
                feedbackRequired: { type: 'boolean', default: false, example: true, description: 'Whether feedback collection is required' }
              }
            }
          }
        }
      },
      responses: {
        201: {
          description: 'Event created successfully',
          content: {
            'application/json': {
              example: {
                success: true,
                message: 'Event created successfully',
                data: {
                  id: 'event-id',
                  title: 'Annual Company Conference',
                  status: 'PLANNING',
                  budgetStatus: 'DRAFT',
                  googleCalendarEventId: 'google-cal-id',
                  googleCalendarLink: 'https://calendar.google.com/event'
                }
              }
            }
          }
        },
        400: { description: 'Bad request - missing required fields or validation error' },
        401: { description: 'Unauthorized' }
      }
    },
    get: {
      summary: 'Get all active events',
      description: '**Required Role:** Any authenticated user. Retrieve all active events ordered by start date. Returns events with author information.',
      tags: ['Events Management - Core Events'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'Events retrieved successfully',
          content: {
            'application/json': {
              example: {
                success: true,
                data: [
                  {
                    id: 'event-id',
                    title: 'Annual Company Conference',
                    startDate: '2024-12-15T09:00:00.000Z',
                    status: 'PLANNING',
                    author: { id: 'user-id', firstName: 'John', lastName: 'Doe' }
                  }
                ]
              }
            }
          }
        },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/events/upcoming': {
    get: {
      summary: 'Get upcoming events',
      description: '**Required Role:** Any authenticated user. Retrieve all upcoming events (start date >= current date) ordered by start date',
      tags: ['Events Management - Core Events'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'Upcoming events retrieved successfully',
          content: {
            'application/json': {
              example: {
                success: true,
                data: []
              }
            }
          }
        },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/events/{id}': {
    get: {
      summary: 'Get event by ID',
      description: '**Required Role:** Any authenticated user. Retrieve a specific event by ID with full details including author information',
      tags: ['Events Management - Core Events'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Event ID', example: 'clx1234567890abcdef' }
      ],
      responses: {
        200: { description: 'Event retrieved successfully' },
        404: { description: 'Event not found' },
        401: { description: 'Unauthorized' }
      }
    },
    put: {
      summary: 'Update an event',
      description: '**Required Role:** Event Organizer (Must be event author - only author can update). Update an event. Only the event author can update their events. Updates basic event information.',
      tags: ['Events Management - Core Events'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Event ID', example: 'clx1234567890abcdef' }
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['title', 'description', 'startDate', 'endDate'],
              properties: {
                title: { type: 'string', example: 'Updated Event Title' },
                description: { type: 'string', example: 'Updated event description' },
                startDate: { type: 'string', format: 'date-time', example: '2024-12-15T09:00:00.000Z' },
                endDate: { type: 'string', format: 'date-time', example: '2024-12-15T17:00:00.000Z' },
                location: { type: 'string', example: 'Updated Location' },
                rsvpDeadline: { type: 'string', format: 'date-time', example: '2024-12-10T23:59:59.000Z', description: 'RSVP deadline (optional, can be null to remove deadline)' },
                eventType: { type: 'string', enum: ['CONFERENCE', 'MEETING', 'WORKSHOP', 'SOCIAL', 'SEMINAR', 'TRAINING', 'OTHER'], example: 'CONFERENCE' },
                maxAttendees: { type: 'integer', example: 500 },
                isPublic: { type: 'boolean', example: false },
                requiresRSVP: { type: 'boolean', example: true },
                estimatedBudget: { type: 'number', example: 50000 },
                checkInRequired: { type: 'boolean', example: true },
                feedbackRequired: { type: 'boolean', example: true }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Event updated successfully' },
        400: { description: 'Bad request - validation error' },
        403: { description: 'Forbidden - can only edit your own events' },
        404: { description: 'Event not found' },
        401: { description: 'Unauthorized' }
      }
    },
    delete: {
      summary: 'Delete an event',
      description: '**Required Role:** Event Organizer (Must be event author - only author can delete). Delete an event (soft delete by setting isActive to false). Only the event author can delete their events.',
      tags: ['Events Management - Core Events'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Event ID', example: 'clx1234567890abcdef' }
      ],
      responses: {
        200: { description: 'Event deleted successfully' },
        403: { description: 'Forbidden - can only delete your own events' },
        404: { description: 'Event not found' },
        401: { description: 'Unauthorized' }
      }
    }
  },

  // ========== EVENTS MANAGEMENT - GUEST MANAGEMENT ==========
  '/events/{eventId}/guests': {
    post: {
      summary: 'Add guests to an event',
      description: '**Required Role:** Event Organizer (Any authenticated user). Add one or more guests to an event. Invitation emails with unique RSVP links are automatically sent to all guests.',
      tags: ['Events Management - Guest Management'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'eventId', required: true, schema: { type: 'string' }, description: 'Event ID', example: 'clx1234567890abcdef' }
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['guests'],
              properties: {
                guests: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['email', 'name'],
                    properties: {
                      email: { type: 'string', format: 'email', example: 'john@example.com' },
                      name: { type: 'string', example: 'John Doe' },
                      phone: { type: 'string', example: '+263771234567' },
                      company: { type: 'string', example: 'Tech Corp' },
                      title: { type: 'string', example: 'CEO' },
                      dietaryRequirements: { type: 'string', example: 'Vegetarian', description: 'Dietary restrictions or requirements' },
                      accessibilityNeeds: { type: 'string', example: 'Wheelchair access', description: 'Accessibility requirements' },
                      emergencyContact: { type: 'string', example: 'Jane Doe' },
                      emergencyPhone: { type: 'string', example: '+263771234568' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      responses: {
        201: {
          description: 'Guests added successfully and invitation emails sent',
          content: {
            'application/json': {
              example: {
                success: true,
                message: 'Guests added successfully',
                data: [
                  {
                    id: 'guest-id',
                    email: 'john@example.com',
                    name: 'John Doe',
                    invitationToken: 'unique-token',
                    rsvpStatus: 'PENDING'
                  }
                ]
              }
            }
          }
        },
        400: { description: 'Bad request - guests array is required and must not be empty' },
        404: { description: 'Event not found' },
        401: { description: 'Unauthorized' }
      }
    },
    get: {
      summary: 'Get event guests',
      description: '**Required Role:** Any authenticated user. Retrieve all guests for an event with pagination and optional RSVP status filtering',
      tags: ['Events Management - Guest Management'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'eventId', required: true, schema: { type: 'string' }, description: 'Event ID', example: 'clx1234567890abcdef' },
        { in: 'query', name: 'page', schema: { type: 'integer', default: 1 }, description: 'Page number' },
        { in: 'query', name: 'limit', schema: { type: 'integer', default: 10 }, description: 'Number of items per page' },
        { in: 'query', name: 'rsvpStatus', schema: { type: 'string', enum: ['PENDING', 'ACCEPTED', 'DECLINED', 'MAYBE'] }, description: 'Filter by RSVP status' }
      ],
      responses: {
        200: {
          description: 'Event guests retrieved successfully',
          content: {
            'application/json': {
              example: {
                success: true,
                data: [],
                pagination: { page: 1, limit: 10, total: 0, pages: 0 }
              }
            }
          }
        },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/events/rsvp/{invitationToken}': {
    post: {
      summary: 'Handle RSVP response (PUBLIC)',
      description: '**Required Role:** PUBLIC (No authentication required). Guests use this endpoint to respond to event invitations using their unique invitation token. Organizers receive email notifications when guests respond.',
      tags: ['Events Management - Guest Management'],
      parameters: [
        { in: 'path', name: 'invitationToken', required: true, schema: { type: 'string' }, description: 'Unique invitation token sent to guest via email', example: 'abc123def456...' }
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['rsvpStatus'],
              properties: {
                rsvpStatus: { type: 'string', enum: ['ACCEPTED', 'DECLINED', 'MAYBE'], example: 'ACCEPTED', description: 'RSVP response status' },
                notes: { type: 'string', example: 'Looking forward to attending!', description: 'Optional notes from guest' }
              }
            }
          }
        }
      },
      responses: {
        200: {
          description: 'RSVP response recorded successfully',
          content: {
            'application/json': {
              example: {
                success: true,
                message: 'RSVP response recorded successfully',
                data: {
                  id: 'guest-id',
                  rsvpStatus: 'ACCEPTED',
                  rsvpRespondedAt: '2024-12-01T10:00:00.000Z'
                }
              }
            }
          }
        },
        400: { description: 'Bad request - invalid RSVP status or RSVP deadline has passed' },
        404: { description: 'Invalid invitation token' }
      }
    }
  },
  '/events/{eventId}/guests/{guestId}/check-in': {
    post: {
      summary: 'Check in guest to event',
      description: '**Required Role:** Event Staff (Any authenticated user - Reception staff, event coordinator, etc.). Check in a guest to an event. Creates a check-in record and updates the guest\'s check-in status. Used during event day operations.',
      tags: ['Events Management - Guest Management'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'eventId', required: true, schema: { type: 'string' }, description: 'Event ID', example: 'clx1234567890abcdef' },
        { in: 'path', name: 'guestId', required: true, schema: { type: 'string' }, description: 'Guest ID', example: 'guest-id' }
      ],
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                notes: { type: 'string', example: 'Checked in at main entrance', description: 'Optional check-in notes' }
              }
            }
          }
        }
      },
      responses: {
        201: {
          description: 'Guest checked in successfully',
          content: {
            'application/json': {
              example: {
                success: true,
                message: 'Guest checked in successfully',
                data: {
                  id: 'checkin-id',
                  eventId: 'event-id',
                  guestId: 'guest-id',
                  checkInTime: '2024-12-15T09:00:00.000Z'
                }
              }
            }
          }
        },
        400: { description: 'Bad request' },
        404: { description: 'Event or guest not found' },
        401: { description: 'Unauthorized' }
      }
    }
  },

  // ========== EVENTS MANAGEMENT - BUDGET MANAGEMENT ==========
  '/events/{eventId}/budget-items': {
    post: {
      summary: 'Add budget items to an event',
      description: '**Required Role:** Event Organizer (Any authenticated user). Add one or more budget items to an event. Budget items are categorized expenses with estimated costs. Adding budget items automatically changes the event budget status from DRAFT to SUBMITTED and event status to BUDGET_PENDING, making it ready for approval.',
      tags: ['Events Management - Budget Management'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'eventId', required: true, schema: { type: 'string' }, description: 'Event ID', example: 'clx1234567890abcdef' }
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['budgetItems'],
              properties: {
                budgetItems: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['category', 'itemName', 'estimatedCost'],
                    properties: {
                      category: { type: 'string', enum: ['VENUE', 'CATERING', 'DECORATIONS', 'ENTERTAINMENT', 'TRANSPORT', 'MARKETING', 'TECHNOLOGY', 'STAFFING', 'SECURITY', 'CLEANING', 'INSURANCE', 'UTILITIES', 'OTHER'], example: 'VENUE', description: 'Budget item category' },
                      itemName: { type: 'string', example: 'Conference Hall Rental' },
                      description: { type: 'string', example: 'Main conference hall for 500 people', description: 'Detailed description of the budget item' },
                      estimatedCost: { type: 'number', example: 15000, description: 'Estimated cost for this item' },
                      quantity: { type: 'integer', default: 1, example: 1, description: 'Quantity of items' },
                      unit: { type: 'string', example: 'day', description: 'Unit of measurement (e.g., day, person, hour)' },
                      vendor: { type: 'string', example: 'Convention Center', description: 'Vendor name' },
                      vendorContact: { type: 'string', example: 'events@convention.com', description: 'Vendor contact information' },
                      notes: { type: 'string', example: 'Includes AV equipment', description: 'Additional notes about the budget item' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      responses: {
        201: {
          description: 'Budget items added successfully',
          content: {
            'application/json': {
              example: {
                success: true,
                message: 'Budget items added successfully',
                data: [
                  {
                    id: 'budget-item-id',
                    category: 'VENUE',
                    itemName: 'Conference Hall Rental',
                    estimatedCost: '15000.00'
                  }
                ]
              }
            }
          }
        },
        400: { description: 'Bad request - budget items array is required and must not be empty' },
        404: { description: 'Event not found' },
        401: { description: 'Unauthorized' }
      }
    },
    get: {
      summary: 'Get event budget items',
      description: '**Required Role:** Any authenticated user. Retrieve all budget items for an event',
      tags: ['Events Management - Budget Management'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'eventId', required: true, schema: { type: 'string' }, description: 'Event ID', example: 'clx1234567890abcdef' }
      ],
      responses: {
        200: {
          description: 'Budget items retrieved successfully',
          content: {
            'application/json': {
              example: {
                success: true,
                data: []
              }
            }
          }
        },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/events/{eventId}/budget/approve': {
    post: {
      summary: 'Approve event budget',
      description: '**Required Role:** Budget Approver (Finance Manager, Department Head, or any user with approval rights). Approve an event budget. **Required:** Budget must be in SUBMITTED status. Creates a journal entry for budget allocation (Dr. Event Budget Account, Cr. Cash/Bank). Sends email notification to event organizer. Once approved, budget status becomes APPROVED and event status becomes BUDGET_APPROVED, allowing expenses to be recorded.',
      tags: ['Events Management - Budget Management'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'eventId', required: true, schema: { type: 'string' }, description: 'Event ID', example: 'clx1234567890abcdef' }
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['approvedBudget'],
              properties: {
                approvedBudget: { type: 'number', example: 48000, description: 'Approved budget amount (can be different from estimated budget)' },
                notes: { type: 'string', example: 'Approved with minor adjustments to catering costs', description: 'Optional approval notes' }
              }
            }
          }
        }
      },
      responses: {
        200: {
          description: 'Budget approved successfully',
          content: {
            'application/json': {
              example: {
                success: true,
                message: 'Budget approved successfully',
                data: {
                  id: 'event-id',
                  budgetStatus: 'APPROVED',
                  status: 'BUDGET_APPROVED',
                  approvedBudget: '48000.00',
                  budgetApprovedAt: '2024-12-01T10:00:00.000Z'
                }
              }
            }
          }
        },
        400: { description: 'Bad request - approved budget is required and must be greater than 0' },
        404: { description: 'Event not found' },
        401: { description: 'Unauthorized' }
      }
    }
  },

  // ========== EVENTS MANAGEMENT - EXPENSE MANAGEMENT ==========
  '/events/{eventId}/expenses': {
    post: {
      summary: 'Record event expense',
      description: '**Required Role:** Event Organizer (Any authenticated user). Record an expense for an event. **Requires budget to be approved first.** Automatically creates accounting journal entries (Dr. Expense, Dr. VAT if taxable, Cr. AP). VAT is calculated automatically at 14.5% if expense is taxable. Links expense to budget items if provided.',
      tags: ['Events Management - Expense Management'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'eventId', required: true, schema: { type: 'string' }, description: 'Event ID', example: 'clx1234567890abcdef' }
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['description', 'amount', 'category', 'vendorId'],
              properties: {
                description: { type: 'string', example: 'Catering services for lunch', description: 'Expense description' },
                amount: { type: 'number', example: 5000, description: 'Expense amount (before VAT)' },
                category: { type: 'string', enum: ['VENUE', 'CATERING', 'DECORATIONS', 'ENTERTAINMENT', 'TRANSPORT', 'MARKETING', 'TECHNOLOGY', 'STAFFING', 'SECURITY', 'CLEANING', 'INSURANCE', 'UTILITIES', 'OTHER'], example: 'CATERING', description: 'Expense category' },
                vendorId: { type: 'string', example: 'vendor-id-123', description: 'Required: Vendor ID from the vendors list' },
                budgetItemId: { type: 'string', example: 'budget-item-id', description: 'Optional: Link expense to a specific budget item' },
                vendor: { type: 'string', example: 'Catering Co', description: 'Optional: Vendor name for display purposes' },
                paymentMethod: { type: 'string', enum: ['BANK', 'CASH'], example: 'BANK', description: 'Payment method used' },
                paymentDate: { type: 'string', format: 'date-time', example: '2024-12-15T12:00:00.000Z', description: 'Date of payment' },
                isTaxable: { type: 'boolean', default: true, example: true, description: 'Whether the expense is taxable (VAT will be calculated at 14.5%)' },
                isReimbursable: { type: 'boolean', default: true, example: true, description: 'Whether the expense is reimbursable' },
                receiptNumber: { type: 'string', example: 'REC-001', description: 'Receipt or invoice number' },
                currencyId: { type: 'string', example: 'currency-id', description: 'Currency ID (defaults to USD if not provided)' }
              }
            }
          }
        }
      },
      responses: {
        201: {
          description: 'Expense recorded successfully with journal entry created',
          content: {
            'application/json': {
              example: {
                success: true,
                message: 'Expense recorded successfully with journal entry created',
                data: {
                  id: 'expense-id',
                  amount: '5000.00',
                  status: 'APPROVED',
                  category: 'CATERING'
                }
              }
            }
          }
        },
        400: { description: 'Bad request - missing required fields or budget not approved' },
        404: { description: 'Event not found' },
        401: { description: 'Unauthorized' }
      }
    },
    get: {
      summary: 'Get event expenses',
      description: '**Required Role:** Any authenticated user. Retrieve all expenses for an event',
      tags: ['Events Management - Expense Management'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'eventId', required: true, schema: { type: 'string' }, description: 'Event ID', example: 'clx1234567890abcdef' }
      ],
      responses: {
        200: {
          description: 'Event expenses retrieved successfully',
          content: {
            'application/json': {
              example: {
                success: true,
                data: []
              }
            }
          }
        },
        401: { description: 'Unauthorized' }
      }
    }
  },

  // ========== EVENTS MANAGEMENT - FEEDBACK MANAGEMENT ==========
  '/events/{eventId}/feedback': {
    post: {
      summary: 'Submit event feedback (PUBLIC)',
      description: '**Required Role:** PUBLIC (No authentication required). Submit feedback for an event. Supports anonymous feedback. Multi-dimensional rating system for overall satisfaction, content quality, venue quality, food quality, and organization.',
      tags: ['Events Management - Feedback Management'],
      parameters: [
        { in: 'path', name: 'eventId', required: true, schema: { type: 'string' }, description: 'Event ID', example: 'clx1234567890abcdef' }
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['rating', 'overallSatisfaction'],
              properties: {
                rating: { type: 'integer', minimum: 1, maximum: 5, example: 5, description: 'Overall rating (1-5 scale)' },
                overallSatisfaction: { type: 'integer', minimum: 1, maximum: 5, example: 5, description: 'Overall satisfaction rating (1-5 scale)' },
                contentQuality: { type: 'integer', minimum: 1, maximum: 5, example: 4, description: 'Content quality rating (1-5 scale)' },
                venueQuality: { type: 'integer', minimum: 1, maximum: 5, example: 5, description: 'Venue quality rating (1-5 scale)' },
                foodQuality: { type: 'integer', minimum: 1, maximum: 5, example: 4, description: 'Food quality rating (1-5 scale)' },
                organization: { type: 'integer', minimum: 1, maximum: 5, example: 5, description: 'Organization rating (1-5 scale)' },
                positiveAspects: { type: 'string', example: 'Great speakers and networking opportunities', description: 'What went well' },
                areasForImprovement: { type: 'string', example: 'Better signage for breakout sessions', description: 'Areas that need improvement' },
                suggestions: { type: 'string', example: 'Consider longer breaks between sessions', description: 'Suggestions for future events' },
                wouldAttendAgain: { type: 'boolean', example: true, description: 'Would attend again' },
                wouldRecommend: { type: 'boolean', example: true, description: 'Would recommend to others' },
                additionalComments: { type: 'string', example: 'Overall excellent event!', description: 'Additional comments' },
                anonymous: { type: 'boolean', default: false, example: false, description: 'Submit feedback anonymously' },
                guestId: { type: 'string', example: 'guest-id', description: 'Optional: Guest ID if feedback is from a registered guest' }
              }
            }
          }
        }
      },
      responses: {
        201: {
          description: 'Feedback submitted successfully',
          content: {
            'application/json': {
              example: {
                success: true,
                message: 'Feedback submitted successfully',
                data: {
                  id: 'feedback-id',
                  rating: 5,
                  overallSatisfaction: 5
                }
              }
            }
          }
        },
        400: { description: 'Bad request - rating and overall satisfaction are required' },
        404: { description: 'Event not found' }
      }
    },
    get: {
      summary: 'Get event feedback',
      description: '**Required Role:** Any authenticated user. Retrieve all feedback for an event. Includes guest information unless feedback is anonymous.',
      tags: ['Events Management - Feedback Management'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'eventId', required: true, schema: { type: 'string' }, description: 'Event ID', example: 'clx1234567890abcdef' }
      ],
      responses: {
        200: {
          description: 'Event feedback retrieved successfully',
          content: {
            'application/json': {
              example: {
                success: true,
                data: []
              }
            }
          }
        },
        401: { description: 'Unauthorized' }
      }
    }
  },

  // ========== EVENTS MANAGEMENT - ANALYTICS & REPORTING ==========
  '/events/{eventId}/analytics': {
    get: {
      summary: 'Get event analytics',
      description: '**Required Role:** Any authenticated user. Retrieve comprehensive analytics for an event including RSVP rates, check-in rates, feedback rates, average ratings, budget utilization, and cost per attendee.',
      tags: ['Events Management - Analytics & Reporting'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'eventId', required: true, schema: { type: 'string' }, description: 'Event ID', example: 'clx1234567890abcdef' }
      ],
      responses: {
        200: {
          description: 'Event analytics retrieved successfully',
          content: {
            'application/json': {
              example: {
                success: true,
                data: {
                  eventId: 'event-id',
                  title: 'Annual Company Conference',
                  totalGuests: 500,
                  acceptedGuests: 450,
                  checkedInGuests: 420,
                  feedbackCount: 380,
                  rsvpRate: 90.0,
                  checkInRate: 93.3,
                  feedbackRate: 90.5,
                  averageRating: 4.2,
                  totalBudget: 48000,
                  totalExpenses: 45200,
                  budgetUtilization: 94.2,
                  budgetVariance: 2800,
                  costPerAttendee: 107.62
                }
              }
            }
          }
        },
        404: { description: 'Event not found' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/events/{eventId}/reports': {
    post: {
      summary: 'Generate event report',
      description: '**Required Role:** Event Organizer (Any authenticated user). Generate a comprehensive event report with metrics, analytics, and recommendations. Report includes RSVP statistics, check-in data, feedback analysis, budget vs actual expenses, and performance recommendations.',
      tags: ['Events Management - Analytics & Reporting'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'eventId', required: true, schema: { type: 'string' }, description: 'Event ID', example: 'clx1234567890abcdef' }
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['reportType'],
              properties: {
                reportType: { type: 'string', enum: ['FINANCIAL', 'ATTENDANCE', 'FEEDBACK', 'COMPREHENSIVE'], example: 'COMPREHENSIVE', description: 'Type of report to generate' }
              }
            }
          }
        }
      },
      responses: {
        201: {
          description: 'Event report generated successfully',
          content: {
            'application/json': {
              example: {
                success: true,
                message: 'Event report generated successfully',
                data: {
                  id: 'report-id',
                  reportType: 'COMPREHENSIVE',
                  totalAttendees: 420,
                  rsvpRate: 90.0,
                  checkInRate: 93.3,
                  averageRating: 4.2,
                  totalBudget: 48000,
                  totalExpenses: 45200,
                  budgetVariance: 2800,
                  costPerAttendee: 107.62,
                  recommendations: 'Event performed well across all metrics.'
                }
              }
            }
          }
        },
        400: { description: 'Bad request - report type is required' },
        404: { description: 'Event not found' },
        401: { description: 'Unauthorized' }
      }
    }
  }
};


