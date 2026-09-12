// @ts-nocheck
import { InvestmentOpsError } from "../../middleware/investmentOpsFoundation";
import { prisma } from "../../utils/database";

export function investmentOpsIsAdmin(user: any): boolean {
  const roleName = String(user?.role?.name || user?.roleName || "").trim().toLowerCase();
  const roleCode = String(user?.roleCode || user?.role?.code || "").trim().toLowerCase();
  const email = String(user?.email || "").trim().toLowerCase();
  if (["admin", "system administrator", "super admin", "superadmin"].includes(roleName)) return true;
  if (["admin", "system_admin", "super_admin"].includes(roleCode)) return true;
  // Local/demo convention: platform admin mailbox
  if (email === "admin@nts.com" || email.startsWith("admin@")) return true;
  if (user?.isAdmin === true || user?.role?.isSystem === true) return true;
  return false;
}

/** Skip maker/checker and four-eye when the actor is an admin (demo/UAT convenience). */
export function assertFourEyeSeparation(
  makerId: string | null | undefined,
  actorId: string,
  user: any,
  message = "Maker cannot act on their own item"
): void {
  if (investmentOpsIsAdmin(user)) return;
  if (makerId && String(makerId) === String(actorId)) {
    throw new InvestmentOpsError("FOUR_EYE_VIOLATION", message, 403);
  }
}

export async function isFourEyeOrdersEnabled(): Promise<boolean> {
  const row = await prisma.investmentOpsSetting.findUnique({
    where: { settingKey: "four_eye_orders" },
  });
  if (!row?.settingValue) return false;
  const v = row.settingValue as { enabled?: boolean };
  return v.enabled === true;
}

export async function assertFourEyeApproval(
  order: { createdById?: string | null; submittedAt?: Date | null },
  approverId: string,
  user?: any
) {
  if (user && investmentOpsIsAdmin(user)) return;
  if (!(await isFourEyeOrdersEnabled())) return;
  const creatorId = order.createdById;
  if (creatorId && creatorId === approverId) {
    throw new Error("Four-eye policy: approver must differ from order creator");
  }
}
