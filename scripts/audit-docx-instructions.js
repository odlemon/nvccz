const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");

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

function findTableRanges(xml) {
  const ranges = [];
  let i = 0;
  while (true) {
    const start = indexOfTblOpen(xml, i);
    if (start < 0) break;
    let depth = 0;
    let pos = start;
    let end = -1;
    while (pos < xml.length) {
      const open = indexOfTblOpen(xml, pos);
      const close = xml.indexOf("</w:tbl>", pos);
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

function plain(xml) {
  return [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(" ");
}

const dir = path.join(__dirname, "..", "storage", "report-templates", "investment-ops");
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".docx"))) {
  const zip = new PizZip(fs.readFileSync(path.join(dir, f), "binary"));
  const xml = zip.file("word/document.xml").asText();
  const tables = findTableRanges(xml);
  const instrInTbl = tables.filter((t) => /INSTRUCTION\s*:/i.test(plain(xml.slice(t.start, t.end))));
  // paragraphs containing INSTRUCTION not inside those tables?
  const instrParaCount = (xml.match(/INSTRUCTION\s*:/gi) || []).length;
  // find context around first INSTRUCTION
  const idx = xml.search(/INSTRUCTION\s*:/i);
  let context = "none";
  if (idx >= 0) {
    const before = xml.slice(Math.max(0, idx - 500), idx);
    const inTbl = before.lastIndexOf("<w:tbl") > before.lastIndexOf("</w:tbl>");
    const inTc = before.lastIndexOf("<w:tc") > before.lastIndexOf("</w:tc>");
    context = inTbl ? (inTc ? "table-cell" : "table") : "paragraph";
  }
  console.log(JSON.stringify({ f, tables: tables.length, instrMentions: instrParaCount, instrTables: instrInTbl.length, firstContext: context }));
}
