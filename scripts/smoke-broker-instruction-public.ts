/** Quick smoke: public broker instruction GET + reply */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient() as any;
const BASE = process.env.API_BASE_URL || "http://127.0.0.1:3009/api";

async function main() {
  const bad = await fetch(`${BASE}/investment-ops/public/broker-instructions/not-real`);
  const badJson = await bad.json().catch(() => ({}));
  console.log("invalid token", bad.status, badJson.code || badJson.message);

  let order = await prisma.investmentOrder.findFirst({
    where: { status: "SENT_TO_BROKER" },
    orderBy: { updatedAt: "desc" },
  });
  if (!order) {
    order = await prisma.investmentOrder.findFirst({
      where: { status: { in: ["APPROVED", "BROKER_CONFIRMATION_RECORDED"] } },
      orderBy: { updatedAt: "desc" },
    });
  }
  if (!order) {
    console.log("No suitable order for smoke — skip reply");
    return;
  }

  // Ensure SENT_TO_BROKER for reply path
  if (order.status !== "SENT_TO_BROKER") {
    await prisma.investmentOrder.update({
      where: { id: order.id },
      data: { status: "SENT_TO_BROKER" },
    });
    order = await prisma.investmentOrder.findUnique({ where: { id: order.id } });
  }

  const token = `smoke_${Date.now().toString(36)}`;
  const id = `bins_smoke_${Date.now().toString(36)}`;
  const exp = new Date(Date.now() + 7 * 86400000);
  await prisma.$executeRawUnsafe(
    `INSERT INTO investment_order_broker_instructions
      (id, order_id, channel, to_email, subject, body_text, reply_token, status, expires_at, created_at, updated_at)
     VALUES (?, ?, 'EMAIL', 'broker-test@example.com', 'Smoke', 'body', ?, 'SENT', ?, NOW(3), NOW(3))`,
    id,
    order.id,
    token,
    exp
  );
  console.log("token", token, "order", order.orderRef, order.id);

  const get = await fetch(`${BASE}/investment-ops/public/broker-instructions/${token}`);
  const getJson = await get.json();
  console.log("GET", get.status, JSON.stringify(getJson).slice(0, 500));

  const reply = await fetch(`${BASE}/investment-ops/public/broker-instructions/${token}/reply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      outcome: "COUNTER",
      quantity: String(order.quantity || "100"),
      price: "12.50",
      notes: "Best available is higher — proceed?",
      proceed: true,
      brokerReference: "SMOKE-BRK-1",
    }),
  });
  const replyJson = await reply.json();
  console.log("REPLY", reply.status, replyJson?.data?.outcome || replyJson?.code, replyJson?.data?.confirmationId || replyJson?.message);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
