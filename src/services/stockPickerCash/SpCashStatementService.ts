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

function buildStatementPdfBuffer(stmt: any): Promise<Buffer> {
  const PDFDocument = require("pdfkit");
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const period =
      stmt.periodFrom || stmt.periodTo
        ? `${stmt.periodFrom ? String(stmt.periodFrom).slice(0, 10) : "…"} → ${
            stmt.periodTo ? String(stmt.periodTo).slice(0, 10) : "…"
          }`
        : "Period n/a";
    const clientLabel = stmt.clientName || stmt.clientOrVehicleId || "Client";
    const accountLabel =
      stmt.cashAccountLabel || stmt.accountNumberMasked || stmt.cashAccountId || "Cash account";
    const ccy = stmt.currency || "USD";

    doc.font("Helvetica-Bold").fontSize(16).text("Client Cash Statement", { align: "center" });
    doc.moveDown(0.4);
    doc.font("Helvetica").fontSize(10).text(period, { align: "center" });
    doc.moveDown(1);
    doc.font("Helvetica-Bold").fontSize(11).text(`Client: ${clientLabel}`);
    doc.font("Helvetica").fontSize(10).text(`Account: ${accountLabel}`);
    doc.text(`Currency: ${ccy}`);
    doc.text(`Status: ${stmt.status || ""}`);
    if (stmt.generatedByName) doc.text(`Generated by: ${stmt.generatedByName}`);
    if (stmt.approvedByName) doc.text(`Approved by: ${stmt.approvedByName}`);
    doc.moveDown(0.8);

    doc.font("Helvetica-Bold").fontSize(11).text(`Opening cash: ${stmt.openingCash} ${ccy}`);
    doc.moveDown(0.4);
    doc.font("Helvetica-Bold").fontSize(11).text("Movements");
    doc.moveDown(0.2);
    doc.font("Helvetica").fontSize(9);
    const movements = stmt.sections?.movements || [];
    if (!movements.length) {
      doc.text("(No movements in period)");
    } else {
      for (const m of movements.slice(0, 80)) {
        const vd = m.valueDate ? String(m.valueDate).slice(0, 10) : "";
        doc.text(`${vd}  ${m.description || ""}  ${m.amount || ""}`);
      }
      if (movements.length > 80) doc.text(`… and ${movements.length - 80} more`);
    }
    doc.moveDown(0.6);
    doc.font("Helvetica-Bold").fontSize(11).text(`Closing cash: ${stmt.closingCash} ${ccy}`);
    doc.moveDown(1);
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#666666")
      .text(`Checksum: ${stmt.checksum || "n/a"} · Generated by Investment Ops cash statements`);
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

export class SpCashStatementService {
  static async list(query: any = {}) {
    const { page, pageSize, skip, take } = parsePagination(query);
    const where: any = {};
    if (query.status) where.status = String(query.status);
    where.run = {};
    if (query.clientOrVehicleId) where.run.clientOrVehicleId = String(query.clientOrVehicleId);
    if (query.cashAccountId) where.run.cashAccountId = String(query.cashAccountId);
    if (query.statementType) where.run.statementType = String(query.statementType).toUpperCase();
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

    const statementType = String(body.statementType || "CLIENT_CASH").toUpperCase();
    // Investor capital statements share this resource via statementType
    if (!["CLIENT_CASH", "CLIENT", "INVESTOR", "INVESTOR_CAPITAL", "CAPITAL"].includes(statementType)) {
      throw new InvestmentOpsError("VALIDATION_ERROR", "Unsupported statementType", 400, {
        field: "statementType",
      });
    }
    const normalizedType =
      statementType === "CLIENT"
        ? "CLIENT_CASH"
        : statementType === "CAPITAL" || statementType === "INVESTOR"
          ? "INVESTOR_CAPITAL"
          : statementType;

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
          if (!vehicleId) {
            throw new InvestmentOpsError(
              "VALIDATION_ERROR",
              "clientOrVehicleId required when account has no linked client",
              400,
              { field: "clientOrVehicleId", cashAccountId }
            );
          }
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
    const fileName = `statement-${String(stmt.periodFrom || "").slice(0, 10) || id}.pdf`;
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
      if (query.statementType) where.run.statementType = String(query.statementType).toUpperCase();
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
