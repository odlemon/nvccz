// @ts-nocheck
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { GoogleCalendarService } from './GoogleCalendarService';
import { EmailNotificationService } from './EmailNotificationService';
import { JournalEntryService, CreateExpenseJournalEntryParams } from './JournalEntryService';
import VATService from './VATService';
import crypto from 'crypto';

const prisma = new PrismaClient();
const googleCalendarService = new GoogleCalendarService();

export interface EventCreationData {
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  location?: string;
  eventType?: string;
  maxAttendees?: number;
  isPublic?: boolean;
  requiresRSVP?: boolean;
  rsvpDeadline?: string;
  estimatedBudget?: number;
  checkInRequired?: boolean;
  feedbackRequired?: boolean;
  authorId: string;
}

export interface GuestData {
  email: string;
  name: string;
  phone?: string;
  company?: string;
  title?: string;
  dietaryRequirements?: string;
  accessibilityNeeds?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
}

export interface BudgetItemData {
  category: string;
  itemName: string;
  description?: string;
  estimatedCost: number;
  quantity?: number;
  unit?: string;
  vendor?: string;
  vendorContact?: string;
  notes?: string;
}

export class EventService {
  /**
   * Create a new event with enhanced features
   */
  static async createEvent(data: EventCreationData): Promise<any> {
    try {
      // Create the event
      const event = await prisma.event.create({
        data: {
          title: data.title,
          description: data.description,
          startDate: new Date(data.startDate),
          endDate: new Date(data.endDate),
          location: data.location,
          authorId: data.authorId,
          eventType: data.eventType,
          maxAttendees: data.maxAttendees,
          isPublic: data.isPublic || false,
          requiresRSVP: data.requiresRSVP || true,
          rsvpDeadline: data.rsvpDeadline ? new Date(data.rsvpDeadline) : null,
          estimatedBudget: data.estimatedBudget ? new Decimal(data.estimatedBudget) : null,
          checkInRequired: data.checkInRequired || false,
          feedbackRequired: data.feedbackRequired || false,
          status: 'PLANNING',
          budgetStatus: 'DRAFT',
        },
        include: {
          author: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });

      // Sync with Google Calendar if enabled
      if (process.env.GOOGLE_CALENDAR_ENABLED === 'true') {
        try {
          const googleData = await googleCalendarService.syncEventWithGoogle(event);
          
          await prisma.event.update({
            where: { id: event.id },
            data: {
              googleCalendarEventId: googleData.googleEventId,
              googleCalendarLink: googleData.googleCalendarLink,
            },
          });

          event.googleCalendarEventId = googleData.googleEventId;
          event.googleCalendarLink = googleData.googleCalendarLink;
        } catch (error) {
          console.error('Failed to sync with Google Calendar:', error);
          // Continue without Google Calendar sync
        }
      }

      return event;
    } catch (error) {
      console.error('Error creating event:', error);
      throw error;
    }
  }

  /**
   * Add guests to an event
   */
  static async addGuests(eventId: string, guests: GuestData[]): Promise<any> {
    try {
      const event = await prisma.event.findUnique({
        where: { id: eventId },
      });

      if (!event) {
        throw new Error('Event not found');
      }

      const guestRecords = await Promise.all(
        guests.map(async (guest) => {
          const invitationToken = crypto.randomBytes(32).toString('hex');
          
          return prisma.eventGuest.create({
            data: {
              eventId,
              email: guest.email,
              name: guest.name,
              phone: guest.phone,
              company: guest.company,
              title: guest.title,
              invitationToken,
              dietaryRequirements: guest.dietaryRequirements,
              accessibilityNeeds: guest.accessibilityNeeds,
              emergencyContact: guest.emergencyContact,
              emergencyPhone: guest.emergencyPhone,
            },
          });
        })
      );

      // Send invitation emails
      for (const guest of guestRecords) {
        try {
          await EmailNotificationService.sendEventInvitationEmail({
            guestName: guest.name,
            guestEmail: guest.email,
            eventTitle: event.title,
            eventDate: event.startDate,
            eventLocation: event.location,
            invitationToken: guest.invitationToken,
            rsvpDeadline: event.rsvpDeadline,
          });
        } catch (emailError) {
          console.error(`Failed to send invitation to ${guest.email}:`, emailError);
        }
      }

      return guestRecords;
    } catch (error) {
      console.error('Error adding guests:', error);
      throw error;
    }
  }

  /**
   * Handle RSVP response
   */
  static async handleRSVP(invitationToken: string, rsvpStatus: 'ACCEPTED' | 'DECLINED' | 'MAYBE', notes?: string): Promise<any> {
    try {
      const guest = await prisma.eventGuest.findUnique({
        where: { invitationToken },
        include: {
          event: {
            include: {
              author: {
                select: {
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
          },
        },
      });

      if (!guest) {
        throw new Error('Invalid invitation token');
      }

      // Check if RSVP deadline has passed
      if (guest.event.rsvpDeadline && new Date() > guest.event.rsvpDeadline) {
        throw new Error('RSVP deadline has passed');
      }

      // Update guest RSVP status
      const updatedGuest = await prisma.eventGuest.update({
        where: { id: guest.id },
        data: {
          rsvpStatus,
          rsvpRespondedAt: new Date(),
          rsvpNotes: notes,
        },
        include: {
          event: true,
        },
      });

      // Notify event organizer
      try {
        await EmailNotificationService.sendRSVPNotificationEmail({
          organizerName: `${guest.event.author.firstName} ${guest.event.author.lastName}`,
          organizerEmail: guest.event.author.email,
          guestName: guest.name,
          eventTitle: guest.event.title,
          rsvpStatus,
          rsvpNotes: notes,
        });
      } catch (emailError) {
        console.error('Failed to send RSVP notification:', emailError);
      }

      return updatedGuest;
    } catch (error) {
      console.error('Error handling RSVP:', error);
      throw error;
    }
  }

  /**
   * Add budget items to an event
   */
  static async addBudgetItems(eventId: string, budgetItems: BudgetItemData[]): Promise<any> {
    try {
      const budgetItemRecords = await Promise.all(
        budgetItems.map((item) =>
          prisma.eventBudgetItem.create({
            data: {
              eventId,
              category: item.category,
              itemName: item.itemName,
              description: item.description,
              estimatedCost: new Decimal(item.estimatedCost),
              quantity: item.quantity || 1,
              unit: item.unit,
              vendor: item.vendor,
              vendorContact: item.vendorContact,
              notes: item.notes,
            },
          })
        )
      );

      // Update event budget status
      await prisma.event.update({
        where: { id: eventId },
        data: {
          budgetStatus: 'SUBMITTED',
          status: 'BUDGET_PENDING',
        },
      });

      return budgetItemRecords;
    } catch (error) {
      console.error('Error adding budget items:', error);
      throw error;
    }
  }

  /**
   * Approve event budget
   */
  static async approveBudget(eventId: string, approverId: string, approvedBudget: number, notes?: string): Promise<any> {
    try {
      const event = await prisma.event.update({
        where: { id: eventId },
        data: {
          budgetStatus: 'APPROVED',
          status: 'BUDGET_APPROVED',
          approvedBudget: new Decimal(approvedBudget),
          budgetApprovedBy: approverId,
          budgetApprovedAt: new Date(),
        },
        include: {
          author: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });

      // Create journal entry for budget allocation
      try {
        await this.createBudgetAllocationJournalEntry(eventId, approvedBudget, approverId);
        console.log(`Budget allocation journal entry created for event: ${eventId}`);
      } catch (journalError) {
        console.error('Error creating budget allocation journal entry:', journalError);
        // Don't fail the budget approval if journal entry fails
      }

      // Notify event organizer
      try {
        await EmailNotificationService.sendBudgetApprovalEmail({
          organizerName: `${event.author.firstName} ${event.author.lastName}`,
          organizerEmail: event.author.email,
          eventTitle: event.title,
          approvedBudget,
          notes,
        });
      } catch (emailError) {
        console.error('Failed to send budget approval notification:', emailError);
      }

      return event;
    } catch (error) {
      console.error('Error approving budget:', error);
      throw error;
    }
  }

  /**
   * Record event expense with journal entry creation
   */
  static async recordExpense(eventId: string, expenseData: any, createdById: string): Promise<any> {
    try {
      // Get event details for context
      const event = await prisma.event.findUnique({
        where: { id: eventId },
        include: { author: true }
      });

      if (!event) {
        throw new Error('Event not found');
      }

      // Calculate VAT if taxable
      const isTaxable = expenseData.isTaxable || false;
      const vatAmount = VATService.isVATEligible(Number(expenseData.amount), isTaxable)
        ? VATService.calculateVAT(Number(expenseData.amount))
        : 0;
      const totalAmount = Number(expenseData.amount) + vatAmount;

      // Create the event expense record
      const expense = await prisma.eventExpense.create({
        data: {
          eventId,
          budgetItemId: expenseData.budgetItemId,
          description: expenseData.description,
          amount: new Decimal(expenseData.amount),
          category: expenseData.category,
          vendor: expenseData.vendor,
          receiptPath: expenseData.receiptPath,
          paymentMethod: expenseData.paymentMethod,
          paymentDate: expenseData.paymentDate ? new Date(expenseData.paymentDate) : null,
          isReimbursable: expenseData.isReimbursable || true,
          status: 'PENDING', // Will be updated after journal entry creation
        },
      });

      // Create journal entry for accounting integration
      try {
        // Map event expense category to expense category ID
        const expenseCategoryId = await this.getExpenseCategoryId(expenseData.category);
        
        // Create vendor if not exists (for journal entry)
        const vendorId = await this.getOrCreateVendor(expenseData.vendor, createdById);
        
        // Get currency ID (default to USD if not specified)
        const currencyId = expenseData.currencyId || await this.getDefaultCurrencyId();

        const journalEntryParams: CreateExpenseJournalEntryParams = {
          vendorId,
          categoryId: expenseCategoryId,
          amount: Number(expenseData.amount),
          vatAmount,
          totalAmount,
          currencyId,
          transactionDate: expenseData.paymentDate ? new Date(expenseData.paymentDate) : new Date(),
          description: `Event Expense: ${expenseData.description} (Event: ${event.title})`,
          receiptNumber: expenseData.receiptNumber,
          isTaxable,
          paymentMethod: expenseData.paymentMethod || 'BANK',
          createdById
        };

        const journalEntryResult = await JournalEntryService.createExpenseJournalEntry(journalEntryParams);

        // Update expense with journal entry reference and status
        const updatedExpense = await prisma.eventExpense.update({
          where: { id: expense.id },
          data: {
            status: 'APPROVED', // Mark as approved since journal entry was created
          },
        });

        console.log(`Journal entry created for event expense: ${journalEntryResult.journalEntry.referenceNumber}`);
        
        return updatedExpense;
      } catch (journalError) {
        console.error('Error creating journal entry for event expense:', journalError);
        // Update expense status to indicate journal entry failed
        await prisma.eventExpense.update({
          where: { id: expense.id },
          data: { status: 'REJECTED' }
        });
        throw new Error(`Expense recorded but journal entry failed: ${journalError.message}`);
      }
    } catch (error) {
      console.error('Error recording expense:', error);
      throw error;
    }
  }

  /**
   * Check in guest to event
   */
  static async checkInGuest(eventId: string, guestId: string, checkedInBy: string, notes?: string): Promise<any> {
    try {
      const checkIn = await prisma.eventCheckIn.create({
        data: {
          eventId,
          guestId,
          checkedInBy,
          notes,
        },
      });

      // Update guest check-in status
      await prisma.eventGuest.update({
        where: { id: guestId },
        data: {
          checkedIn: true,
          checkedInAt: new Date(),
          checkedInBy,
        },
      });

      return checkIn;
    } catch (error) {
      console.error('Error checking in guest:', error);
      throw error;
    }
  }

  /**
   * Submit event feedback
   */
  static async submitFeedback(eventId: string, feedbackData: any, guestId?: string): Promise<any> {
    try {
      const feedback = await prisma.eventFeedback.create({
        data: {
          eventId,
          guestId,
          rating: feedbackData.rating,
          overallSatisfaction: feedbackData.overallSatisfaction,
          contentQuality: feedbackData.contentQuality,
          venueQuality: feedbackData.venueQuality,
          foodQuality: feedbackData.foodQuality,
          organization: feedbackData.organization,
          positiveAspects: feedbackData.positiveAspects,
          areasForImprovement: feedbackData.areasForImprovement,
          suggestions: feedbackData.suggestions,
          wouldAttendAgain: feedbackData.wouldAttendAgain,
          wouldRecommend: feedbackData.wouldRecommend,
          additionalComments: feedbackData.additionalComments,
          anonymous: feedbackData.anonymous || false,
        },
      });

      return feedback;
    } catch (error) {
      console.error('Error submitting feedback:', error);
      throw error;
    }
  }

  /**
   * Generate event report
   */
  static async generateEventReport(eventId: string, reportType: string, generatedBy: string): Promise<any> {
    try {
      const event = await prisma.event.findUnique({
        where: { id: eventId },
        include: {
          guests: true,
          feedback: true,
          expenses: true,
          budgetItems: true,
          checkIns: true,
        },
      });

      if (!event) {
        throw new Error('Event not found');
      }

      // Calculate metrics
      const totalAttendees = event.checkIns.length;
      const totalGuests = event.guests.length;
      const rsvpRate = totalGuests > 0 ? (event.guests.filter(g => g.rsvpStatus === 'ACCEPTED').length / totalGuests) * 100 : 0;
      const checkInRate = totalGuests > 0 ? (totalAttendees / totalGuests) * 100 : 0;
      
      const averageRating = event.feedback.length > 0 
        ? event.feedback.reduce((sum, f) => sum + f.overallSatisfaction, 0) / event.feedback.length 
        : 0;

      const totalBudget = event.approvedBudget || event.estimatedBudget || 0;
      const totalExpenses = event.expenses.reduce((sum, e) => sum + Number(e.amount), 0);
      const budgetVariance = Number(totalBudget) - totalExpenses;
      const costPerAttendee = totalAttendees > 0 ? totalExpenses / totalAttendees : 0;

      const report = await prisma.eventReport.create({
        data: {
          eventId,
          reportType,
          generatedBy,
          totalAttendees,
          rsvpRate: new Decimal(rsvpRate),
          checkInRate: new Decimal(checkInRate),
          averageRating: new Decimal(averageRating),
          totalBudget: new Decimal(totalBudget),
          totalExpenses: new Decimal(totalExpenses),
          budgetVariance: new Decimal(budgetVariance),
          costPerAttendee: new Decimal(costPerAttendee),
          summary: `Event report for ${event.title}`,
          keyMetrics: {
            totalGuests,
            totalAttendees,
            rsvpRate,
            checkInRate,
            averageRating,
            totalBudget,
            totalExpenses,
            budgetVariance,
            costPerAttendee,
          },
          recommendations: this.generateRecommendations(event, {
            rsvpRate,
            checkInRate,
            averageRating,
            budgetVariance,
          }),
        },
      });

      return report;
    } catch (error) {
      console.error('Error generating event report:', error);
      throw error;
    }
  }

  /**
   * Get expense category ID by category name
   */
  private static async getExpenseCategoryId(categoryName: string): Promise<string> {
    try {
      // Map event categories to expense categories
      const categoryMapping: { [key: string]: string } = {
        'VENUE': 'Venue & Facilities',
        'CATERING': 'Food & Beverage',
        'DECORATIONS': 'Marketing & Promotions',
        'ENTERTAINMENT': 'Entertainment',
        'TRANSPORT': 'Travel & Transportation',
        'MARKETING': 'Marketing & Promotions',
        'TECHNOLOGY': 'Technology & Equipment',
        'STAFFING': 'Professional Services',
        'SECURITY': 'Security & Safety',
        'CLEANING': 'Maintenance & Cleaning',
        'INSURANCE': 'Insurance',
        'UTILITIES': 'Utilities',
        'OTHER': 'Other Expenses'
      };

      const mappedCategory = categoryMapping[categoryName] || 'Other Expenses';

      // Find or create expense category
      let category = await prisma.expenseCategory.findFirst({
        where: { name: mappedCategory }
      });

      if (!category) {
        category = await prisma.expenseCategory.create({
          data: {
            name: mappedCategory,
            description: `Event expense category for ${categoryName}`,
            isActive: true,
            createdById: 'system' // You might want to pass a real user ID
          }
        });
      }

      return category.id;
    } catch (error) {
      console.error('Error getting expense category ID:', error);
      throw error;
    }
  }

  /**
   * Get or create vendor for journal entry
   */
  private static async getOrCreateVendor(vendorName: string, createdById: string): Promise<string> {
    try {
      if (!vendorName) {
        // Create a default vendor for event expenses
        vendorName = 'Event Vendor';
      }

      // Find existing vendor
      let vendor = await prisma.vendor.findFirst({
        where: { name: vendorName }
      });

      if (!vendor) {
        vendor = await prisma.vendor.create({
          data: {
            name: vendorName,
            contactPerson: 'Event Contact',
            email: 'events@company.com',
            phone: 'N/A',
            address: 'Event Address',
            isActive: true,
            createdById
          }
        });
      }

      return vendor.id;
    } catch (error) {
      console.error('Error getting or creating vendor:', error);
      throw error;
    }
  }

  /**
   * Get default currency ID
   */
  private static async getDefaultCurrencyId(): Promise<string> {
    try {
      // Find USD currency or create it
      let currency = await prisma.currency.findFirst({
        where: { code: 'USD' }
      });

      if (!currency) {
        currency = await prisma.currency.create({
          data: {
            code: 'USD',
            name: 'US Dollar',
            symbol: '$',
            isActive: true
          }
        });
      }

      return currency.id;
    } catch (error) {
      console.error('Error getting default currency ID:', error);
      throw error;
    }
  }

  /**
   * Create journal entry for budget allocation
   */
  private static async createBudgetAllocationJournalEntry(eventId: string, approvedBudget: number, approverId: string): Promise<void> {
    try {
      // Get event details
      const event = await prisma.event.findUnique({
        where: { id: eventId },
        include: { author: true }
      });

      if (!event) {
        throw new Error('Event not found');
      }

      // Get currency ID
      const currencyId = await this.getDefaultCurrencyId();

      // Create journal entry for budget allocation
      const journalEntry = await prisma.journalEntry.create({
        data: {
          transactionDate: new Date(),
          referenceNumber: `BUDGET-${eventId}-${Date.now()}`,
          description: `Event Budget Allocation: ${event.title}`,
          totalAmount: new Decimal(approvedBudget),
          currencyId,
          status: 'POSTED',
          createdById: approverId
        }
      });

      // Create journal entry lines for budget allocation
      // 1. Debit Event Budget Account (Asset)
      const eventBudgetAccount = await this.getOrCreateEventBudgetAccount();
      await prisma.journalEntryLine.create({
        data: {
          journalEntryId: journalEntry.id,
          chartOfAccountId: eventBudgetAccount,
          debitAmount: new Decimal(approvedBudget),
          creditAmount: new Decimal(0),
          description: `Event Budget Allocation: ${event.title}`,
          vatAmount: new Decimal(0)
        }
      });

      // 2. Credit Cash/Bank Account (Asset)
      const cashAccount = await this.getOrCreateCashAccount();
      await prisma.journalEntryLine.create({
        data: {
          journalEntryId: journalEntry.id,
          chartOfAccountId: cashAccount,
          debitAmount: new Decimal(0),
          creditAmount: new Decimal(approvedBudget),
          description: `Budget allocation from cash/bank for event: ${event.title}`,
          vatAmount: new Decimal(0)
        }
      });

      console.log(`Budget allocation journal entry created: ${journalEntry.referenceNumber}`);
    } catch (error) {
      console.error('Error creating budget allocation journal entry:', error);
      throw error;
    }
  }

  /**
   * Get or create Event Budget Account
   */
  private static async getOrCreateEventBudgetAccount(): Promise<string> {
    try {
      let account = await prisma.chartOfAccounts.findFirst({
        where: { 
          name: 'Event Budget Allocation',
          accountType: 'ASSET'
        }
      });

      if (!account) {
        account = await prisma.chartOfAccounts.create({
          data: {
            code: 'EBA-001',
            name: 'Event Budget Allocation',
            accountType: 'ASSET',
            description: 'Allocated budget for events',
            isActive: true,
            createdById: 'system'
          }
        });
      }

      return account.id;
    } catch (error) {
      console.error('Error getting or creating event budget account:', error);
      throw error;
    }
  }

  /**
   * Get or create Cash Account
   */
  private static async getOrCreateCashAccount(): Promise<string> {
    try {
      let account = await prisma.chartOfAccounts.findFirst({
        where: { 
          name: 'Cash',
          accountType: 'ASSET'
        }
      });

      if (!account) {
        account = await prisma.chartOfAccounts.create({
          data: {
            code: 'CASH-001',
            name: 'Cash',
            accountType: 'ASSET',
            description: 'Cash on hand',
            isActive: true,
            createdById: 'system'
          }
        });
      }

      return account.id;
    } catch (error) {
      console.error('Error getting or creating cash account:', error);
      throw error;
    }
  }

  /**
   * Generate recommendations based on event metrics
   */
  private static generateRecommendations(event: any, metrics: any): string {
    const recommendations = [];

    if (metrics.rsvpRate < 70) {
      recommendations.push('Consider sending reminder emails to improve RSVP response rate');
    }

    if (metrics.checkInRate < 80) {
      recommendations.push('Implement better check-in process or send event reminders');
    }

    if (metrics.averageRating < 3.5) {
      recommendations.push('Review feedback for areas of improvement in content, venue, or organization');
    }

    if (metrics.budgetVariance < 0) {
      recommendations.push('Review budget planning to avoid overspending in future events');
    }

    if (metrics.costPerAttendee > Number(event.approvedBudget) / event.maxAttendees) {
      recommendations.push('Consider optimizing costs per attendee for better value');
    }

    return recommendations.join('. ') || 'Event performed well across all metrics.';
  }

  /**
   * Get event analytics
   */
  static async getEventAnalytics(eventId: string): Promise<any> {
    try {
      const event = await prisma.event.findUnique({
        where: { id: eventId },
        include: {
          guests: true,
          feedback: true,
          expenses: true,
          budgetItems: true,
          checkIns: true,
        },
      });

      if (!event) {
        throw new Error('Event not found');
      }

      const totalGuests = event.guests.length;
      const acceptedGuests = event.guests.filter(g => g.rsvpStatus === 'ACCEPTED').length;
      const checkedInGuests = event.checkIns.length;
      const feedbackCount = event.feedback.length;

      const rsvpRate = totalGuests > 0 ? (acceptedGuests / totalGuests) * 100 : 0;
      const checkInRate = totalGuests > 0 ? (checkedInGuests / totalGuests) * 100 : 0;
      const feedbackRate = totalGuests > 0 ? (feedbackCount / totalGuests) * 100 : 0;

      const averageRating = event.feedback.length > 0 
        ? event.feedback.reduce((sum, f) => sum + f.overallSatisfaction, 0) / event.feedback.length 
        : 0;

      const totalBudget = Number(event.approvedBudget || event.estimatedBudget || 0);
      const totalExpenses = event.expenses.reduce((sum, e) => sum + Number(e.amount), 0);
      const budgetUtilization = totalBudget > 0 ? (totalExpenses / totalBudget) * 100 : 0;

      return {
        eventId,
        title: event.title,
        totalGuests,
        acceptedGuests,
        checkedInGuests,
        feedbackCount,
        rsvpRate,
        checkInRate,
        feedbackRate,
        averageRating,
        totalBudget,
        totalExpenses,
        budgetUtilization,
        budgetVariance: totalBudget - totalExpenses,
        costPerAttendee: checkedInGuests > 0 ? totalExpenses / checkedInGuests : 0,
      };
    } catch (error) {
      console.error('Error getting event analytics:', error);
      throw error;
    }
  }
}
