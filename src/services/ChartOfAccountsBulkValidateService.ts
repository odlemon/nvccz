import { Readable } from "stream";
import csv from "csv-parser";
import { prisma } from "../utils/database";
import {
  CHART_VALID_ACCOUNT_TYPES,
  CHART_VALID_FINANCIAL_STATEMENTS,
  validateChartAccountNumberForType,
} from "../utils/chartOfAccountsNumberRange";

const MAX_ROWS = 5000;

const VALID_TYPE_SET = new Set<string>(CHART_VALID_ACCOUNT_TYPES);
const VALID_FS_SET = new Set<string>(CHART_VALID_FINANCIAL_STATEMENTS);

export type ChartBulkRowError = {
  row: number;
  accountNo?: string;
  messages: string[];
};

export type ChartBulkValidateResult = {
  ok: boolean;
  totalDataRows: number;
  headerRowLine: number;
  rowErrors: ChartBulkRowError[];
  reportLines: string[];
};

export type ChartBulkCreatedAccount = {
  id: string;
  accountNo: string;
  accountName: string;
};

export type ChartBulkImportResult =
  | ChartBulkValidateResult
  | {
      ok: true;
      totalDataRows: number;
      headerRowLine: number;
      rowErrors: [];
      reportLines: [];
      createdCount: number;
      created: ChartBulkCreatedAccount[];
    };

function normalizeHeaderKey(k: string): string {
  let s = String(k == null ? "" : k).trim();
  if (s.charCodeAt(0) === 0xfeff) {
    s = s.slice(1);
  }
  return s.toLowerCase().replace(/\s+/g, "");
}

/** Map flexible CSV headers to canonical field names */
function canonicalField(norm: string): string | null {
  const aliases: Record<string, string> = {
    accountno: "accountNo",
    accountnumber: "accountNo",
    code: "accountNo",
    glcode: "accountNo",
    accountname: "accountName",
    name: "accountName",
    description: "accountName",
    accounttype: "accountType",
    type: "accountType",
    financialstatement: "financialStatement",
    statement: "financialStatement",
    fs: "financialStatement",
    notes: "notes",
    parentid: "parentId",
    parentaccountno: "parentAccountNo",
    parentcode: "parentAccountNo",
    isactive: "isActive",
    active: "isActive",
  };
  return aliases[norm] ?? null;
}

function normalizeRow(raw: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const canon = canonicalField(normalizeHeaderKey(k));
    if (canon) {
      out[canon] = v != null ? String(v).trim() : "";
    }
  }
  return out;
}

export async function parseChartOfAccountsCsvBuffer(buffer: Buffer): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    const rows: Record<string, string>[] = [];
    Readable.from(buffer)
      .pipe(csv({ mapHeaders: ({ header }) => header }))
      .on("data", (raw: Record<string, string>) => {
        rows.push(normalizeRow(raw));
      })
      .on("end", () => resolve(rows))
      .on("error", reject);
  });
}

function parseIsActive(raw: string | undefined): boolean {
  if (raw == null || raw === "") {
    return true;
  }
  const v = String(raw).trim().toLowerCase();
  if (["false", "0", "no"].includes(v)) {
    return false;
  }
  return true;
}

/**
 * Validate parsed rows (shared by validate-only and import).
 * Row numbers: line 1 = header, line 2 = first data row (Excel-style).
 */
export async function validateNormalizedChartRows(
  rawRows: Record<string, string>[]
): Promise<ChartBulkValidateResult> {
  if (rawRows.length === 0) {
    return {
      ok: false,
      totalDataRows: 0,
      headerRowLine: 1,
      rowErrors: [{ row: 1, messages: ["CSV has no data rows (empty file or missing header row)."] }],
      reportLines: ["Row 1: CSV has no data rows (empty file or missing header row)."],
    };
  }

  if (rawRows.length > MAX_ROWS) {
    return {
      ok: false,
      totalDataRows: rawRows.length,
      headerRowLine: 1,
      rowErrors: [
        {
          row: 1,
          messages: [`Too many rows (${rawRows.length}). Maximum allowed is ${MAX_ROWS}.`],
        },
      ],
      reportLines: [`Row 1: Too many rows (${rawRows.length}). Maximum allowed is ${MAX_ROWS}.`],
    };
  }

  const rowErrors: ChartBulkRowError[] = [];
  const seenAccountNo = new Map<string, number>();

  const accountNosInFile = new Set<string>();
  for (let i = 0; i < rawRows.length; i++) {
    const r = rawRows[i];
    const no = (r.accountNo ?? "").trim();
    if (no) {
      accountNosInFile.add(no);
    }
  }

  const existingInDb = await prisma.chartOfAccounts.findMany({
    where: { accountNo: { in: [...accountNosInFile] } },
    select: { accountNo: true },
  });
  const existingSet = new Set(existingInDb.map((x) => x.accountNo));

  const parentNos = new Set<string>();
  for (const r of rawRows) {
    const p = (r.parentAccountNo ?? "").trim();
    if (p) {
      parentNos.add(p);
    }
  }
  const parentRowsInDb = await prisma.chartOfAccounts.findMany({
    where: { accountNo: { in: [...parentNos] } },
    select: { accountNo: true },
  });
  const parentExistsByNo = new Set(parentRowsInDb.map((x) => x.accountNo));

  const parentIdsInFile = new Set<string>();
  for (const r of rawRows) {
    const pid = (r.parentId ?? "").trim();
    if (pid) {
      parentIdsInFile.add(pid);
    }
  }
  const parentByIdRows =
    parentIdsInFile.size > 0
      ? await prisma.chartOfAccounts.findMany({
          where: { id: { in: [...parentIdsInFile] } },
          select: { id: true },
        })
      : [];
  const parentIdExists = new Set(parentByIdRows.map((x) => x.id));

  for (let i = 0; i < rawRows.length; i++) {
    const lineNo = i + 2;
    const r = rawRows[i];
    const messages: string[] = [];

    const accountNo = (r.accountNo ?? "").trim();
    const accountName = (r.accountName ?? "").trim();
    const accountType = (r.accountType ?? "").trim();
    const financialStatement = (r.financialStatement ?? "").trim();
    const parentAccountNo = (r.parentAccountNo ?? "").trim();
    const parentId = (r.parentId ?? "").trim();

    if (!accountNo) {
      messages.push("accountNo is required.");
    }
    if (!accountName) {
      messages.push("accountName is required.");
    }
    if (!accountType) {
      messages.push("accountType is required.");
    }
    if (!financialStatement) {
      messages.push("financialStatement is required.");
    }

    if (accountType && !VALID_TYPE_SET.has(accountType)) {
      messages.push(
        `Invalid accountType "${accountType}". Must be one of: ${CHART_VALID_ACCOUNT_TYPES.join(", ")}.`
      );
    }

    if (financialStatement && !VALID_FS_SET.has(financialStatement)) {
      messages.push(
        `Invalid financialStatement "${financialStatement}". Must be one of: ${CHART_VALID_FINANCIAL_STATEMENTS.join(", ")}.`
      );
    }

    if (accountNo && accountType) {
      const rangeCheck = validateChartAccountNumberForType(accountNo, accountType);
      if (!rangeCheck.valid && rangeCheck.message) {
        messages.push(rangeCheck.message);
      }
    }

    if (accountNo) {
      const first = seenAccountNo.get(accountNo);
      if (first !== undefined) {
        messages.push(`Duplicate accountNo "${accountNo}" in file (also on row ${first}).`);
      } else {
        seenAccountNo.set(accountNo, lineNo);
      }
      if (existingSet.has(accountNo)) {
        messages.push(`Account number "${accountNo}" already exists in the chart.`);
      }
    }

    if (
      parentAccountNo &&
      !parentExistsByNo.has(parentAccountNo) &&
      !accountNosInFile.has(parentAccountNo)
    ) {
      messages.push(
        `Parent account "${parentAccountNo}" was not found in the chart or as an accountNo elsewhere in this file.`
      );
    }

    if (parentId && !parentAccountNo && !parentIdExists.has(parentId)) {
      messages.push(`parentId "${parentId}" was not found.`);
    }

    if (r.isActive !== undefined && r.isActive !== "") {
      const v = String(r.isActive).trim().toLowerCase();
      if (!["true", "false", "1", "0", "yes", "no"].includes(v)) {
        messages.push(`isActive must be true/false (got "${r.isActive}").`);
      }
    }

    if (messages.length > 0) {
      rowErrors.push({ row: lineNo, accountNo: accountNo || undefined, messages });
    }
  }

  const reportLines = rowErrors.flatMap((e) => e.messages.map((m) => `Row ${e.row}: ${m}`));

  return {
    ok: rowErrors.length === 0,
    totalDataRows: rawRows.length,
    headerRowLine: 1,
    rowErrors,
    reportLines,
  };
}

export async function validateChartOfAccountsCsvBuffer(buffer: Buffer): Promise<ChartBulkValidateResult> {
  const rawRows = await parseChartOfAccountsCsvBuffer(buffer);
  return validateNormalizedChartRows(rawRows);
}

/**
 * Validate CSV then create all accounts in one transaction (parents linked in a second pass).
 */
export async function bulkImportChartOfAccountsFromBuffer(buffer: Buffer): Promise<ChartBulkImportResult> {
  const rawRows = await parseChartOfAccountsCsvBuffer(buffer);
  const validation = await validateNormalizedChartRows(rawRows);
  if (!validation.ok) {
    return validation;
  }

  const created = await prisma.$transaction(
    async (tx) => {
      const accountNoToId = new Map<string, string>();
      const ordered: ChartBulkCreatedAccount[] = [];

      for (const r of rawRows) {
        const accountNo = (r.accountNo ?? "").trim();
        const accountName = (r.accountName ?? "").trim();
        const accountType = (r.accountType ?? "").trim();
        const financialStatement = (r.financialStatement ?? "").trim();
        const notes = (r.notes ?? "").trim() || null;

        const row = await tx.chartOfAccounts.create({
          data: {
            accountNo,
            accountName,
            accountType,
            financialStatement,
            notes,
            parentId: null,
            isActive: parseIsActive(r.isActive),
          },
        });
        accountNoToId.set(accountNo, row.id);
        ordered.push({ id: row.id, accountNo, accountName });
      }

      for (let i = 0; i < rawRows.length; i++) {
        const r = rawRows[i];
        const accountNo = (r.accountNo ?? "").trim();
        const id = accountNoToId.get(accountNo);
        if (!id) {
          continue;
        }
        const parentAccountNo = (r.parentAccountNo ?? "").trim();
        const parentIdCsv = (r.parentId ?? "").trim();

        let parentIdToSet: string | null = null;
        if (parentAccountNo) {
          const fromBatch = accountNoToId.get(parentAccountNo);
          if (fromBatch) {
            parentIdToSet = fromBatch;
          } else {
            const p = await tx.chartOfAccounts.findUnique({
              where: { accountNo: parentAccountNo },
              select: { id: true },
            });
            if (p) {
              parentIdToSet = p.id;
            }
          }
        } else if (parentIdCsv) {
          parentIdToSet = parentIdCsv;
        }

        if (parentIdToSet) {
          await tx.chartOfAccounts.update({
            where: { id },
            data: { parentId: parentIdToSet },
          });
        }
      }

      return ordered;
    },
    { maxWait: 60000, timeout: 120000 }
  );

  return {
    ok: true,
    totalDataRows: rawRows.length,
    headerRowLine: 1,
    rowErrors: [],
    reportLines: [],
    createdCount: created.length,
    created,
  };
}
