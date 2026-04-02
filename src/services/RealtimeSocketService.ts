// @ts-nocheck
import { Server as SocketIOServer } from "socket.io";
import jwt from "jsonwebtoken";

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

  io.on("connection", (socket) => {
    const userId = socket.data?.userId;
    if (userId) {
      socket.join(`user:${userId}`);
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
  });

  return io;
}

export function emitToTask(taskId: string, event: string, payload: any) {
  if (!io || !taskId) return;
  io.to(`task:${taskId}`).emit(event, payload);
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

