// @ts-nocheck
import { createHash, randomUUID } from "crypto";
import { InvestmentOpsError } from "../../middleware/investmentOpsFoundation";
import { prisma } from "../../utils/database";

const db = prisma as any;

const DEFAULT_LEASE_MS = 60_000;
const WORKER_ID = () => `inv-ops-worker-${process.pid}-${randomUUID().slice(0, 8)}`;

export const INVESTMENT_JOB_TYPES = [
  "VALUATION_RUN",
  "INVESTMENT_DASHBOARD_RECALCULATE",
  "PRICE_INGEST",
  "ROUTING_RETRY",
  "RECONCILIATION_RUN",
  "RECONCILIATION_UPLOAD",
  "INVESTMENT_SIMULATION_COMMAND",
  "ACCOUNTING_INTEGRATION",
  "LEDGER_EXPORT",
  "REPORT_GENERATE",
  "FILE_UPLOAD_SESSION",
  "DOCUMENT_CREATE_IDEMPOTENCY",
  "DOCUMENT_VERSION_IDEMPOTENCY",
  "TRADING_POSITIONS_RECALCULATE",
] as const;

export type InvestmentJobHandler = (job: any, attempt: any) => Promise<unknown>;

const handlers = new Map<string, InvestmentJobHandler>();

export function registerInvestmentJobHandler(jobType: string, handler: InvestmentJobHandler) {
  handlers.set(jobType, handler);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/** Order-independent checksum for valuation/recon snapshots. */
export function contentChecksum(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export class InvestmentJobWorkerService {
  static async enqueue(params: {
    jobType: string;
    aggregateType?: string | null;
    aggregateId?: string | null;
    payloadJson: Record<string, unknown>;
    idempotencyKey: string;
    priority?: number;
    availableAt?: Date;
    maxAttempts?: number;
  }) {
    const existing = await db.investmentJob.findUnique({
      where: { idempotencyKey: params.idempotencyKey },
    });
    if (existing) return existing;
    try {
      return await db.investmentJob.create({
        data: {
          jobType: params.jobType,
          aggregateType: params.aggregateType ?? null,
          aggregateId: params.aggregateId ?? null,
          payloadJson: params.payloadJson,
          idempotencyKey: params.idempotencyKey,
          priority: params.priority ?? 100,
          availableAt: params.availableAt ?? new Date(),
          maxAttempts: params.maxAttempts ?? 5,
          status: "PENDING",
        },
      });
    } catch (error: any) {
      if (String(error?.code) === "P2002") {
        return db.investmentJob.findUnique({ where: { idempotencyKey: params.idempotencyKey } });
      }
      throw error;
    }
  }

  static async get(jobId: string, userId?: string, user?: any) {
    const job = await db.investmentJob.findUnique({
      where: { id: jobId },
      include: { attempts: { orderBy: { attemptNo: "asc" } } },
    });
    if (!job) throw new InvestmentOpsError("JOB_NOT_FOUND", "Investment job not found", 404);

    if (userId) {
      const payload = (job.payloadJson || {}) as Record<string, unknown>;
      const fundId =
        (payload.fundId as string | undefined) ||
        ((payload as any).aggregate?.fundId as string | undefined) ||
        null;
      if (fundId) {
        const { ListedEquityAccessService } = await import("../listedEquity/ListedEquityAccessService");
        await ListedEquityAccessService.assertFundAccess(userId, fundId, user);
      } else {
        const starterId =
          (payload.startedById as string | undefined) ||
          (payload.requestedById as string | undefined) ||
          (payload.userId as string | undefined) ||
          null;
        const { ListedEquityAccessService } = await import("../listedEquity/ListedEquityAccessService");
        const { hasInvestmentPermission } = await import("./InvestmentCapabilitiesService");
        const admin = await ListedEquityAccessService.isAdmin(user || {});
        const elevated =
          typeof hasInvestmentPermission === "function" &&
          (hasInvestmentPermission(user, "investments.admin") ||
            hasInvestmentPermission(user, "investments.execute"));
        if (!admin && !elevated && starterId !== userId) {
          throw new InvestmentOpsError(
            "FORBIDDEN_JOB_ACCESS",
            "Job has no fund scope and was not started by the caller",
            403,
            { jobId }
          );
        }
      }
    }

    return job;
  }

  /** Extend lease for a running job owned by workerId. */
  static async heartbeat(jobId: string, workerId: string, leaseMs = DEFAULT_LEASE_MS) {
    const now = new Date();
    const updated = await db.investmentJob.updateMany({
      where: { id: jobId, status: "RUNNING", lockedBy: workerId },
      data: {
        lockedAt: now,
        leaseExpiresAt: new Date(Date.now() + leaseMs),
      },
    });
    if (updated.count !== 1) {
      throw new InvestmentOpsError(
        "JOB_HEARTBEAT_REJECTED",
        "Job lease heartbeat rejected",
        409,
        { jobId, workerId }
      );
    }
    return this.get(jobId);
  }

  /** Cancel a non-terminal job. Idempotent for already-cancelled. */
  static async cancel(jobId: string, reason?: string) {
    const job = await this.get(jobId);
    if (["COMPLETED", "CANCELLED", "DEAD_LETTER"].includes(job.status)) return job;
    return db.investmentJob.update({
      where: { id: jobId },
      data: {
        status: "CANCELLED",
        lastError: reason || "cancelled",
        lockedBy: null,
        lockedAt: null,
        leaseExpiresAt: null,
        completedAt: new Date(),
      },
      include: { attempts: { orderBy: { attemptNo: "asc" } } },
    });
  }

  /** Recover expired RUNNING leases back to FAILED for retry (idempotent recovery). */
  static async recoverExpiredLeases(limit = 50) {
    const now = new Date();
    const stale = await db.investmentJob.findMany({
      where: {
        status: "RUNNING",
        leaseExpiresAt: { lt: now },
      },
      take: limit,
      orderBy: { leaseExpiresAt: "asc" },
    });
    const recovered = [];
    for (const job of stale) {
      const fatal = job.attemptCount >= job.maxAttempts;
      const updated = await db.investmentJob.updateMany({
        where: {
          id: job.id,
          status: "RUNNING",
          leaseExpiresAt: { lt: now },
        },
        data: {
          status: fatal ? "DEAD_LETTER" : "FAILED",
          lastError: fatal ? "max attempts exceeded after lease expiry" : "lease expired",
          availableAt: fatal ? undefined : new Date(),
          lockedBy: null,
          lockedAt: null,
          leaseExpiresAt: null,
        },
      });
      if (updated.count === 1) recovered.push(job.id);
    }
    return { recoveredCount: recovered.length, jobIds: recovered };
  }

  /** Lease the next available job (recoverable). */
  static async leaseNext(jobTypes?: string[], leaseMs = DEFAULT_LEASE_MS) {
    await this.recoverExpiredLeases(20);
    const now = new Date();
    const candidates = await db.investmentJob.findMany({
      where: {
        status: { in: ["PENDING", "FAILED"] },
        availableAt: { lte: now },
        ...(jobTypes?.length ? { jobType: { in: jobTypes } } : {}),
        OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }],
      },
      orderBy: [{ priority: "asc" }, { availableAt: "asc" }, { createdAt: "asc" }],
      take: 20,
    });

    const workerId = WORKER_ID();
    for (const candidate of candidates) {
      if (candidate.attemptCount >= candidate.maxAttempts) {
        await db.investmentJob.update({
          where: { id: candidate.id },
          data: { status: "DEAD_LETTER", lastError: "max attempts exceeded" },
        });
        continue;
      }
      const leaseExpiresAt = new Date(Date.now() + leaseMs);
      const updated = await db.investmentJob.updateMany({
        where: {
          id: candidate.id,
          status: { in: ["PENDING", "FAILED"] },
          OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }],
        },
        data: {
          status: "RUNNING",
          lockedBy: workerId,
          lockedAt: now,
          leaseExpiresAt,
          attemptCount: { increment: 1 },
        },
      });
      if (updated.count !== 1) continue;

      const job = await db.investmentJob.findUnique({ where: { id: candidate.id } });
      const attempt = await db.investmentJobAttempt.create({
        data: {
          jobId: job.id,
          attemptNo: job.attemptCount,
          workerId,
          status: "RUNNING",
          startedAt: now,
        },
      });
      return { job, attempt };
    }
    return null;
  }

  static async completeAttempt(jobId: string, attemptId: string, resultJson?: unknown) {
    await db.$transaction(async (tx: any) => {
      await tx.investmentJobAttempt.update({
        where: { id: attemptId },
        data: {
          status: "SUCCEEDED",
          completedAt: new Date(),
          resultJson: resultJson ?? null,
        },
      });
      await tx.investmentJob.update({
        where: { id: jobId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          lockedBy: null,
          lockedAt: null,
          leaseExpiresAt: null,
          lastError: null,
        },
      });
    });
  }

  static async failAttempt(
    jobId: string,
    attemptId: string,
    error: unknown,
    opts?: { retryDelayMs?: number; fatal?: boolean }
  ) {
    const message = error instanceof Error ? error.message : String(error);
    const code =
      error instanceof InvestmentOpsError ? error.code : "JOB_ATTEMPT_FAILED";
    const job = await db.investmentJob.findUnique({ where: { id: jobId } });
    if (job?.status === "CANCELLED") {
      await db.investmentJobAttempt.update({
        where: { id: attemptId },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          errorCode: "JOB_CANCELLED",
          errorMessage: message,
        },
      });
      return;
    }
    const fatal = opts?.fatal || (job && job.attemptCount >= job.maxAttempts);
    const availableAt = new Date(Date.now() + (opts?.retryDelayMs ?? 5_000));
    await db.$transaction(async (tx: any) => {
      await tx.investmentJobAttempt.update({
        where: { id: attemptId },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          errorCode: code,
          errorMessage: message,
        },
      });
      await tx.investmentJob.update({
        where: { id: jobId },
        data: {
          status: fatal ? "DEAD_LETTER" : "FAILED",
          lastError: message,
          availableAt: fatal ? undefined : availableAt,
          lockedBy: null,
          lockedAt: null,
          leaseExpiresAt: null,
        },
      });
    });
  }

  static async processLeased(job: any, attempt: any) {
    const refreshed = await db.investmentJob.findUnique({ where: { id: job.id } });
    if (refreshed?.status === "CANCELLED") {
      await this.failAttempt(job.id, attempt.id, new Error("Job cancelled"), { fatal: true });
      return { ok: false, error: "cancelled" };
    }
    const handler = handlers.get(job.jobType);
    if (!handler) {
      await this.failAttempt(job.id, attempt.id, new Error(`No handler for ${job.jobType}`), {
        fatal: true,
      });
      return { ok: false, error: `No handler for ${job.jobType}` };
    }
    try {
      const heartbeat = setInterval(() => {
        void this.heartbeat(job.id, attempt.workerId).catch(() => undefined);
      }, Math.max(5_000, Math.floor(DEFAULT_LEASE_MS / 3)));
      let result: unknown;
      try {
        result = await handler(job, attempt);
      } finally {
        clearInterval(heartbeat);
      }
      const after = await db.investmentJob.findUnique({ where: { id: job.id } });
      if (after?.status === "CANCELLED") {
        return { ok: false, error: "cancelled" };
      }
      await this.completeAttempt(job.id, attempt.id, result ?? null);
      return { ok: true, result };
    } catch (error) {
      await this.failAttempt(job.id, attempt.id, error);
      return { ok: false, error };
    }
  }

  /** Process one job by id if leaseable (in-process worker entrypoint). */
  static async processJobById(jobId: string) {
    const job = await db.investmentJob.findUnique({ where: { id: jobId } });
    if (!job) throw new InvestmentOpsError("JOB_NOT_FOUND", "Investment job not found", 404);
    if (job.status === "COMPLETED" || job.status === "CANCELLED") return this.get(jobId);

    if (job.status === "RUNNING" && job.leaseExpiresAt && job.leaseExpiresAt > new Date()) {
      return this.get(jobId);
    }

    const now = new Date();
    const workerId = WORKER_ID();
    const leased = await db.investmentJob.updateMany({
      where: {
        id: jobId,
        status: { in: ["PENDING", "FAILED", "RUNNING"] },
      },
      data: {
        status: "RUNNING",
        lockedBy: workerId,
        lockedAt: now,
        leaseExpiresAt: new Date(Date.now() + DEFAULT_LEASE_MS),
        attemptCount: { increment: job.status === "RUNNING" && job.lockedBy ? 0 : 1 },
      },
    });
    if (leased.count !== 1) {
      return this.get(jobId);
    }
    const refreshed = await db.investmentJob.findUnique({ where: { id: jobId } });
    const attemptNo = refreshed.attemptCount || 1;
    const existingAttempt = await db.investmentJobAttempt.findUnique({
      where: { jobId_attemptNo: { jobId, attemptNo } },
    });
    const attempt =
      existingAttempt ||
      (await db.investmentJobAttempt.create({
        data: {
          jobId,
          attemptNo,
          workerId,
          status: "RUNNING",
          startedAt: now,
        },
      }));
    await this.processLeased(refreshed, attempt);
    return this.get(jobId);
  }

  /** Drain available jobs of given types (recoverable in-process worker). */
  static async processAvailable(limit = 5, jobTypes?: string[]) {
    const results = [];
    for (let i = 0; i < limit; i++) {
      const leased = await this.leaseNext(jobTypes);
      if (!leased) break;
      results.push(await this.processLeased(leased.job, leased.attempt));
    }
    return results;
  }
}
