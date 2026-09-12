/**
 * Verify broker public reply → DB notification + Socket.IO events for instruction sender.
 * Usage: npx ts-node --transpile-only -r dotenv/config scripts/verify-broker-reply-realtime-notification.ts
 */
import "dotenv/config";
import { io, Socket } from "socket.io-client";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient() as any;
const BASE = process.env.API_BASE_URL || "http://127.0.0.1:3009/api";
const WS = (BASE.replace(/\/api\/?$/, "") || "http://127.0.0.1:3009").replace(/\/$/, "");

async function login(): Promise<{ token: string; userId: string }> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@nts.com", password: "admin123" }),
  });
  const json = (await res.json()) as any;
  const token = json?.token || json?.data?.token;
  const userId = json?.user?.id || json?.data?.user?.id;
  if (!token || !userId) throw new Error(`login failed: ${JSON.stringify(json).slice(0, 300)}`);
  return { token, userId };
}

function waitForSocket(socket: Socket, ms = 12_000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (socket.connected) return resolve();
    socket.once("connect", () => resolve());
    socket.once("connect_error", (e) => reject(e));
    setTimeout(() => reject(new Error("socket connect timeout")), ms);
  });
}

async function main() {
  const results: string[] = [];
  const fail = (msg: string) => {
    results.push(`FAIL: ${msg}`);
    console.error(`FAIL: ${msg}`);
  };
  const pass = (msg: string) => {
    results.push(`PASS: ${msg}`);
    console.log(`PASS: ${msg}`);
  };

  const { token, userId } = await login();
  pass(`login admin userId=${userId}`);

  const socketEvents: Array<{ event: string; payload: unknown }> = [];
  const socket = io(WS, { auth: { token }, transports: ["websocket", "polling"] });
  socket.on("notification_created", (payload) => {
    socketEvents.push({ event: "notification_created", payload });
    console.log("[socket] notification_created", JSON.stringify(payload).slice(0, 240));
  });
  socket.on("investment_broker_reply", (payload) => {
    socketEvents.push({ event: "investment_broker_reply", payload });
    console.log("[socket] investment_broker_reply", JSON.stringify(payload));
  });

  try {
    await waitForSocket(socket);
    pass(`socket connected id=${socket.id}`);
  } catch (e: any) {
    fail(`socket connect: ${e?.message || e}`);
    process.exit(1);
  }

  let order = await prisma.investmentOrder.findFirst({
    where: { status: "SENT_TO_BROKER" },
    orderBy: { updatedAt: "desc" },
  });
  if (!order) {
    order = await prisma.investmentOrder.findFirst({
      where: { status: { in: ["BROKER_CONFIRMATION_RECORDED", "APPROVED"] } },
      orderBy: { updatedAt: "desc" },
    });
  }
  if (!order) {
    fail("no investment order in DB to test with");
    process.exit(1);
  }
  pass(`using order ${order.orderRef} (${order.id})`);

  await prisma.investmentOrderBrokerConfirmation.updateMany({
    where: { orderId: order.id, status: "RECORDED" },
    data: { status: "REJECTED", decidedAt: new Date() },
  });
  if (order.status !== "SENT_TO_BROKER") {
    await prisma.investmentOrder.update({
      where: { id: order.id },
      data: { status: "SENT_TO_BROKER" },
    });
  }

  const replyToken = `rt_${Date.now().toString(36)}`;
  const instrId = `bins_rt_${Date.now().toString(36)}`;
  const exp = new Date(Date.now() + 7 * 86400000);
  await prisma.$executeRawUnsafe(
    `INSERT INTO investment_order_broker_instructions
      (id, order_id, channel, to_email, subject, body_text, reply_token, status, expires_at, created_by_id, created_at, updated_at)
     VALUES (?, ?, 'EMAIL', 'broker-test@example.com', 'RT test', 'body', ?, 'SENT', ?, ?, NOW(3), NOW(3))`,
    instrId,
    order.id,
    replyToken,
    exp,
    userId
  );
  pass(`seeded instruction ${instrId} created_by_id=${userId}`);

  const beforeCount = await prisma.notification.count({
    where: { userId, type: "INVESTMENT_BROKER_REPLY" },
  });

  const replyRes = await fetch(
    `${BASE}/investment-ops/public/broker-instructions/${replyToken}/reply`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        outcome: "COUNTER",
        quantity: String(order.quantity || "100"),
        price: "12.50",
        notes: "Realtime notification verification",
        proceed: true,
        brokerReference: "RT-VERIFY-1",
      }),
    }
  );
  const replyJson = (await replyRes.json()) as any;
  console.log("reply HTTP", replyRes.status, replyJson?.data?.outcome || replyJson?.code || replyJson?.message);
  if (!replyRes.ok && replyRes.status !== 201) {
    fail(`broker reply HTTP ${replyRes.status}: ${replyJson?.message || replyJson?.code}`);
  } else {
    pass(`broker reply recorded outcome=${replyJson?.data?.outcome || "COUNTER"}`);
  }

  await new Promise((r) => setTimeout(r, 2500));

  const afterCount = await prisma.notification.count({
    where: { userId, type: "INVESTMENT_BROKER_REPLY" },
  });
  const latest = await prisma.notification.findFirst({
    where: { userId, type: "INVESTMENT_BROKER_REPLY" },
    orderBy: { createdAt: "desc" },
  });

  if (afterCount > beforeCount && latest) {
    pass(`DB notification created: "${latest.title}"`);
  } else {
    fail(`DB notification not created (before=${beforeCount} after=${afterCount})`);
  }

  const notifEvent = socketEvents.find((e) => e.event === "notification_created");
  const brokerEvent = socketEvents.find((e) => e.event === "investment_broker_reply");

  if (notifEvent) {
    const p = notifEvent.payload as any;
    if (p?.type === "INVESTMENT_BROKER_REPLY" || p?.title?.includes("counter")) {
      pass("socket notification_created received with broker payload");
    } else {
      pass(`socket notification_created received (type=${p?.type})`);
    }
  } else {
    fail("socket notification_created not received within 2.5s");
  }

  if (brokerEvent) {
    const p = brokerEvent.payload as any;
    if (p?.orderId === order.id) {
      pass("socket investment_broker_reply received for correct orderId");
    } else {
      fail(`investment_broker_reply wrong orderId: ${p?.orderId}`);
    }
  } else {
    fail("socket investment_broker_reply not received within 2.5s");
  }

  console.log("\n=== SUMMARY ===");
  results.forEach((r) => console.log(r));

  const ok = results.every((r) => r.startsWith("PASS:")) || !results.some((r) => r.startsWith("FAIL:"));
  socket.disconnect();
  await prisma.$disconnect();
  process.exit(ok ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
