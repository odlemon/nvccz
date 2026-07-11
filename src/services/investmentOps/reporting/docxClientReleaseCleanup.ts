import PizZip from "pizzip";

const INSTRUCTION_MARKERS = [
  /INSTRUCTION\s*:/i,
  /Delete all blue instruction boxes/i,
  /Replace all yellow highlighted placeholders/i,
];

const INTERNAL_SECTION_HEADINGS = [
  /Arcus Audit,\s*Version and Publication Controls/i,
  /Final Release Checklist/i,
];

/** Remove yellow placeholder highlighting from OOXML run properties. */
function stripYellowHighlights(xml: string): string {
  return xml
    .replace(/<w:highlight\b[^/]*w:val="yellow"[^/]*\/>/gi, "")
    .replace(/<w:highlight\b[^>]*>\s*<\/w:highlight>/gi, "")
    .replace(/w:fill="FFF2CC"/gi, 'w:fill="FFFFFF"');
}

/** Drop whole tables that are authoring instruction callouts. */
function removeInstructionTables(xml: string): string {
  return xml.replace(/<w:tbl\b[\s\S]*?<\/w:tbl>/g, (table) => {
    return INSTRUCTION_MARKERS.some((re) => re.test(table)) ? "" : table;
  });
}

/**
 * Remove heading + following sibling tables for internal-only release sections.
 */
function removeInternalSections(xml: string): string {
  let out = xml;
  for (const headingRe of INTERNAL_SECTION_HEADINGS) {
    // Re-scan after each removal — document shrinks as we go.
    while (true) {
      const textMatch = out.match(headingRe);
      if (!textMatch || textMatch.index == null) break;
      const textAt = textMatch.index;
      const start = out.lastIndexOf("<w:p", textAt);
      if (start < 0) break;
      const paraEnd = out.indexOf("</w:p>", textAt);
      if (paraEnd < 0) break;
      let end = paraEnd + "</w:p>".length;
      while (true) {
        const rest = out.slice(end);
        const ws = rest.match(/^\s*/)?.[0] || "";
        end += ws.length;
        const next = out.slice(end);
        if (!next.startsWith("<w:tbl")) break;
        const tbl = next.match(/^<w:tbl\b[\s\S]*?<\/w:tbl>/);
        if (!tbl) break;
        end += tbl[0].length;
      }
      out = out.slice(0, start) + out.slice(end);
    }
  }
  return out;
}

function cleanDocumentXml(xml: string): string {
  let out = removeInstructionTables(xml);
  out = removeInternalSections(out);
  out = stripYellowHighlights(out);
  return out;
}

/**
 * Client-release cleanup for Arcus DOCX templates:
 * - remove blue "INSTRUCTION" authoring boxes
 * - remove yellow placeholder highlights
 * - remove internal-only sections (audit controls / final release checklist)
 */
export function sanitizeDocxForClientRelease(docxBuffer: Buffer): Buffer {
  const zip = new PizZip(docxBuffer);
  for (const name of Object.keys(zip.files)) {
    if (!/^word\/(document|header\d*|footer\d*)\.xml$/i.test(name)) continue;
    const file = zip.file(name);
    if (!file || file.dir) continue;
    const cleaned = cleanDocumentXml(file.asText());
    zip.file(name, cleaned);
  }
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;
}
