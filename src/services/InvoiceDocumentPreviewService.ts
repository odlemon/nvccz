//@ts-nocheck
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { logger } from "../utils/logger";

const run = promisify(execFile);
const MAX_PAGES = 3;
const DPI = 110;

type Word = { page: number; line: string; text: string; left: number; top: number; width: number; height: number };
export type InvoicePreviewPage = { image: string; width: number; height: number };
export type InvoiceHighlight = { field: string; label: string; page: number; left: number; top: number; width: number; height: number };
export type InvoicePreview = { pages: InvoicePreviewPage[]; highlights: InvoiceHighlight[]; note: string | null };
type Rendered = { pages: InvoicePreviewPage[]; words: Word[]; note: string | null };

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9.]/g, "");

/**
 * SRD §7 Invoice Processing Screen: the uploaded invoice in a viewer, with the data points the reading extracted
 * highlighted on it. A PDF is rendered page by page (up to three), a scan or photo is shown as it was uploaded, and OCR
 * gives the position of every word. Each value the reading returned is then looked for among those words; a value that
 * is not found on the page is not highlighted, and nothing is placed by guess.
 *
 * Rendering starts alongside the reading (pagesQuietly) and is finished with the values it returns (finish).
 */
export class InvoiceDocumentPreviewService {
  static async pagesQuietly(buffer: Buffer, mimeType: string): Promise<Rendered | null> {
    try {
      return await this.pages(buffer, mimeType);
    } catch (e: any) {
      logger.warn("Invoice document preview failed", { error: String(e?.message || e) });
      return null;
    }
  }

  static finish(rendered: Rendered | null, payload: any): InvoicePreview | null {
    if (!rendered) return null;
    return { pages: rendered.pages, highlights: rendered.pages.length ? this.locate(payload || {}, rendered.words) : [], note: rendered.note };
  }

  static async pages(buffer: Buffer, mimeType: string): Promise<Rendered> {
    const isPdf = buffer.subarray(0, 5).toString("latin1") === "%PDF-";
    const isTiff = /tiff/i.test(mimeType || "") || ["49492a00", "4d4d002a"].includes(buffer.subarray(0, 4).toString("hex"));
    if (isTiff) {
      return { pages: [], words: [], note: "A TIFF cannot be shown in the browser. Open the file itself to compare the fields." };
    }
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "invoice-preview-"));
    try {
      let files: string[];
      let displayMime = "image/png";
      if (isPdf) {
        const pdf = path.join(dir, "invoice.pdf");
        await fs.writeFile(pdf, buffer);
        await run("pdftoppm", ["-r", String(DPI), "-png", "-f", "1", "-l", String(MAX_PAGES), pdf, path.join(dir, "page")], { timeout: 60000 });
        files = (await fs.readdir(dir))
          .filter((f) => /^page-\d+\.png$/.test(f))
          .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
          .map((f) => path.join(dir, f));
      } else {
        const image = path.join(dir, "invoice-image");
        await fs.writeFile(image, buffer);
        files = [image];
        displayMime = /^image\//.test(mimeType || "") ? mimeType : "image/png";
      }

      const pages: InvoicePreviewPage[] = [];
      const words: Word[] = [];
      for (const [index, file] of files.entries()) {
        const { stdout } = await run(
          "tesseract",
          [file, "stdout", "-l", process.env.VENDOR_INVOICE_OCR_LANG || "eng", "--psm", "4", "tsv"],
          { timeout: 90000, maxBuffer: 20 * 1024 * 1024 }
        );
        let width = 0;
        let height = 0;
        for (const row of String(stdout || "").split("\n").slice(1)) {
          const c = row.split("\t");
          if (c.length < 12) continue;
          const [level, , block, par, line, , left, top, w, h, , ...rest] = c;
          if (level === "1") {
            width = Number(w);
            height = Number(h);
            continue;
          }
          const text = rest.join("\t").trim();
          if (level !== "5" || !text) continue;
          words.push({ page: index, line: `${index}:${block}:${par}:${line}`, text, left: Number(left), top: Number(top), width: Number(w), height: Number(h) });
        }
        pages.push({ image: `data:${displayMime};base64,${(await fs.readFile(file)).toString("base64")}`, width, height });
      }
      return { pages, words, note: null };
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /** Finds each extracted value among the OCR words and returns one box per value found. */
  static locate(p: any, words: Word[]): InvoiceHighlight[] {
    const out: InvoiceHighlight[] = [];
    const used = new Set<Word>();
    const add = (field: string, label: string, seq: Word[] | null) => {
      if (!seq || !seq.length) return;
      seq.forEach((w) => used.add(w));
      const left = Math.min(...seq.map((w) => w.left));
      const top = Math.min(...seq.map((w) => w.top));
      const right = Math.max(...seq.map((w) => w.left + w.width));
      const bottom = Math.max(...seq.map((w) => w.top + w.height));
      out.push({ field, label, page: seq[0].page, left, top, width: right - left, height: bottom - top });
    };
    /** Consecutive words on one line whose joined text equals one of the targets (or, with prefix, starts it). */
    const phrase = (targets: unknown[], { last = false, prefix = false } = {}): Word[] | null => {
      const wanted = targets.map(norm).filter((t) => t.length >= 2);
      if (!wanted.length) return null;
      const found: Word[][] = [];
      for (let i = 0; i < words.length; i++) {
        if (used.has(words[i])) continue;
        let joined = "";
        const seq: Word[] = [];
        for (let j = i; j < words.length && j < i + 14; j++) {
          if (words[j].line !== words[i].line || used.has(words[j])) break;
          joined += norm(words[j].text);
          seq.push(words[j]);
          if (wanted.some((t) => joined === t || (prefix && joined.length >= Math.min(t.length, 18) && t.startsWith(joined)))) {
            found.push([...seq]);
            break;
          }
          if (!wanted.some((t) => t.startsWith(joined))) break;
        }
      }
      if (!found.length) return null;
      return last ? found[found.length - 1] : found[0];
    };
    const amounts = (v: unknown) => {
      const n = Number(v);
      if (v == null || !Number.isFinite(n) || n === 0) return [];
      return [n.toFixed(2), String(n)];
    };
    const dates = (v: unknown) => {
      const m = String(v ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (!m) return [];
      const [, y, mo, d] = m;
      const month = MONTHS[Number(mo) - 1];
      const di = String(Number(d));
      const mi = String(Number(mo));
      return [
        `${y}-${mo}-${d}`, `${d}/${mo}/${y}`, `${di}/${mi}/${y}`, `${mo}/${d}/${y}`, `${d}.${mo}.${y}`, `${d}-${mo}-${y}`,
        `${di} ${month} ${y}`, `${d} ${month} ${y}`, `${di} ${month.slice(0, 3)} ${y}`, `${d} ${month.slice(0, 3)} ${y}`,
        `${month} ${di}, ${y}`, `${month.slice(0, 3)} ${di}, ${y}`,
      ];
    };

    add("supplierName", "Supplier", phrase([p.supplierName]));
    add("invoiceNumber", "Invoice number", phrase([p.invoiceNumber]));
    add("invoiceDate", "Invoice date", phrase(dates(p.invoiceDate)));
    add("dueDate", "Due date", phrase(dates(p.dueDate)));
    add("purchaseOrderReference", "Purchase order", phrase([p.purchaseOrderReference]));
    add("supplierTaxNumber", "Tax number", phrase([p.supplierTaxNumber]));
    for (const [i, line] of (Array.isArray(p.lines) ? p.lines : []).entries()) {
      const description = phrase([line?.description], { prefix: true });
      add(`line${i + 1}`, `Line ${i + 1}`, description);
      const lineKey = description?.[0]?.line;
      const total = lineKey ? words.filter((w) => w.line === lineKey && !used.has(w) && amounts(line?.lineTotal).includes(norm(w.text))) : [];
      add(`line${i + 1}Total`, `Line ${i + 1} total`, total.length ? [total[total.length - 1]] : null);
    }
    // Totals sit at the foot of the invoice: the last occurrence on the page, not a line figure above it.
    add("totalAmount", "Total", phrase(amounts(p.totalAmount), { last: true }));
    add("taxAmount", "VAT", phrase(amounts(p.taxAmount), { last: true }));
    add("subtotal", "Subtotal", phrase(amounts(p.subtotal), { last: true }));
    return out;
  }
}
