const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");
require("ts-node/register/transpile-only");
const cleanup = require("../src/services/investmentOps/reporting/docxClientReleaseCleanup");

const f = path.join(__dirname, "..", "storage", "report-templates", "investment-ops", "performance-report.docx");
const Docxtemplater = require("docxtemplater");
const tpl = fs.readFileSync(f, "binary");
const zip = new PizZip(tpl);
const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => "" });
doc.render({});
const rendered = Buffer.from(doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" }));

const xml = new PizZip(rendered).file("word/document.xml").asText();
const ranges = cleanup.findTableRanges(xml);
console.log("tables", ranges.length);
let instr = 0;
for (const r of ranges) {
  const frag = xml.slice(r.start, r.end);
  const plain = [...frag.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(" ");
  if (/INSTRUCTION/i.test(plain) || /Delete all blue/i.test(plain) || /Final Release Checklist/i.test(plain) || /Arcus Audit/i.test(plain)) {
    instr++;
    console.log("TBL", instr, plain.slice(0, 200).replace(/\s+/g, " "));
  }
}
// try cleanup and catch
try {
  const cleaned = cleanup.sanitizeDocxForClientRelease(rendered);
  console.log("cleaned markers", cleanup.countInstructionMarkers(cleaned));
  const plain = [...new PizZip(cleaned).file("word/document.xml").asText().matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(" ");
  console.log("has INSTRUCTION", /INSTRUCTION/i.test(plain));
  console.log("has Audit", /Arcus Audit/i.test(plain));
  console.log("has Checklist", /Final Release Checklist/i.test(plain));
} catch (e) {
  console.log("THREW", e);
}
