// @ts-nocheck
import { readFileSync } from "fs";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";

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
    return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
  }
}
