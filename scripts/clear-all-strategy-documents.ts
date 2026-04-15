/**
 * Removes strategy PDFs from disk and clears strategyDocumentUrl on all strategies.
 * One-off / dev helper. Run: npx ts-node scripts/clear-all-strategy-documents.ts
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

async function main() {
  const dir = path.join(process.cwd(), "storage", "performance", "strategies");
  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir)) {
      if (name.toLowerCase().endsWith(".pdf")) {
        fs.unlinkSync(path.join(dir, name));
        console.log(`[ok] deleted ${name}`);
      }
    }
  } else {
    console.log("[skip] strategies dir missing");
  }

  const prisma = new PrismaClient();
  try {
    const r = await prisma.performanceStrategy.updateMany({
      where: { strategyDocumentUrl: { not: null } },
      data: { strategyDocumentUrl: null }
    });
    console.log(`[ok] cleared strategyDocumentUrl on ${r.count} row(s)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
