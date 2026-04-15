// @ts-nocheck
import { randomUUID } from "crypto";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../utils/database";

export interface CreateClientRequest {
  /** Optional. When omitted, a unique value is generated (`inv-{uuid}`). */
  investorId?: string;
  type: string; // "individual" or "institutional"
  legalName: string;
  email: string;
  country: string;
  phone?: string;
  address?: string;
  taxId?: string;
  status?: string;
  // Investment commitment fields
  fundId?: string;
  amount?: number;
  currency?: string;
  effectiveDate?: Date;
  eSign?: any;
  notes?: string;
}

export interface UpdateClientRequest {
  investorId?: string;
  type?: string;
  legalName?: string;
  email?: string;
  country?: string;
  phone?: string;
  address?: string;
  taxId?: string;
  status?: string;
  // Investment commitment fields
  fundId?: string;
  amount?: number;
  currency?: string;
  effectiveDate?: Date;
  eSign?: any;
  notes?: string;
}


export class ClientService {
  // Create a new client with optional investment commitment
  static async createClient(request: CreateClientRequest) {
    try {
      const providedInvestorId =
        request.investorId != null && String(request.investorId).trim() !== ""
          ? String(request.investorId).trim()
          : null;
      const investorId = providedInvestorId ?? `inv-${randomUUID()}`;

      if (providedInvestorId) {
        const existingClient = await prisma.client.findUnique({
          where: { investorId: providedInvestorId },
        });
        if (existingClient) {
          throw new Error("Client with this investor ID already exists");
        }
      }

      // Check if email already exists
      const existingEmail = await prisma.client.findUnique({
        where: { email: request.email }
      });

      if (existingEmail) {
        throw new Error("Client with this email already exists");
      }

      // If fundId is provided, validate fund and commitment details
      if (request.fundId) {
        if (!request.amount || !request.effectiveDate) {
          throw new Error("Amount and effective date are required when creating investment commitment");
        }

        // Check if fund exists
        const fund = await prisma.fund.findUnique({
          where: { id: request.fundId }
        });

        if (!fund) {
          throw new Error("Fund not found");
        }

        // Check if fund is open for investments
        if (fund.status !== "OPEN") {
          throw new Error("Fund is not open for new investments");
        }

        // Check if commitment amount is within fund limits
        if (request.amount < fund.minInvestment) {
          throw new Error(`Investment amount must be at least ${fund.minInvestment}`);
        }

        if (request.amount > fund.maxInvestment) {
          throw new Error(`Investment amount cannot exceed ${fund.maxInvestment}`);
        }

        // Check if fund has sufficient remaining amount
        if (request.amount > fund.remainingAmount) {
          throw new Error("Insufficient remaining amount in fund");
        }
      }

      // Create client and investment commitment in a transaction with timeout
      const result = await prisma.$transaction(async (tx) => {
        // Determine client status: if creating with commitments, must be ACTIVE
        const clientStatus = request.fundId ? "ACTIVE" : (request.status || "ACTIVE");
        
        // Create the client
        const client = await tx.client.create({
          data: {
            investorId,
            type: request.type,
            legalName: request.legalName,
            email: request.email,
            country: request.country,
            phone: request.phone,
            address: request.address,
            taxId: request.taxId,
            status: clientStatus
          }
        });

        let commitment = null;

        // Create investment commitment if fundId is provided
        if (request.fundId) {
          commitment = await tx.investmentCommitment.create({
            data: {
              clientId: client.id,
              fundId: request.fundId,
              amount: request.amount!,
              currency: request.currency || "USD",
              effectiveDate: request.effectiveDate!,
              eSign: request.eSign,
              notes: request.notes,
              status: "PENDING"
            },
            include: {
              fund: {
                select: {
                  id: true,
                  name: true,
                  description: true,
                  status: true
                }
              }
            }
          });
        }

        return { client, commitment };
      }, {
        timeout: 10000 // 10 seconds timeout
      });

      // Return client with commitment if created
      const clientWithCommitment = await prisma.client.findUnique({
        where: { id: result.client.id },
        include: {
          investmentCommitments: {
            include: {
              fund: {
                select: {
                  id: true,
                  name: true,
                  description: true,
                  status: true
                }
              }
            }
          }
        }
      });

      return clientWithCommitment;
    } catch (error) {
      throw error;
    }
  }

  // Get all clients
  static async getAllClients(page: number = 1, limit: number = 10, filters: any = {}) {
    try {
      const skip = (page - 1) * limit;
      const where: any = {};

      if (filters.type) {
        where.type = filters.type;
      }

      if (filters.country) {
        where.country = filters.country;
      }

      if (filters.status) {
        where.status = filters.status;
      }

      if (filters.search) {
        where.OR = [
          { legalName: { contains: filters.search, mode: 'insensitive' } },
          { email: { contains: filters.search, mode: 'insensitive' } },
          { investorId: { contains: filters.search, mode: 'insensitive' } }
        ];
      }

      const [clients, total] = await Promise.all([
        prisma.client.findMany({
          where,
          skip,
          take: limit,
          include: {
            investmentCommitments: {
              include: {
                fund: {
                  select: {
                    id: true,
                    name: true,
                    status: true
                  }
                }
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          }
        }),
        prisma.client.count({ where })
      ]);

      return {
        clients,
        total,
        page,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      throw error;
    }
  }

  // Get client by ID
  static async getClientById(id: string) {
    try {
      const client = await prisma.client.findUnique({
        where: { id },
        include: {
          investmentCommitments: {
            include: {
              fund: {
                select: {
                  id: true,
                  name: true,
                  description: true,
                  status: true,
                  totalAmount: true,
                  remainingAmount: true
                }
              }
            }
          }
        }
      });

      if (!client) {
        throw new Error("Client not found");
      }

      return client;
    } catch (error) {
      throw error;
    }
  }

  // Get client by investor ID
  static async getClientByInvestorId(investorId: string) {
    try {
      const client = await prisma.client.findUnique({
        where: { investorId },
        include: {
          investmentCommitments: {
            include: {
              fund: {
                select: {
                  id: true,
                  name: true,
                  description: true,
                  status: true
                }
              }
            }
          }
        }
      });

      if (!client) {
        throw new Error("Client not found");
      }

      return client;
    } catch (error) {
      throw error;
    }
  }

  // Update client and optionally update/create investment commitment
  static async updateClient(id: string, request: UpdateClientRequest) {
    try {
      const existingClient = await prisma.client.findUnique({
        where: { id }
      });

      if (!existingClient) {
        throw new Error("Client not found");
      }

      // Check for duplicate investor ID if being updated
      if (request.investorId && request.investorId !== existingClient.investorId) {
        const duplicateInvestorId = await prisma.client.findUnique({
          where: { investorId: request.investorId }
        });

        if (duplicateInvestorId) {
          throw new Error("Client with this investor ID already exists");
        }
      }

      // Check for duplicate email if being updated
      if (request.email && request.email !== existingClient.email) {
        const duplicateEmail = await prisma.client.findUnique({
          where: { email: request.email }
        });

        if (duplicateEmail) {
          throw new Error("Client with this email already exists");
        }
      }

      // If fundId is provided, validate fund and commitment details
      if (request.fundId) {
        if (!request.amount || !request.effectiveDate) {
          throw new Error("Amount and effective date are required when updating investment commitment");
        }

        // Check if fund exists
        const fund = await prisma.fund.findUnique({
          where: { id: request.fundId }
        });

        if (!fund) {
          throw new Error("Fund not found");
        }

        // Check if fund is open for investments
        if (fund.status !== "OPEN") {
          throw new Error("Fund is not open for new investments");
        }

        // Check if commitment amount is within fund limits
        if (request.amount < fund.minInvestment) {
          throw new Error(`Investment amount must be at least ${fund.minInvestment}`);
        }

        if (request.amount > fund.maxInvestment) {
          throw new Error(`Investment amount cannot exceed ${fund.maxInvestment}`);
        }

        // Check if fund has sufficient remaining amount
        if (request.amount > fund.remainingAmount) {
          throw new Error("Insufficient remaining amount in fund");
        }
      }

      // Check if commitment already exists (outside transaction to avoid timeout)
      let existingCommitment = null;
      if (request.fundId) {
        existingCommitment = await prisma.investmentCommitment.findUnique({
          where: {
            clientId_fundId: {
              clientId: id,
              fundId: request.fundId
            }
          }
        });
      }

      // Update client and handle commitment in a transaction with timeout
      const result = await prisma.$transaction(async (tx) => {
        // Determine client status: if adding commitments, must be ACTIVE
        const clientStatus = request.fundId ? "ACTIVE" : (request.status || existingClient.status);
        
        // Update the client
        const updatedClient = await tx.client.update({
          where: { id },
          data: {
            ...(request.investorId && { investorId: request.investorId }),
            ...(request.type && { type: request.type }),
            ...(request.legalName && { legalName: request.legalName }),
            ...(request.email && { email: request.email }),
            ...(request.country && { country: request.country }),
            ...(request.phone !== undefined && { phone: request.phone }),
            ...(request.address !== undefined && { address: request.address }),
            ...(request.taxId !== undefined && { taxId: request.taxId }),
            status: clientStatus
          }
        });

        // Handle investment commitment if fundId is provided
        if (request.fundId) {
          if (existingCommitment) {
            // Update existing commitment
            await tx.investmentCommitment.update({
              where: { id: existingCommitment.id },
              data: {
                amount: request.amount!,
                currency: request.currency || "USD",
                effectiveDate: request.effectiveDate!,
                eSign: request.eSign,
                notes: request.notes
              }
            });
          } else {
            // Create new commitment
            await tx.investmentCommitment.create({
              data: {
                clientId: id,
                fundId: request.fundId,
                amount: request.amount!,
                currency: request.currency || "USD",
                effectiveDate: request.effectiveDate!,
                eSign: request.eSign,
                notes: request.notes,
                status: "PENDING"
              }
            });
          }
        }

        return updatedClient;
      }, {
        timeout: 10000 // 10 seconds timeout
      });

      // Return updated client with commitments
      const clientWithCommitments = await prisma.client.findUnique({
        where: { id },
        include: {
          investmentCommitments: {
            include: {
              fund: {
                select: {
                  id: true,
                  name: true,
                  description: true,
                  status: true
                }
              }
            }
          }
        }
      });

      return clientWithCommitments;
    } catch (error) {
      throw error;
    }
  }

  // Delete client
  static async deleteClient(id: string) {
    try {
      const existingClient = await prisma.client.findUnique({
        where: { id }
      });

      if (!existingClient) {
        throw new Error("Client not found");
      }

      // Check if client has active investment commitments
      const activeCommitments = await prisma.investmentCommitment.count({
        where: {
          clientId: id,
          status: { in: ["PENDING", "ACTIVE"] }
        }
      });

      if (activeCommitments > 0) {
        throw new Error("Cannot delete client with active investment commitments");
      }

      await prisma.client.delete({
        where: { id }
      });

      return { message: "Client deleted successfully" };
    } catch (error) {
      throw error;
    }
  }


  // Get client statistics
  static async getClientStatistics() {
    try {
      const [
        totalClients,
        individualClients,
        institutionalClients,
        activeClients,
        totalCommitments,
        totalCommitmentAmount
      ] = await Promise.all([
        prisma.client.count(),
        prisma.client.count({ where: { type: "individual" } }),
        prisma.client.count({ where: { type: "institutional" } }),
        prisma.client.count({ where: { status: "ACTIVE" } }),
        prisma.investmentCommitment.count(),
        prisma.investmentCommitment.aggregate({
          _sum: { amount: true }
        })
      ]);

      return {
        totalClients,
        individualClients,
        institutionalClients,
        activeClients,
        totalCommitments,
        totalCommitmentAmount: totalCommitmentAmount._sum.amount || 0
      };
    } catch (error) {
      throw error;
    }
  }
}
