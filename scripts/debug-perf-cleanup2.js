const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");
require("ts-node/register/transpile-only");
const {
  findTableRanges,
  sanitizeDocxForClientRelease,
  countInstructionMarkers,
} = require("../src/services/investmentOps/reporting/docxClientReleaseCleanup");

// Re-implement steps inline by reading the module source functions — monkey by copying logic
const src = fs.readFileSync(
  path.join(__dirname, "..", "src/services/investmentOps/reporting/docxClientReleaseCleanup.ts"),
  "utf8"
);

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

const ranges = findTableRanges(xml);
console.log("before instr mentions", (plain(xml).match(/INSTRUCTION\s*:/gi) || []).length);
let removed = 0;
for (let i = ranges.length - 1; i >= 0; i--) {
  const { start, end } = ranges[i];
  const frag = xml.slice(start, end);
  const p = plain(frag);
  const hit = markers.some((re) => re.test(p));
  if (hit) {
    removed++;
    xml = xml.slice(0, start) + xml.slice(end);
  }
}
console.log("removed tables", removed);
console.log("after instr mentions", (plain(xml).match(/INSTRUCTION\s*:/gi) || []).length);
console.log("after has Audit", /Arcus Audit/i.test(plain(xml)));
console.log("after has Checklist", /Final Release Checklist/i.test(plain(xml)));

// Check tag balance after table removal
const open = (xml.match(/<[A-Za-z_][\w:.-]*(?:\s[^>]*)?>/g) || []).filter(
  (t) => !t.startsWith("<?") && !t.startsWith("<!") && !t.endsWith("/>")
).length;
const close = (xml.match(/<\/[A-Za-z_][\w:.-]*>/g) || []).length;
console.log("balance", open, close, open === close);
