const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");
require("ts-node/register/transpile-only");
const { findTableRanges } = require("../src/services/investmentOps/reporting/docxClientReleaseCleanup");

const f = path.join(__dirname, "..", "storage", "report-templates", "investment-ops", "performance-report.docx");
const tpl = fs.readFileSync(f, "binary");
const zip0 = new PizZip(tpl);
const doc = new Docxtemplater(zip0, { paragraphLoop: true, linebreaks: true, nullGetter: () => "" });
doc.render({});
const rendered = Buffer.from(doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" }));
let xml = new PizZip(rendered).file("word/document.xml").asText();

const markers = [
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
function plain(frag) {
  return [...frag.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(" ");
}
function bal(x) {
  const open = (x.match(/<[A-Za-z_][\w:.-]*(?:\s[^>]*)?>/g) || []).filter(
    (t) => !t.startsWith("<?") && !t.startsWith("<!") && !t.endsWith("/>")
  ).length;
  const close = (x.match(/<\/[A-Za-z_][\w:.-]*>/g) || []).length;
  return [open, close, open === close];
}

// remove instruction tables
const ranges = findTableRanges(xml);
for (let i = ranges.length - 1; i >= 0; i--) {
  const { start, end } = ranges[i];
  const frag = xml.slice(start, end);
  if (markers.some((re) => re.test(plain(frag)))) xml = xml.slice(0, start) + xml.slice(end);
}
console.log("after tables", bal(xml), "instr", (plain(xml).match(/INSTRUCTION/gi) || []).length);

// remove orphan paras
xml = xml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (para) => {
  const p = plain(para).trim();
  if (!p) return para;
  if (markers.some((re) => re.test(p)) && p.length < 400) return "";
  return para;
});
console.log("after orphans", bal(xml), "instr", (plain(xml).match(/INSTRUCTION/gi) || []).length);

// remove internal sections — copy from source
function indexOfTblOpen(xml, from) {
  let pos = from;
  while (pos < xml.length) {
    const i = xml.indexOf("<w:tbl", pos);
    if (i < 0) return -1;
    const next = xml[i + 6];
    if (next === ">" || next === " " || next === "\n" || next === "\r" || next === "\t" || next === "/") return i;
    pos = i + 6;
  }
  return -1;
}
const HEADINGS = [/Arcus Audit,\s*Version and Publication Controls/i, /Final Release Checklist/i];
for (const headingRe of HEADINGS) {
  let guard = 0;
  while (guard++ < 20) {
    const textMatch = xml.match(headingRe);
    if (!textMatch || textMatch.index == null) break;
    const textAt = textMatch.index;
    const start = xml.lastIndexOf("<w:p", textAt);
    console.log("heading hit", headingRe, "at", textAt, "pStart", start);
    if (start < 0) break;
    const paraEnd = xml.indexOf("</w:p>", textAt);
    if (paraEnd < 0) break;
    let end = paraEnd + "</w:p>".length;
    for (let n = 0; n < 12; n++) {
      const ws = xml.slice(end).match(/^\s*/)?.[0] || "";
      const afterWs = end + ws.length;
      if (indexOfTblOpen(xml, afterWs) !== afterWs) break;
      const ranges2 = findTableRanges(xml.slice(afterWs));
      if (!ranges2.length || ranges2[0].start !== 0) break;
      end = afterWs + ranges2[0].end;
      console.log("  consume table to", end);
    }
    xml = xml.slice(0, start) + xml.slice(end);
    console.log("  after remove", bal(xml));
  }
}
console.log("final", bal(xml));
console.log("Audit", /Arcus Audit/i.test(plain(xml)));
console.log("Checklist", /Final Release Checklist/i.test(plain(xml)));
console.log("instr", /INSTRUCTION/i.test(plain(xml)));
