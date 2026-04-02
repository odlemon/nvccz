/**
 * E.04-style check: two Socket.IO clients in same task room receive task_message without refresh.
 * Requires API already running (e.g. npm run dev). Uses DB task + JWT for that task's createdBy.
 */
import "dotenv/config";
import { io as ioClient, Socket } from "socket.io-client";
import { prisma } from "../src/utils/database";
import { createToken } from "../src/middleware/authenticate";

const PORT = process.env.PORT || "3009";
const BASE = `http://127.0.0.1:${PORT}`;

function connectSocket(token: string): Socket {
  return ioClient(BASE, {
    transports: ["websocket", "polling"],
    auth: { token },
    reconnection: false,
    timeout: 8000
  });
}

function waitForEvent(socket: Socket, event: string, timeoutMs: number): Promise<any> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
    socket.once(event, (payload: any) => {
      clearTimeout(t);
      resolve(payload);
    });
  });
}

async function main() {
  const task = await prisma.task.findFirst({
    where: { id: "cmneen5st0003unno1toqyrwm" },
    select: { id: true, createdBy: true }
  });
  if (!task?.createdBy) {
    throw new Error("Seed task cmneen5st0003unno1toqyrwm not found or has no createdBy");
  }

  const token = createToken(task.createdBy);
  const clientA = connectSocket(token);
  const clientB = connectSocket(token);

  await new Promise<void>((resolve, reject) => {
    let n = 0;
    const done = () => {
      n += 1;
      if (n === 2) resolve();
    };
    clientA.on("connect", done);
    clientB.on("connect", done);
    clientA.on("connect_error", reject);
    clientB.on("connect_error", reject);
  });

  clientA.emit("join_task", { taskId: task.id });
  clientB.emit("join_task", { taskId: task.id });

  await new Promise((r) => setTimeout(r, 300));

  const pA = waitForEvent(clientA, "task_message", 10000);
  const pB = waitForEvent(clientB, "task_message", 10000);

  const body = JSON.stringify({
    content: `E.04 socket verify ${Date.now()}`,
    mentionUserIds: []
  });

  const res = await fetch(`${BASE}/api/tasks/${task.id}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST messages failed: ${res.status} ${text}`);
  }

  const [msgA, msgB] = await Promise.all([pA, pB]);

  clientA.close();
  clientB.close();

  const pass =
    msgA &&
    msgB &&
    msgA.taskId === task.id &&
    msgB.taskId === task.id &&
    msgA.content === msgB.content &&
    msgA.id === msgB.id;

  console.log(
    JSON.stringify(
      {
        uat: "E.04",
        pass,
        receivedByBoth: Boolean(msgA && msgB),
        messageId: msgA?.id
      },
      null,
      2
    )
  );

  if (msgA?.id) {
    await prisma.activityLog.deleteMany({ where: { id: msgA.id, taskId: task.id } }).catch(() => undefined);
  }

  if (!pass) process.exit(1);
}

main()
  .catch((e) => {
    console.error("E04_SOCKET_VERIFY_FAILED", e.message || e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
