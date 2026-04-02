// @ts-nocheck

import fs from "fs";
import path from "path";
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
    document.fontSize(18).text(params.documentTitle, { align: "center" });
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
