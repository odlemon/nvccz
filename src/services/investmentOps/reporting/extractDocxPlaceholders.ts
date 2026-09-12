import { readFileSync, writeFileSync } from "fs";
import PizZip from "pizzip";

export function extractDocxPlaceholders(docxPath: string): string[] {
  const content = readFileSync(docxPath, "binary");
  const xml = new PizZip(content).file("word/document.xml")?.asText() || "";
  const found = new Set<string>();
  for (const m of xml.matchAll(/\{([a-z0-9_]+)\}/gi)) {
    found.add(m[1]);
  }
  return [...found].sort();
}

export function countLiteralNaInDocx(docxPath: string): number {
  const content = readFileSync(docxPath, "binary");
  const xml = new PizZip(content).file("word/document.xml")?.asText() || "";
  return (xml.match(/<w:t>N\/A<\/w:t>/g) || []).length;
}

export function normalizeDocxDelimiters(docxPath: string): number {
  const content = readFileSync(docxPath, "binary");
  const zip = new PizZip(content);
  let changes = 0;
  for (const name of Object.keys(zip.files)) {
    if (!name.endsWith(".xml")) continue;
    let xml = zip.file(name)?.asText() || "";
    const before = xml;
    xml = xml.replace(/\{\{/g, "{").replace(/\}\}/g, "}");
    if (xml !== before) {
      zip.file(name, xml);
      changes++;
    }
  }
  if (changes > 0) {
    writeFileSync(docxPath, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));
  }
  return changes;
}

export function patchLiteralNaInDocx(docxPath: string, replacements: string[]): number {
  const content = readFileSync(docxPath, "binary");
  const zip = new PizZip(content);
  let xml = zip.file("word/document.xml")?.asText() || "";
  let count = 0;
  for (const ph of replacements) {
    const needle = "<w:t>N/A</w:t>";
    const idx = xml.indexOf(needle);
    if (idx < 0) break;
    xml = xml.slice(0, idx) + `<w:t>{${ph.replace(/[{}]/g, "")}}</w:t>` + xml.slice(idx + needle.length);
    count++;
  }
  if (count > 0) {
    zip.file("word/document.xml", xml);
    writeFileSync(docxPath, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));
  }
  return count;
}
