// @ts-nocheck
/**
 * Southern Africa Fundraising client demo seed (idempotent, deterministic).
 *
 * Run: npx ts-node --transpile-only -r dotenv/config scripts/seed-fundraising-client-demo.ts
 * Safety: hard-blocks client1_db; only nts or demo_env allowed.
 */
import "dotenv/config";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { FundraisingFeGapsService } from "../src/services/fundraising/FundraisingFeGapsService";
import { FundraisingIrOpportunityService } from "../src/services/fundraising/FundraisingIrOpportunityService";
import { remoteUploadService, resolveMediaBaseUrl } from "../src/services/RemoteUploadService";

const prisma = new PrismaClient();

const DEMO_SOURCE = "arcus-southern-africa-demo";

const DEMO_CAMPAIGN_NAMES = [
  "Arcus Growth Equity Fund II",
  "Arcus Infrastructure Co-Investment Programme",
  "Arcus Regional Opportunities Fund",
  "Arcus Venture Partners Africa",
  "BPOPF Southern Africa Listed Equity Mandate",
] as const;
const LEGACY_DEMO_CAMPAIGN_NAMES = ["Arcus Listed Portfolio Institutional Mandate"] as const;

const DEMO_INVESTOR_NAMES = [
  "Government Employees Pension Fund",
  "First Mutual Life Assurance Company",
  "Botswana Public Officers Pension Fund",
  "National Social Security Authority",
  "Old Mutual Investment Group South Africa",
  "Development Bank of Southern Africa",
  "Stanlib Multi-Manager",
  "Public Investment Corporation",
] as const;

const DEMO_PLACEMENT_AGENT = "Southern Cross Capital Partners";
const DEMO_DDQ_TEMPLATE = "Arcus Institutional DDQ Pack";
const DEMO_REPORT_SCHEDULE = "Weekly Pipeline Summary for ExCo";

function dec(n: number | string): Decimal {
  return new Decimal(n);
}

function sha256Hex(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function dateOnly(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}

function atUtc(y: number, m: number, d: number, h = 10, min = 0): Date {
  return new Date(Date.UTC(y, m - 1, d, h, min, 0, 0));
}

function sanitizeDatabaseUrlForLog(databaseUrl: string | undefined) {
  if (!databaseUrl) return "(DATABASE_URL not set)";
  try {
    const u = new URL(databaseUrl);
    if (u.password) u.password = "****";
    return `${u.protocol}//${u.username ? `${u.username}@` : ""}${u.host}${u.pathname}${u.search}`;
  } catch {
    return "(DATABASE_URL set; unable to parse safely)";
  }
}

function resolveDatabaseName(databaseUrl: string): string {
  try {
    const pathname = new URL(databaseUrl).pathname || "";
    const name = pathname.replace(/^\//, "").split("/")[0]?.trim();
    if (name) return name.toLowerCase();
  } catch {
    /* fall through */
  }
  const slash = databaseUrl.match(/\/([^/?]+)(?:\?|$)/);
  return (slash?.[1] || "").toLowerCase();
}

function assertAllowedDatabase(databaseUrl: string) {
  const dbName = resolveDatabaseName(databaseUrl);
  if (!dbName) throw new Error("Could not determine database name from DATABASE_URL.");
  if (dbName === "client1_db") {
    throw new Error(
      "HARD BLOCK: refusing to seed client1_db. Point DATABASE_URL at nts or demo_env only."
    );
  }
  if (dbName !== "nts" && dbName !== "demo_env") {
    throw new Error(`Refusing to seed "${dbName}". Only nts or demo_env are allowed.`);
  }
  return dbName;
}

async function resolveDocumentMeta(
  fixtureFile: string,
  uploadType: string,
  mimeType = "application/pdf"
): Promise<{
  fileUrl: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  sha256: string;
}> {
  const fileName = path.basename(fixtureFile);
  const fixturePath = path.join(process.cwd(), "fixtures", "fundraising", fileName);
  if (fs.existsSync(fixturePath)) {
    try {
      const buf = fs.readFileSync(fixturePath);
      const uploaded = await remoteUploadService.uploadSingleFile(
        { buffer: buf, originalname: fileName, mimetype: mimeType },
        uploadType
      );
      return {
        fileUrl: uploaded.downloadURL,
        storagePath: uploaded.filePath,
        fileName,
        mimeType,
        sha256: sha256Hex(buf),
      };
    } catch {
      /* fallback below */
    }
  }
  const rel = `fundraising-demo/${fileName}`;
  const base = resolveMediaBaseUrl().replace(/\/+$/, "") || "/api/public-media";
  const fileUrl = base.startsWith("http") ? `${base}/${rel}` : `${base}/${rel}`;
  const digest = sha256Hex(Buffer.from(`arcus-demo:${fileName}`));
  return { fileUrl, storagePath: rel, fileName, mimeType, sha256: digest };
}

async function nullDataRoomFolderParents() {
  await prisma.$executeRawUnsafe(
    `UPDATE fundraising_data_room_folders SET parent_id = NULL WHERE parent_id IS NOT NULL`
  );
}

async function purgeDemoOwnedRecords(campaignIds: string[], investorIds: string[]) {
  if (campaignIds.length === 0 && investorIds.length === 0) return;

  const opps = await prisma.fundraisingOpportunity.findMany({
    where: {
      OR: [{ campaignId: { in: campaignIds } }, { investorId: { in: investorIds } }],
    },
    select: { id: true },
  });
  const oppIds = opps.map((o) => o.id);

  const commitments = await prisma.fundraisingCommitment.findMany({
    where: {
      OR: [{ campaignId: { in: campaignIds } }, { investorId: { in: investorIds } }],
    },
    select: { id: true },
  });
  const commitmentIds = commitments.map((c) => c.id);

  const agreements = await prisma.fundraisingAgreement.findMany({
    where: {
      OR: [
        { campaignId: { in: campaignIds } },
        { investorId: { in: investorIds } },
        { opportunityId: { in: oppIds } },
      ],
    },
    select: { id: true },
  });
  const agreementIds = agreements.map((a) => a.id);

  const ddqCases = await prisma.fundraisingDdqCase.findMany({
    where: {
      OR: [{ campaignId: { in: campaignIds } }, { investorId: { in: investorIds } }],
    },
    select: { id: true },
  });
  const ddqCaseIds = ddqCases.map((c) => c.id);

  const ddqItems = ddqCaseIds.length
    ? await prisma.fundraisingDdqItem.findMany({
        where: { caseId: { in: ddqCaseIds } },
        select: { id: true },
      })
    : [];
  const ddqItemIds = ddqItems.map((i) => i.id);

  const rooms = await prisma.fundraisingDataRoom.findMany({
    where: { campaignId: { in: campaignIds } },
    select: { id: true },
  });
  const roomIds = rooms.map((r) => r.id);

  const meetings = await prisma.fundraisingMeeting.findMany({
    where: {
      OR: [
        { campaignId: { in: campaignIds } },
        { investorId: { in: investorIds } },
        { opportunityId: { in: oppIds } },
      ],
    },
    select: { id: true },
  });
  const meetingIds = meetings.map((m) => m.id);

  const docs = await prisma.fundraisingDocument.findMany({
    where: {
      OR: [
        { campaignId: { in: campaignIds } },
        { investorId: { in: investorIds } },
        { opportunityId: { in: oppIds } },
      ],
    },
    select: { id: true },
  });
  const docIds = docs.map((d) => d.id);

  const agents = await prisma.fundraisingPlacementAgent.findMany({
    where: { legalName: DEMO_PLACEMENT_AGENT },
    select: { id: true },
  });
  const agentIds = agents.map((a) => a.id);

  const approvals = await prisma.fundraisingApprovalRequest.findMany({
    where: {
      OR: [
        { objectId: { in: campaignIds } },
        { objectId: { in: oppIds } },
        { objectId: { in: commitmentIds } },
      ],
    },
    select: { id: true },
  });
  const approvalIds = approvals.map((a) => a.id);

  const jobs = await prisma.fundraisingReportJob.findMany({
    where: { triggeredById: { not: "" } },
    select: { id: true, filtersJson: true },
  });
  const demoJobIds = jobs
    .filter((j) => {
      const f = (j.filtersJson || {}) as Record<string, unknown>;
      return campaignIds.includes(String(f.campaignId || ""));
    })
    .map((j) => j.id);

  if (agreementIds.length) {
    await prisma.fundraisingAgreementProviderArtifact.deleteMany({
      where: { agreementId: { in: agreementIds } },
    });
    await prisma.fundraisingAgreementSignatory.deleteMany({
      where: { agreementId: { in: agreementIds } },
    });
    await prisma.fundraisingAgreementVersion.deleteMany({
      where: { agreementId: { in: agreementIds } },
    });
    await prisma.fundraisingAgreement.deleteMany({ where: { id: { in: agreementIds } } });
  }

  if (agentIds.length) {
    await prisma.fundraisingPlacementCommissionLedgerEntry.deleteMany({
      where: { agentId: { in: agentIds } },
    });
    await prisma.fundraisingPlacementExclusion.deleteMany({ where: { agentId: { in: agentIds } } });
    await prisma.fundraisingPlacementAssignment.deleteMany({ where: { agentId: { in: agentIds } } });
  }

  if (commitmentIds.length) {
    await prisma.fundraisingCommitmentChecklistItem.deleteMany({
      where: { commitmentId: { in: commitmentIds } },
    });
    await prisma.fundraisingCommitment.deleteMany({ where: { id: { in: commitmentIds } } });
  }

  if (oppIds.length) {
    await prisma.fundraisingPlacementAssignment.deleteMany({ where: { opportunityId: { in: oppIds } } });
    await prisma.fundraisingOpportunityChecklistItem.deleteMany({ where: { opportunityId: { in: oppIds } } });
    await prisma.opportunityAmountHistory.deleteMany({ where: { opportunityId: { in: oppIds } } });
    await prisma.opportunityStageHistory.deleteMany({ where: { opportunityId: { in: oppIds } } });
    await prisma.fundraisingCommercialTerms.deleteMany({ where: { opportunityId: { in: oppIds } } });
    await prisma.fundraisingOpportunity.deleteMany({ where: { id: { in: oppIds } } });
  }

  if (ddqItemIds.length) {
    await prisma.fundraisingDdqItemEvidence.deleteMany({ where: { itemId: { in: ddqItemIds } } });
    await prisma.fundraisingDdqItemComment.deleteMany({ where: { itemId: { in: ddqItemIds } } });
  }
  if (ddqCaseIds.length) {
    await prisma.fundraisingDdqQuestionReply.deleteMany({
      where: { question: { caseId: { in: ddqCaseIds } } },
    });
    await prisma.fundraisingDdqQuestion.deleteMany({ where: { caseId: { in: ddqCaseIds } } });
    await prisma.fundraisingDdqItem.deleteMany({ where: { caseId: { in: ddqCaseIds } } });
    await prisma.fundraisingDdqCase.deleteMany({ where: { id: { in: ddqCaseIds } } });
  }

  if (roomIds.length) {
    await prisma.fundraisingDataRoomAccessLog.deleteMany({ where: { dataRoomId: { in: roomIds } } });
    await prisma.fundraisingDataRoomAccess.deleteMany({ where: { dataRoomId: { in: roomIds } } });
    await prisma.fundraisingDataRoomDocument.deleteMany({ where: { dataRoomId: { in: roomIds } } });
    await nullDataRoomFolderParents();
    await prisma.fundraisingDataRoomFolder.deleteMany({ where: { dataRoomId: { in: roomIds } } });
    await prisma.fundraisingDataRoom.deleteMany({ where: { id: { in: roomIds } } });
  }

  if (docIds.length) {
    await prisma.fundraisingDocumentVersion.deleteMany({ where: { documentId: { in: docIds } } });
    await prisma.fundraisingDocument.deleteMany({ where: { id: { in: docIds } } });
  }

  if (meetingIds.length) {
    await prisma.fundraisingMeetingActionItem.deleteMany({ where: { meetingId: { in: meetingIds } } });
    await prisma.fundraisingMeetingAttendee.deleteMany({ where: { meetingId: { in: meetingIds } } });
    await prisma.fundraisingMeeting.deleteMany({ where: { id: { in: meetingIds } } });
  }

  if (campaignIds.length) {
    await prisma.fundraisingClosingReadinessEvent.deleteMany({
      where: { closing: { campaignId: { in: campaignIds } } },
    });
    await prisma.fundraisingClosing.deleteMany({ where: { campaignId: { in: campaignIds } } });
    await prisma.fundraisingCommunication.deleteMany({ where: { campaignId: { in: campaignIds } } });
    await prisma.fundraisingRfpProposalVersion.deleteMany({
      where: { rfp: { campaignId: { in: campaignIds } } },
    });
    await prisma.fundraisingRfp.deleteMany({ where: { campaignId: { in: campaignIds } } });
    await prisma.fundraisingMandate.deleteMany({ where: { campaignId: { in: campaignIds } } });
    await prisma.fundraisingCampaignMaterialVersion.deleteMany({
      where: { material: { campaignId: { in: campaignIds } } },
    });
    await prisma.fundraisingCampaignMaterial.deleteMany({ where: { campaignId: { in: campaignIds } } });
    await prisma.fundraisingCampaignEvent.deleteMany({ where: { campaignId: { in: campaignIds } } });
    await prisma.fundraisingCampaignTemplate.deleteMany({ where: { campaignId: { in: campaignIds } } });
    await prisma.fundraisingCampaignDistributionListMember.deleteMany({
      where: { list: { campaignId: { in: campaignIds } } },
    });
    await prisma.fundraisingCampaignDistributionList.deleteMany({
      where: { campaignId: { in: campaignIds } },
    });
    await prisma.fundraisingForecastScenario.deleteMany({ where: { campaignId: { in: campaignIds } } });
    await prisma.fundraisingPipelineDeal.deleteMany({ where: { campaignId: { in: campaignIds } } });
    await prisma.fundraisingStageChecklistTemplate.deleteMany({
      where: { stage: { campaignId: { in: campaignIds } } },
    });
    await prisma.fundraisingPipelineStage.deleteMany({ where: { campaignId: { in: campaignIds } } });
    await prisma.fundraisingCampaignGlMapping.deleteMany({ where: { campaignId: { in: campaignIds } } });
    await prisma.fundraisingCampaign.deleteMany({ where: { id: { in: campaignIds } } });
  }

  if (investorIds.length) {
    await prisma.fundraisingCommunication.deleteMany({ where: { investorId: { in: investorIds } } });
    await prisma.fundraisingKycCase.deleteMany({ where: { investorId: { in: investorIds } } });
    await prisma.fundraisingComplianceHold.deleteMany({ where: { investorId: { in: investorIds } } });
    await prisma.investorContact.deleteMany({ where: { investorId: { in: investorIds } } });
    await prisma.investorOrganisation.deleteMany({ where: { id: { in: investorIds } } });
  }

  if (agentIds.length) {
    await prisma.fundraisingPlacementAgent.deleteMany({ where: { id: { in: agentIds } } });
  }

  if (approvalIds.length) {
    await prisma.fundraisingApprovalEvent.deleteMany({ where: { approvalId: { in: approvalIds } } });
    await prisma.fundraisingApprovalRequest.deleteMany({ where: { id: { in: approvalIds } } });
  }

  if (demoJobIds.length) {
    await prisma.fundraisingReportRun.deleteMany({ where: { jobId: { in: demoJobIds } } });
    await prisma.fundraisingReportJob.deleteMany({ where: { id: { in: demoJobIds } } });
  }

  const demoTasks = await prisma.task.findMany({
    where: { taskMetadata: { path: "$.sourceModule", equals: "fundraising" } },
    select: { id: true, taskMetadata: true },
  });
  const taskIds = demoTasks
    .filter((t) => {
      const m = (t.taskMetadata || {}) as Record<string, unknown>;
      const key = String(m.demoKey || "");
      return key.startsWith("arcus-demo:");
    })
    .map((t) => t.id);
  if (taskIds.length) {
    await prisma.activityLog.deleteMany({ where: { taskId: { in: taskIds } } }).catch(() => null);
    await prisma.task.deleteMany({ where: { id: { in: taskIds } } });
  }

  await prisma.fundraisingAuditLog.deleteMany({
    where: {
      OR: [
        { objectId: { in: campaignIds } },
        { objectId: { in: investorIds } },
        { objectId: { in: oppIds } },
      ],
    },
  });
}

async function createCampaignWithStages(
  adminId: string,
  fundId: string | null,
  spec: {
    name: string;
    campaignType: string;
    targetCapital: number;
    status: string;
    approvalStatus?: string;
    submittedForApprovalAt?: Date | null;
    pausedAt?: Date | null;
    pauseReason?: string | null;
    description?: string;
  }
) {
  const seed = await FundraisingFeGapsService.getSeedStagesForCampaignType(spec.campaignType);
  const { campaign, stageMap } = await prisma.$transaction(
    async (tx) => {
      const campaign = await tx.fundraisingCampaign.create({
        data: {
          fundId,
          campaignType: spec.campaignType,
          name: spec.name,
          description: spec.description ?? null,
          targetCapital: dec(spec.targetCapital),
          minimumTargetAmount: dec(spec.targetCapital * 0.6),
          hardCapAmount: dec(spec.targetCapital * 1.1),
          primaryCurrency: "USD",
          startDate: dateOnly(2026, 1, 1),
          closeDate: dateOnly(2027, 12, 31),
          firstCloseTargetDate: dateOnly(2026, 9, 30),
          finalCloseTargetDate: dateOnly(2027, 6, 30),
          regionTags: ["Southern Africa", "SADC"],
          investorSegments: ["Pension funds", "Insurers", "Sovereign wealth"],
          status: spec.status,
          approvalStatus: spec.approvalStatus ?? "APPROVED",
          submittedForApprovalAt: spec.submittedForApprovalAt ?? null,
          pausedAt: spec.pausedAt ?? null,
          pauseReason: spec.pauseReason ?? null,
          campaignOwnerId: adminId,
          createdById: adminId,
        },
      });

      if (fundId) {
        await tx.fundraisingCampaignGlMapping.create({ data: { campaignId: campaign.id } });
      }

      const stageMap: Record<string, string> = {};
      for (const stage of seed) {
        const createdStage = await tx.fundraisingPipelineStage.create({
          data: {
            campaignId: campaign.id,
            stageCode: stage.stageCode,
            stageName: stage.stageName,
            sortOrder: stage.sortOrder,
            winProbabilityPct: dec(stage.winProbabilityPct),
            gateRules: stage.gateRules ?? undefined,
          },
        });
        stageMap[stage.stageCode] = createdStage.id;
        for (let i = 0; i < stage.checklist.length; i++) {
          const item = stage.checklist[i];
          await tx.fundraisingStageChecklistTemplate.create({
            data: {
              stageId: createdStage.id,
              itemKey: item.itemKey,
              label: item.label,
              sortOrder: i,
              isRequired: item.isRequired,
            },
          });
        }
      }
      return { campaign, stageMap };
    },
    { timeout: 60000 }
  );
  return { campaign, stageMap, seed };
}

async function upsertOpportunity(
  adminId: string,
  spec: {
    demoKey: string;
    campaignId: string;
    investorId: string;
    contactId: string | null;
    stageCode: string;
    stageMap: Record<string, string>;
    status?: string;
    opportunityType?: string;
    amounts?: Partial<Record<string, number>>;
    priority?: string;
    lostReason?: string;
    expectedAum?: number;
  }
) {
  const stageId = spec.stageMap[spec.stageCode];
  if (!stageId) throw new Error(`Missing stage ${spec.stageCode}`);

  const amounts = spec.amounts || {};
  const opp = await prisma.fundraisingOpportunity.create({
    data: {
      campaignId: spec.campaignId,
      investorId: spec.investorId,
      primaryContactId: spec.contactId,
      currentStageId: stageId,
      opportunityType: spec.opportunityType || "LP_COMMITMENT",
      opportunityCurrency: "USD",
      indicativeAmount: amounts.indicativeAmount != null ? dec(amounts.indicativeAmount) : null,
      qualifiedAmount: amounts.qualifiedAmount != null ? dec(amounts.qualifiedAmount) : null,
      softCircleAmount: amounts.softCircleAmount != null ? dec(amounts.softCircleAmount) : null,
      proposedAmount: amounts.proposedAmount != null ? dec(amounts.proposedAmount) : null,
      signedAmount: amounts.signedAmount != null ? dec(amounts.signedAmount) : null,
      admittedAmount: amounts.admittedAmount != null ? dec(amounts.admittedAmount) : null,
      fundedAmount: dec(amounts.fundedAmount ?? 0),
      expectedAum: spec.expectedAum != null ? dec(spec.expectedAum) : null,
      stageProbability: dec(35),
      confidenceAdjustment: dec(1),
      expectedCloseDate: dateOnly(2026, 11, 30),
      opportunityOwnerId: adminId,
      priority: spec.priority || "MEDIUM",
      status: spec.status || "OPEN",
      lostReason: spec.lostReason ?? null,
      source: spec.demoKey,
      notes: "Southern Africa institutional LP pipeline card",
      createdById: adminId,
    },
  });

  const amountRows: Array<{ amountType: string; newValue: number | null }> = [];
  for (const [field, amountType] of [
    ["indicativeAmount", "INDICATIVE"],
    ["qualifiedAmount", "QUALIFIED"],
    ["softCircleAmount", "SOFT_CIRCLE"],
    ["proposedAmount", "PROPOSED"],
    ["signedAmount", "SIGNED"],
  ] as const) {
    const v = amounts[field as keyof typeof amounts];
    if (v != null) amountRows.push({ amountType, newValue: v });
  }
  for (const row of amountRows) {
    await prisma.opportunityAmountHistory.create({
      data: {
        opportunityId: opp.id,
        amountType: row.amountType,
        oldValue: null,
        newValue: row.newValue != null ? dec(row.newValue) : null,
        currency: "USD",
        reason: "Initial demo amount",
        changedById: adminId,
      },
    });
  }
  if (amountRows.length > 1) {
    await prisma.opportunityAmountHistory.create({
      data: {
        opportunityId: opp.id,
        amountType: "SOFT_CIRCLE",
        oldValue: dec(amountRows[0]?.newValue ?? 0),
        newValue: dec(amounts.softCircleAmount ?? amounts.indicativeAmount ?? 0),
        currency: "USD",
        reason: "Revised after management presentation",
        changedById: adminId,
        changedAt: atUtc(2026, 5, 12),
      },
    });
  }

  await prisma.opportunityStageHistory.create({
    data: {
      opportunityId: opp.id,
      fromStageId: null,
      toStageId: stageId,
      fromStageCode: null,
      toStageCode: spec.stageCode,
      reason: "Opportunity opened",
      changedById: adminId,
      changedAt: atUtc(2026, 3, 1),
      gateResult: { passed: true, softPass: true },
    },
  });
  if (spec.stageCode !== "TARGET_INVESTOR" && spec.stageCode !== "TARGET_CLIENT") {
    const priorCode = spec.stageCode === "CONTACTED" ? "TARGET_INVESTOR" : "CONTACTED";
    const priorId = spec.stageMap[priorCode];
    if (priorId) {
      await prisma.opportunityStageHistory.create({
        data: {
          opportunityId: opp.id,
          fromStageId: priorId,
          toStageId: stageId,
          fromStageCode: priorCode,
          toStageCode: spec.stageCode,
          reason: "Progressed after investor engagement",
          changedById: adminId,
          changedAt: atUtc(2026, 4, 20),
          gateResult: { passed: true },
        },
      });
    }
  }

  await FundraisingIrOpportunityService.seedChecklistForStage(prisma, opp.id, stageId);
  const checklist = await prisma.fundraisingOpportunityChecklistItem.findMany({
    where: { opportunityId: opp.id, stageId },
  });
  if (checklist.length) {
    await prisma.fundraisingOpportunityChecklistItem.update({
      where: { id: checklist[0].id },
      data: { isComplete: true, completedAt: atUtc(2026, 4, 15), completedById: adminId },
    });
  }
  return opp;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL || "";
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const dbName = assertAllowedDatabase(databaseUrl);

  console.log(`Seeding Southern Africa Fundraising demo on ${sanitizeDatabaseUrlForLog(databaseUrl)} (${dbName})`);

  const admin =
    (await prisma.user.findUnique({ where: { email: "admin@nts.com" }, select: { id: true, email: true } })) ||
    (await prisma.user.findFirst({
      where: { role: { name: { in: ["admin", "Admin", "System Administrator"] } } },
      select: { id: true, email: true },
    }));
  if (!admin) throw new Error("No admin user found (expected admin@nts.com or admin role)");

  const fundPe =
    (await prisma.fund.findFirst({ where: { name: "Arcus Growth Equity Fund" }, select: { id: true, name: true } })) ||
    (await prisma.fund.findFirst({
      where: { name: { contains: "Arcus Growth" } },
      select: { id: true, name: true },
    }));
  const fundListed =
    (await prisma.fund.findFirst({ where: { name: "Arcus Listed Portfolio" }, select: { id: true, name: true } })) ||
    fundPe;
  if (!fundPe) throw new Error("No suitable PE fund found (prefer Arcus Growth Equity Fund)");
  if (!fundListed) throw new Error("No suitable listed fund found (prefer Arcus Listed Portfolio)");

  const settings = await prisma.fundraisingSettings.findFirst({ where: { settingsKey: "DEFAULT" } });
  const pipelineTemplateCount = await prisma.fundraisingPipelineTemplate.count({ where: { isActive: true } });
  if (!settings && pipelineTemplateCount === 0) {
    console.warn("[warn] No fundraising settings or pipeline templates found; stage seeds will use static defaults");
  }

  const existingCampaigns = await prisma.fundraisingCampaign.findMany({
    where: { name: { in: [...DEMO_CAMPAIGN_NAMES, ...LEGACY_DEMO_CAMPAIGN_NAMES] } },
    select: { id: true, name: true },
  });
  const existingInvestors = await prisma.investorOrganisation.findMany({
    where: {
      OR: [{ source: DEMO_SOURCE }, { legalName: { in: [...DEMO_INVESTOR_NAMES] } }],
    },
    select: { id: true },
  });
  await purgeDemoOwnedRecords(
    existingCampaigns.map((c) => c.id),
    existingInvestors.map((i) => i.id)
  );

  const investorDefs = [
    {
      legalName: DEMO_INVESTOR_NAMES[0],
      tradingName: "GEPF",
      investorType: "PENSION_FUND",
      countryCode: "ZA",
      jurisdiction: "South Africa",
      estimatedAum: 180000000000,
      contact: { fullName: "Thabo Mokoena", roleTitle: "Chief Investment Officer", email: "t.mokoena@gepf.co.za" },
    },
    {
      legalName: DEMO_INVESTOR_NAMES[1],
      tradingName: "First Mutual Life",
      investorType: "INSURANCE_ASSET_MANAGER",
      countryCode: "ZW",
      jurisdiction: "Zimbabwe",
      estimatedAum: 4200000000,
      contact: { fullName: "Rudo Nyamutswa", roleTitle: "Head of Investments", email: "r.nyamutswa@firstmutual.co.zw" },
    },
    {
      legalName: DEMO_INVESTOR_NAMES[2],
      tradingName: "BPOPF",
      investorType: "PENSION_FUND",
      countryCode: "BW",
      jurisdiction: "Botswana",
      estimatedAum: 3100000000,
      contact: { fullName: "Kagiso Modise", roleTitle: "Investment Manager", email: "k.modise@bpopf.co.bw" },
    },
    {
      legalName: DEMO_INVESTOR_NAMES[3],
      tradingName: "NSSA",
      investorType: "PENSION_FUND",
      countryCode: "ZW",
      jurisdiction: "Zimbabwe",
      estimatedAum: 900000000,
      kycStatus: "CLEARED",
      sanctionsStatus: "CLEAR",
      contact: { fullName: "Farai Chigwada", roleTitle: "Director Investments", email: "f.chigwada@nssa.org.zw" },
    },
    {
      legalName: DEMO_INVESTOR_NAMES[4],
      tradingName: "OMIG SA",
      investorType: "INSURANCE_ASSET_MANAGER",
      countryCode: "ZA",
      jurisdiction: "South Africa",
      estimatedAum: 65000000000,
      contact: { fullName: "Lerato Nkosi", roleTitle: "Principal", email: "lerato.nkosi@oldmutual.com" },
    },
    {
      legalName: DEMO_INVESTOR_NAMES[5],
      tradingName: "DBSA",
      investorType: "DEVELOPMENT_FINANCE_INSTITUTION",
      countryCode: "ZA",
      jurisdiction: "South Africa",
      estimatedAum: 48000000000,
      contact: { fullName: "Naledi Seabela", roleTitle: "Head of Funds", email: "naledi.seabela@dbsa.org" },
    },
    {
      legalName: DEMO_INVESTOR_NAMES[6],
      tradingName: "Stanlib",
      investorType: "ASSET_MANAGER",
      countryCode: "ZA",
      jurisdiction: "South Africa",
      estimatedAum: 72000000000,
      contact: { fullName: "Nomsa Dlamini", roleTitle: "Client Director", email: "n.dlamini@stanlib.com" },
    },
    {
      legalName: DEMO_INVESTOR_NAMES[7],
      tradingName: "PIC",
      investorType: "SOVEREIGN_WEALTH",
      countryCode: "ZA",
      jurisdiction: "South Africa",
      estimatedAum: 280000000000,
      contact: { fullName: "Sipho Khumalo", roleTitle: "Senior Analyst", email: "s.khumalo@pic.gov.za" },
    },
  ] as const;

  const investors: Record<string, { id: string; contactId: string }> = {};
  for (const def of investorDefs) {
    const inv = await prisma.investorOrganisation.create({
      data: {
        legalName: def.legalName,
        tradingName: def.tradingName,
        investorType: def.investorType,
        countryCode: def.countryCode,
        jurisdiction: def.jurisdiction,
        baseCurrency: "USD",
        estimatedAum: dec(def.estimatedAum),
        typicalMinimumTicket: dec(2500000),
        typicalMaximumTicket: dec(25000000),
        assetClassPreferences: ["Private equity", "Growth equity", "Co-investments"],
        geographicInterests: ["Southern Africa", "SADC"],
        relationshipOwnerId: admin.id,
        source: DEMO_SOURCE,
        status: "ACTIVE",
        kycStatus: def.kycStatus || "IN_PROGRESS",
        sanctionsStatus: def.sanctionsStatus || "CLEAR",
        riskRating: "MEDIUM",
        investorClassification: "INSTITUTIONAL",
        lastInteractionAt: atUtc(2026, 6, 20),
        nextAction: "Schedule IC follow-up",
        nextActionDate: dateOnly(2026, 8, 5),
        notes: "Arcus Southern Africa fundraising relationship",
        createdById: admin.id,
      },
    });
    const contact = await prisma.investorContact.create({
      data: {
        investorId: inv.id,
        fullName: def.contact.fullName,
        roleTitle: def.contact.roleTitle,
        email: def.contact.email,
        phone: "+27101234567",
        decisionInfluence: "HIGH",
        isPrimary: true,
        status: "ACTIVE",
        createdById: admin.id,
      },
    });
    investors[def.legalName] = { id: inv.id, contactId: contact.id };
  }

  const { campaign: activePe, stageMap: peStages } = await createCampaignWithStages(admin.id, fundPe.id, {
    name: DEMO_CAMPAIGN_NAMES[0],
    campaignType: "PE_FUNDRAISE",
    targetCapital: 150_000_000,
    status: "ACTIVE",
    description: "Second close for growth equity fund focused on Southern African mid-market",
  });

  const { campaign: draftPe, stageMap: draftStages } = await createCampaignWithStages(admin.id, fundPe.id, {
    name: DEMO_CAMPAIGN_NAMES[1],
    campaignType: "PE_FUNDRAISE",
    targetCapital: 75_000_000,
    status: "DRAFT",
    approvalStatus: "PENDING",
    description: "Infrastructure co-investment programme for regional pension allocators",
  });

  const { campaign: pendingPe } = await createCampaignWithStages(admin.id, fundPe.id, {
    name: DEMO_CAMPAIGN_NAMES[2],
    campaignType: "PE_FUNDRAISE",
    targetCapital: 120_000_000,
    status: "DRAFT",
    approvalStatus: "PENDING",
    submittedForApprovalAt: atUtc(2026, 7, 1),
    description: "Regional opportunities fund awaiting investment committee approval",
  });

  const { campaign: pausedPe } = await createCampaignWithStages(admin.id, fundPe.id, {
    name: DEMO_CAMPAIGN_NAMES[3],
    campaignType: "VC_FUNDRAISE",
    targetCapital: 40_000_000,
    status: "PAUSED",
    pausedAt: atUtc(2026, 6, 1),
    pauseReason: "Paused pending revised marketing materials and fee disclosure",
    description: "Venture partners Africa sleeve",
  });

  const { campaign: activeAm, stageMap: amStages } = await createCampaignWithStages(
    admin.id,
    fundListed.id,
    {
      name: DEMO_CAMPAIGN_NAMES[4],
      campaignType: "INSTITUTIONAL_MANDATE",
      targetCapital: 200_000_000,
      status: "ACTIVE",
      description: "Institutional listed equity mandate for Botswana Public Officers Pension Fund",
    }
  );

  const oppGepf = await upsertOpportunity(admin.id, {
    demoKey: "arcus-demo:gepf-growth-equity-ii",
    campaignId: activePe.id,
    investorId: investors[DEMO_INVESTOR_NAMES[0]].id,
    contactId: investors[DEMO_INVESTOR_NAMES[0]].contactId,
    stageCode: "QUALIFIED",
    stageMap: peStages,
    priority: "HIGH",
    amounts: { indicativeAmount: 15_000_000, qualifiedAmount: 12_000_000, softCircleAmount: 10_000_000 },
  });
  const oppPspf = await upsertOpportunity(admin.id, {
    demoKey: "arcus-demo:pspf-growth-equity-ii",
    campaignId: activePe.id,
    investorId: investors[DEMO_INVESTOR_NAMES[1]].id,
    contactId: investors[DEMO_INVESTOR_NAMES[1]].contactId,
    stageCode: "ENGAGED",
    stageMap: peStages,
    amounts: { indicativeAmount: 8_000_000, softCircleAmount: 6_500_000 },
  });
  const oppBpopf = await upsertOpportunity(admin.id, {
    demoKey: "arcus-demo:bpopf-growth-equity-ii",
    campaignId: activePe.id,
    investorId: investors[DEMO_INVESTOR_NAMES[2]].id,
    contactId: investors[DEMO_INVESTOR_NAMES[2]].contactId,
    stageCode: "DATA_ROOM",
    stageMap: peStages,
    amounts: { indicativeAmount: 5_000_000, softCircleAmount: 4_000_000, qualifiedAmount: 4_500_000 },
  });
  const oppNssa = await upsertOpportunity(admin.id, {
    demoKey: "arcus-demo:nssa-growth-equity-ii",
    campaignId: activePe.id,
    investorId: investors[DEMO_INVESTOR_NAMES[3]].id,
    contactId: investors[DEMO_INVESTOR_NAMES[3]].contactId,
    stageCode: "COMMERCIAL_NEGOTIATION",
    stageMap: peStages,
    amounts: {
      indicativeAmount: 6_000_000,
      qualifiedAmount: 5_500_000,
      softCircleAmount: 5_000_000,
      proposedAmount: 4_750_000,
    },
  });
  const oppOldMutual = await upsertOpportunity(admin.id, {
    demoKey: "arcus-demo:omig-growth-equity-ii",
    campaignId: activePe.id,
    investorId: investors[DEMO_INVESTOR_NAMES[4]].id,
    contactId: investors[DEMO_INVESTOR_NAMES[4]].contactId,
    stageCode: "SIGNED",
    stageMap: peStages,
    status: "OPEN",
    amounts: {
      indicativeAmount: 20_000_000,
      qualifiedAmount: 18_000_000,
      softCircleAmount: 17_000_000,
      proposedAmount: 16_000_000,
      signedAmount: 15_000_000,
    },
  });
  await upsertOpportunity(admin.id, {
    demoKey: "arcus-demo:dbsa-growth-equity-ii",
    campaignId: activePe.id,
    investorId: investors[DEMO_INVESTOR_NAMES[5]].id,
    contactId: investors[DEMO_INVESTOR_NAMES[5]].contactId,
    stageCode: "CONTACTED",
    stageMap: peStages,
    status: "LOST",
    lostReason: "Allocated to competing regional manager this cycle",
    amounts: { indicativeAmount: 7_000_000 },
  });
  const oppStanlibAm = await upsertOpportunity(admin.id, {
    demoKey: "arcus-demo:bpopf-listed-mandate",
    campaignId: activeAm.id,
    investorId: investors[DEMO_INVESTOR_NAMES[2]].id,
    contactId: investors[DEMO_INVESTOR_NAMES[2]].contactId,
    stageCode: "PROPOSAL",
    stageMap: amStages,
    opportunityType: "MANDATE_AUM",
    expectedAum: 35_000_000,
    amounts: { indicativeAmount: 35_000_000, qualifiedAmount: 30_000_000 },
  });
  await upsertOpportunity(admin.id, {
    demoKey: "arcus-demo:pic-draft-fund",
    campaignId: draftPe.id,
    investorId: investors[DEMO_INVESTOR_NAMES[7]].id,
    contactId: investors[DEMO_INVESTOR_NAMES[7]].contactId,
    stageCode: "TARGET_INVESTOR",
    stageMap: draftStages,
    amounts: { indicativeAmount: 25_000_000 },
  });
  const oppStanlibCommitment = await upsertOpportunity(admin.id, {
    demoKey: "arcus-demo:stanlib-admitted-commitment",
    campaignId: activePe.id,
    investorId: investors[DEMO_INVESTOR_NAMES[6]].id,
    contactId: investors[DEMO_INVESTOR_NAMES[6]].contactId,
    stageCode: "SIGNED",
    stageMap: peStages,
    amounts: {
      indicativeAmount: 10_000_000,
      qualifiedAmount: 9_000_000,
      softCircleAmount: 8_000_000,
      proposedAmount: 8_000_000,
      signedAmount: 8_000_000,
      admittedAmount: 8_000_000,
    },
  });
  const oppPicFunded = await upsertOpportunity(admin.id, {
    demoKey: "arcus-demo:pic-funded-commitment",
    campaignId: activePe.id,
    investorId: investors[DEMO_INVESTOR_NAMES[7]].id,
    contactId: investors[DEMO_INVESTOR_NAMES[7]].contactId,
    stageCode: "SIGNED",
    stageMap: peStages,
    amounts: {
      indicativeAmount: 14_000_000,
      qualifiedAmount: 12_000_000,
      softCircleAmount: 12_000_000,
      proposedAmount: 12_000_000,
      signedAmount: 12_000_000,
      admittedAmount: 12_000_000,
      fundedAmount: 4_000_000,
    },
  });

  await prisma.fundraisingCommercialTerms.create({
    data: {
      opportunityId: oppNssa.id,
      termsType: "PE_VC",
      termsJson: { managementFee: 2, carriedInterest: 20, hurdle: 8, currency: "USD" },
    },
  });

  const pitchDeck = await resolveDocumentMeta(
    "arcus-growth-equity-fund-ii-teaser.pdf",
    "fundraising-campaign-materials"
  );
  const ppm = await resolveDocumentMeta(
    "arcus-track-record-summary.pdf",
    "fundraising-campaign-materials"
  );

  await prisma.fundraisingCampaignTemplate.create({
    data: {
      campaignId: activePe.id,
      name: "Initial outreach email",
      templateType: "EMAIL",
      subject: "Arcus Growth Equity Fund II introduction",
      bodyHtml: "<p>Dear {{contactName}}, we would welcome a conversation on our Southern Africa growth equity strategy.</p>",
      status: "ACTIVE",
      createdById: admin.id,
    },
  });
  const distList = await prisma.fundraisingCampaignDistributionList.create({
    data: {
      campaignId: activePe.id,
      name: "Southern Africa pension CIO list",
      segmentJson: { regions: ["ZA", "ZW", "ZM", "BW"], types: ["PENSION_FUND"] },
      createdById: admin.id,
    },
  });
  await prisma.fundraisingCampaignDistributionListMember.createMany({
    data: [
      { listId: distList.id, investorId: investors[DEMO_INVESTOR_NAMES[0]].id, contactId: investors[DEMO_INVESTOR_NAMES[0]].contactId },
      { listId: distList.id, investorId: investors[DEMO_INVESTOR_NAMES[1]].id, contactId: investors[DEMO_INVESTOR_NAMES[1]].contactId },
      { listId: distList.id, investorId: investors[DEMO_INVESTOR_NAMES[3]].id, contactId: investors[DEMO_INVESTOR_NAMES[3]].contactId },
    ],
  });
  await prisma.fundraisingCampaignEvent.create({
    data: {
      campaignId: activePe.id,
      title: "Johannesburg LP breakfast briefing",
      eventType: "ROADSHOW",
      startsAt: atUtc(2026, 8, 14, 7, 30),
      endsAt: atUtc(2026, 8, 14, 10, 0),
      location: "Sandton, Johannesburg",
      status: "PLANNED",
      notes: "Hosted with GEPF and PIC invited",
      createdById: admin.id,
    },
  });
  const material = await prisma.fundraisingCampaignMaterial.create({
    data: {
      campaignId: activePe.id,
      name: "Growth Equity Fund II pitch deck",
      category: "MARKETING",
      confidential: true,
      createdById: admin.id,
    },
  });
  await prisma.fundraisingCampaignMaterialVersion.create({
    data: {
      materialId: material.id,
      versionNumber: 1,
      fileUrl: pitchDeck.fileUrl,
      storagePath: pitchDeck.storagePath,
      fileName: pitchDeck.fileName,
      mimeType: pitchDeck.mimeType,
      sha256: pitchDeck.sha256,
      uploadedById: admin.id,
    },
  });

  await prisma.fundraisingCommunication.createMany({
    data: [
      {
        campaignId: activePe.id,
        opportunityId: oppGepf.id,
        investorId: investors[DEMO_INVESTOR_NAMES[0]].id,
        contactId: investors[DEMO_INVESTOR_NAMES[0]].contactId,
        interactionType: "MEETING",
        subject: "GEPF introductory meeting",
        summary: "Strong interest in regional mid-market exposure and co-investment rights",
        outcome: "POSITIVE",
        sentiment: "POSITIVE",
        confidentiality: "INTERNAL",
        nextAction: "Send DD pack",
        dueDate: dateOnly(2026, 8, 1),
        ownerId: admin.id,
        occurredAt: atUtc(2026, 5, 8),
        createdById: admin.id,
      },
      {
        campaignId: activePe.id,
        opportunityId: oppPspf.id,
        investorId: investors[DEMO_INVESTOR_NAMES[1]].id,
        contactId: investors[DEMO_INVESTOR_NAMES[1]].contactId,
        interactionType: "PHONE_CALL",
        subject: "First Mutual follow-up",
        summary: "Confirmed ticket size range and investment committee timetable",
        outcome: "FOLLOW_UP",
        confidentiality: "INTERNAL",
        occurredAt: atUtc(2026, 6, 2),
        createdById: admin.id,
      },
      {
        campaignId: activeAm.id,
        opportunityId: oppStanlibAm.id,
        investorId: investors[DEMO_INVESTOR_NAMES[2]].id,
        contactId: investors[DEMO_INVESTOR_NAMES[2]].contactId,
        interactionType: "EMAIL",
        subject: "BPOPF mandate proposal sent",
        summary: "Shared fee grid and transition plan for listed portfolio sleeve",
        confidentiality: "INTERNAL",
        occurredAt: atUtc(2026, 6, 25),
        createdById: admin.id,
      },
    ],
  });

  const meeting = await prisma.fundraisingMeeting.create({
    data: {
      title: "NSSA commercial terms review",
      meetingType: "VIDEO",
      scheduledStart: atUtc(2026, 7, 22, 9, 0),
      scheduledEnd: atUtc(2026, 7, 22, 10, 0),
      timezone: "Africa/Harare",
      campaignId: activePe.id,
      investorId: investors[DEMO_INVESTOR_NAMES[3]].id,
      opportunityId: oppNssa.id,
      contactId: investors[DEMO_INVESTOR_NAMES[3]].contactId,
      ownerId: admin.id,
      agenda: "Review fee terms, co-invest capacity, and subscription timeline",
      status: "SCHEDULED",
      createdById: admin.id,
    },
  });
  const completedMeeting = await prisma.fundraisingMeeting.create({
    data: {
      title: "GEPF investment committee diligence session",
      meetingType: "IN_PERSON",
      scheduledStart: atUtc(2026, 7, 8, 10, 0),
      scheduledEnd: atUtc(2026, 7, 8, 12, 0),
      timezone: "Africa/Johannesburg",
      location: "GEPF offices, Pretoria",
      campaignId: activePe.id,
      investorId: investors[DEMO_INVESTOR_NAMES[0]].id,
      opportunityId: oppGepf.id,
      contactId: investors[DEMO_INVESTOR_NAMES[0]].contactId,
      ownerId: admin.id,
      agenda: "Review track record, portfolio construction, governance, and DDQ responsibilities",
      status: "COMPLETED",
      discussionNotes:
        "The committee focused on downside protection, local currency exposure, governance rights, and the pipeline for the first deployment year.",
      outcomeSummary:
        "GEPF will proceed to final due diligence subject to receiving the updated attribution analysis.",
      decisionsJson: [
        "Arcus will provide gross-to-net attribution by 24 July",
        "GEPF legal counsel will review the side letter in parallel",
      ],
      completedAt: atUtc(2026, 7, 8, 12, 0),
      completedById: admin.id,
      completionNonce: "arcus-demo-gepf-diligence-complete",
      createdById: admin.id,
    },
  });
  const cancelledMeeting = await prisma.fundraisingMeeting.create({
    data: {
      title: "DBSA regional fund introduction",
      meetingType: "PHONE",
      scheduledStart: atUtc(2026, 7, 15, 14, 0),
      scheduledEnd: atUtc(2026, 7, 15, 14, 45),
      timezone: "Africa/Johannesburg",
      campaignId: activePe.id,
      investorId: investors[DEMO_INVESTOR_NAMES[5]].id,
      contactId: investors[DEMO_INVESTOR_NAMES[5]].contactId,
      ownerId: admin.id,
      agenda: "Discuss DBSA allocation priorities and regional development outcomes",
      status: "CANCELLED",
      cancelReason: "DBSA requested a new date after its quarterly allocation meeting",
      createdById: admin.id,
    },
  });
  await prisma.fundraisingMeetingAttendee.createMany({
    data: [
      {
        meetingId: meeting.id,
        email: "f.chigwada@nssa.org.zw",
        fullName: "Farai Chigwada",
        role: "EXTERNAL",
      },
      { meetingId: meeting.id, userId: admin.id, fullName: "Arcus Fundraising Lead", role: "INTERNAL" },
      {
        meetingId: completedMeeting.id,
        email: "t.mokoena@gepf.co.za",
        fullName: "Thabo Mokoena",
        role: "EXTERNAL",
      },
      {
        meetingId: completedMeeting.id,
        userId: admin.id,
        fullName: "Arcus Fundraising Lead",
        role: "INTERNAL",
      },
      {
        meetingId: cancelledMeeting.id,
        email: "naledi.seabela@dbsa.org",
        fullName: "Naledi Seabela",
        role: "EXTERNAL",
      },
      {
        meetingId: cancelledMeeting.id,
        userId: admin.id,
        fullName: "Arcus Fundraising Lead",
        role: "INTERNAL",
      },
    ],
  });

  const linkedTask = await prisma.task.create({
    data: {
      title: "Circulate revised side letter to NSSA counsel",
      description: "Include fee rebate language agreed in commercial negotiation",
      stage: "todo",
      status: "todo",
      date: dateOnly(2026, 7, 25),
      priority: "high",
      taskMetadata: {
        sourceModule: "fundraising",
        demoKey: "arcus-demo:nssa-side-letter-task",
        campaignId: activePe.id,
        opportunityId: oppNssa.id,
        investorId: investors[DEMO_INVESTOR_NAMES[3]].id,
      },
      createdBy: admin.id,
      activities: [],
    },
  });

  await prisma.fundraisingMeetingActionItem.create({
    data: {
      meetingId: meeting.id,
      title: "Confirm NSSA board paper submission date",
      ownerId: admin.id,
      dueDate: dateOnly(2026, 7, 28),
      status: "OPEN",
      linkedTaskId: linkedTask.id,
      sortOrder: 1,
      idempotencyKey: "arcus-demo-nssa-board-date",
    },
  });
  await prisma.fundraisingMeetingActionItem.create({
    data: {
      meetingId: completedMeeting.id,
      title: "Provide GEPF gross-to-net attribution analysis",
      ownerId: admin.id,
      dueDate: dateOnly(2026, 7, 24),
      status: "OPEN",
      sortOrder: 1,
      idempotencyKey: "arcus-demo-gepf-attribution",
    },
  });

  await prisma.task.create({
    data: {
      title: "Prepare GEPF IC memo for Growth Equity Fund II",
      description: "Include portfolio construction and regional allocation case study",
      stage: "in_progress",
      status: "in_progress",
      date: dateOnly(2026, 8, 10),
      priority: "medium",
      taskMetadata: {
        sourceModule: "fundraising",
        demoKey: "arcus-demo:gepf-ic-memo-task",
        campaignId: activePe.id,
        opportunityId: oppGepf.id,
        investorId: investors[DEMO_INVESTOR_NAMES[0]].id,
      },
      createdBy: admin.id,
      activities: [],
    },
  });

  const rfp = await prisma.fundraisingRfp.create({
    data: {
      investorId: investors[DEMO_INVESTOR_NAMES[2]].id,
      campaignId: activeAm.id,
      referenceNumber: "RFP-BPOPF-2026-LEM-01",
      institutionName: "Botswana Public Officers Pension Fund",
      deadline: dateOnly(2026, 9, 15),
      presentationDate: dateOnly(2026, 10, 2),
      evaluationCriteria: { trackRecord: 30, fees: 25, team: 25, transition: 20 },
      status: "SUBMITTED",
      outcome: "WON",
      assetClass: "Listed equities",
      geography: "Southern Africa",
      fitScore: dec(82.5),
      stageCode: "AWARDED",
      stageName: "Awarded",
      createdById: admin.id,
    },
  });
  const proposalMeta = await resolveDocumentMeta(
    "bpopf-listed-equity-proposal.pdf",
    "fundraising-rfp-proposals"
  );
  await prisma.fundraisingRfpProposalVersion.create({
    data: {
      rfpId: rfp.id,
      versionNumber: 1,
      fileUrl: proposalMeta.fileUrl,
      storagePath: proposalMeta.storagePath,
      fileName: proposalMeta.fileName,
      mimeType: proposalMeta.mimeType,
      sha256: proposalMeta.sha256,
      status: "FINAL",
      uploadedById: admin.id,
    },
  });

  const mandate = await prisma.fundraisingMandate.create({
    data: {
      investorId: investors[DEMO_INVESTOR_NAMES[2]].id,
      campaignId: activeAm.id,
      opportunityId: oppStanlibAm.id,
      rfpId: rfp.id,
      name: "BPOPF Southern Africa Listed Equity Mandate",
      status: "ONBOARDING",
      expectedAum: dec(35_000_000),
      activatedAum: dec(0),
      currency: "USD",
      agreementSigned: false,
      kycApproved: false,
      guidelinesConfigured: true,
      benchmarkConfigured: true,
      feesConfigured: true,
      reportingConfigured: false,
      assetClass: "Listed equities",
      geography: "Southern Africa",
      stageCode: "PROPOSAL",
      stageName: "Proposal",
      ownerId: admin.id,
      createdById: admin.id,
    },
  });

  let ddqTemplate = await prisma.fundraisingDdqTemplate.findFirst({ where: { name: DEMO_DDQ_TEMPLATE } });
  if (!ddqTemplate) {
    ddqTemplate = await prisma.fundraisingDdqTemplate.create({
      data: {
        name: DEMO_DDQ_TEMPLATE,
        category: "Institutional",
        questionsJson: [
          { key: "ubo", question: "Provide ultimate beneficial ownership structure" },
          { key: "aml", question: "Describe AML policy and last independent review date" },
        ],
        createdById: admin.id,
      },
    });
  }

  const ddqCase = await prisma.fundraisingDdqCase.create({
    data: {
      investorId: investors[DEMO_INVESTOR_NAMES[0]].id,
      campaignId: activePe.id,
      opportunityId: oppGepf.id,
      templateId: ddqTemplate.id,
      title: "GEPF Growth Equity Fund II DDQ",
      status: "IN_REVIEW",
      progressPct: dec(65),
      ownerId: admin.id,
      internalReviewAt: atUtc(2026, 6, 18),
      createdById: admin.id,
    },
  });
  const ddqItem = await prisma.fundraisingDdqItem.create({
    data: {
      caseId: ddqCase.id,
      category: "Compliance",
      requirement: "Provide audited financial statements for the last three years",
      status: "IN_REVIEW",
      ownerId: admin.id,
      dueDate: dateOnly(2026, 8, 15),
      questionKey: "financials",
    },
  });
  const evidenceMeta = await resolveDocumentMeta(
    "institutional-ddq-response.pdf",
    "fundraising-ddq-evidence"
  );
  await prisma.fundraisingDdqItemEvidence.create({
    data: {
      itemId: ddqItem.id,
      fileUrl: evidenceMeta.fileUrl,
      storagePath: evidenceMeta.storagePath,
      fileName: evidenceMeta.fileName,
      mimeType: evidenceMeta.mimeType,
      sha256: evidenceMeta.sha256,
      uploadedById: admin.id,
    },
  });
  await prisma.fundraisingDdqItemComment.create({
    data: {
      itemId: ddqItem.id,
      authorId: admin.id,
      body: "Please confirm whether the 2025 audit is signed by the external auditor.",
    },
  });
  const ddqQuestion = await prisma.fundraisingDdqQuestion.create({
    data: {
      caseId: ddqCase.id,
      question: "What is the fund-level leverage policy for portfolio companies?",
      status: "OPEN",
      askedById: admin.id,
    },
  });
  await prisma.fundraisingDdqQuestionReply.create({
    data: {
      questionId: ddqQuestion.id,
      body: "The fund targets net debt to EBITDA below 3.5x at entry with no fund-level borrowing.",
      authorId: admin.id,
    },
  });

  await prisma.fundraisingKycCase.create({
    data: {
      investorId: investors[DEMO_INVESTOR_NAMES[3]].id,
      status: "APPROVED",
      riskRating: "LOW",
      pepFlag: false,
      adverseMediaFlag: false,
      detailsJson: { screeningProvider: "Arcus Compliance", lastReview: "2026-06-01" },
      docsNote: "Certified IDs and board resolution on file",
      approvedById: admin.id,
      ownerId: admin.id,
      decidedAt: atUtc(2026, 6, 10),
      createdById: admin.id,
    },
  });
  await prisma.fundraisingKycCase.create({
    data: {
      investorId: investors[DEMO_INVESTOR_NAMES[0]].id,
      status: "UNDER_REVIEW",
      riskRating: "MEDIUM",
      pepFlag: false,
      adverseMediaFlag: false,
      ownerId: admin.id,
      createdById: admin.id,
    },
  });

  const dataRoom = await prisma.fundraisingDataRoom.create({
    data: {
      campaignId: activePe.id,
      name: "Growth Equity Fund II data room",
      status: "ACTIVE",
      requiresMfa: false,
      defaultWatermarkEnabled: true,
      defaultDownloadLimit: 5,
      createdById: admin.id,
    },
  });
  const legalFolder = await prisma.fundraisingDataRoomFolder.create({
    data: { dataRoomId: dataRoom.id, name: "Legal", sortOrder: 1 },
  });
  const financeFolder = await prisma.fundraisingDataRoomFolder.create({
    data: { dataRoomId: dataRoom.id, name: "Financial", sortOrder: 2 },
  });
  const roomDocMeta = await resolveDocumentMeta(
    "mutual-nondisclosure-agreement.pdf",
    "fundraising-data-room"
  );
  const roomDoc = await prisma.fundraisingDataRoomDocument.create({
    data: {
      dataRoomId: dataRoom.id,
      folderId: legalFolder.id,
      fileName: roomDocMeta.fileName,
      mimeType: roomDocMeta.mimeType,
      fileUrl: roomDocMeta.fileUrl,
      storagePath: roomDocMeta.storagePath,
      sha256: roomDocMeta.sha256,
      viewOnly: false,
      downloadLimit: 3,
      watermarkEnabled: true,
      createdById: admin.id,
    },
  });
  await prisma.fundraisingDataRoomDocument.create({
    data: {
      dataRoomId: dataRoom.id,
      folderId: financeFolder.id,
      fileName: "Arcus track record summary.pdf",
      mimeType: "application/pdf",
      fileUrl: ppm.fileUrl,
      storagePath: ppm.storagePath,
      sha256: ppm.sha256,
      createdById: admin.id,
    },
  });
  await prisma.fundraisingDataRoomAccess.create({
    data: {
      dataRoomId: dataRoom.id,
      investorId: investors[DEMO_INVESTOR_NAMES[2]].id,
      contactId: investors[DEMO_INVESTOR_NAMES[2]].contactId,
      permissionLevel: "DOWNLOAD",
      downloadLimit: 5,
      watermarkEnabled: true,
      createdById: admin.id,
    },
  });
  await prisma.fundraisingDataRoomAccessLog.createMany({
    data: [
      {
        dataRoomId: dataRoom.id,
        documentId: roomDoc.id,
        investorId: investors[DEMO_INVESTOR_NAMES[2]].id,
        userId: admin.id,
        action: "VIEW",
        success: true,
        ipAddress: "102.128.0.10",
        country: "BW",
        createdAt: atUtc(2026, 6, 14, 11, 0),
      },
      {
        dataRoomId: dataRoom.id,
        documentId: roomDoc.id,
        investorId: investors[DEMO_INVESTOR_NAMES[2]].id,
        userId: admin.id,
        action: "DOWNLOAD",
        success: true,
        ipAddress: "102.128.0.10",
        country: "BW",
        createdAt: atUtc(2026, 6, 14, 11, 5),
      },
    ],
  });

  const subMeta = await resolveDocumentMeta(
    "subscription-agreement-draft.pdf",
    "fundraising-agreements"
  );
  const unifiedDoc = await prisma.fundraisingDocument.create({
    data: {
      name: "Arcus Track Record Summary",
      category: "Track Record",
      sourceType: "UPLOAD",
      sourceId: activePe.id,
      campaignId: activePe.id,
      confidential: true,
      status: "ACTIVE",
      fileUrl: ppm.fileUrl,
      storagePath: ppm.storagePath,
      fileName: ppm.fileName,
      mimeType: ppm.mimeType,
      sha256: ppm.sha256,
      currentVersionNumber: 1,
      createdById: admin.id,
    },
  });
  await prisma.fundraisingDocumentVersion.create({
    data: {
      documentId: unifiedDoc.id,
      versionNumber: 1,
      fileUrl: ppm.fileUrl,
      storagePath: ppm.storagePath,
      fileName: ppm.fileName,
      mimeType: ppm.mimeType,
      sha256: ppm.sha256,
      changeNotes: "Initial client demo version",
      uploadedById: admin.id,
    },
  });
  const additionalDocuments = [
    {
      name: "Arcus Growth Equity Fund II Investor Teaser",
      category: "Marketing",
      status: "ACTIVE",
      campaignId: activePe.id,
      investorId: null,
      opportunityId: null,
      meta: pitchDeck,
    },
    {
      name: "GEPF Institutional DDQ Response",
      category: "Due Diligence",
      status: "UNDER_REVIEW",
      campaignId: activePe.id,
      investorId: investors[DEMO_INVESTOR_NAMES[0]].id,
      opportunityId: oppGepf.id,
      meta: evidenceMeta,
    },
    {
      name: "Mutual Nondisclosure Agreement",
      category: "Legal",
      status: "DRAFT",
      campaignId: activePe.id,
      investorId: investors[DEMO_INVESTOR_NAMES[3]].id,
      opportunityId: oppNssa.id,
      meta: roomDocMeta,
    },
    {
      name: "BPOPF Listed Equity Proposal",
      category: "Marketing",
      status: "APPROVED",
      campaignId: activeAm.id,
      investorId: investors[DEMO_INVESTOR_NAMES[2]].id,
      opportunityId: oppStanlibAm.id,
      meta: proposalMeta,
    },
    {
      name: "Old Mutual Subscription Agreement",
      category: "Legal",
      status: "OUT_FOR_SIGNATURE",
      campaignId: activePe.id,
      investorId: investors[DEMO_INVESTOR_NAMES[4]].id,
      opportunityId: oppOldMutual.id,
      meta: subMeta,
    },
    {
      name: "Fund II Valuation and Financial Summary",
      category: "Financials",
      status: "SUPERSEDED",
      campaignId: activePe.id,
      investorId: null,
      opportunityId: null,
      meta: ppm,
    },
    {
      name: "NSSA KYC Document Register",
      category: "KYC",
      status: "ACTIVE",
      campaignId: activePe.id,
      investorId: investors[DEMO_INVESTOR_NAMES[3]].id,
      opportunityId: oppNssa.id,
      meta: evidenceMeta,
    },
  ];
  for (const docSpec of additionalDocuments) {
    const doc = await prisma.fundraisingDocument.create({
      data: {
        name: docSpec.name,
        category: docSpec.category,
        sourceType: "UPLOAD",
        sourceId: activePe.id,
        campaignId: docSpec.campaignId,
        investorId: docSpec.investorId,
        opportunityId: docSpec.opportunityId,
        confidential: docSpec.category !== "Marketing",
        status: docSpec.status,
        fileUrl: docSpec.meta.fileUrl,
        storagePath: docSpec.meta.storagePath,
        fileName: docSpec.meta.fileName,
        mimeType: docSpec.meta.mimeType,
        sha256: docSpec.meta.sha256,
        currentVersionNumber: 1,
        createdById: admin.id,
      },
    });
    await prisma.fundraisingDocumentVersion.create({
      data: {
        documentId: doc.id,
        versionNumber: 1,
        fileUrl: docSpec.meta.fileUrl,
        storagePath: docSpec.meta.storagePath,
        fileName: docSpec.meta.fileName,
        mimeType: docSpec.meta.mimeType,
        sha256: docSpec.meta.sha256,
        changeNotes: `Approved source file for ${docSpec.name}`,
        status: docSpec.status === "SUPERSEDED" ? "SUPERSEDED" : "ACTIVE",
        uploadedById: admin.id,
      },
    });
  }

  const agreement = await prisma.fundraisingAgreement.create({
    data: {
      opportunityId: oppOldMutual.id,
      investorId: investors[DEMO_INVESTOR_NAMES[4]].id,
      campaignId: activePe.id,
      documentType: "SUBSCRIPTION_AGREEMENT",
      title: "Old Mutual Growth Equity Fund II subscription agreement",
      status: "OUT_FOR_SIGNATURE",
      provider: "MANUAL",
      createdById: admin.id,
    },
  });
  const agreementVersion = await prisma.fundraisingAgreementVersion.create({
    data: {
      agreementId: agreement.id,
      versionNumber: 1,
      fileUrl: subMeta.fileUrl,
      storagePath: subMeta.storagePath,
      fileName: subMeta.fileName,
      mimeType: subMeta.mimeType,
      sha256: subMeta.sha256,
      status: "FINAL",
      uploadedById: admin.id,
    },
  });
  await prisma.fundraisingAgreementSignatory.createMany({
    data: [
      {
        agreementId: agreement.id,
        versionId: agreementVersion.id,
        fullName: "Lerato Nkosi",
        email: "lerato.nkosi@oldmutual.com",
        sequenceOrder: 1,
        status: "SIGNED",
        signedAt: atUtc(2026, 6, 28),
      },
      {
        agreementId: agreement.id,
        versionId: agreementVersion.id,
        fullName: "Arcus Fund Administrator",
        email: "fundadmin@arcus.co.zw",
        sequenceOrder: 2,
        status: "PENDING",
        invitedAt: atUtc(2026, 6, 29),
      },
    ],
  });
  await prisma.fundraisingAgreementProviderArtifact.create({
    data: {
      agreementId: agreement.id,
      versionId: agreementVersion.id,
      artifactType: "CERTIFICATE",
      fileUrl: subMeta.fileUrl,
      storagePath: subMeta.storagePath,
      fileName: "signature-certificate.pdf",
      mimeType: "application/pdf",
      sha256: subMeta.sha256,
      certificateRef: "ARCUS-SIG-2026-0628",
    },
  });
  const draftAgreement = await prisma.fundraisingAgreement.create({
    data: {
      opportunityId: oppGepf.id,
      investorId: investors[DEMO_INVESTOR_NAMES[0]].id,
      campaignId: activePe.id,
      documentType: "SIDE_LETTER",
      title: "GEPF governance and reporting side letter",
      status: "DRAFT",
      provider: "MANUAL",
      createdById: admin.id,
    },
  });
  await prisma.fundraisingAgreementSignatory.create({
    data: {
      agreementId: draftAgreement.id,
      versionId: null,
      fullName: "Thabo Mokoena",
      email: "t.mokoena@gepf.co.za",
      sequenceOrder: 1,
      status: "PENDING",
    },
  });
  const completedAgreement = await prisma.fundraisingAgreement.create({
    data: {
      opportunityId: oppNssa.id,
      investorId: investors[DEMO_INVESTOR_NAMES[3]].id,
      campaignId: activePe.id,
      documentType: "NON_DISCLOSURE_AGREEMENT",
      title: "NSSA mutual nondisclosure agreement",
      status: "COMPLETED",
      provider: "MANUAL",
      providerStatus: "COMPLETED",
      sentAt: atUtc(2026, 5, 18),
      createdById: admin.id,
    },
  });
  const completedVersion = await prisma.fundraisingAgreementVersion.create({
    data: {
      agreementId: completedAgreement.id,
      versionNumber: 1,
      fileUrl: roomDocMeta.fileUrl,
      storagePath: roomDocMeta.storagePath,
      fileName: roomDocMeta.fileName,
      mimeType: roomDocMeta.mimeType,
      sha256: roomDocMeta.sha256,
      checksum: roomDocMeta.sha256,
      status: "FINAL",
      uploadedById: admin.id,
    },
  });
  await prisma.fundraisingAgreementSignatory.create({
    data: {
      agreementId: completedAgreement.id,
      versionId: completedVersion.id,
      fullName: "Farai Chigwada",
      email: "f.chigwada@nssa.org.zw",
      sequenceOrder: 1,
      status: "SIGNED",
      signedAt: atUtc(2026, 5, 20),
      certificateRef: "ARCUS-NDA-2026-0520",
    },
  });

  const commitment = await prisma.fundraisingCommitment.create({
    data: {
      opportunityId: oppOldMutual.id,
      investorId: investors[DEMO_INVESTOR_NAMES[4]].id,
      campaignId: activePe.id,
      fundId: fundPe.id,
      currency: "USD",
      commitmentAmount: dec(15_000_000),
      fundedAmount: dec(0),
      unfundedAmount: dec(15_000_000),
      status: "SIGNED",
      signedAt: atUtc(2026, 6, 28),
      complianceStatus: "CLEARED",
      accountingStatus: "POSTED",
      createdById: admin.id,
    },
  });
  for (const [i, item] of [
    { itemKey: "subscription_docs", label: "Subscription documents signed", isRequired: true, done: true },
    { itemKey: "wire_instructions", label: "Wire instructions confirmed", isRequired: true, done: true },
    { itemKey: "tax_forms", label: "Tax forms submitted", isRequired: true, done: false },
    { itemKey: "bank_details", label: "Bank details verified", isRequired: true, done: true },
  ].entries()) {
    await prisma.fundraisingCommitmentChecklistItem.create({
      data: {
        commitmentId: commitment.id,
        itemKey: item.itemKey,
        label: item.label,
        isRequired: item.isRequired,
        isComplete: item.done,
        completedAt: item.done ? atUtc(2026, 6, 28) : null,
        completedById: item.done ? admin.id : null,
        sortOrder: i,
      },
    });
  }
  const admittedCommitment = await prisma.fundraisingCommitment.create({
    data: {
      opportunityId: oppStanlibCommitment.id,
      investorId: investors[DEMO_INVESTOR_NAMES[6]].id,
      campaignId: activePe.id,
      fundId: fundPe.id,
      currency: "USD",
      commitmentAmount: dec(8_000_000),
      fundedAmount: dec(0),
      unfundedAmount: dec(8_000_000),
      status: "ADMITTED",
      signedAt: atUtc(2026, 5, 30),
      admissionDate: dateOnly(2026, 6, 14),
      complianceStatus: "CLEARED",
      accountingStatus: "READY",
      capitalCallContact: "Nomsa Dlamini",
      createdById: admin.id,
    },
  });
  const fundedCommitment = await prisma.fundraisingCommitment.create({
    data: {
      opportunityId: oppPicFunded.id,
      investorId: investors[DEMO_INVESTOR_NAMES[7]].id,
      campaignId: activePe.id,
      fundId: fundPe.id,
      currency: "USD",
      commitmentAmount: dec(12_000_000),
      fundedAmount: dec(4_000_000),
      unfundedAmount: dec(8_000_000),
      status: "FUNDED",
      signedAt: atUtc(2026, 4, 24),
      admissionDate: dateOnly(2026, 5, 15),
      complianceStatus: "CLEARED",
      accountingStatus: "POSTED",
      capitalCallContact: "Sipho Khumalo",
      createdById: admin.id,
    },
  });
  await prisma.fundraisingCommitmentChecklistItem.createMany({
    data: [
      {
        commitmentId: admittedCommitment.id,
        itemKey: "subscription_docs",
        label: "Subscription documents signed",
        isRequired: true,
        isComplete: true,
        completedAt: atUtc(2026, 5, 30),
        completedById: admin.id,
        sortOrder: 1,
      },
      {
        commitmentId: admittedCommitment.id,
        itemKey: "first_capital_call",
        label: "First capital call notice issued",
        isRequired: true,
        isComplete: false,
        sortOrder: 2,
      },
      {
        commitmentId: fundedCommitment.id,
        itemKey: "subscription_docs",
        label: "Subscription documents signed",
        isRequired: true,
        isComplete: true,
        completedAt: atUtc(2026, 4, 24),
        completedById: admin.id,
        sortOrder: 1,
      },
      {
        commitmentId: fundedCommitment.id,
        itemKey: "wire_received",
        label: "Initial capital call received",
        isRequired: true,
        isComplete: true,
        completedAt: atUtc(2026, 6, 5),
        completedById: admin.id,
        sortOrder: 2,
      },
    ],
  });

  const closing = await prisma.fundraisingClosing.create({
    data: {
      campaignId: activePe.id,
      fundId: fundPe.id,
      closeType: "FIRST_CLOSE",
      closingDate: dateOnly(2026, 9, 30),
      status: "PLANNED",
      name: "Growth Equity Fund II first close",
      targetAmount: dec(75_000_000),
      totalCommitmentValue: dec(15_000_000),
      legalReady: true,
      complianceReady: true,
      fundReady: false,
      readinessJson: { sideLetters: "in_progress", equalisation: "pending" },
      createdById: admin.id,
    },
  });
  await prisma.fundraisingClosingReadinessEvent.createMany({
    data: [
      {
        closingId: closing.id,
        eventType: "LEGAL_READY",
        actorId: admin.id,
        notes: "Subscription documents template approved by counsel",
        createdAt: atUtc(2026, 6, 15),
      },
      {
        closingId: closing.id,
        eventType: "COMPLIANCE_READY",
        actorId: admin.id,
        notes: "KYC cleared for anchor LP Old Mutual",
        createdAt: atUtc(2026, 6, 20),
      },
    ],
  });
  await prisma.fundraisingCommitment.update({
    where: { id: commitment.id },
    data: { closingId: closing.id },
  });
  const completedClosing = await prisma.fundraisingClosing.create({
    data: {
      campaignId: activePe.id,
      fundId: fundPe.id,
      closeType: "INTERIM_CLOSE",
      closingDate: dateOnly(2026, 6, 14),
      status: "CLOSED",
      name: "Growth Equity Fund II anchor interim close",
      targetAmount: dec(20_000_000),
      totalCommitmentValue: dec(20_000_000),
      legalReady: true,
      complianceReady: true,
      fundReady: true,
      readinessJson: {
        sideLetters: "complete",
        equalisation: "complete",
        investorRegister: "complete",
      },
      postCloseJson: {
        lpPortalProvisioned: true,
        capitalCallContactsConfirmed: true,
        reportingPreferencesCaptured: true,
      },
      closedAt: atUtc(2026, 6, 14, 16, 0),
      createdById: admin.id,
    },
  });
  await prisma.fundraisingCommitment.updateMany({
    where: { id: { in: [admittedCommitment.id, fundedCommitment.id] } },
    data: { closingId: completedClosing.id },
  });

  const agent = await prisma.fundraisingPlacementAgent.create({
    data: {
      legalName: DEMO_PLACEMENT_AGENT,
      territory: "Southern Africa",
      geographyJson: { countries: ["ZA", "ZW", "ZM", "BW", "NA"] },
      commissionPct: dec(1.5),
      retainer: dec(120_000),
      successFee: dec(250_000),
      appointmentStart: dateOnly(2026, 1, 1),
      appointmentEnd: dateOnly(2027, 12, 31),
      status: "ACTIVE",
      commissionStatus: "ACCRUING",
      accruedCommission: dec(225_000),
      paidCommission: dec(120_000),
      createdById: admin.id,
    },
  });
  await prisma.fundraisingPlacementAssignment.create({
    data: { agentId: agent.id, opportunityId: oppPspf.id },
  });
  await prisma.fundraisingPlacementExclusion.create({
    data: {
      agentId: agent.id,
      exclusionType: "INVESTOR",
      investorId: investors[DEMO_INVESTOR_NAMES[0]].id,
      reason: "GEPF appointed directly without placement agent",
      createdById: admin.id,
    },
  });
  await prisma.fundraisingPlacementCommissionLedgerEntry.create({
    data: {
      agentId: agent.id,
      opportunityId: oppOldMutual.id,
      commitmentId: commitment.id,
      eventType: "SUCCESS_FEE",
      amount: dec(225_000),
      currency: "USD",
      status: "ACCRUING",
      notes: "Success fee on Old Mutual signed commitment",
      createdById: admin.id,
    },
  });
  await prisma.fundraisingPlacementCommissionLedgerEntry.createMany({
    data: [
      {
        agentId: agent.id,
        opportunityId: oppPspf.id,
        eventType: "RETAINER",
        amount: dec(120_000),
        currency: "USD",
        status: "PAID",
        notes: "Annual Southern Africa mandate retainer paid",
        createdById: admin.id,
      },
      {
        agentId: agent.id,
        opportunityId: oppBpopf.id,
        eventType: "SUCCESS_FEE",
        amount: dec(60_000),
        currency: "USD",
        status: "ON_HOLD",
        notes: "Held pending confirmation that the investor is within the appointment scope",
        createdById: admin.id,
      },
    ],
  });

  await prisma.fundraisingForecastScenario.createMany({
    data: [
      {
        campaignId: activePe.id,
        name: "Base case close",
        scenarioType: "BASE",
        assumptionsJson: { winRate: 0.35, avgTicket: 8_000_000 },
        projectedSigned: dec(90_000_000),
        projectedAum: dec(90_000_000),
        projectedFees: dec(1_800_000),
        monthlyProjection: [
          { month: "2026-07", cumulativeSigned: 20_000_000 },
          { month: "2026-09", cumulativeSigned: 55_000_000 },
          { month: "2026-12", cumulativeSigned: 90_000_000 },
        ],
        recalculatedAt: atUtc(2026, 7, 1),
        createdById: admin.id,
      },
      {
        campaignId: activePe.id,
        name: "Upside close",
        scenarioType: "UPSIDE",
        assumptionsJson: { winRate: 0.45, avgTicket: 10_000_000 },
        projectedSigned: dec(120_000_000),
        projectedAum: dec(120_000_000),
        projectedFees: dec(2_400_000),
        createdById: admin.id,
      },
    ],
  });

  const pendingApproval = await prisma.fundraisingApprovalRequest.create({
    data: {
      objectType: "CAMPAIGN",
      objectId: pendingPe.id,
      requestType: "ACTIVATION",
      status: "PENDING",
      requestedById: admin.id,
      reason: "Request approval to activate Regional Opportunities Fund",
      payload: { campaignName: pendingPe.name },
      amount: dec(120_000_000),
      currency: "USD",
    },
  });
  await prisma.fundraisingApprovalEvent.create({
    data: {
      approvalId: pendingApproval.id,
      eventType: "SUBMITTED",
      actorId: admin.id,
      notes: "Submitted to investment committee",
      createdAt: atUtc(2026, 7, 1),
    },
  });
  const approvedActivation = await prisma.fundraisingApprovalRequest.create({
    data: {
      objectType: "CAMPAIGN",
      objectId: activePe.id,
      requestType: "ACTIVATION",
      status: "APPROVED",
      requestedById: admin.id,
      decidedById: admin.id,
      decidedAt: atUtc(2026, 2, 15),
      reason: "Approved for active fundraising",
    },
  });
  await prisma.fundraisingApprovalEvent.create({
    data: {
      approvalId: approvedActivation.id,
      eventType: "APPROVED",
      actorId: admin.id,
      notes: "Investment committee approved launch",
      createdAt: atUtc(2026, 2, 15),
    },
  });

  let reportSchedule = await prisma.fundraisingReportSchedule.findFirst({
    where: { name: DEMO_REPORT_SCHEDULE },
  });
  if (!reportSchedule) {
    reportSchedule = await prisma.fundraisingReportSchedule.create({
      data: {
        reportKey: "pipeline-summary",
        name: DEMO_REPORT_SCHEDULE,
        cadence: "WEEKLY",
        recipientsJson: [{ email: "fundraising@arcus.co.zw", name: "Fundraising team" }],
        format: "CSV",
        filtersJson: { campaignId: activePe.id },
        isActive: true,
        nextRunAt: atUtc(2026, 7, 21, 6, 0),
        createdById: admin.id,
      },
    });
  } else {
    reportSchedule = await prisma.fundraisingReportSchedule.update({
      where: { id: reportSchedule.id },
      data: {
        reportKey: "pipeline-summary",
        cadence: "WEEKLY",
        recipientsJson: [{ email: "fundraising@arcus.co.zw", name: "Fundraising team" }],
        format: "CSV",
        filtersJson: { campaignId: activePe.id },
        isActive: true,
        nextRunAt: atUtc(2026, 7, 21, 6, 0),
      },
    });
  }

  const reportJob = await prisma.fundraisingReportJob.create({
    data: {
      jobType: "REPORT",
      reportKey: "pipeline-summary",
      status: "COMPLETED",
      filtersJson: { campaignId: activePe.id },
      format: "JSON",
      triggeredById: admin.id,
      startedAt: atUtc(2026, 7, 14, 6, 0),
      completedAt: atUtc(2026, 7, 14, 6, 2),
      scheduleId: reportSchedule.id,
    },
  });
  await prisma.fundraisingReportRun.createMany({
    data: [
      {
        scheduleId: reportSchedule.id,
        jobId: reportJob.id,
        reportKey: "pipeline-summary",
        status: "COMPLETED",
        runAt: atUtc(2026, 7, 14, 6, 2),
      },
      {
        scheduleId: reportSchedule.id,
        reportKey: "pipeline-summary",
        status: "COMPLETED",
        runAt: atUtc(2026, 7, 7, 6, 2),
      },
    ],
  });

  await prisma.fundraisingComplianceHold.create({
    data: {
      investorId: investors[DEMO_INVESTOR_NAMES[5]].id,
      status: "RELEASED",
      reason: "Temporary hold while adverse media review completed",
      placedById: admin.id,
      placedAt: atUtc(2026, 4, 1),
      releasedById: admin.id,
      releasedAt: atUtc(2026, 4, 10),
      releaseReason: "No material findings",
    },
  });

  await prisma.fundraisingAuditLog.createMany({
    data: [
      {
        userId: admin.id,
        role: "admin",
        action: "CREATE_CAMPAIGN",
        objectType: "FundraisingCampaign",
        objectId: activePe.id,
        newValue: { name: activePe.name, status: "ACTIVE" },
        reason: "Southern Africa demo seed",
        timestamp: atUtc(2026, 2, 1),
      },
      {
        userId: admin.id,
        role: "admin",
        action: "CREATE_OPPORTUNITY",
        objectType: "FundraisingOpportunity",
        objectId: oppGepf.id,
        newValue: { investor: DEMO_INVESTOR_NAMES[0], stage: "QUALIFIED" },
        timestamp: atUtc(2026, 3, 1),
      },
      {
        userId: admin.id,
        role: "admin",
        action: "CREATE_COMMITMENT",
        objectType: "FundraisingCommitment",
        objectId: commitment.id,
        newValue: { amount: 15_000_000, status: "SIGNED" },
        timestamp: atUtc(2026, 6, 28),
      },
    ],
  });

  const tabCounts = {
    investors: await prisma.investorOrganisation.count({ where: { source: DEMO_SOURCE } }),
    contacts: await prisma.investorContact.count({
      where: { investor: { source: DEMO_SOURCE } },
    }),
    campaigns: await prisma.fundraisingCampaign.count({
      where: { name: { in: [...DEMO_CAMPAIGN_NAMES] } },
    }),
    opportunities: await prisma.fundraisingOpportunity.count({
      where: { campaign: { name: { in: [...DEMO_CAMPAIGN_NAMES] } } },
    }),
    communications: await prisma.fundraisingCommunication.count({
      where: { campaign: { name: { in: [...DEMO_CAMPAIGN_NAMES] } } },
    }),
    meetings: await prisma.fundraisingMeeting.count({
      where: { campaign: { name: { in: [...DEMO_CAMPAIGN_NAMES] } } },
    }),
    meetingActionItems: await prisma.fundraisingMeetingActionItem.count({
      where: { meeting: { campaign: { name: { in: [...DEMO_CAMPAIGN_NAMES] } } } },
    }),
    tasks: (
      await prisma.task.findMany({
        where: { taskMetadata: { path: "$.sourceModule", equals: "fundraising" } },
        select: { taskMetadata: true },
      })
    ).filter((t) => String((t.taskMetadata as any)?.demoKey || "").startsWith("arcus-demo:")).length,
    rfps: await prisma.fundraisingRfp.count({
      where: { campaign: { name: { in: [...DEMO_CAMPAIGN_NAMES] } } },
    }),
    mandates: await prisma.fundraisingMandate.count({
      where: { campaign: { name: { in: [...DEMO_CAMPAIGN_NAMES] } } },
    }),
    ddqCases: await prisma.fundraisingDdqCase.count({
      where: { campaign: { name: { in: [...DEMO_CAMPAIGN_NAMES] } } },
    }),
    ddqItems: await prisma.fundraisingDdqItem.count({
      where: { ddqCase: { campaign: { name: { in: [...DEMO_CAMPAIGN_NAMES] } } } },
    }),
    ddqQuestions: await prisma.fundraisingDdqQuestion.count({
      where: { ddqCase: { campaign: { name: { in: [...DEMO_CAMPAIGN_NAMES] } } } },
    }),
    kycCases: await prisma.fundraisingKycCase.count({
      where: { investor: { source: DEMO_SOURCE } },
    }),
    dataRooms: await prisma.fundraisingDataRoom.count({
      where: { campaign: { name: { in: [...DEMO_CAMPAIGN_NAMES] } } },
    }),
    dataRoomDocuments: await prisma.fundraisingDataRoomDocument.count({
      where: { dataRoom: { campaign: { name: { in: [...DEMO_CAMPAIGN_NAMES] } } } },
    }),
    dataRoomAccess: await prisma.fundraisingDataRoomAccess.count({
      where: { dataRoom: { campaign: { name: { in: [...DEMO_CAMPAIGN_NAMES] } } } },
    }),
    dataRoomAccessLogs: await prisma.fundraisingDataRoomAccessLog.count({
      where: { dataRoom: { campaign: { name: { in: [...DEMO_CAMPAIGN_NAMES] } } } },
    }),
    documents: await prisma.fundraisingDocument.count({
      where: { campaign: { name: { in: [...DEMO_CAMPAIGN_NAMES] } } },
    }),
    documentVersions: await prisma.fundraisingDocumentVersion.count({
      where: { document: { campaign: { name: { in: [...DEMO_CAMPAIGN_NAMES] } } } },
    }),
    agreements: await prisma.fundraisingAgreement.count({
      where: { campaign: { name: { in: [...DEMO_CAMPAIGN_NAMES] } } },
    }),
    agreementVersions: await prisma.fundraisingAgreementVersion.count({
      where: { agreement: { campaign: { name: { in: [...DEMO_CAMPAIGN_NAMES] } } } },
    }),
    agreementSignatories: await prisma.fundraisingAgreementSignatory.count({
      where: { agreement: { campaign: { name: { in: [...DEMO_CAMPAIGN_NAMES] } } } },
    }),
    commitments: await prisma.fundraisingCommitment.count({
      where: { campaign: { name: { in: [...DEMO_CAMPAIGN_NAMES] } } },
    }),
    commitmentChecklistItems: await prisma.fundraisingCommitmentChecklistItem.count({
      where: { commitment: { campaign: { name: { in: [...DEMO_CAMPAIGN_NAMES] } } } },
    }),
    closings: await prisma.fundraisingClosing.count({
      where: { campaign: { name: { in: [...DEMO_CAMPAIGN_NAMES] } } },
    }),
    closingReadinessEvents: await prisma.fundraisingClosingReadinessEvent.count({
      where: { closing: { campaign: { name: { in: [...DEMO_CAMPAIGN_NAMES] } } } },
    }),
    placementAgents: await prisma.fundraisingPlacementAgent.count({
      where: { legalName: DEMO_PLACEMENT_AGENT },
    }),
    placementAssignments: await prisma.fundraisingPlacementAssignment.count({
      where: { agent: { legalName: DEMO_PLACEMENT_AGENT } },
    }),
    placementExclusions: await prisma.fundraisingPlacementExclusion.count({
      where: { agent: { legalName: DEMO_PLACEMENT_AGENT } },
    }),
    commissionLedgerEntries: await prisma.fundraisingPlacementCommissionLedgerEntry.count({
      where: { agent: { legalName: DEMO_PLACEMENT_AGENT } },
    }),
    forecasts: await prisma.fundraisingForecastScenario.count({
      where: { campaign: { name: { in: [...DEMO_CAMPAIGN_NAMES] } } },
    }),
    approvals: await prisma.fundraisingApprovalRequest.count({
      where: { objectId: { in: [pendingPe.id, activePe.id] } },
    }),
    approvalEvents: await prisma.fundraisingApprovalEvent.count({
      where: { approval: { objectId: { in: [pendingPe.id, activePe.id] } } },
    }),
    reportJobs: await prisma.fundraisingReportJob.count({
      where: { scheduleId: reportSchedule.id },
    }),
    reportRuns: await prisma.fundraisingReportRun.count({
      where: { scheduleId: reportSchedule.id },
    }),
    campaignTemplates: await prisma.fundraisingCampaignTemplate.count({
      where: { campaign: { name: { in: [...DEMO_CAMPAIGN_NAMES] } } },
    }),
    distributionLists: await prisma.fundraisingCampaignDistributionList.count({
      where: { campaign: { name: { in: [...DEMO_CAMPAIGN_NAMES] } } },
    }),
    campaignEvents: await prisma.fundraisingCampaignEvent.count({
      where: { campaign: { name: { in: [...DEMO_CAMPAIGN_NAMES] } } },
    }),
    campaignMaterials: await prisma.fundraisingCampaignMaterial.count({
      where: { campaign: { name: { in: [...DEMO_CAMPAIGN_NAMES] } } },
    }),
    auditLogs: await prisma.fundraisingAuditLog.count({
      where: {
        OR: [
          { objectId: activePe.id },
          { objectId: oppGepf.id },
          { objectId: commitment.id },
        ],
      },
    }),
  };

  const manifest = {
    database: dbName,
    admin: { id: admin.id, email: admin.email },
    funds: {
      pe: { id: fundPe.id, name: fundPe.name },
      listed: { id: fundListed.id, name: fundListed.name },
    },
    preserved: {
      fundraisingSettings: Boolean(settings),
      pipelineTemplateCount,
    },
    campaigns: {
      activePe: { id: activePe.id, name: activePe.name, status: "ACTIVE" },
      draftPe: { id: draftPe.id, name: draftPe.name, status: "DRAFT" },
      pendingPe: { id: pendingPe.id, name: pendingPe.name, status: "DRAFT", approvalStatus: "PENDING" },
      pausedPe: { id: pausedPe.id, name: pausedPe.name, status: "PAUSED" },
      activeAm: { id: activeAm.id, name: activeAm.name, status: "ACTIVE" },
    },
    investors: Object.fromEntries(
      DEMO_INVESTOR_NAMES.map((name) => [name, investors[name]])
    ),
    opportunities: {
      gepf: oppGepf.id,
      pspf: oppPspf.id,
      bpopf: oppBpopf.id,
      nssa: oppNssa.id,
      oldMutual: oppOldMutual.id,
      stanlibAm: oppStanlibAm.id,
    },
    commitment: { id: commitment.id, amount: 15_000_000 },
    closing: { id: closing.id },
    dataRoom: { id: dataRoom.id },
    mandate: { id: mandate.id },
    rfp: { id: rfp.id },
    ddqCase: { id: ddqCase.id },
    agreement: { id: agreement.id },
    placementAgent: { id: agent.id },
    reportSchedule: { id: reportSchedule.id },
    tabCounts,
  };

  console.log(JSON.stringify(manifest, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
