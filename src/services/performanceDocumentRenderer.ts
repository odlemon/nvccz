// @ts-nocheck

import fs from "fs";
import path from "path";
import { brandLogoBuffer, brandName } from "./p2p/BrandService";
import { ensureDirectoryForFile, toSafeFileName } from "./performanceBackendSupport";

const PDFDocument = require("pdfkit");

export async function renderPerformanceReviewPdf(params: {
  documentTitle: string;
  subjectName: string;
  reviewPeriod: string;
  sections: Array<{ heading: string; lines: string[] }>;
  outputDirectory?: string;
}) {
  const baseDirectory =
    params.outputDirectory ||
    path.resolve(process.cwd(), "storage", "performance", "reviews");
  const fileName = `${toSafeFileName(params.subjectName)}-${toSafeFileName(params.reviewPeriod)}.pdf`;
  const outputPath = path.join(baseDirectory, fileName);

  ensureDirectoryForFile(outputPath);

  await new Promise<void>((resolve, reject) => {
    const document = new PDFDocument({
      margin: 50,
      size: "A4"
    });
    const stream = fs.createWriteStream(outputPath);

    document.pipe(stream);
    const logo = brandLogoBuffer();
    if (logo) { try { document.image(logo, 50, 40, { fit: [120, 44] }); document.y = 96; } catch { /* unreadable logo: name only */ } }
    document.fontSize(10).fillColor("#555555").text(brandName(), 50, logo ? 44 : 40, { align: "right" });
    document.fillColor("#000000");
    document.y = Math.max(document.y, logo ? 96 : 64);
    document.fontSize(18).text(params.documentTitle, 50, document.y, { align: "center" });
    document.moveDown(0.5);
    document.fontSize(11).text(`Subject: ${params.subjectName}`);
    document.text(`Review Period: ${params.reviewPeriod}`);
    document.moveDown();

    for (const section of params.sections) {
      document.fontSize(13).text(section.heading, {
        underline: true
      });
      document.moveDown(0.3);

      for (const line of section.lines) {
        document.fontSize(10).text(line, {
          lineGap: 2
        });
      }

      document.moveDown();
    }

    document.end();
    stream.on("finish", () => resolve());
    stream.on("error", reject);
  });

  return outputPath;
}
