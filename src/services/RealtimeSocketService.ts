// @ts-nocheck
import { Server as SocketIOServer } from "socket.io";
import jwt from "jsonwebtoken";
import { prisma } from "../utils/database";

let io: SocketIOServer | null = null;

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_here";

function parseBearer(token?: string) {
  if (!token) return "";
  return token.startsWith("Bearer ") ? token.slice(7) : token;
}

export function initSocketServer(httpServer: any) {
  if (io) return io;

  io = new SocketIOServer(httpServer, {
    cors: {
      origin: true,
      credentials: true
    }
  });

  io.use((socket, next) => {
    try {
      const rawToken =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization ||
        socket.handshake.query?.token;
      const token = parseBearer(String(rawToken || ""));
      if (!token) return next();

      const decoded: any = jwt.verify(token, JWT_SECRET);
      socket.data.userId = decoded?.userId;
      return next();
    } catch {
      return next();
    }
  });

  io.on("connection", async (socket) => {
    const userId = socket.data?.userId;
    if (userId) {
      socket.join(`user:${userId}`);
      try {
        const relation = await prisma.lpUserRelation.findFirst({
          where: { userId, isActive: true },
          select: { clientId: true },
        });
        if (relation?.clientId) {
          socket.data.lpClientId = relation.clientId;
          socket.join(`lp_portal:${relation.clientId}`);
        }
      } catch {
        /* non-fatal */
      }
    }

    socket.on("join_task", (payload: { taskId?: string }) => {
      const taskId = String(payload?.taskId || "").trim();
      if (!taskId) return;
      socket.join(`task:${taskId}`);
    });

    socket.on("leave_task", (payload: { taskId?: string }) => {
      const taskId = String(payload?.taskId || "").trim();
      if (!taskId) return;
      socket.leave(`task:${taskId}`);
    });

    socket.on("join_deal", (payload: { applicationId?: string }) => {
      const applicationId = String(payload?.applicationId || "").trim();
      if (!applicationId) return;
      socket.join(`deal:${applicationId}`);
    });

    socket.on("leave_deal", (payload: { applicationId?: string }) => {
      const applicationId = String(payload?.applicationId || "").trim();
      if (!applicationId) return;
      socket.leave(`deal:${applicationId}`);
    });

    socket.on("join_lp_portal", async () => {
      const uid = socket.data?.userId;
      if (!uid) return;
      try {
        const relation = await prisma.lpUserRelation.findFirst({
          where: { userId: uid, isActive: true },
          select: { clientId: true },
        });
        if (relation?.clientId) {
          socket.data.lpClientId = relation.clientId;
          socket.join(`lp_portal:${relation.clientId}`);
        }
      } catch {
        /* non-fatal */
      }
    });

    socket.on("join_lp_thread", (payload: { threadId?: string }) => {
      const threadId = String(payload?.threadId || "").trim();
      if (!threadId) return;
      socket.join(`lp_thread:${threadId}`);
    });

    socket.on("leave_lp_thread", (payload: { threadId?: string }) => {
      const threadId = String(payload?.threadId || "").trim();
      if (!threadId) return;
      socket.leave(`lp_thread:${threadId}`);
    });

    socket.on("join_lp_request", (payload: { reference?: string }) => {
      const reference = String(payload?.reference || "").trim();
      if (!reference) return;
      socket.join(`lp_request:${reference}`);
    });

    socket.on("leave_lp_request", (payload: { reference?: string }) => {
      const reference = String(payload?.reference || "").trim();
      if (!reference) return;
      socket.leave(`lp_request:${reference}`);
    });
  });

  return io;
}

export function emitToTask(taskId: string, event: string, payload: any) {
  if (!io || !taskId) return;
  io.to(`task:${taskId}`).emit(event, payload);
}

export function emitToDeal(applicationId: string, event: string, payload: any) {
  if (!io || !applicationId) return;
  io.to(`deal:${applicationId}`).emit(event, payload);
}

export function emitToUser(userId: string, event: string, payload: any) {
  if (!io || !userId) return;
  io.to(`user:${userId}`).emit(event, payload);
}

export function emitToUsers(userIds: string[], event: string, payload: any) {
  if (!io || !Array.isArray(userIds)) return;
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  unique.forEach((userId) => io!.to(`user:${userId}`).emit(event, payload));
}

export function emitToLpPortalClient(clientId: string, event: string, payload: any) {
  if (!io || !clientId) return;
  io.to(`lp_portal:${clientId}`).emit(event, payload);
}

export function emitToLpThread(threadId: string, event: string, payload: any) {
  if (!io || !threadId) return;
  io.to(`lp_thread:${threadId}`).emit(event, payload);
}

export function emitToLpRequest(reference: string, event: string, payload: any) {
  if (!io || !reference) return;
  io.to(`lp_request:${reference}`).emit(event, payload);
}

