// @ts-nocheck
import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";

const outputDir = path.join(process.cwd(), "fixtures", "fundraising");

const fixtures = [
  {
    file: "arcus-growth-equity-fund-ii-teaser.pdf",
    title: "Arcus Growth Equity Fund II",
    subtitle: "Investor Teaser",
    sections: [
      ["Strategy", "Growth capital for established Southern African businesses with proven cash generation and regional expansion potential."],
      ["Target size", "USD 120 million with a USD 40 million first close target."],
      ["Focus sectors", "Financial services, business services, consumer products, healthcare and enabling infrastructure."],
      ["Responsible investment", "Every investment is assessed against governance, climate resilience and measurable employment outcomes."],
    ],
  },
  {
    file: "arcus-track-record-summary.pdf",
    title: "Arcus Capital Partners",
    subtitle: "Track Record Summary 2021 to 2025",
    sections: [
      ["Portfolio development", "The team has supported regional expansion, working capital discipline and management succession across its portfolio."],
      ["Value creation", "Operating plans focus on revenue quality, cash conversion, governance and sustainable margin improvement."],
      ["Reporting", "Quarterly investor reporting includes operating KPIs, valuation commentary, ESG indicators and material risk updates."],
    ],
  },
  {
    file: "institutional-ddq-response.pdf",
    title: "Institutional Due Diligence Response",
    subtitle: "Arcus Growth Equity Fund II",
    sections: [
      ["Governance", "The investment committee operates under a documented charter with conflicts reviewed before every decision."],
      ["Risk management", "Portfolio, liquidity, valuation, compliance and operational risks are reviewed quarterly."],
      ["Compliance", "Investor onboarding includes sanctions screening, beneficial ownership verification and source of funds review."],
    ],
  },
  {
    file: "mutual-nondisclosure-agreement.pdf",
    title: "Mutual Nondisclosure Agreement",
    subtitle: "Discussion Draft",
    sections: [
      ["Purpose", "The parties may exchange confidential information while evaluating a potential investment relationship."],
      ["Protection", "Each party will protect confidential information using the same care applied to its own sensitive information."],
      ["Term", "Confidentiality obligations continue for three years from the effective date."],
    ],
  },
  {
    file: "subscription-agreement-draft.pdf",
    title: "Subscription Agreement",
    subtitle: "Arcus Growth Equity Fund II",
    sections: [
      ["Subscriber", "Government Employees Pension Fund."],
      ["Commitment", "USD 12,000,000 subject to final investment committee approval and completion of onboarding."],
      ["Closing", "Admission is effective only after acceptance by the general partner and satisfaction of compliance requirements."],
    ],
  },
  {
    file: "bpopf-listed-equity-proposal.pdf",
    title: "Botswana Public Officers Pension Fund",
    subtitle: "Southern Africa Listed Equity Proposal",
    sections: [
      ["Mandate objective", "Long-term real capital growth from a diversified portfolio of listed Southern African companies."],
      ["Investment process", "Fundamental research, valuation discipline, liquidity analysis and active stewardship."],
      ["Client service", "Monthly portfolio reporting, quarterly review meetings and prompt notification of material mandate events."],
    ],
  },
];

async function createPdf(fixture: (typeof fixtures)[number]) {
  const filePath = path.join(outputDir, fixture.file);
  const doc = new PDFDocument({ size: "A4", margins: { top: 56, bottom: 56, left: 64, right: 64 } });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  doc.font("Helvetica-Bold").fontSize(20).text(fixture.title);
  doc.moveDown(0.3);
  doc.font("Helvetica").fontSize(12).fillColor("#444444").text(fixture.subtitle);
  doc.moveDown(1.5);
  doc.fillColor("#111111");

  for (const [heading, body] of fixture.sections) {
    doc.font("Helvetica-Bold").fontSize(12).text(heading);
    doc.moveDown(0.25);
    doc.font("Helvetica").fontSize(10.5).text(body, { lineGap: 3 });
    doc.moveDown(1);
  }

  doc.moveDown(1);
  doc.font("Helvetica").fontSize(8).fillColor("#666666");
  doc.text("Prepared for confidential institutional investor review. July 2026.");
  doc.end();

  await new Promise<void>((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
  console.log(`[ok] ${fixture.file}`);
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  for (const fixture of fixtures) await createPdf(fixture);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
