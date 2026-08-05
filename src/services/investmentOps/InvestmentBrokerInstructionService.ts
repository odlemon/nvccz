// @ts-nocheck
/**
 * Broker instruction email (PO-style) + magic-link public reply → broker confirmation.
 * Uses raw SQL so it works before/without prisma generate on Windows.
 */
import { createHash, randomBytes } from "crypto";
import { emailTransport, getFromAddress, getCompanyShortName } from "../../config/email.config";
import { InvestmentOpsError } from "../../middleware/investmentOpsFoundation";
import { prisma } from "../../utils/database";
import { InvestmentBrokerConfirmationService } from "./InvestmentBrokerConfirmationService";
import { InvestmentOrderPhase2Service } from "./InvestmentOrderPhase2Service";
import { InvestmentOpsAuditService } from "./InvestmentOpsAuditService";
import { emitToUser } from "../RealtimeSocketService";

const db = prisma as any;

function brokerReplyPath(orderId: string): string {
  return `/investments-v2/orders/orderbook?orderId=${orderId}`;
}

async function notifyInstructionSender(opts: {
  recipientUserId: string;
  orderId: string;
  orderRef: string;
  outcome: string;
  quantity: string;
  price: string;
  currencyCode: string;
  brokerEmail: string;
  confirmationId?: string | null;
}) {
  const path = brokerReplyPath(opts.orderId);
  const qty = opts.quantity;
  const px = opts.price;
  const ccy = opts.currencyCode || "USD";
  const labelsByOutcome: Record<string, { title: string; message: string }> = {
    COUNTER: {
      title: "Broker counter-offer",
      message: `${opts.orderRef}: broker offers ${qty} @ ${px} ${ccy}. Review on the orderbook.`,
    },
    FILLED: {
      title: "Broker fill confirmation",
      message: `${opts.orderRef}: ${qty} @ ${px} ${ccy}. Accept on the orderbook to book the trade.`,
    },
    UNABLE: {
      title: "Broker unable to fill",
      message: `${opts.orderRef}: broker could not fill as instructed. Reject and send again or fail the order.`,
    },
    PARTIAL: {
      title: "Broker partial fill",
      message: `${opts.orderRef}: partial ${qty} @ ${px} ${ccy}. Review on the orderbook.`,
    },
  };
  const labels = labelsByOutcome[opts.outcome] || {
    title: "Broker response",
    message: `${opts.orderRef}: broker replied (${opts.outcome}).`,
  };

  const notification = await db.notification.create({
    data: {
      title: labels.title,
      message: labels.message,
      type: "INVESTMENT_BROKER_REPLY",
      userId: opts.recipientUserId,
      relatedEntity: "InvestmentOrder",
      relatedEntityId: opts.orderId,
      data: {
        path,
        orderId: opts.orderId,
        orderRef: opts.orderRef,
        outcome: opts.outcome,
        quantity: qty,
        price: px,
        currencyCode: ccy,
        confirmationId: opts.confirmationId ?? null,
        brokerEmail: opts.brokerEmail,
      },
    },
  });

  const formatted = {
    id: notification.id,
    title: notification.title,
    message: notification.message,
    type: notification.type,
    isRead: false,
    data: notification.data,
    relatedEntity: notification.relatedEntity,
    relatedEntityId: notification.relatedEntityId,
    createdAt: notification.createdAt,
    timeAgo: "Just now",
  };

  emitToUser(opts.recipientUserId, "notification_created", formatted);
  emitToUser(opts.recipientUserId, "investment_broker_reply", {
    orderId: opts.orderId,
    orderRef: opts.orderRef,
    outcome: opts.outcome,
    confirmationId: opts.confirmationId ?? null,
  });
}

function fail(code: string, message: string, status = 400, details?: unknown): never {
  throw new InvestmentOpsError(code, message, status, details);
}

function frontendBase(): string {
  return (
    process.env.BROKER_REPLY_BASE_URL ||
    process.env.FRONTEND_URL ||
    "http://localhost:3001"
  ).replace(/\/$/, "");
}

function replyUrl(token: string): string {
  return `${frontendBase()}/broker-instruction/${token}`;
}

function newToken(): string {
  return randomBytes(32).toString("base64url");
}

function id(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
}

async function resolveBrokerEmail(order: any, data: any): Promise<{
  email: string | null;
  brokerName: string | null;
  brokerProfileId: string | null;
}> {
  let brokerProfileId = data?.brokerProfileId || order.brokerProfileId || null;

  if (!brokerProfileId && order.fundId) {
    const cfg = await db.listedEquityFundConfig.findFirst({
      where: { fundId: order.fundId },
      include: { brokerProfile: true },
    });
    brokerProfileId = cfg?.brokerProfileId || null;
    if (cfg?.brokerProfile?.contactEmail) {
      return {
        email: cfg.brokerProfile.contactEmail,
        brokerName: cfg.brokerProfile.name,
        brokerProfileId,
      };
    }
  }

  if (brokerProfileId) {
    const profile = await db.listedEquityStakeholderProfile.findUnique({
      where: { id: brokerProfileId },
    });
    if (profile?.contactEmail) {
      return {
        email: profile.contactEmail,
        brokerName: profile.name,
        brokerProfileId,
      };
    }
    return {
      email: null,
      brokerName: profile?.name || null,
      brokerProfileId,
    };
  }

  return { email: null, brokerName: null, brokerProfileId };
}

async function loadOrderContext(orderId: string) {
  const order = await db.investmentOrder.findUnique({
    where: { id: orderId },
    include: {
      instrument: { select: { ticker: true, shortName: true, instrumentCode: true } },
    },
  });
  if (!order) fail("ORDER_NOT_FOUND", "Order not found", 404);

  let fundName: string | null = null;
  if (order.fundId) {
    const fund = await db.fund.findUnique({
      where: { id: order.fundId },
      select: { name: true },
    });
    fundName = fund?.name || null;
  }

  let securitySymbol: string | null =
    order.instrument?.ticker ||
    order.instrument?.instrumentCode ||
    order.instrument?.shortName ||
    null;
  if (!securitySymbol && order.securityId) {
    const sec = await db.listedEquitySecurity.findUnique({
      where: { id: order.securityId },
      select: { symbol: true },
    });
    securitySymbol = sec?.symbol || null;
  }

  return { order, fundName, securitySymbol };
}

function buildEmailBodies(opts: {
  order: any;
  fundName: string | null;
  securitySymbol: string | null;
  brokerName: string | null;
  notes: string | null;
  replyLink: string;
}) {
  const { order, fundName, securitySymbol, brokerName, notes, replyLink } = opts;
  const qty = order.quantity != null ? String(order.quantity) : "—";
  const limit = order.limitPrice != null ? String(order.limitPrice) : "MARKET";
  const valueDate = order.valueDate
    ? new Date(order.valueDate).toISOString().slice(0, 10)
    : "—";

  const subject = `[Trade instruction] ${order.orderRef} — ${order.side} ${qty} ${securitySymbol || "SEC"}`;

  const text = [
    `Dear ${brokerName || "Broker"},`,
    ``,
    `Please find below a trade instruction from the asset manager. Open the secure link to accept, counter, or decline.`,
    ``,
    `Order:        ${order.orderRef}`,
    `Fund:         ${fundName || order.fundId || "—"}`,
    `Side:         ${order.side}`,
    `Security:     ${securitySymbol || "—"}`,
    `Quantity:     ${qty}`,
    `Order type:   ${order.orderType || "—"}`,
    `Limit price:  ${limit} ${order.tradeCurrency || ""}`,
    `Value date:   ${valueDate}`,
    notes ? `Notes:        ${notes}` : null,
    ``,
    `Reply here (secure link):`,
    replyLink,
    ``,
    `This link expires in 14 days. Do not forward to unauthorized parties.`,
    ``,
    `— ${getCompanyShortName()}`,
  ]
    .filter((l) => l != null)
    .join("\n");

  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;color:#0f172a">
      <h2 style="margin:0 0 12px">Trade instruction</h2>
      <p>Dear ${brokerName || "Broker"},</p>
      <p>Please review this instruction and respond via the secure link (accept / counter / unable).</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px;margin:16px 0">
        <tr><td style="padding:6px 0;color:#64748b">Order</td><td style="padding:6px 0"><strong>${order.orderRef}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Fund</td><td style="padding:6px 0">${fundName || "—"}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Side</td><td style="padding:6px 0">${order.side}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Security</td><td style="padding:6px 0">${securitySymbol || "—"}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Quantity</td><td style="padding:6px 0">${qty}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Limit</td><td style="padding:6px 0">${limit} ${order.tradeCurrency || ""}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Value date</td><td style="padding:6px 0">${valueDate}</td></tr>
        ${notes ? `<tr><td style="padding:6px 0;color:#64748b">Notes</td><td style="padding:6px 0">${notes}</td></tr>` : ""}
      </table>
      <p style="margin:24px 0">
        <a href="${replyLink}" style="background:#1262d6;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;display:inline-block">
          Respond to instruction
        </a>
      </p>
      <p style="font-size:12px;color:#64748b">Or paste: ${replyLink}<br/>Link expires in 14 days.</p>
    </div>
  `;

  return { subject, text, html };
}

async function insertInstruction(row: Record<string, unknown>) {
  await db.$executeRawUnsafe(
    `INSERT INTO investment_order_broker_instructions
      (id, order_id, channel, to_email, subject, body_text, reply_token, status, delivery_error, email_message_id, sent_at, expires_at, created_by_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))`,
    row.id,
    row.orderId,
    row.channel,
    row.toEmail,
    row.subject,
    row.bodyText,
    row.replyToken,
    row.status,
    row.deliveryError,
    row.emailMessageId,
    row.sentAt,
    row.expiresAt,
    row.createdById
  );
}

async function insertMessage(row: Record<string, unknown>) {
  await db.$executeRawUnsafe(
    `INSERT INTO investment_order_broker_messages
      (id, order_id, instruction_id, direction, channel, kind, body, payload_json, actor_label, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, NOW(3))`,
    row.id,
    row.orderId,
    row.instructionId,
    row.direction,
    row.channel,
    row.kind,
    row.body,
    JSON.stringify(row.payloadJson ?? null),
    row.actorLabel
  );
}

async function findInstructionByToken(token: string) {
  const rows = await db.$queryRawUnsafe(
    `SELECT * FROM investment_order_broker_instructions WHERE reply_token = ? LIMIT 1`,
    token
  );
  const r = rows?.[0];
  if (!r) return null;
  return {
    id: r.id,
    orderId: r.order_id,
    channel: r.channel,
    toEmail: r.to_email,
    subject: r.subject,
    bodyText: r.body_text,
    replyToken: r.reply_token,
    status: r.status,
    deliveryError: r.delivery_error,
    emailMessageId: r.email_message_id,
    sentAt: r.sent_at,
    repliedAt: r.replied_at,
    expiresAt: r.expires_at,
    createdById: r.created_by_id,
  };
}

export class InvestmentBrokerInstructionService {
  static async dispatchAfterSend(orderId: string, data: any, userId: string, user: any) {
    const { order, fundName, securitySymbol } = await loadOrderContext(orderId);
    const broker = await resolveBrokerEmail(order, data);
    if (!broker.brokerProfileId) {
      fail("BROKER_REQUIRED", "Select a broker profile before sending the instruction email", 422);
    }
    if (!broker.email) {
      fail(
        "BROKER_EMAIL_MISSING",
        `Broker “${broker.brokerName || broker.brokerProfileId}” has no contact email on their record`,
        422
      );
    }

    if (broker.brokerProfileId && broker.brokerProfileId !== order.brokerProfileId) {
      await db.investmentOrder.update({
        where: { id: orderId },
        data: { brokerProfileId: broker.brokerProfileId },
      });
    }

    const token = newToken();
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const link = replyUrl(token);
    const notes = data?.notes != null ? String(data.notes) : order.sentToBrokerNotes;
    const { subject, text, html } = buildEmailBodies({
      order,
      fundName,
      securitySymbol,
      brokerName: broker.brokerName,
      notes,
      replyLink: link,
    });

    const instructionId = id("bins");
    let status = "PENDING";
    let deliveryError: string | null = null;
    let emailMessageId: string | null = null;
    let sentAt: Date | null = null;

    if (!broker.email) {
      status = "NO_EMAIL";
      deliveryError = "No broker contact email — share the reply link manually";
    } else {
      try {
        const from = getFromAddress("investment");
        const info = await emailTransport.sendMail({
          from: `"${from.name}" <${from.address}>`,
          to: broker.email,
          subject,
          text,
          html,
        });
        emailMessageId = info?.messageId || null;
        status = "SENT";
        sentAt = new Date();
      } catch (e: any) {
        status = "FAILED";
        deliveryError = e?.message || "EMAIL_SEND_FAILED";
      }
    }

    await insertInstruction({
      id: instructionId,
      orderId,
      channel: "EMAIL",
      toEmail: broker.email,
      subject,
      bodyText: text,
      replyToken: token,
      status,
      deliveryError,
      emailMessageId,
      sentAt,
      expiresAt,
      createdById: userId,
    });

    await insertMessage({
      id: id("bmsg"),
      orderId,
      instructionId,
      direction: "OUTBOUND",
      channel: "EMAIL",
      kind: "INSTRUCTION",
      body: subject,
      payloadJson: {
        toEmail: broker.email,
        status,
        deliveryError,
        replyUrl: link,
      },
      actorLabel:
        `${user?.firstName || ""} ${user?.lastName || ""}`.trim() || user?.email || userId,
    });

    await InvestmentOpsAuditService.log(
      "BROKER_INSTRUCTION_DISPATCHED",
      "InvestmentOrder",
      orderId,
      { instructionId, status, toEmail: broker.email, replyUrl: link },
      userId
    );

    return {
      instructionId,
      status,
      toEmail: broker.email,
      deliveryError,
      replyUrl: link,
      expiresAt: expiresAt.toISOString(),
      emailMessageId,
    };
  }

  static async listMessages(orderId: string, userId: string, user: any) {
    await InvestmentOrderPhase2Service.get(orderId, userId, user);
    const msgRows = await db.$queryRawUnsafe(
      `SELECT * FROM investment_order_broker_messages WHERE order_id = ? ORDER BY created_at ASC`,
      orderId
    );
    const instrRows = await db.$queryRawUnsafe(
      `SELECT * FROM investment_order_broker_instructions WHERE order_id = ? ORDER BY created_at DESC LIMIT 5`,
      orderId
    );
    const latest = instrRows?.[0];
    return {
      messages: (msgRows || []).map((r: any) => ({
        id: r.id,
        direction: r.direction,
        channel: r.channel,
        kind: r.kind,
        body: r.body,
        actorLabel: r.actor_label,
        createdAt: r.created_at,
        payloadJson: typeof r.payload_json === "string" ? JSON.parse(r.payload_json) : r.payload_json,
      })),
      latestInstruction: latest
        ? {
            id: latest.id,
            status: latest.status,
            toEmail: latest.to_email,
            deliveryError: latest.delivery_error,
            replyUrl: replyUrl(latest.reply_token),
            sentAt: latest.sent_at,
            expiresAt: latest.expires_at,
            repliedAt: latest.replied_at,
          }
        : null,
    };
  }

  static async getPublicByToken(token: string) {
    const instruction = await findInstructionByToken(token);
    if (!instruction) fail("INSTRUCTION_NOT_FOUND", "Invalid or unknown reply link", 404);

    if (instruction.expiresAt && new Date(instruction.expiresAt) < new Date()) {
      fail("INSTRUCTION_EXPIRED", "This reply link has expired", 410);
    }

    const { order, fundName, securitySymbol } = await loadOrderContext(instruction.orderId);
    const openConfirmations = await db.investmentOrderBrokerConfirmation.count({
      where: { orderId: order.id, status: "RECORDED" },
    });

    return {
      instructionId: instruction.id,
      status: instruction.status,
      alreadyReplied: Boolean(instruction.repliedAt) || instruction.status === "REPLIED",
      expiresAt: instruction.expiresAt,
      companyName: getCompanyShortName(),
      order: {
        id: order.id,
        orderRef: order.orderRef,
        side: order.side,
        quantity: order.quantity != null ? String(order.quantity) : null,
        orderType: order.orderType,
        limitPrice: order.limitPrice != null ? String(order.limitPrice) : null,
        tradeCurrency: order.tradeCurrency,
        valueDate: order.valueDate
          ? new Date(order.valueDate).toISOString().slice(0, 10)
          : null,
        status: order.status,
        fundName,
        securitySymbol,
        notes: order.sentToBrokerNotes || order.notes || null,
      },
      openConfirmationCount: openConfirmations,
    };
  }

  static async replyPublic(token: string, body: any) {
    const instruction = await findInstructionByToken(token);
    if (!instruction) fail("INSTRUCTION_NOT_FOUND", "Invalid or unknown reply link", 404);
    if (instruction.expiresAt && new Date(instruction.expiresAt) < new Date()) {
      fail("INSTRUCTION_EXPIRED", "This reply link has expired", 410);
    }
    if (instruction.status === "REPLIED" || instruction.repliedAt) {
      fail("INSTRUCTION_ALREADY_REPLIED", "A reply was already submitted for this link", 409);
    }

    const order = await db.investmentOrder.findUnique({ where: { id: instruction.orderId } });
    if (!order) fail("ORDER_NOT_FOUND", "Order not found", 404);
    if (
      !["SENT_TO_BROKER", "ROUTED", "BROKER_CONFIRMATION_RECORDED", "PARTIALLY_EXECUTED"].includes(
        order.status
      )
    ) {
      fail(
        "ORDER_NOT_AWAITING_BROKER",
        `Order status ${order.status} cannot receive broker replies`,
        422
      );
    }

    const outcome = String(body?.outcome || "").toUpperCase();
    if (!["FILLED", "COUNTER", "UNABLE", "PARTIAL"].includes(outcome)) {
      fail("VALIDATION_ERROR", "outcome must be FILLED, COUNTER, UNABLE, or PARTIAL", 422);
    }

    const proceed =
      body?.proceed === true ||
      String(body?.proceed || "").toLowerCase() === "true" ||
      String(body?.proceed || "").toLowerCase() === "yes";

    let quantity = body?.quantity;
    let price = body?.price;
    if (outcome === "UNABLE") {
      quantity = quantity || order.quantity;
      price = price || order.limitPrice || order.executionPrice || "0.01";
    }
    if (quantity == null || price == null || String(quantity) === "" || String(price) === "") {
      fail("VALIDATION_ERROR", "quantity and price are required", 422);
    }

    const notesParts = [
      body?.notes ? String(body.notes).trim() : "",
      outcome === "COUNTER"
        ? proceed
          ? "Broker asks: proceed at counter? YES"
          : "Broker asks: proceed at counter? (awaiting AM decision)"
        : "",
      `Via broker reply link ${instruction.id}`,
    ].filter(Boolean);

    const idempotencyKey = `broker-reply:${instruction.id}:${createHash("sha256")
      .update(JSON.stringify({ outcome, quantity, price, notes: body?.notes }))
      .digest("hex")
      .slice(0, 24)}`;

    const systemUser = { id: "broker-portal", email: instruction.toEmail || "broker@external" };
    const confirmation = await InvestmentBrokerConfirmationService.record(
      order.id,
      {
        outcome,
        quantity,
        price,
        currencyCode: body?.currencyCode || order.tradeCurrency || "USD",
        brokerReference: body?.brokerReference || null,
        tradeDate: body?.tradeDate || new Date().toISOString().slice(0, 10),
        valueDate: body?.valueDate || undefined,
        notes: notesParts.join(" | "),
        attachmentFileId: null,
      },
      String(order.version),
      idempotencyKey,
      null,
      systemUser,
      { skipAccessCheck: true }
    );

    await db.$executeRawUnsafe(
      `UPDATE investment_order_broker_instructions
       SET status = 'REPLIED', replied_at = NOW(3), updated_at = NOW(3)
       WHERE id = ?`,
      instruction.id
    );

    await insertMessage({
      id: id("bmsg"),
      orderId: order.id,
      instructionId: instruction.id,
      direction: "INBOUND",
      channel: "PORTAL",
      kind: outcome,
      body: notesParts.join(" | ") || outcome,
      payloadJson: {
        outcome,
        quantity: String(quantity),
        price: String(price),
        currencyCode: body?.currencyCode || order.tradeCurrency || "USD",
        proceed,
        confirmationId: confirmation?.id,
        brokerReference: body?.brokerReference || null,
      },
      actorLabel: instruction.toEmail || "Broker",
    });

    await InvestmentOpsAuditService.log(
      "BROKER_INSTRUCTION_REPLIED",
      "InvestmentOrder",
      order.id,
      { instructionId: instruction.id, outcome, confirmationId: confirmation?.id },
      null
    );

    if (instruction.createdById) {
      try {
        await notifyInstructionSender({
          recipientUserId: instruction.createdById,
          orderId: order.id,
          orderRef: order.orderRef,
          outcome,
          quantity: String(quantity),
          price: String(price),
          currencyCode: body?.currencyCode || order.tradeCurrency || "USD",
          brokerEmail: instruction.toEmail || "broker",
          confirmationId: confirmation?.id,
        });
      } catch (e: any) {
        console.warn("[broker reply] notify instruction sender failed:", e?.message || e);
      }
    }

    return {
      ok: true,
      outcome,
      confirmationId: confirmation?.id,
      orderRef: order.orderRef,
      message:
        outcome === "UNABLE"
          ? "Response recorded. The asset manager has been notified that the security could not be filled as instructed."
          : outcome === "COUNTER"
            ? "Counter-offer recorded. The asset manager will Accept or Reject on the orderbook."
            : "Fill recorded. The asset manager will Accept to book the trade.",
    };
  }
}
