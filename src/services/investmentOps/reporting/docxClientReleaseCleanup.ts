import PizZip from "pizzip";

const INSTRUCTION_TEXT_MARKERS = [
  /INSTRUCTION\s*:/i,
  /Delete all blue instruction boxes/i,
  /Replace all yellow highlighted placeholders/i,
  /blue instruction box/i,
  /Blue instruction boxes/i,
  /Delete before issuing the final pack/i,
  /Guidance for preparers\/reviewers/i,
  /EDITOR NOTE\s*:/i,
  /Authoring note\s*:/i,
];

const INTERNAL_SECTION_HEADINGS = [
  /Arcus Audit,\s*Version and Publication Controls/i,
  /Final Release Checklist/i,
];

/** Blue / ice callout fills used for authoring instruction boxes in Arcus packs. */
const INSTRUCTION_FILLS = new Set([
  "D6EAF8",
  "DDEBF7",
  "BDD7EE",
  "9DC3E6",
  "5B9BD5",
  "2E75B6",
  "1E88E5",
  "EEF6FF",
  "E8F4FD",
  "DEEBF7",
  "C5D9F1",
  "B4C6E7",
  "8FAADC",
  "5B9BD5",
  "2F5496",
  "1F4E79",
]);

/** True open of a table element — not tblPr / tblGrid / tblBorders etc. */
function indexOfTblOpen(xml: string, from: number): number {
  let pos = from;
  while (pos < xml.length) {
    const i = xml.indexOf("<w:tbl", pos);
    if (i < 0) return -1;
    const next = xml[i + 6]; // char after "<w:tbl"
    if (next === ">" || next === " " || next === "\n" || next === "\r" || next === "\t" || next === "/") {
      return i;
    }
    pos = i + 6;
  }
  return -1;
}

function indexOfTblClose(xml: string, from: number): number {
  return xml.indexOf("</w:tbl>", from);
}

/**
 * True open of a paragraph — `<w:p>` / `<w:p ...>` but NOT `<w:pPr`, `<w:pStyle`, `<w:pict`, etc.
 */
function indexOfParagraphOpen(xml: string, from: number): number {
  let pos = from;
  while (pos < xml.length) {
    const i = xml.indexOf("<w:p", pos);
    if (i < 0) return -1;
    const next = xml[i + 4]; // char after "<w:p"
    if (next === ">" || next === " " || next === "\n" || next === "\r" || next === "\t" || next === "/") {
      return i;
    }
    pos = i + 4;
  }
  return -1;
}

/** Last paragraph open that starts at or before `at`. */
function lastParagraphOpenBefore(xml: string, at: number): number {
  let found = -1;
  let pos = 0;
  while (pos <= at) {
    const i = indexOfParagraphOpen(xml, pos);
    if (i < 0 || i > at) break;
    found = i;
    pos = i + 4;
  }
  return found;
}

export type XmlRange = { start: number; end: number };

/** Top-level table ranges with correct nesting. */
export function findTableRanges(xml: string): XmlRange[] {
  const ranges: XmlRange[] = [];
  let i = 0;
  while (true) {
    const start = indexOfTblOpen(xml, i);
    if (start < 0) break;
    let depth = 0;
    let pos = start;
    let end = -1;
    while (pos < xml.length) {
      const open = indexOfTblOpen(xml, pos);
      const close = indexOfTblClose(xml, pos);
      if (close < 0) break;
      if (open >= 0 && open <= close) {
        depth += 1;
        pos = open + 6;
        continue;
      }
      depth -= 1;
      pos = close + "</w:tbl>".length;
      if (depth === 0) {
        end = pos;
        break;
      }
    }
    if (end < 0) break;
    ranges.push({ start, end });
    i = end;
  }
  return ranges;
}

function plainTextFromXml(fragment: string): string {
  return [...fragment.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(" ");
}

function hasInstructionFill(fragment: string): boolean {
  for (const m of fragment.matchAll(/w:fill="([0-9A-Fa-f]{6})"/gi)) {
    if (INSTRUCTION_FILLS.has(m[1].toUpperCase())) return true;
  }
  if (/w:color\s+w:val="1E88E5"/i.test(fragment) && /INSTRUCTION/i.test(plainTextFromXml(fragment))) {
    return true;
  }
  return false;
}

function isInstructionTable(fragment: string): boolean {
  const plain = plainTextFromXml(fragment);
  if (INSTRUCTION_TEXT_MARKERS.some((re) => re.test(plain))) return true;
  if (hasInstructionFill(fragment) && /INSTRUCTION/i.test(plain)) return true;
  return false;
}

function tagBalanceOk(xml: string): boolean {
  const open = (xml.match(/<[A-Za-z_][\w:.-]*(?:\s[^>]*)?>/g) || []).filter(
    (t) => !t.startsWith("<?") && !t.startsWith("<!") && !t.endsWith("/>")
  ).length;
  const close = (xml.match(/<\/[A-Za-z_][\w:.-]*>/g) || []).length;
  return open === close;
}

/** Remove yellow placeholder highlighting from OOXML run properties. */
function stripYellowHighlights(xml: string): string {
  return xml
    .replace(/<w:highlight\b[^/]*w:val="yellow"[^/]*\/>/gi, "")
    .replace(/<w:highlight\b[^>]*>\s*<\/w:highlight>/gi, "")
    .replace(/w:fill="FFF2CC"/gi, 'w:fill="FFFFFF"')
    .replace(/w:fill="FFFF00"/gi, 'w:fill="FFFFFF"');
}

/** Drop instruction callout tables (nested-aware). */
function removeInstructionTables(xml: string): string {
  const ranges = findTableRanges(xml);
  let out = xml;
  for (let i = ranges.length - 1; i >= 0; i--) {
    const { start, end } = ranges[i];
    const fragment = out.slice(start, end);
    if (isInstructionTable(fragment)) {
      out = out.slice(0, start) + out.slice(end);
    }
  }
  return out;
}

/**
 * Remove internal-only release sections (heading paragraph + following tables).
 * Uses precise `<w:p` matching so we never cut mid-`<w:pPr>`.
 */
function removeInternalSections(xml: string): string {
  let out = xml;
  for (const headingRe of INTERNAL_SECTION_HEADINGS) {
    let guard = 0;
    while (guard++ < 20) {
      const textMatch = out.match(headingRe);
      if (!textMatch || textMatch.index == null) break;
      const textAt = textMatch.index;
      const start = lastParagraphOpenBefore(out, textAt);
      if (start < 0) break;
      const paraEnd = out.indexOf("</w:p>", textAt);
      if (paraEnd < 0) break;
      let end = paraEnd + "</w:p>".length;
      for (let n = 0; n < 12; n++) {
        const ws = out.slice(end).match(/^\s*/)?.[0] || "";
        const afterWs = end + ws.length;
        if (indexOfTblOpen(out, afterWs) !== afterWs) break;
        const ranges = findTableRanges(out.slice(afterWs));
        if (!ranges.length || ranges[0].start !== 0) break;
        end = afterWs + ranges[0].end;
      }
      const candidate = out.slice(0, start) + out.slice(end);
      if (!tagBalanceOk(candidate)) {
        // Don't corrupt — stop trying this heading.
        break;
      }
      out = candidate;
    }
  }
  return out;
}

/** Drop short authoring callout paragraphs (INSTRUCTION / EDITOR NOTE banners). */
function removeOrphanInstructionParagraphs(xml: string): string {
  return xml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (para) => {
    // Guard: only real paragraph opens (regex already anchors on <w:p\b)
    const plain = plainTextFromXml(para).trim();
    if (!plain) return para;
    if (INSTRUCTION_TEXT_MARKERS.some((re) => re.test(plain)) && plain.length < 400) {
      return "";
    }
    return para;
  });
}

function leftoverAuthoringMarkers(xml: string): string[] {
  const plain = plainTextFromXml(xml);
  const leftover: string[] = [];
  if (/INSTRUCTION\s*:/i.test(plain)) leftover.push("INSTRUCTION");
  if (/Blue instruction boxes/i.test(plain)) leftover.push("Blue instruction boxes");
  if (/EDITOR NOTE\s*:/i.test(plain)) leftover.push("EDITOR NOTE");
  if (/Delete all blue instruction boxes/i.test(plain)) leftover.push("Delete all blue…");
  if (/Replace all yellow highlighted placeholders/i.test(plain)) leftover.push("Replace all yellow…");
  if (/Arcus Audit,\s*Version and Publication Controls/i.test(plain)) leftover.push("Arcus Audit section");
  if (/Final Release Checklist/i.test(plain)) leftover.push("Final Release Checklist");
  return leftover;
}

function cleanDocumentXml(xml: string): string {
  let out = removeInstructionTables(xml);
  if (!tagBalanceOk(out)) {
    throw new Error("Instruction-table removal broke OOXML balance");
  }
  const afterOrphans = removeOrphanInstructionParagraphs(out);
  if (tagBalanceOk(afterOrphans)) out = afterOrphans;

  const afterSections = removeInternalSections(out);
  if (tagBalanceOk(afterSections)) out = afterSections;

  out = stripYellowHighlights(out);
  if (!tagBalanceOk(out)) {
    throw new Error("Yellow-strip broke OOXML balance");
  }

  const leftover = leftoverAuthoringMarkers(out);
  if (leftover.length) {
    throw new Error(`Authoring markers still present: ${leftover.join(", ")}`);
  }
  return out;
}

/**
 * Client-release cleanup for Arcus DOCX templates:
 * 1. Yellow placeholders are already merged by Docxtemplater — strip yellow highlight chrome
 * 2. Delete blue INSTRUCTION boxes / tables (authoring only)
 * 3. Remove internal audit / final release checklist sections
 */
export function sanitizeDocxForClientRelease(docxBuffer: Buffer): Buffer {
  const zip = new PizZip(docxBuffer);
  for (const name of Object.keys(zip.files)) {
    if (!/^word\/(document|header\d*|footer\d*)\.xml$/i.test(name)) continue;
    const file = zip.file(name);
    if (!file || file.dir) continue;
    const original = file.asText();
    try {
      zip.file(name, cleanDocumentXml(original));
    } catch {
      // Guaranteed path: always remove instruction tables + yellow even if audit section is sticky.
      let soft = removeInstructionTables(original);
      if (!tagBalanceOk(soft)) soft = original;
      const orphans = removeOrphanInstructionParagraphs(soft);
      if (tagBalanceOk(orphans)) soft = orphans;
      const sections = removeInternalSections(soft);
      if (tagBalanceOk(sections)) soft = sections;
      soft = stripYellowHighlights(soft);
      zip.file(name, tagBalanceOk(soft) ? soft : stripYellowHighlights(original));
    }
  }
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;
}

/** Test helper — count remaining instruction markers in a buffer. */
export function countInstructionMarkers(docxBuffer: Buffer): number {
  const zip = new PizZip(docxBuffer);
  let n = 0;
  for (const name of Object.keys(zip.files)) {
    if (!/^word\/(document|header\d*|footer\d*)\.xml$/i.test(name)) continue;
    const file = zip.file(name);
    if (!file || file.dir) continue;
    const plain = plainTextFromXml(file.asText());
    for (const re of INSTRUCTION_TEXT_MARKERS) {
      const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
      const global = new RegExp(re.source, flags);
      n += (plain.match(global) || []).length;
    }
  }
  return n;
}
