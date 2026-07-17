// @ts-nocheck
import fs from "fs";
import path from "path";
import XLSX from "xlsx";
import { prisma } from "../../utils/database";
import { FpaError } from "./FpaError";
import { FpaAuditService } from "./FpaAuditService";

function downloadPath(jobId: string) {
  return `/api/v1/fpa/exports/${jobId}/download`;
}

function exportDir() {
  const dir = path.join(process.cwd(), "storage", "local-upload-mock", "fpa-exports");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function buildBoardPackWorkbook(opts: {
  modelName: string;
  fiscalYear?: number | null;
  exportType: string;
  cells: any[];
  meta?: any;
}) {
  const wb = XLSX.utils.book_new();

  // Cover sheet
  const cover = XLSX.utils.aoa_to_sheet([
    ["Arcus FP&A Board Pack"],
    ["Model", opts.modelName],
    ["Export type", opts.exportType],
    ["Fiscal year", opts.fiscalYear ?? ""],
    ["Generated at", new Date().toISOString()],
    ["Cell count", opts.cells.length],
    ["Budget cycle", opts.meta?.budgetCycleId || ""],
  ]);
  XLSX.utils.book_append_sheet(wb, cover, "Cover");

  // Detail sheet — one row per cell
  const detailRows = [
    [
      "Line Code",
      "Line Name",
      "Line Type",
      "Period",
      "Department Id",
      "Value",
      "Currency",
      "Source",
      "Scenario Id",
    ],
  ];
  for (const c of opts.cells) {
    detailRows.push([
      c.lineItem?.code || "",
      c.lineItem?.name || "",
      c.lineItem?.lineItemType || "",
      c.periodDate ? new Date(c.periodDate).toISOString().slice(0, 10) : "",
      c.departmentId || "",
      c.value != null ? Number(c.value) : "",
      c.currencyCode || "",
      c.sourceType || "",
      c.scenarioId || "",
    ]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detailRows), "Detail");

  // Pivot-ish summary by line code (sum of values)
  const byLine: Record<string, { name: string; total: number }> = {};
  for (const c of opts.cells) {
    const code = c.lineItem?.code || "UNKNOWN";
    if (!byLine[code]) byLine[code] = { name: c.lineItem?.name || code, total: 0 };
    byLine[code].total += Number(c.value || 0);
  }
  const summaryRows = [["Line Code", "Line Name", "Total"]];
  for (const [code, v] of Object.entries(byLine).sort((a, b) => a[0].localeCompare(b[0]))) {
    summaryRows.push([code, v.name, v.total]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), "By Line");

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

const SUPPORTED_EXPORT_TYPES = new Set([
  "BOARD_PACK",
  "MANAGEMENT_REPORT",
  "FINANCIAL_STATEMENTS",
  "DEPT_EXPENSES",
]);

export class FpaExportService {
  static capabilities() {
    return {
      exportTypes: [
        { code: "BOARD_PACK", enabled: true },
        { code: "MANAGEMENT_REPORT", enabled: true },
        { code: "FINANCIAL_STATEMENTS", enabled: true },
        { code: "DEPT_EXPENSES", enabled: true },
      ],
    };
  }

  static async listJobs(query: any = {}) {
    const where: any = {};
    if (query.modelId) where.modelId = String(query.modelId);
    const limit = Math.min(100, Math.max(1, Number(query.limit || 20)));
    const jobs = await prisma.planningExportJob.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return jobs.map((j) => ({
      id: j.id,
      exportType: j.exportType,
      status: j.status === "COMPLETED" ? "READY" : j.status,
      createdAt: j.createdAt,
      completedAt: j.completedAt,
      modelId: j.modelId,
      versionId: j.versionId,
      downloadUrl: j.fileUrl || downloadPath(j.id),
    }));
  }

  static async createBoardPack(input: any, userId: string, ip?: string) {
    const modelId = input.modelId;
    const versionId = input.versionId;
    if (!modelId) throw new FpaError(400, "VALIDATION", "modelId required");

    const model = await prisma.planningModel.findUnique({
      where: { id: modelId },
      select: { id: true, name: true },
    });
    if (!model) throw new FpaError(404, "NOT_FOUND", "Planning model not found");

    const exportType = String(input.exportType || "BOARD_PACK").toUpperCase();
    if (!SUPPORTED_EXPORT_TYPES.has(exportType)) {
      throw new FpaError(
        400,
        "UNSUPPORTED_EXPORT_TYPE",
        `exportType must be one of ${[...SUPPORTED_EXPORT_TYPES].join(", ")}`
      );
    }

    let cellWhere: any = { modelId, ...(versionId ? { versionId } : {}) };
    if (exportType === "DEPT_EXPENSES") {
      cellWhere = {
        ...cellWhere,
        departmentId: { not: null },
        lineItem: { category: { in: ["EXPENSE", "OPEX"] } },
      };
    } else if (exportType === "FINANCIAL_STATEMENTS") {
      cellWhere = {
        ...cellWhere,
        lineItem: { code: { in: ["REVENUE", "EBITDA", "OPEX", "CLOSING_CASH", "EXPENSE"] } },
      };
    }

    const cells = await prisma.planningCell.findMany({
      where: cellWhere,
      include: {
        lineItem: { select: { code: true, name: true, lineItemType: true, category: true } },
      },
      orderBy: [{ periodDate: "asc" }],
    });

    const fiscalYear = input.meta?.fiscalYear ?? input.period ?? null;
    const buffer = buildBoardPackWorkbook({
      modelName: model.name,
      fiscalYear,
      exportType,
      cells,
      meta: { ...(input.meta || {}), period: input.period || null },
    });

    const payload = {
      exportType,
      modelId,
      versionId: versionId || null,
      generatedAt: new Date().toISOString(),
      cellCount: cells.length,
      format: "xlsx",
      meta: input.meta || {},
    };

    const job = await prisma.planningExportJob.create({
      data: {
        modelId,
        versionId: versionId || null,
        exportType,
        status: "COMPLETED",
        payloadJson: payload,
        createdById: userId,
        completedAt: new Date(),
      },
    });

    const fyLabel = fiscalYear ? `FY${fiscalYear}` : "board-pack";
    const filename = `${fyLabel}-board-pack.xlsx`;
    const storagePath = path.join(exportDir(), `${job.id}.xlsx`);
    fs.writeFileSync(storagePath, buffer);

    const fileUrl = downloadPath(job.id);
    const updated = await prisma.planningExportJob.update({
      where: { id: job.id },
      data: {
        fileUrl,
        payloadJson: { ...payload, filename, storagePath },
      },
    });

    await FpaAuditService.log("EXPORT_BOARD_PACK", userId, { modelId, versionId, ip });
    return {
      ...updated,
      id: job.id,
      downloadUrl: fileUrl,
      boardPackUrl: fileUrl,
      filename,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
  }

  static async createManagementReport(input: any, userId: string, ip?: string) {
    return FpaExportService.createBoardPack({ ...input, exportType: "MANAGEMENT_REPORT" }, userId, ip);
  }

  static async getJob(jobId: string) {
    const job = await prisma.planningExportJob.findUnique({ where: { id: jobId } });
    if (!job) throw new FpaError(404, "NOT_FOUND", "Export job not found");
    return {
      ...job,
      downloadUrl: job.fileUrl || downloadPath(job.id),
      boardPackUrl: job.fileUrl || downloadPath(job.id),
    };
  }

  /**
   * Streams a real .xlsx board pack (never JSON cell dump).
   */
  static async getDownload(jobId: string) {
    const job = await prisma.planningExportJob.findUnique({ where: { id: jobId } });
    if (!job) throw new FpaError(404, "NOT_FOUND", "Export job not found");
    if (job.status !== "COMPLETED") {
      throw new FpaError(409, "EXPORT_NOT_READY", `Export status is ${job.status}`);
    }

    const meta = (job.payloadJson || {}) as any;
    const storagePath =
      meta.storagePath || path.join(exportDir(), `${job.id}.xlsx`);
    let buffer: Buffer | null = null;

    if (storagePath && fs.existsSync(storagePath)) {
      buffer = fs.readFileSync(storagePath);
    }

    // Rebuild on the fly for older jobs that only stored JSON cells
    if (!buffer) {
      const cells = await prisma.planningCell.findMany({
        where: {
          modelId: job.modelId,
          ...(job.versionId ? { versionId: job.versionId } : {}),
        },
        include: {
          lineItem: { select: { code: true, name: true, lineItemType: true } },
        },
        orderBy: [{ periodDate: "asc" }],
      });
      const model = await prisma.planningModel.findUnique({
        where: { id: job.modelId },
        select: { name: true },
      });
      buffer = buildBoardPackWorkbook({
        modelName: model?.name || job.modelId,
        fiscalYear: meta.meta?.fiscalYear ?? meta.fiscalYear ?? null,
        exportType: job.exportType || "BOARD_PACK",
        cells,
        meta: meta.meta || meta,
      });
      try {
        fs.writeFileSync(storagePath, buffer);
      } catch {
        /* non-fatal */
      }
    }

    const fy = meta.meta?.fiscalYear || meta.fiscalYear;
    const filename =
      meta.filename ||
      (fy ? `FY${fy}-board-pack.xlsx` : `${String(job.exportType || "board-pack").toLowerCase()}-${job.id}.xlsx`);

    return {
      job,
      buffer,
      filename,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
  }
}
