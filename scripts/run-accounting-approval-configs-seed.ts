//@ts-nocheck
// Idempotent data-seed: creates the ProcurementApprovalConfig + ProcurementApprovalStage that gate
// non-privileged Chart of Accounts edits behind CFO approval (stageType "MASTER_DATA_COA").
// See ApprovalService.createApprovalRequest / updateEntityStatusAfterApproval and
// ChartOfAccountsController.updateChartOfAccounts. Safe to re-run: no-ops once the stage exists.
//
// Usage: npm run db:migrate:accounting-approval-configs-seed
import 'dotenv/config';
import { prisma } from '../src/utils/database';

const CONFIG_NAME = 'Accounting Master Data — Chart of Accounts';
const STAGE_TYPE = 'MASTER_DATA_COA';
// "CFO" is this codebase's established finance-leadership roleCode — already the privileged-bypass
// role in config/cfoModulePermissions.ts (isModulePrivilegedUser/isCfoUser) and the default approver
// role ApprovalService.createApprovalRequest falls back to for its AMOUNT_THRESHOLD stage.
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
  console.log('🔄 Seeding Chart of Accounts master-data approval config...');

  // Idempotency check #1: if any config already has a MASTER_DATA_COA stage, we're done — re-running
  // this script must never create a second stage/config for the same stageType.
  const existingStage = await prisma.procurementApprovalStage.findFirst({
    where: { stageType: STAGE_TYPE },
    include: { config: true },
  });
  if (existingStage) {
    console.log(
      `✅ ${STAGE_TYPE} stage already exists (stage ${existingStage.id}, roleCode=${existingStage.roleCode}, ` +
        `config "${existingStage.config.name}" [${existingStage.configId}]). Nothing to do.`
    );
    await prisma.$disconnect();
    return;
  }

  const creator = await resolveSeedCreator();
  if (!creator) {
    throw new Error(
      'No admin user found (looked for roleCode "ADMIN" or Role.name in Admin/Super Admin/System Administrator) ' +
        'to attribute as createdById for the new ProcurementApprovalConfig. Create/assign an admin user first, then re-run.'
    );
  }
  console.log(`👤 Using creator: ${creator.email || creator.id} (${creator.id})`);

  // Idempotency check #2: reuse a config we previously created by name, in case a prior run created
  // the config but failed before creating the stage.
  let config = await prisma.procurementApprovalConfig.findFirst({ where: { name: CONFIG_NAME } });

  if (!config) {
    config = await prisma.procurementApprovalConfig.create({
      data: {
        name: CONFIG_NAME,
        description: 'Approval gate for Chart of Accounts master-data edits made by non-privileged users (accounting-v52).',
        isActive: true,
        department: 'Finance',
        createdById: creator.id,
      },
    });
    console.log(`➕ Created ProcurementApprovalConfig ${config.id} ("${config.name}").`);
  } else {
    console.log(`🔁 Reusing existing ProcurementApprovalConfig ${config.id} ("${config.name}").`);
  }

  const stage = await prisma.procurementApprovalStage.create({
    data: {
      configId: config.id,
      stageType: STAGE_TYPE,
      stepNumber: 1,
      stepName: 'Chief Financial Officer Review',
      stepType: 'ROLE',
      roleCode: APPROVER_ROLE_CODE,
      isRequired: true,
      canDelegate: false,
      autoApprove: false,
      approvalOrder: 'SEQUENTIAL',
    },
  });
  console.log(`➕ Created ProcurementApprovalStage ${stage.id} (stageType=${STAGE_TYPE}, step 1, roleCode=${APPROVER_ROLE_CODE}).`);

  const approverCount = await prisma.user.count({ where: { roleCode: APPROVER_ROLE_CODE } });
  if (approverCount === 0) {
    console.warn(
      `⚠️  No user currently has roleCode="${APPROVER_ROLE_CODE}". Approval requests for ${STAGE_TYPE} will be ` +
        `created with zero Approval rows (nobody can action them via getMyPendingApprovals/approveApproval) until ` +
        `a user is assigned this role.`
    );
  } else {
    console.log(`✅ ${approverCount} user(s) currently hold roleCode="${APPROVER_ROLE_CODE}" and can approve these requests.`);
  }

  console.log('✅ Done.');
}

main()
  .catch((error) => {
    console.error('❌ Failed to seed accounting approval config:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
