// @ts-nocheck
import { createHash } from "crypto";
import { Decimal } from "@prisma/client/runtime/library";
import { InvestmentOpsError } from "../../middleware/investmentOpsFoundation";
import {
  d,
  db,
  emitCash,
  loadCashAccountLabelMap,
  loadUserDisplayMap,
  moneyStr,
  paginated,
  parseDateOnly,
  parsePagination,
  requireStr,
  withIdempotency,
} from "./spCashSupport";

function withMovements(sections: any) {
  if (!sections || typeof sections !== "object") return sections;
  if (Array.isArray(sections.movements)) return sections;
  const movements: any[] = [];
  for (const key of ["receipts", "payments", "fees", "realisedGainsLosses"]) {
    const items = sections[key]?.items || [];
    for (const item of items) {
      movements.push({
        description: item.description,
        amount: item.amount,
        lineId: item.lineId,
        valueDate: item.valueDate,
        postingPurpose: item.postingPurpose,
        section: key,
      });
    }
  }
  return { ...sections, movements };
}

function presentStatement(
  row: any,
  run?: any,
  extras?: {
    accountLabels?: ReturnType<typeof import("./spCashSupport").presentCashAccountLabels> | null;
    generatedBy?: { name: string | null; email: string | null } | null;
    approvedBy?: { name: string | null; email: string | null } | null;
  }
) {
  const sections = withMovements(row.sectionsJson);
  const labels = extras?.accountLabels;
  return {
    id: row.id,
    runId: row.runId,
    openingCash: moneyStr(row.openingCash),
    closingCash: moneyStr(row.closingCash),
    sections,
    checksum: row.checksum,
    status: row.status,
    approvedById: row.approvedById,
    approvedByName: extras?.approvedBy?.name || null,
    approvedAt: row.approvedAt,
    generatedById: run?.createdById || null,
    generatedByName: extras?.generatedBy?.name || null,
    generatedByEmail: extras?.generatedBy?.email || null,
    generatedBy: extras?.generatedBy
      ? {
          id: run?.createdById || null,
          name: extras.generatedBy.name,
          email: extras.generatedBy.email,
        }
      : null,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    // Promoted top-level fields for FE schedule / segment
    periodFrom: run?.periodFrom ?? null,
    periodTo: run?.periodTo ?? null,
    cashAccountId: run?.cashAccountId ?? null,
    accountNumber: labels?.accountNumber ?? null,
    accountNumberMasked: labels?.accountNumberMasked ?? null,
    cashAccountLabel: labels?.cashAccountLabel ?? null,
    clientName: labels?.clientName ?? null,
    clientOrVehicleId: run?.clientOrVehicleId ?? null,
    currency: run?.currency ?? null,
    statementType: run?.statementType ?? null,
    run: run
      ? {
          id: run.id,
          clientOrVehicleId: run.clientOrVehicleId,
          cashAccountId: run.cashAccountId,
          periodFrom: run.periodFrom,
          periodTo: run.periodTo,
          statementType: run.statementType,
          currency: run.currency,
          status: run.status,
          createdById: run.createdById,
        }
      : undefined,
  };
}

async function enrichStatements(rows: Array<{ row: any; run?: any }>) {
  const accountIds = rows.map((r) => r.run?.cashAccountId).filter(Boolean);
  const userIds = rows
    .flatMap((r) => [r.run?.createdById, r.row.approvedById])
    .filter(Boolean);
  const [accountMap, userMap] = await Promise.all([
    loadCashAccountLabelMap(accountIds),
    loadUserDisplayMap(userIds),
  ]);
  return rows.map(({ row, run }) =>
    presentStatement(row, run, {
      accountLabels: run?.cashAccountId ? accountMap[run.cashAccountId] : null,
      generatedBy: run?.createdById ? userMap[run.createdById] : null,
      approvedBy: row.approvedById ? userMap[row.approvedById] : null,
    })
  );
}

const PDF_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function pdfIsoDay(value: unknown): string {
  if (value == null || value === "") return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const s = String(value);
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return "";
}

function pdfLongDate(value: unknown): string {
  const iso = pdfIsoDay(value);
  if (!iso) return "";
  const [y, m, day] = iso.split("-");
  return `${day} ${PDF_MONTHS[Number(m) - 1] || m} ${y}`;
}

function pdfMoney(value: unknown): string {
  const n = Number(String(value ?? "0").replace(/,/g, ""));
  if (!Number.isFinite(n)) return "0.00";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pdfAmount(value: unknown): number {
  const n = Number(String(value ?? "0").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function buildStatementPdfBuffer(stmt: any): Promise<Buffer> {
  const PDFDocument = require("pdfkit");
  return new Promise((resolve, reject) => {
    const margin = 48;
    const doc = new PDFDocument({ margin, size: "A4", bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const contentW = pageW - margin * 2;
    const navy = "#0F172A";
    const blue = "#2563EB";
    const muted = "#64748B";
    const line = "#E2E8F0";
    const ink = "#0F172A";
    const ccy = String(stmt.currency || "USD");
    const clientLabel = stmt.clientName || "Client";
    const accountLabel = stmt.clientName || stmt.cashAccountLabel || "Cash account";
    const fromLabel = pdfLongDate(stmt.periodFrom);
    const toLabel = pdfLongDate(stmt.periodTo);
    const period = fromLabel && toLabel ? `${fromLabel} - ${toLabel}` : fromLabel || toLabel || "Period n/a";
    const generatedOn = pdfLongDate(stmt.createdAt || new Date());
    const movements = Array.isArray(stmt.sections?.movements) ? stmt.sections.movements : [];

    const colDate = margin;
    const colDesc = margin + 78;
    const colDebit = margin + contentW - 180;
    const colCredit = margin + contentW - 90;
    const descW = colDebit - colDesc - 8;
    const moneyW = 82;
    const rowH = 18;
    const footerY = pageH - 36;
    const tableBottom = footerY - 28;

    const drawHeaderBand = () => {
      doc.save();
      doc.rect(0, 0, pageW, 78).fill(navy);
      doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(16);
      doc.text("ARCUS", margin, 22, { width: contentW / 2, align: "left" });
      doc.font("Helvetica").fontSize(8).fillColor("#93C5FD");
      doc.text("ASSET MANAGEMENT", margin, 42, { width: contentW / 2 });
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#FFFFFF");
      doc.text("CLIENT CASH STATEMENT", margin, 22, { width: contentW, align: "right" });
      doc.font("Helvetica").fontSize(9).fillColor("#CBD5E1");
      doc.text(period, margin, 42, { width: contentW, align: "right" });
      doc.restore();
      doc.x = margin;
      doc.y = 96;
    };

    const ensureSpace = (needed: number) => {
      if (doc.y + needed <= tableBottom) return;
      doc.addPage();
      drawHeaderBand();
      drawTableHeader();
    };

    const drawTableHeader = () => {
      const y = doc.y;
      doc.save();
      doc.rect(margin, y, contentW, 22).fill("#F1F5F9");
      doc.fillColor(muted).font("Helvetica-Bold").fontSize(8);
      doc.text("DATE", colDate + 8, y + 7, { width: 66 });
      doc.text("DESCRIPTION", colDesc, y + 7, { width: descW });
      doc.text(`DEBIT (${ccy})`, colDebit, y + 7, { width: moneyW, align: "right" });
      doc.text(`CREDIT (${ccy})`, colCredit, y + 7, { width: moneyW, align: "right" });
      doc.restore();
      doc.y = y + 22;
    };

    const drawMoneyRow = (
      date: string,
      description: string,
      debit: string,
      credit: string,
      opts?: { bold?: boolean; fill?: string }
    ) => {
      ensureSpace(rowH + 2);
      const y = doc.y;
      if (opts?.fill) {
        doc.save();
        doc.rect(margin, y, contentW, rowH).fill(opts.fill);
        doc.restore();
      }
      doc.fillColor(ink).font(opts?.bold ? "Helvetica-Bold" : "Helvetica").fontSize(8);
      doc.text(date, colDate + 8, y + 5, { width: 66 });
      doc.text(description || "-", colDesc, y + 5, { width: descW, ellipsis: true });
      doc.text(debit, colDebit, y + 5, { width: moneyW, align: "right" });
      doc.text(credit, colCredit, y + 5, { width: moneyW, align: "right" });
      doc.strokeColor(line).lineWidth(0.4).moveTo(margin, y + rowH).lineTo(margin + contentW, y + rowH).stroke();
      doc.y = y + rowH;
    };

    drawHeaderBand();

    const metaY = doc.y;
    doc.font("Helvetica").fontSize(8).fillColor(muted).text("CLIENT", margin, metaY);
    doc.font("Helvetica-Bold").fontSize(11).fillColor(ink).text(clientLabel, margin, metaY + 12, { width: contentW / 2 - 12 });
    doc.font("Helvetica").fontSize(8).fillColor(muted).text("ACCOUNT", margin, metaY + 36);
    doc.font("Helvetica").fontSize(10).fillColor(ink).text(accountLabel, margin, metaY + 48, { width: contentW / 2 - 12 });

    const rightX = margin + contentW / 2;
    const metaRight = [
      ["CURRENCY", ccy],
      ["GENERATED", generatedOn || "-"],
    ];
    if (stmt.generatedByName) metaRight.push(["PREPARED BY", String(stmt.generatedByName)]);
    let ry = metaY;
    for (const [k, v] of metaRight) {
      doc.font("Helvetica").fontSize(8).fillColor(muted).text(k, rightX, ry, { width: contentW / 2, align: "right" });
      doc.font("Helvetica-Bold").fontSize(10).fillColor(ink).text(v, rightX, ry + 11, { width: contentW / 2, align: "right" });
      ry += 28;
    }
    doc.y = Math.max(metaY + 72, ry) + 8;
    doc.strokeColor(blue).lineWidth(1.5).moveTo(margin, doc.y).lineTo(margin + contentW, doc.y).stroke();
    doc.y += 14;

    doc.font("Helvetica-Bold").fontSize(10).fillColor(ink).text("Cash movements", margin, doc.y);
    doc.y += 16;
    drawTableHeader();
    drawMoneyRow("", "Opening cash", pdfMoney(stmt.openingCash), "", { bold: true, fill: "#F8FAFC" });

    if (!movements.length) {
      drawMoneyRow("", "No movements in this period", "", "");
    } else {
      for (const m of movements) {
        const amt = pdfAmount(m.amount);
        const debit = amt > 0 ? pdfMoney(amt) : "";
        const credit = amt < 0 ? pdfMoney(Math.abs(amt)) : "";
        drawMoneyRow(pdfLongDate(m.valueDate), String(m.description || ""), debit, credit);
      }
    }

    drawMoneyRow("", `Closing cash (${ccy})`, pdfMoney(stmt.closingCash), "", { bold: true, fill: "#EFF6FF" });

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      doc.save();
      doc.strokeColor(line).lineWidth(0.6).moveTo(margin, footerY - 10).lineTo(margin + contentW, footerY - 10).stroke();
      doc.font("Helvetica").fontSize(7).fillColor(muted);
      doc.text("This statement is computer generated and does not require a signature.", margin, footerY - 4, {
        width: contentW * 0.7,
        align: "left",
      });
      doc.text(`Page ${i + 1} of ${range.count}`, margin, footerY - 4, { width: contentW, align: "right" });
      doc.restore();
    }

    doc.end();
  });
}

async function buildSections(cashAccountId: string, currency: string, from: Date, to: Date) {
  const priorLines = await db.spCashJournalLine.findMany({
    where: {
      cashAccountId,
      journal: { status: "POSTED", currency, valueDate: { lt: from } },
    },
  });
  let opening = new Decimal(0);
  for (const l of priorLines) opening = opening.plus(d(l.signedCashAmount));

  const lines = await db.spCashJournalLine.findMany({
    where: {
      cashAccountId,
      journal: { status: "POSTED", currency, valueDate: { gte: from, lte: to } },
    },
    include: { journal: true },
    orderBy: { createdAt: "asc" },
  });

  const receipts: any[] = [];
  const payments: any[] = [];
  const fees: any[] = [];
  const realisedGl: any[] = [];
  let closing = opening;

  for (const l of lines) {
    const amt = d(l.signedCashAmount);
    closing = closing.plus(amt);
    const purpose = String(l.journal?.postingPurpose || "").toUpperCase();
    const item = {
      lineId: l.id,
      journalId: l.journalId,
      valueDate: l.journal?.valueDate,
      description: l.description,
      amount: moneyStr(amt),
      postingPurpose: l.journal?.postingPurpose,
    };
    if (purpose.includes("FEE") || purpose.includes("CHARGE")) fees.push(item);
    else if (purpose.includes("GAIN") || purpose.includes("LOSS") || purpose.includes("REALISED")) {
      realisedGl.push(item);
    } else if (amt.gte(0)) receipts.push(item);
    else payments.push(item);
  }

  const sections = withMovements({
    openingCash: { amount: moneyStr(opening), currency },
    receipts: { items: receipts, total: moneyStr(receipts.reduce((s, i) => s.plus(d(i.amount)), new Decimal(0))) },
    payments: { items: payments, total: moneyStr(payments.reduce((s, i) => s.plus(d(i.amount)), new Decimal(0))) },
    fees: { items: fees, total: moneyStr(fees.reduce((s, i) => s.plus(d(i.amount)), new Decimal(0))) },
    realisedGainsLosses: {
      items: realisedGl,
      total: moneyStr(realisedGl.reduce((s, i) => s.plus(d(i.amount)), new Decimal(0))),
    },
    closingCash: { amount: moneyStr(closing), currency },
  });

  return { opening, closing, sections };
}

async function generateOne(
  body: {
    cashAccountId: string;
    clientOrVehicleId: string;
    currency: string;
    periodFrom: Date;
    periodTo: Date;
    statementType?: string;
  },
  actorId: string
) {
  const account = await db.spCashClientAccount.findUnique({ where: { id: body.cashAccountId } });
  if (!account) throw new InvestmentOpsError("NOT_FOUND", "Cash account not found", 404, { field: "cashAccountId" });
  if (account.clientOrVehicleId && String(account.clientOrVehicleId) !== String(body.clientOrVehicleId)) {
    throw new InvestmentOpsError("NOT_FOUND", "Cash account not found for clientOrVehicleId", 404, {
      field: "clientOrVehicleId",
    });
  }

  const { opening, closing, sections } = await buildSections(
    body.cashAccountId,
    body.currency,
    body.periodFrom,
    body.periodTo
  );
  const checksum = createHash("sha256").update(JSON.stringify(sections)).digest("hex");

  const run = await db.spCashClientStatementRun.create({
    data: {
      clientOrVehicleId: body.clientOrVehicleId,
      cashAccountId: body.cashAccountId,
      periodFrom: body.periodFrom,
      periodTo: body.periodTo,
      statementType: body.statementType || "CLIENT_CASH",
      currency: body.currency,
      status: "COMPLETED",
      createdById: actorId,
    },
  });

  const stmt = await db.spCashClientStatement.create({
    data: {
      runId: run.id,
      openingCash: opening,
      closingCash: closing,
      sectionsJson: sections,
      checksum,
      status: "DRAFT",
      version: 1,
    },
  });

  await emitCash({
    eventType: "cash.statement.generated",
    aggregateType: "SpCashClientStatement",
    aggregateId: stmt.id,
    aggregateVersion: 1,
    actorId,
    payload: { runId: run.id, checksum },
  });
  return (await enrichStatements([{ row: stmt, run }]))[0];
}

function normalizeStatementType(raw: unknown): string {
  const t = String(raw || "CLIENT_CASH").toUpperCase();
  if (t === "PERIODIC" || t === "CLIENT") return "CLIENT_CASH";
  if (t === "CAPITAL" || t === "INVESTOR") return "INVESTOR_CAPITAL";
  return t;
}

export class SpCashStatementService {
  static async list(query: any = {}) {
    const { page, pageSize, skip, take } = parsePagination(query);
    const where: any = {};
    if (query.status) where.status = String(query.status);
    where.run = {};
    if (query.clientOrVehicleId) where.run.clientOrVehicleId = String(query.clientOrVehicleId);
    if (query.cashAccountId) where.run.cashAccountId = String(query.cashAccountId);
    if (query.statementType) where.run.statementType = normalizeStatementType(query.statementType);
    if (!Object.keys(where.run).length) delete where.run;

    const [items, total] = await Promise.all([
      db.spCashClientStatement.findMany({
        where,
        include: { run: true },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      db.spCashClientStatement.count({ where }),
    ]);
    const presented = await enrichStatements(items.map((r: any) => ({ row: r, run: r.run })));
    return paginated(presented, total, page, pageSize);
  }

  static async generate(body: any, actorId: string, idempotencyKey?: string) {
    const currency = requireStr(body.currency || "USD", "currency").toUpperCase();
    const periodFrom = parseDateOnly(body.periodFrom, "periodFrom");
    const periodTo = parseDateOnly(body.periodTo, "periodTo");
    if (!periodFrom || !periodTo) {
      throw new InvestmentOpsError("VALIDATION_ERROR", "periodFrom and periodTo required", 400, {
        fields: ["periodFrom", "periodTo"],
      });
    }

    const normalizedType = normalizeStatementType(body.statementType || "CLIENT_CASH");
    if (!["CLIENT_CASH", "INVESTOR_CAPITAL"].includes(normalizedType)) {
      throw new InvestmentOpsError("VALIDATION_ERROR", "Unsupported statementType", 400, {
        field: "statementType",
      });
    }

    const accountIds: string[] = Array.isArray(body.cashAccountIds)
      ? body.cashAccountIds.map(String)
      : body.cashAccountId
        ? [String(body.cashAccountId)]
        : [];

    if (!accountIds.length) {
      throw new InvestmentOpsError("VALIDATION_ERROR", "cashAccountId or cashAccountIds required", 400, {
        field: "cashAccountId",
        fields: ["cashAccountId", "cashAccountIds"],
      });
    }

    const clientOrVehicleId = body.clientOrVehicleId
      ? String(body.clientOrVehicleId)
      : null;

    return withIdempotency(
      "sp-cash:statement:generate",
      idempotencyKey || body.idempotencyKey,
      body,
      async () => {
        const statements = [];
        for (const cashAccountId of accountIds) {
          let vehicleId = clientOrVehicleId;
          if (!vehicleId) {
            const account = await db.spCashClientAccount.findUnique({ where: { id: cashAccountId } });
            vehicleId = account?.clientOrVehicleId || null;
          }
          if (!vehicleId) continue;
          statements.push(
            await generateOne(
              {
                cashAccountId,
                clientOrVehicleId: vehicleId,
                currency,
                periodFrom,
                periodTo,
                statementType: normalizedType,
              },
              actorId
            )
          );
        }
        if (!statements.length) {
          throw new InvestmentOpsError(
            "VALIDATION_ERROR",
            "No cash accounts with a linked client were in scope",
            400,
            { field: "cashAccountId" }
          );
        }
        if (statements.length === 1) return statements[0];
        return {
          runId: statements[0]?.runId ?? null,
          statements,
          count: statements.length,
        };
      },
      201
    );
  }

  static async get(id: string) {
    const row = await db.spCashClientStatement.findUnique({
      where: { id },
      include: { run: true },
    });
    if (!row) throw new InvestmentOpsError("NOT_FOUND", "Statement not found", 404);
    return (await enrichStatements([{ row, run: row.run }]))[0];
  }

  static async preview(id: string) {
    const stmt = await this.get(id);
    const movements = stmt.sections?.movements || [];
    const rowsHtml = movements
      .map(
        (m: any) =>
          `<tr><td>${m.valueDate || ""}</td><td>${m.description || ""}</td><td>${m.amount || ""}</td></tr>`
      )
      .join("");
    const previewHtml = `<html><body><h1>Client Statement</h1><p>Opening: ${stmt.openingCash}</p><table>${rowsHtml}</table><p>Closing: ${stmt.closingCash}</p></body></html>`;
    return {
      statementId: id,
      status: stmt.status,
      sections: stmt.sections,
      openingCash: stmt.openingCash,
      closingCash: stmt.closingCash,
      checksum: stmt.checksum,
      run: stmt.run,
      previewHtml,
      periodFrom: stmt.periodFrom,
      periodTo: stmt.periodTo,
      currency: stmt.currency,
      statementType: stmt.statementType,
    };
  }

  static async approve(id: string, body: any, actorId: string) {
    const row = await db.spCashClientStatement.findUnique({
      where: { id },
      include: { run: true },
    });
    if (!row) throw new InvestmentOpsError("NOT_FOUND", "Statement not found", 404);
    if (!["DRAFT", "PENDING_APPROVAL"].includes(row.status)) {
      throw new InvestmentOpsError("INVALID_STATUS", `Cannot approve in ${row.status}`, 409);
    }
    const updated = await db.spCashClientStatement.update({
      where: { id },
      data: {
        status: "APPROVED",
        approvedById: actorId,
        approvedAt: new Date(),
        version: { increment: 1 },
      },
      include: { run: true },
    });
    await emitCash({
      eventType: "cash.statement.approved",
      aggregateType: "SpCashClientStatement",
      aggregateId: id,
      aggregateVersion: updated.version,
      actorId,
    });
    return (await enrichStatements([{ row: updated, run: updated.run }]))[0];
  }

  static async email(id: string, body: any, actorId: string) {
    const row = await db.spCashClientStatement.findUnique({ where: { id } });
    if (!row) throw new InvestmentOpsError("NOT_FOUND", "Statement not found", 404);
    if (row.status !== "APPROVED") {
      throw new InvestmentOpsError("INVALID_STATUS", "Only approved statements can be emailed", 409);
    }
    const delivery = await db.spCashClientStatementDelivery.create({
      data: {
        statementId: id,
        channel: "EMAIL",
        status: "DELIVERED",
        deliveredAt: new Date(),
      },
    });
    await emitCash({
      eventType: "cash.statement.delivered",
      aggregateType: "SpCashClientStatement",
      aggregateId: id,
      aggregateVersion: row.version,
      actorId,
      payload: { channel: "EMAIL", to: body?.to || null, deliveryId: delivery.id },
    });
    return { statementId: id, delivery };
  }

  static async download(id: string, accept?: string) {
    const preview = await this.preview(id);
    const stmt = await this.get(id);
    const pdfBuffer = await buildStatementPdfBuffer(stmt);
    const fileName = `statement-${pdfIsoDay(stmt.periodFrom) || id}.pdf`;
    const wantsPdf = String(accept || "").includes("application/pdf");

    if (wantsPdf) {
      return {
        mode: "binary" as const,
        statementId: id,
        contentType: "application/pdf",
        fileName,
        buffer: pdfBuffer,
        checksum: preview.checksum,
      };
    }

    return {
      mode: "json" as const,
      statementId: id,
      contentType: "application/pdf",
      fileName,
      contentBase64: pdfBuffer.toString("base64"),
      downloadUrl: null,
      checksum: preview.checksum,
    };
  }

  static async summary(query: any = {}) {
    const where: any = {};
    if (query.clientOrVehicleId || query.statementType) {
      where.run = {};
      if (query.clientOrVehicleId) where.run.clientOrVehicleId = String(query.clientOrVehicleId);
      if (query.statementType) where.run.statementType = normalizeStatementType(query.statementType);
    }
    const [total, draft, pendingApproval, approved, delivered, recent] = await Promise.all([
      db.spCashClientStatement.count({ where }),
      db.spCashClientStatement.count({ where: { ...where, status: "DRAFT" } }),
      db.spCashClientStatement.count({ where: { ...where, status: "PENDING_APPROVAL" } }),
      db.spCashClientStatement.count({ where: { ...where, status: "APPROVED" } }),
      db.spCashClientStatementDelivery.count({ where: { status: "DELIVERED" } }),
      db.spCashClientStatement.findMany({
        where,
        include: { run: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]);

    let clientCashCovered = new Decimal(0);
    let periodMovements = new Decimal(0);
    const accountIds = new Set<string>();
    for (const s of recent) {
      clientCashCovered = clientCashCovered.plus(d(s.closingCash));
      periodMovements = periodMovements.plus(d(s.closingCash).minus(d(s.openingCash)));
      if (s.run?.cashAccountId) accountIds.add(s.run.cashAccountId);
    }

    return {
      total,
      draft,
      pendingApproval,
      approved,
      delivered,
      clientCashCovered: moneyStr(clientCashCovered),
      totalCash: moneyStr(clientCashCovered),
      periodMovements: moneyStr(periodMovements),
      movementTotal: moneyStr(periodMovements),
      accountsInScope: accountIds.size,
      accountCount: accountIds.size,
    };
  }
}
