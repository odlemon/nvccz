/**
 * Idempotent DEV seed: LP + investee portal test logins on `nts`.
 *
 * Usage: npm run db:seed:portal-test-users
 */
// @ts-nocheck
import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { assertDevDatabase } from "./lib/assert-dev-database";

const prisma = new PrismaClient() as any;

const PASSWORD = "PortalTest!2026";

const LP_EMAIL = "lp.test@arcus.co.zw";
const INVESTEE_EMAIL = "investee.test@arcus.co.zw";
const INVESTEE_BUSINESS = "Arcus Demo Investee Co";

async function ensureRole(name: string, description: string) {
  let role = await prisma.role.findUnique({ where: { name } });
  if (!role) {
    role = await prisma.role.create({
      data: { name, description, permissions: [] },
    });
    console.log(`[ok] created role ${name}`);
  }
  return role;
}

async function ensureUser(opts: {
  email: string;
  firstName: string;
  lastName: string;
  roleId: string;
  roleCode: string;
}) {
  const hash = await bcrypt.hash(PASSWORD, 10);
  let user = await prisma.user.findUnique({ where: { email: opts.email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: opts.email,
        password: hash,
        firstName: opts.firstName,
        lastName: opts.lastName,
        roleId: opts.roleId,
        roleCode: opts.roleCode,
      },
    });
    console.log(`[ok] created user ${opts.email}`);
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hash,
        firstName: opts.firstName,
        lastName: opts.lastName,
        roleId: opts.roleId,
        roleCode: opts.roleCode,
      },
    });
    console.log(`[ok] upserted user ${opts.email}`);
  }
  return user;
}

async function seedLpUser() {
  const lpRole =
    (await prisma.role.findFirst({
      where: {
        OR: [{ name: { contains: "Limited" } }, { name: { contains: "Partner" } }, { name: "limited_partner" }],
      },
    })) || (await ensureRole("Limited Partner", "LP portal test role"));

  const user = await ensureUser({
    email: LP_EMAIL,
    firstName: "LP",
    lastName: "Tester",
    roleId: lpRole.id,
    roleCode: "LIMITED_PARTNER",
  });

  let client = await prisma.client.findFirst({
    where: { OR: [{ email: LP_EMAIL }, { userId: user.id }] },
  });
  if (!client) {
    client = await prisma.client.create({
      data: {
        investorId: "LP-TEST-001",
        type: "institutional",
        legalName: "Arcus LP Test Account",
        email: LP_EMAIL,
        country: "ZW",
        status: "ACTIVE",
        userId: user.id,
      },
    });
    console.log("[ok] created LP client");
  } else {
    await prisma.client.update({
      where: { id: client.id },
      data: {
        userId: user.id,
        status: "ACTIVE",
        email: LP_EMAIL,
        legalName: "Arcus LP Test Account",
      },
    });
    console.log("[ok] linked LP client");
  }

  await prisma.lpUserRelation.upsert({
    where: {
      userId_clientId: { userId: user.id, clientId: client.id },
    },
    create: {
      userId: user.id,
      clientId: client.id,
      lpRole: "VIEWER",
      isActive: true,
    },
    update: { lpRole: "VIEWER", isActive: true },
  });
  console.log("[ok] lp_user_relation ready");
}

async function seedInvesteeUser() {
  const applicantRole = await ensureRole("applicant", "Investee portal test role");
  const user = await ensureUser({
    email: INVESTEE_EMAIL,
    firstName: "Investee",
    lastName: "Tester",
    roleId: applicantRole.id,
    roleCode: "applicant",
  });

  let application = await prisma.application.findFirst({
    where: { applicantEmail: INVESTEE_EMAIL },
  });
  if (!application) {
    application = await prisma.application.create({
      data: {
        applicantName: "Investee Tester",
        applicantEmail: INVESTEE_EMAIL,
        applicantPhone: "+263770000001",
        applicantAddress: "1 Demo Street, Harare",
        businessName: INVESTEE_BUSINESS,
        businessDescription: "Demo investee for portal login testing.",
        industry: "Technology",
        businessStage: "GROWTH",
        requestedAmount: new Decimal(250_000),
        currentStage: "ACTIVE_DD",
        submittedAt: new Date(),
      },
    });
    console.log("[ok] created application");
  } else {
    console.log("[ok] application already exists");
  }

  return { user, application };
}

async function main() {
  await assertDevDatabase(prisma, "seed:portal-test-users");
  console.log("=== Portal test users (DEV only) ===");
  await seedLpUser();
  await seedInvesteeUser();
  console.log("");
  console.log("LP portal:");
  console.log(`  email:    ${LP_EMAIL}`);
  console.log(`  password: ${PASSWORD}`);
  console.log("");
  console.log("Investee portal:");
  console.log(`  email:    ${INVESTEE_EMAIL}`);
  console.log(`  password: ${PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
