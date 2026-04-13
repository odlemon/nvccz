/**
 * One-off: duplicate CEO resolution — keep Tatenda R as CEO, move Takudzwa C to another role.
 * Run: npx ts-node scripts/fix-duplicate-ceo-reassign-takudzwa.ts
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";

const KEEP_CEO_ID = "cmhlnqd460001unnslmw98ry8"; // Tatenda R
const REASSIGN_USER_ID = "cmk24c3zx0011kt83fsuqqn84"; // Takudzwa C

/** Prefer a concrete Investments / analyst-style role if present; else first role that is not CEO-like */
async function pickReplacementRoleId(): Promise<{ id: string; name: string }> {
  const roles = await prisma.role.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
  const notCeo = (n: string) => {
    const l = n.toLowerCase();
    return !l.includes("chief executive") && l !== "ceo" && !/^ceo\b/.test(l);
  };
  const preferred =
    roles.find((r) => notCeo(r.name) && /invest|analyst|officer|member|employee/i.test(r.name)) ||
    roles.find((r) => notCeo(r.name) && /finance|human|legal|marketing|operations/i.test(r.name)) ||
    roles.find((r) => notCeo(r.name));
  if (!preferred) throw new Error("No non-CEO role found in roles table.");
  return preferred;
}

async function main() {
  const tak = await prisma.user.findUnique({
    where: { id: REASSIGN_USER_ID },
    include: { role: true }
  });
  if (!tak) throw new Error(`User not found: ${REASSIGN_USER_ID}`);

  console.log("Before:", {
    id: tak.id,
    name: `${tak.firstName} ${tak.lastName}`,
    email: tak.email,
    roleId: tak.roleId,
    roleName: tak.role?.name,
    roleCode: tak.roleCode
  });

  const replacement = await pickReplacementRoleId();
  console.log(`Assigning replacement role: ${replacement.name} (${replacement.id})`);

  await prisma.user.update({
    where: { id: REASSIGN_USER_ID },
    data: {
      roleId: replacement.id,
      roleCode: replacement.name === "Board Member" ? "BOARD_MEMBER" : null
    }
  });

  const after = await prisma.user.findUnique({
    where: { id: REASSIGN_USER_ID },
    include: { role: true }
  });
  console.log("After:", {
    id: after?.id,
    roleName: after?.role?.name,
    roleCode: after?.roleCode
  });

  console.log("Done. Tatenda R remains CEO; Takudzwa C now uses a non-CEO role.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
