/**
 * Smoke: render every investment-ops DOCX template empty → cleanup → assert client-ready.
 * Run: node scripts/smoke-docx-client-release-cleanup.js
 */
const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");

// Use compiled cleanup if present, else ts-node isn't available — compile via require of dist after build.
// For local quick check, transpile inline by reading the TS via a tiny copy of the logic is heavy;
// Prefer requiring dist after `npm run build`, with a fallback dynamic import of the source via ts-node/register.

function loadCleanup() {
  // Prefer live TypeScript source so smoke reflects the latest cleanup logic.
  try {
    require("ts-node/register/transpile-only");
    return require("../src/services/investmentOps/reporting/docxClientReleaseCleanup");
  } catch (e) {
    const dist = path.join(
      __dirname,
      "..",
      "dist",
      "services",
      "investmentOps",
      "reporting",
      "docxClientReleaseCleanup.js"
    );
    if (fs.existsSync(dist)) return require(dist);
    throw e;
  }
}

const { sanitizeDocxForClientRelease, countInstructionMarkers } = loadCleanup();

const dir = path.join(__dirname, "..", "storage", "report-templates", "investment-ops");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".docx"));

function plainFromDocx(buf) {
  const zip = new PizZip(buf);
  let plain = "";
  for (const name of Object.keys(zip.files)) {
    if (!/^word\/(document|header\d*|footer\d*)\.xml$/i.test(name)) continue;
    const file = zip.file(name);
    if (!file || file.dir) continue;
    plain += [...file.asText().matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(" ");
  }
  return plain;
}

function yellowCount(buf) {
  const zip = new PizZip(buf);
  let n = 0;
  for (const name of Object.keys(zip.files)) {
    if (!/^word\/(document|header\d*|footer\d*)\.xml$/i.test(name)) continue;
    const file = zip.file(name);
    if (!file || file.dir) continue;
    n += (file.asText().match(/w:val="yellow"/gi) || []).length;
  }
  return n;
}

function tagBalance(buf) {
  const zip = new PizZip(buf);
  const xml = zip.file("word/document.xml").asText();
  const open = (xml.match(/<[A-Za-z_][\w:.-]*(?:\s[^>]*)?>/g) || []).filter(
    (t) => !t.startsWith("<?") && !t.startsWith("<!") && !t.endsWith("/>")
  ).length;
  const close = (xml.match(/<\/[A-Za-z_][\w:.-]*>/g) || []).length;
  return { open, close, ok: open === close };
}

let failed = 0;
for (const f of files) {
  const tpl = fs.readFileSync(path.join(dir, f), "binary");
  const zip = new PizZip(tpl);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => "",
  });
  // Empty merge — placeholders become blank; cleanup must still strip chrome.
  doc.render({});
  const rendered = Buffer.from(doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" }));
  let cleaned;
  try {
    cleaned = sanitizeDocxForClientRelease(rendered);
  } catch (e) {
    console.log("FAIL", f, "cleanup threw", e.message);
    failed++;
    continue;
  }
  const instr = countInstructionMarkers(cleaned);
  const yellow = yellowCount(cleaned);
  const bal = tagBalance(cleaned);
  const plain = plainFromDocx(cleaned);
  const hasDeletePhrase = /Delete all blue instruction boxes/i.test(plain);
  const hasReplacePhrase = /Replace all yellow highlighted placeholders/i.test(plain);
  const hasAudit = /Arcus Audit,\s*Version and Publication Controls/i.test(plain);
  const hasChecklist = /Final Release Checklist/i.test(plain);
  const ok =
    instr === 0 &&
    yellow === 0 &&
    bal.ok &&
    !hasDeletePhrase &&
    !hasReplacePhrase &&
    !hasAudit &&
    !hasChecklist &&
    cleaned.length > 3000;
  console.log(
    (ok ? "PASS" : "FAIL"),
    f,
    JSON.stringify({
      bytes: cleaned.length,
      instr,
      yellow,
      bal,
      hasDeletePhrase,
      hasReplacePhrase,
      hasAudit,
      hasChecklist,
    })
  );
  if (!ok) failed++;
}

console.log(failed === 0 ? `ALL_PASS ${files.length}` : `FAILED ${failed}/${files.length}`);
process.exit(failed === 0 ? 0 : 1);
