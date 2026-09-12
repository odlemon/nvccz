// @ts-nocheck
import { readFileSync } from "fs";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { sanitizeDocxForClientRelease } from "./docxClientReleaseCleanup";

export class DocxTemplateRenderService {
  static render(templatePath: string, data: Record<string, string>): Buffer {
    const content = readFileSync(templatePath, "binary");
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter: () => "",
    });
    doc.render(data);
    const rendered = doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
    // Templates keep yellow placeholders + blue instruction boxes for authors;
    // strip them before the file is issued to stakeholders.
    return sanitizeDocxForClientRelease(Buffer.from(rendered));
  }
}
