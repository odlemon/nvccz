//@ts-nocheck
// Idempotent data-seed: creates the ProcurementApprovalConfig + two ProcurementApprovalStage rows
// that gate non-privileged Payment execution (stageType "PAYMENT_EXECUTION") and Investment booking
// (stageType "INVESTMENT_BOOKING") behind CFO approval. Mirrors
// scripts/run-accounting-approval-configs-seed.ts (MASTER_DATA_COA), seeded earlier the same day —
// see ApprovalService.createApprovalRequest / updateEntityStatusAfterApproval,
// PurchaseInvoiceController.payInvoice/payBatch and ShortTermInvestmentController.createInstrument.
// Safe to re-run: no-ops per stageType once its stage exists.
//
// Usage: npm run db:migrate:payment-investment-approval-configs-seed
import 'dotenv/config';
import { prisma } from '../src/utils/database';

const CONFIG_NAME = 'Accounting — Payment & Investment Execution Approval';
const STAGE_TYPES = ['PAYMENT_EXECUTION', 'INVESTMENT_BOOKING'] as const;
const STAGE_STEP_NAMES: Record<(typeof STAGE_TYPES)[number], string> = {
  PAYMENT_EXECUTION: 'Chief Financial Officer Review — Payment Execution',
  INVESTMENT_BOOKING: 'Chief Financial Officer Review — Investment Booking',
};
// "CFO" is this codebase's established finance-leadership roleCode — already the privileged-bypass
// role in config/cfoModulePermissions.ts (isModulePrivilegedUser/isCfoUser) and the approver role
// used by the MASTER_DATA_COA precedent, so the same CFO test user can approve all three types.
const APPROVER_ROLE_CODE = 'CFO';

async function resolveSeedCreator() {
  const byRoleCode = await prisma.user.findFirst({
    where: { roleCode: { in: ['ADMIN', 'admin', 'Admin'] } },
    orderBy: { createdAt: 'asc' },
  });
  if (byRoleCode) return byRoleCode;

  const byRoleName = await prisma.user.findFirst({
    where: { role: { name: { in: ['Admin', 'Super Admin', 'super admin', 'System Administrator'] } } },
    orderBy: { createdAt: 'asc' },
  });
  return byRoleName;
}

async function main() {
  console.log('🔄 Seeding Payment/Investment execution approval config...');

  const creator = await resolveSeedCreator();
  if (!creator) {
    throw new Error(
      'No admin user found (looked for roleCode "ADMIN" or Role.name in Admin/Super Admin/System Administrator) ' +
        'to attribute as createdById for the new ProcurementApprovalConfig. Create/assign an admin user first, then re-run.'
    );
  }
  console.log(`👤 Using creator: ${creator.email || creator.id} (${creator.id})`);

  // Reuse a config we previously created by name, in case a prior run created the config but not
  // both stages (e.g. failed partway through).
  let config = await prisma.procurementApprovalConfig.findFirst({ where: { name: CONFIG_NAME } });

  if (!config) {
    config = await prisma.procurementApprovalConfig.create({
      data: {
        name: CONFIG_NAME,
        description:
          'Approval gate for Payables payment execution (single/batch pay) and Short-Term Investment ' +
          'booking made by non-privileged users, at/above their respective USD-equivalent thresholds ' +
          '(see PaymentInvestmentApprovalService).',
        isActive: true,
        department: 'Finance',
        createdById: creator.id,
      },
    });
    console.log(`➕ Created ProcurementApprovalConfig ${config.id} ("${config.name}").`);
  } else {
    console.log(`🔁 Reusing existing ProcurementApprovalConfig ${config.id} ("${config.name}").`);
  }

  for (const stageType of STAGE_TYPES) {
    // Idempotency: if any config already has a stage for this stageType, skip it — re-running this
    // script must never create a second stage/config for the same stageType.
    const existingStage = await prisma.procurementApprovalStage.findFirst({
      where: { stageType },
      include: { config: true },
    });
    if (existingStage) {
      console.log(
        `✅ ${stageType} stage already exists (stage ${existingStage.id}, roleCode=${existingStage.roleCode}, ` +
          `config "${existingStage.config.name}" [${existingStage.configId}]). Nothing to do.`
      );
      continue;
    }

    const stage = await prisma.procurementApprovalStage.create({
      data: {
        configId: config.id,
        stageType,
        stepNumber: 1,
        stepName: STAGE_STEP_NAMES[stageType],
        stepType: 'ROLE',
        roleCode: APPROVER_ROLE_CODE,
        isRequired: true,
        canDelegate: false,
        autoApprove: false,
        approvalOrder: 'SEQUENTIAL',
      },
    });
    console.log(`➕ Created ProcurementApprovalStage ${stage.id} (stageType=${stageType}, step 1, roleCode=${APPROVER_ROLE_CODE}).`);
  }

  const approverCount = await prisma.user.count({ where: { roleCode: APPROVER_ROLE_CODE } });
  if (approverCount === 0) {
    console.warn(
      `⚠️  No user currently has roleCode="${APPROVER_ROLE_CODE}". Approval requests for ${STAGE_TYPES.join(
        ' / '
      )} will be created with zero Approval rows (nobody can action them via getMyPendingApprovals/approveApproval) until a user is assigned this role.`
    );
  } else {
    console.log(`✅ ${approverCount} user(s) currently hold roleCode="${APPROVER_ROLE_CODE}" and can approve these requests.`);
  }

  console.log('✅ Done.');
}

main()
  .catch((error) => {
    console.error('❌ Failed to seed payment/investment approval config:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
