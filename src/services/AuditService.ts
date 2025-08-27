// @ts-nocheck
import { dbConnection } from "../utils/database";

const prisma = dbConnection.getPrismaClient();

const SENSITIVE_KEYS = [
  "password",
  "token",
  "secret",
  "apiKey",
  "accessToken",
  "refreshToken",
];

function sanitize(obj: any) {
  if (!obj || typeof obj !== "object") return obj;
  const clone = JSON.parse(JSON.stringify(obj));
  const walk = (o: any) => {
    Object.keys(o).forEach((k) => {
      if (SENSITIVE_KEYS.includes(k)) o[k] = "***";
      else if (o[k] && typeof o[k] === "object") walk(o[k]);
    });
  };
  walk(clone);
  return clone;
}

function stringifyDecimals(val: any) {
  if (val && typeof val === "object" && typeof val.toString === "function") {
    try { return val.toString(); } catch { return val; }
  }
  return val;
}

function normalize(obj: any) {
  if (!obj || typeof obj !== "object") return obj;
  const out: any = Array.isArray(obj) ? [] : {};
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === "object") out[k] = normalize(v);
    else out[k] = stringifyDecimals(v);
  }
  return out;
}

function diff(oldVals: any, newVals: any) {
  const changes: Record<string, { old: any; new: any }> = {};
  const skip = new Set(["updatedAt", "createdAt"]);
  const o = normalize(oldVals || {});
  const n = normalize(newVals || {});
  const keys = new Set([...Object.keys(o), ...Object.keys(n)]);
  for (const k of keys) {
    if (skip.has(k)) continue;
    if (JSON.stringify(o[k]) !== JSON.stringify(n[k])) {
      changes[k] = { old: o[k], new: n[k] };
    }
  }
  return Object.keys(changes).length ? changes : null;
}

export default class AuditService {
  static async log(params: {
    userId?: string | null;
    action: string; // CREATE, UPDATE, DELETE, POST, VOID, LOGIN, etc.
    entityType: string;
    entityId: string;
    oldValues?: any;
    newValues?: any;
    ipAddress?: string | null;
    userAgent?: string | null;
  }) {
    const { userId, action, entityType, entityId, oldValues, newValues, ipAddress, userAgent } = params;

    await prisma.auditLog.create({
      data: {
        userId: userId || null,
        action,
        entityType,
        entityId,
        oldValues: oldValues ? sanitize(oldValues) : undefined,
        newValues: newValues ? sanitize(newValues) : undefined,
        ipAddress: ipAddress || undefined,
        userAgent: userAgent || undefined,
      },
    });
  }

  static computeUpdateDiff(oldRecord: any, updatedRecord: any) {
    return diff(oldRecord, updatedRecord);
  }
}