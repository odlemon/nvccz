// @ts-nocheck
import * as XLSX from "xlsx";
import PDFDocument from "pdfkit";

/**
 * SRD §37: the three export formats of a report. Each is a real file of its kind: the CSV is RFC 4180 text with a byte-order mark
 * (so Excel reads accents), the XLSX is a genuine workbook written by SheetJS (numbers stay numbers, dates stay dates, and a second
 * sheet carries the totals and the exchange rates used), and the PDF is a paged, landscape A4 table drawn with pdfkit.
 */
type Report = { name: string; description?: string; columns: Array<{ key: string; label: string; type?: string }>; filters: Record<string, string>; rows: Array<Record<string, any>>; summary: any; generatedAt: string };

const filterText = (f: Record<string, string>) => Object.entries(f).map(([k, v]) => `${k}: ${v}`).join("; ") || "none";
const money2 = (n: any) => (n == null || n === "" ? "" : Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

function cellText(col: { type?: string }, v: any): string {
  if (v == null) return "";
  if (col.type === "money") return money2(v);
  if (col.type === "datetime") return String(v).replace("T", " ").slice(0, 19);
  if (col.type === "date") return String(v).slice(0, 10);
  return String(v);
}

export function toCsv(r: Report): Buffer {
  const esc = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [r.columns.map((c) => esc(c.label)).join(",")];
  for (const row of r.rows) {
    lines.push(r.columns.map((c) => esc(c.type === "money" || c.type === "number" ? (row[c.key] == null ? "" : String(row[c.key])) : cellText(c, row[c.key]))).join(","));
  }
  return Buffer.from("﻿" + lines.join("\r\n") + "\r\n", "utf8");
}

/** The totals as rows of text: per currency, the converted figure with the rates used, and what could not be converted. */
export function totalsLines(r: Report): string[][] {
  const out: string[][] = [];
  const m = r.summary?.money;
  if (!m) return out;
  out.push(["Totals by currency (never added across currencies)"]);
  for (const [cur, v] of Object.entries(m.byCurrency ?? {})) out.push([cur, money2((v as any).amount), `${(v as any).count} record(s)`]);
  for (const [k, per] of Object.entries(r.summary?.otherMoney ?? {})) {
    const label = r.columns.find((c) => c.key === k)?.label ?? k;
    for (const [cur, amt] of Object.entries(per as any)) out.push([`${label}, ${cur}`, money2(amt)]);
  }
  if (m.mixed) {
    out.push([`Converted into ${m.converted.currency}`, money2(m.converted.total)]);
    for (const x of m.converted.rates) out.push([`Rate ${x.from} → ${x.to}`, String(Number(x.rate).toFixed(6)), `dated ${x.date}`, `source ${x.source}`, x.method === "CROSS" ? `via ${x.via}` : x.method.toLowerCase()]);
    for (const [cur, v] of Object.entries(m.unconverted ?? {})) out.push([`Not converted: ${cur}`, money2((v as any).amount), "no exchange rate available; left out of the converted total"]);
  }
  return out;
}

export function toXlsx(r: Report): Buffer {
  const wb = XLSX.utils.book_new();
  const head = [[r.name], [r.description ?? ""], [`Generated ${r.generatedAt.replace("T", " ").slice(0, 19)} UTC`], [`Filters: ${filterText(r.filters)}`], []];
  const table = [r.columns.map((c) => c.label), ...r.rows.map((row) => r.columns.map((c) => {
    const v = row[c.key];
    if (v == null) return null;
    if (c.type === "money" || c.type === "number" || c.type === "percent") return Number(v);
    if (c.type === "date" || c.type === "datetime") { const d = new Date(v); return Number.isNaN(d.getTime()) ? String(v) : d; }
    return v;
  }))];
  const ws = XLSX.utils.aoa_to_sheet([...head, ...table], { cellDates: true });
  const widths = r.columns.map((c, i) => ({ wch: Math.min(48, Math.max(c.label.length + 2, ...r.rows.slice(0, 200).map((row) => cellText(c, row[c.key]).length + 2))) }));
  ws["!cols"] = widths;
  // money columns keep two decimals and dates their format
  const startRow = head.length; // 0-based row of the header
  r.rows.forEach((_, ri) => r.columns.forEach((c, ci) => {
    const cell = ws[XLSX.utils.encode_cell({ r: startRow + 1 + ri, c: ci })];
    if (!cell) return;
    if (c.type === "money") cell.z = "#,##0.00";
    else if (c.type === "date") cell.z = "yyyy-mm-dd";
    else if (c.type === "datetime") cell.z = "yyyy-mm-dd hh:mm";
  }));
  XLSX.utils.book_append_sheet(wb, ws, "Report");
  const totals = totalsLines(r);
  if (totals.length) {
    const wt = XLSX.utils.aoa_to_sheet(totals);
    wt["!cols"] = [{ wch: 44 }, { wch: 18 }, { wch: 28 }, { wch: 18 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wt, "Totals");
  }
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx", compression: true }));
}

export function toPdf(r: Report): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 30, bufferPages: true, info: { Title: r.name } });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const W = doc.page.width - 60;
    doc.font("Helvetica-Bold").fontSize(15).text(r.name);
    doc.font("Helvetica").fontSize(8.5).fillColor("#555").text(r.description ?? "").text(`Generated ${r.generatedAt.replace("T", " ").slice(0, 19)} UTC · ${r.rows.length} row(s) · Filters: ${filterText(r.filters)}`).fillColor("#000").moveDown(0.6);

    // column widths from the label and the longest of the first rows, within the page
    const want = r.columns.map((c) => Math.min(38, Math.max(c.label.length, ...r.rows.slice(0, 60).map((row) => cellText(c, row[c.key]).length), 4)));
    const total = want.reduce((a, b) => a + b, 0);
    const widths = want.map((w) => (w / total) * W);
    const rowH = 15;
    const drawHead = () => {
      let x = 30;
      const y = doc.y;
      doc.rect(30, y, W, rowH + 2).fill("#eef0f7").fillColor("#000");
      doc.font("Helvetica-Bold").fontSize(7.5);
      r.columns.forEach((c, i) => { doc.text(c.label, x + 3, y + 4, { width: widths[i] - 6, height: rowH, lineBreak: false, ellipsis: true, align: ["money", "number"].includes(c.type ?? "") ? "right" : "left" }); x += widths[i]; });
      doc.y = y + rowH + 2;
    };
    drawHead();
    doc.font("Helvetica").fontSize(7.5);
    r.rows.forEach((row, ri) => {
      if (doc.y + rowH > doc.page.height - 40) { doc.addPage(); drawHead(); doc.font("Helvetica").fontSize(7.5); }
      const y = doc.y;
      if (ri % 2) doc.rect(30, y, W, rowH).fill("#fafafc").fillColor("#000");
      let x = 30;
      r.columns.forEach((c, i) => { doc.text(cellText(c, row[c.key]), x + 3, y + 4, { width: widths[i] - 6, height: rowH, lineBreak: false, ellipsis: true, align: ["money", "number"].includes(c.type ?? "") ? "right" : "left" }); x += widths[i]; });
      doc.y = y + rowH;
    });
    if (!r.rows.length) doc.moveDown().font("Helvetica-Oblique").text("No records match these filters.");
    const totals = totalsLines(r);
    if (totals.length) {
      if (doc.y + 30 + totals.length * 12 > doc.page.height - 40) doc.addPage();
      doc.moveDown(1.2).font("Helvetica-Bold").fontSize(9).text(totals[0][0]);
      doc.font("Helvetica").fontSize(8);
      totals.slice(1).forEach((line) => doc.text(line.join("   ")));
    }
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      doc.font("Helvetica").fontSize(7).fillColor("#777").text(`${r.name} · page ${i + 1} of ${pages.count}`, 30, doc.page.height - 22, { width: W, align: "right", lineBreak: false });
    }
    doc.end();
  });
}
