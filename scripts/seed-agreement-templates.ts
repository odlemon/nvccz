// @ts-nocheck
/**
 * E-signature agreement template catalogue (idempotent, deterministic).
 *
 * Seeds FundraisingAgreementTemplate — the real backing data for the
 * Portfolio "Signature templates" picker (used to start a new signature
 * envelope with a known document type instead of a hardcoded UI fixture).
 *
 * Run: npx ts-node --transpile-only -r dotenv/config scripts/seed-agreement-templates.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { assertDevDatabase } from "./lib/assert-dev-database";

const prisma = new PrismaClient();

const TEMPLATES: Array<{ name: string; documentType: string; description: string }> = [
  {
    name: "Term Sheet",
    documentType: "TERM_SHEET",
    description: "Standard investment term sheet for a portfolio company financing round.",
  },
  {
    name: "Shareholders Agreement",
    documentType: "SHAREHOLDERS_AGREEMENT",
    description: "Governance and shareholder rights agreement for a closed investment.",
  },
  {
    name: "Non-Disclosure Agreement",
    documentType: "NDA",
    description: "Mutual confidentiality agreement used ahead of due diligence.",
  },
  {
    name: "Board / IC Resolution",
    documentType: "BOARD_RESOLUTION",
    description: "Investment committee or board resolution requiring signatory acknowledgement.",
  },
  {
    name: "Loan / Facility Agreement",
    documentType: "LOAN_AGREEMENT",
    description: "Debt or facility agreement for a portfolio company or fund financing.",
  },
];

async function main() {
  await assertDevDatabase(prisma, "seed-agreement-templates");
  for (const t of TEMPLATES) {
    const existing = await prisma.fundraisingAgreementTemplate.findFirst({
      where: { documentType: t.documentType },
    });
    if (existing) {
      console.log("skip (exists):", t.documentType);
      continue;
    }
    const created = await prisma.fundraisingAgreementTemplate.create({ data: t });
    console.log("created:", created.documentType, created.id);
  }
  const count = await prisma.fundraisingAgreementTemplate.count();
  console.log("total templates:", count);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
