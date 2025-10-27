// @ts-nocheck
import { prisma } from "../utils/database";
import { Decimal } from "@prisma/client/runtime/library";

export interface CreateStakeholderRequest {
  stakeholderId: string;
  type: string;
  legalName: string;
  email: string;
  phone?: string;
  address?: string;
  country?: string;
  organizationName?: string;
  industry?: string;
  taxId?: string;
  registrationNumber?: string;
  totalCommitment?: number;
  currency?: string;
  investmentFocus?: string;
  riskTolerance?: string;
  relationshipManagerId?: string;
  relationshipStartDate?: string;
  contactFrequency?: string;
  preferredContactMethod?: string;
}

export interface UpdateStakeholderRequest {
  type?: string;
  legalName?: string;
  email?: string;
  phone?: string;
  address?: string;
  country?: string;
  organizationName?: string;
  industry?: string;
  taxId?: string;
  registrationNumber?: string;
  totalCommitment?: number;
  currency?: string;
  investmentFocus?: string;
  riskTolerance?: string;
  relationshipManagerId?: string;
  relationshipStartDate?: string;
  contactFrequency?: string;
  preferredContactMethod?: string;
  relationshipStatus?: string;
  status?: string;
  isActive?: boolean;
}

export interface CreateStakeholderOnboardingRequest {
  stakeholderId: string;
  stage: string;
  initiatedBy: string;
  assignedTo?: string;
  startDate?: string;
  expectedCompletionDate?: string;
  requiredDocuments?: any[];
  notes?: string;
  internalNotes?: string;
}

export interface UpdateStakeholderOnboardingRequest {
  stage?: string;
  status?: string;
  assignedTo?: string;
  startDate?: string;
  completedDate?: string;
  expectedCompletionDate?: string;
  requiredDocuments?: any[];
  submittedDocuments?: any[];
  kycStatus?: string;
  complianceStatus?: string;
  notes?: string;
  internalNotes?: string;
}

export interface CreateStakeholderEngagementRequest {
  stakeholderId: string;
  engagementType: string;
  subject: string;
  description?: string;
  duration?: number;
  satisfaction?: number;
  followUpRequired?: boolean;
  followUpDate?: string;
  initiatedBy: string;
  participants?: string[];
  outcome?: string;
  nextSteps?: string;
  actionItems?: any[];
}

export class StakeholderService {
  // ===== STAKEHOLDER CRUD OPERATIONS =====

  static async createStakeholder(request: CreateStakeholderRequest) {
    try {
      // Check if stakeholder ID already exists
      const existingStakeholder = await prisma.stakeholder.findUnique({
        where: { stakeholderId: request.stakeholderId }
      });

      if (existingStakeholder) {
        throw new Error(`Stakeholder with ID ${request.stakeholderId} already exists`);
      }

      // Check if email already exists
      const existingEmail = await prisma.stakeholder.findUnique({
        where: { email: request.email }
      });

      if (existingEmail) {
        throw new Error(`Stakeholder with email ${request.email} already exists`);
      }

      // Validate relationship manager if provided
      if (request.relationshipManagerId) {
        const manager = await prisma.user.findUnique({
          where: { id: request.relationshipManagerId }
        });

        if (!manager) {
          throw new Error(`Relationship manager with ID ${request.relationshipManagerId} not found`);
        }
      }

      const stakeholder = await prisma.stakeholder.create({
        data: {
          stakeholderId: request.stakeholderId,
          type: request.type,
          legalName: request.legalName,
          email: request.email,
          phone: request.phone,
          address: request.address,
          country: request.country,
          organizationName: request.organizationName,
          industry: request.industry,
          taxId: request.taxId,
          registrationNumber: request.registrationNumber,
          totalCommitment: request.totalCommitment ? new Decimal(request.totalCommitment) : null,
          currency: request.currency || "USD",
          investmentFocus: request.investmentFocus,
          riskTolerance: request.riskTolerance,
          relationshipManagerId: request.relationshipManagerId,
          relationshipStartDate: request.relationshipStartDate ? new Date(request.relationshipStartDate) : null,
          contactFrequency: request.contactFrequency || "MONTHLY",
          preferredContactMethod: request.preferredContactMethod || "EMAIL"
        },
        include: {
          relationshipManager: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          onboardingRecords: {
            orderBy: { createdAt: 'desc' },
            take: 1
          },
          engagementLogs: {
            orderBy: { engagementDate: 'desc' },
            take: 5
          }
        }
      });

      return stakeholder;
    } catch (error) {
      throw new Error(`Failed to create stakeholder: ${error.message}`);
    }
  }

  static async getAllStakeholders(page: number = 1, limit: number = 10, filters?: any) {
    try {
      const skip = (page - 1) * limit;
      
      const where: any = {};
      
      if (filters?.type) {
        where.type = filters.type;
      }
      
      if (filters?.status) {
        where.status = filters.status;
      }
      
      if (filters?.relationshipManagerId) {
        where.relationshipManagerId = filters.relationshipManagerId;
      }
      
      if (filters?.search) {
        where.OR = [
          { legalName: { contains: filters.search, mode: 'insensitive' } },
          { email: { contains: filters.search, mode: 'insensitive' } },
          { organizationName: { contains: filters.search, mode: 'insensitive' } }
        ];
      }

      const [stakeholders, total] = await Promise.all([
        prisma.stakeholder.findMany({
          where,
          skip,
          take: limit,
          include: {
            relationshipManager: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            },
            onboardingRecords: {
              orderBy: { createdAt: 'desc' },
              take: 1
            },
            engagementLogs: {
              orderBy: { engagementDate: 'desc' },
              take: 3
            }
          },
          orderBy: { createdAt: 'desc' }
        }),
        prisma.stakeholder.count({ where })
      ]);

      return {
        stakeholders,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      throw new Error(`Failed to get stakeholders: ${error.message}`);
    }
  }

  static async getStakeholderById(id: string) {
    try {
      const stakeholder = await prisma.stakeholder.findUnique({
        where: { id },
        include: {
          relationshipManager: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          onboardingRecords: {
            orderBy: { createdAt: 'desc' }
          },
          engagementLogs: {
            orderBy: { engagementDate: 'desc' }
          },
          investmentCommitments: {
            include: {
              fund: {
                select: {
                  id: true,
                  name: true,
                  description: true
                }
              }
            }
          }
        }
      });

      if (!stakeholder) {
        throw new Error(`Stakeholder with ID ${id} not found`);
      }

      return stakeholder;
    } catch (error) {
      throw new Error(`Failed to get stakeholder: ${error.message}`);
    }
  }

  static async getStakeholderByStakeholderId(stakeholderId: string) {
    try {
      const stakeholder = await prisma.stakeholder.findUnique({
        where: { stakeholderId },
        include: {
          relationshipManager: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          onboardingRecords: {
            orderBy: { createdAt: 'desc' }
          },
          engagementLogs: {
            orderBy: { engagementDate: 'desc' }
          },
          investmentCommitments: {
            include: {
              fund: {
                select: {
                  id: true,
                  name: true,
                  description: true
                }
              }
            }
          }
        }
      });

      if (!stakeholder) {
        throw new Error(`Stakeholder with ID ${stakeholderId} not found`);
      }

      return stakeholder;
    } catch (error) {
      throw new Error(`Failed to get stakeholder: ${error.message}`);
    }
  }

  static async updateStakeholder(id: string, request: UpdateStakeholderRequest) {
    try {
      const existingStakeholder = await prisma.stakeholder.findUnique({
        where: { id }
      });

      if (!existingStakeholder) {
        throw new Error(`Stakeholder with ID ${id} not found`);
      }

      // Check if email is being updated and if it already exists
      if (request.email && request.email !== existingStakeholder.email) {
        const existingEmail = await prisma.stakeholder.findUnique({
          where: { email: request.email }
        });

        if (existingEmail) {
          throw new Error(`Stakeholder with email ${request.email} already exists`);
        }
      }

      // Validate relationship manager if provided
      if (request.relationshipManagerId) {
        const manager = await prisma.user.findUnique({
          where: { id: request.relationshipManagerId }
        });

        if (!manager) {
          throw new Error(`Relationship manager with ID ${request.relationshipManagerId} not found`);
        }
      }

      const updateData: any = { ...request };
      
      if (request.totalCommitment !== undefined) {
        updateData.totalCommitment = request.totalCommitment ? new Decimal(request.totalCommitment) : null;
      }
      
      if (request.relationshipStartDate) {
        updateData.relationshipStartDate = new Date(request.relationshipStartDate);
      }

      const stakeholder = await prisma.stakeholder.update({
        where: { id },
        data: updateData,
        include: {
          relationshipManager: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          onboardingRecords: {
            orderBy: { createdAt: 'desc' },
            take: 1
          },
          engagementLogs: {
            orderBy: { engagementDate: 'desc' },
            take: 5
          }
        }
      });

      return stakeholder;
    } catch (error) {
      throw new Error(`Failed to update stakeholder: ${error.message}`);
    }
  }

  static async deleteStakeholder(id: string) {
    try {
      const existingStakeholder = await prisma.stakeholder.findUnique({
        where: { id }
      });

      if (!existingStakeholder) {
        throw new Error(`Stakeholder with ID ${id} not found`);
      }

      await prisma.stakeholder.delete({
        where: { id }
      });

      return { message: "Stakeholder deleted successfully" };
    } catch (error) {
      throw new Error(`Failed to delete stakeholder: ${error.message}`);
    }
  }

  // ===== STAKEHOLDER ONBOARDING OPERATIONS =====

  static async createStakeholderOnboarding(request: CreateStakeholderOnboardingRequest) {
    try {
      // Validate stakeholder exists
      const stakeholder = await prisma.stakeholder.findUnique({
        where: { id: request.stakeholderId }
      });

      if (!stakeholder) {
        throw new Error(`Stakeholder with ID ${request.stakeholderId} not found`);
      }

      // Validate initiator exists
      const initiator = await prisma.user.findUnique({
        where: { id: request.initiatedBy }
      });

      if (!initiator) {
        throw new Error(`User with ID ${request.initiatedBy} not found`);
      }

      // Validate assignee if provided
      if (request.assignedTo) {
        const assignee = await prisma.user.findUnique({
          where: { id: request.assignedTo }
        });

        if (!assignee) {
          throw new Error(`User with ID ${request.assignedTo} not found`);
        }
      }

      const onboarding = await prisma.stakeholderOnboarding.create({
        data: {
          stakeholderId: request.stakeholderId,
          stage: request.stage,
          initiatedBy: request.initiatedBy,
          assignedTo: request.assignedTo,
          startDate: request.startDate ? new Date(request.startDate) : null,
          expectedCompletionDate: request.expectedCompletionDate ? new Date(request.expectedCompletionDate) : null,
          requiredDocuments: request.requiredDocuments || [],
          notes: request.notes,
          internalNotes: request.internalNotes
        },
        include: {
          stakeholder: {
            select: {
              id: true,
              stakeholderId: true,
              legalName: true,
              email: true
            }
          },
          initiator: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          assignee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      return onboarding;
    } catch (error) {
      throw new Error(`Failed to create stakeholder onboarding: ${error.message}`);
    }
  }

  static async updateStakeholderOnboarding(id: string, request: UpdateStakeholderOnboardingRequest) {
    try {
      const existingOnboarding = await prisma.stakeholderOnboarding.findUnique({
        where: { id }
      });

      if (!existingOnboarding) {
        throw new Error(`Stakeholder onboarding with ID ${id} not found`);
      }

      // Validate assignee if provided
      if (request.assignedTo) {
        const assignee = await prisma.user.findUnique({
          where: { id: request.assignedTo }
        });

        if (!assignee) {
          throw new Error(`User with ID ${request.assignedTo} not found`);
        }
      }

      const updateData: any = { ...request };
      
      if (request.startDate) {
        updateData.startDate = new Date(request.startDate);
      }
      
      if (request.completedDate) {
        updateData.completedDate = new Date(request.completedDate);
      }
      
      if (request.expectedCompletionDate) {
        updateData.expectedCompletionDate = new Date(request.expectedCompletionDate);
      }

      const onboarding = await prisma.stakeholderOnboarding.update({
        where: { id },
        data: updateData,
        include: {
          stakeholder: {
            select: {
              id: true,
              stakeholderId: true,
              legalName: true,
              email: true
            }
          },
          initiator: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          assignee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      return onboarding;
    } catch (error) {
      throw new Error(`Failed to update stakeholder onboarding: ${error.message}`);
    }
  }

  // ===== STAKEHOLDER ENGAGEMENT OPERATIONS =====

  static async createStakeholderEngagement(request: CreateStakeholderEngagementRequest) {
    try {
      // Validate stakeholder exists
      const stakeholder = await prisma.stakeholder.findUnique({
        where: { id: request.stakeholderId }
      });

      if (!stakeholder) {
        throw new Error(`Stakeholder with ID ${request.stakeholderId} not found`);
      }

      // Validate initiator exists
      const initiator = await prisma.user.findUnique({
        where: { id: request.initiatedBy }
      });

      if (!initiator) {
        throw new Error(`User with ID ${request.initiatedBy} not found`);
      }

      const engagement = await prisma.stakeholderEngagement.create({
        data: {
          stakeholderId: request.stakeholderId,
          engagementType: request.engagementType,
          subject: request.subject,
          description: request.description,
          duration: request.duration,
          satisfaction: request.satisfaction,
          followUpRequired: request.followUpRequired || false,
          followUpDate: request.followUpDate ? new Date(request.followUpDate) : null,
          initiatedBy: request.initiatedBy,
          participants: request.participants || [],
          outcome: request.outcome,
          nextSteps: request.nextSteps,
          actionItems: request.actionItems || []
        },
        include: {
          stakeholder: {
            select: {
              id: true,
              stakeholderId: true,
              legalName: true,
              email: true
            }
          },
          initiator: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      // Update stakeholder's last contact date
      await prisma.stakeholder.update({
        where: { id: request.stakeholderId },
        data: { lastContactDate: new Date() }
      });

      return engagement;
    } catch (error) {
      throw new Error(`Failed to create stakeholder engagement: ${error.message}`);
    }
  }

  // ===== STAKEHOLDER ANALYTICS =====

  static async getStakeholderAnalytics() {
    try {
      const [
        totalStakeholders,
        stakeholdersByType,
        stakeholdersByStatus,
        onboardingMetrics,
        engagementMetrics
      ] = await Promise.all([
        prisma.stakeholder.count(),
        
        prisma.stakeholder.groupBy({
          by: ['type'],
          _count: { type: true }
        }),
        
        prisma.stakeholder.groupBy({
          by: ['status'],
          _count: { status: true }
        }),
        
        prisma.stakeholderOnboarding.groupBy({
          by: ['stage'],
          _count: { stage: true }
        }),
        
        prisma.stakeholderEngagement.groupBy({
          by: ['engagementType'],
          _count: { engagementType: true },
          _avg: { satisfaction: true }
        })
      ]);

      // Calculate retention rate (simplified)
      const activeStakeholders = await prisma.stakeholder.count({
        where: { status: 'ACTIVE' }
      });

      const retentionRate = totalStakeholders > 0 ? (activeStakeholders / totalStakeholders) * 100 : 0;

      return {
        totalStakeholders,
        activeStakeholders,
        retentionRate: Number(retentionRate.toFixed(2)),
        stakeholdersByType: stakeholdersByType.map(item => ({
          type: item.type,
          count: item._count.type
        })),
        stakeholdersByStatus: stakeholdersByStatus.map(item => ({
          status: item.status,
          count: item._count.status
        })),
        onboardingMetrics: onboardingMetrics.map(item => ({
          stage: item.stage,
          count: item._count.stage
        })),
        engagementMetrics: engagementMetrics.map(item => ({
          engagementType: item.engagementType,
          count: item._count.engagementType,
          averageSatisfaction: item._avg.satisfaction ? Number(item._avg.satisfaction.toFixed(2)) : null
        }))
      };
    } catch (error) {
      throw new Error(`Failed to get stakeholder analytics: ${error.message}`);
    }
  }
}
