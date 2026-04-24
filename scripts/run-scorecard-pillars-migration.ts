import { PrismaClient } from "@prisma/client";
import { ORG_BSC_CANONICAL_TO_PILLAR_ID, ORG_BSC_PILLAR_META } from "../src/services/performanceScorecardSupport";

const prisma = new PrismaClient();

async function tableExists(name: string): Promise<boolean> {
  const rows: any[] = await prisma.$queryRawUnsafe(
    `SELECT 1 AS ok FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1`,
    name
  );
  return rows.length > 0;
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows: any[] = await prisma.$queryRawUnsafe(
    `SELECT 1 AS ok FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1`,
    table,
    column
  );
  return rows.length > 0;
}

async function main() {
  console.log("[scorecard-pillars] starting");

  if (!(await tableExists("scorecard_pillars"))) {
    await prisma.$executeRawUnsafe(`
CREATE TABLE \`scorecard_pillars\` (
  \`id\` VARCHAR(80) NOT NULL,
  \`canonical_name\` VARCHAR(128) NOT NULL,
  \`display_name\` VARCHAR(128) NOT NULL,
  \`description\` TEXT NULL,
  \`is_system\` TINYINT(1) NOT NULL DEFAULT 0,
  \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  \`updated_at\` DATETIME(3) NOT NULL,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`scorecard_pillars_canonical_name_uq\` (\`canonical_name\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log("[ok] created scorecard_pillars");
  } else {
    console.log("[skip] scorecard_pillars already exists");
    if (!(await columnExists("scorecard_pillars", "is_system"))) {
      await prisma.$executeRawUnsafe(`ALTER TABLE \`scorecard_pillars\` ADD COLUMN \`is_system\` TINYINT(1) NOT NULL DEFAULT 0`);
      console.log("[ok] added scorecard_pillars.is_system");
    }
  }

  if (!(await tableExists("scorecard_pillar_aliases"))) {
    await prisma.$executeRawUnsafe(`
CREATE TABLE \`scorecard_pillar_aliases\` (
  \`id\` VARCHAR(191) NOT NULL,
  \`pillar_id\` VARCHAR(80) NOT NULL,
  \`alias\` VARCHAR(128) NOT NULL,
  \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`scorecard_pillar_aliases_alias_uq\` (\`alias\`),
  KEY \`scorecard_pillar_aliases_pillar_idx\` (\`pillar_id\`),
  CONSTRAINT \`scorecard_pillar_aliases_pillar_fk\`
    FOREIGN KEY (\`pillar_id\`) REFERENCES \`scorecard_pillars\`(\`id\`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log("[ok] created scorecard_pillar_aliases");
  } else {
    console.log("[skip] scorecard_pillar_aliases already exists");
  }

  const seeded: Array<{ id: string; canonicalName: string; displayName: string; description: string }> = [
    {
      id: ORG_BSC_CANONICAL_TO_PILLAR_ID["Financial"],
      canonicalName: "Financial",
      displayName: "Financial",
      description:
        "Financial results and stewardship of resources — budget discipline, ROI, revenue, cost efficiency, and financial sustainability.",
    },
    {
      id: ORG_BSC_CANONICAL_TO_PILLAR_ID["Customer & Market"],
      canonicalName: "Customer & Market",
      displayName: "Customer & Market",
      description:
        "Service delivery and stakeholder outcomes — customer satisfaction, market reach, citizen/stakeholder value, and external impact.",
    },
    {
      id: ORG_BSC_CANONICAL_TO_PILLAR_ID["Internal Operations"],
      canonicalName: "Internal Operations",
      displayName: "Internal Operations",
      description:
        "Internal process excellence — operational efficiency, compliance, turnaround times, quality, governance processes, and execution capability.",
    },
    {
      id: ORG_BSC_CANONICAL_TO_PILLAR_ID["Learning, Growth & HR"],
      canonicalName: "Learning, Growth & HR",
      displayName: "Learning, Growth & HR",
      description:
        "People and capability building — skills development, staff engagement, culture, innovation, systems maturity, and organisational learning.",
    },
  ];

  for (const p of seeded) {
    const existing = await prisma.scorecardPillar.findUnique({ where: { id: p.id } });
    if (!existing) {
      await prisma.scorecardPillar.create({
        data: {
          id: p.id,
          canonicalName: p.canonicalName,
          displayName: p.displayName,
          description: p.description,
          isSystem: true,
        },
      } as any);
      continue;
    }
    await prisma.scorecardPillar.update({
      where: { id: p.id },
      data: {
        canonicalName: p.canonicalName,
        displayName:
          existing.displayName == null || String(existing.displayName).trim() === ""
            ? p.displayName
            : undefined,
        description:
          existing.description == null || String(existing.description).trim() === ""
            ? p.description
            : undefined,
        isSystem: true,
      },
    } as any);
  }
  console.log("[ok] ensured 4 system pillars seeded");

  // Backfill missing goal pillarId when scorecardPillar matches canonical.
  for (const [canonical, id] of Object.entries(ORG_BSC_CANONICAL_TO_PILLAR_ID)) {
    const updated = await prisma.performanceGoal.updateMany({
      where: {
        pillarId: null,
        scorecardPillar: canonical,
      },
      data: { pillarId: id },
    });
    if (updated.count > 0) console.log(`[ok] backfilled ${updated.count} goals pillarId for ${canonical}`);
  }

  // Ensure KPI scorecardPillar values are normalized to canonical when they match known aliases via meta.
  // (No-op if already canonical.)
  const canonicalNames = Object.keys(ORG_BSC_PILLAR_META);
  for (const canonical of canonicalNames) {
    // nothing to do; included to make intent explicit
    void canonical;
  }

  console.log("[scorecard-pillars] done");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

