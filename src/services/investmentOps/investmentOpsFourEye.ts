// @ts-nocheck
import { InvestmentOpsError } from "../../middleware/investmentOpsFoundation";
import { prisma } from "../../utils/database";

export function investmentOpsIsAdmin(user: any): boolean {
  const roleName = String(user?.role?.name || "").trim().toLowerCase();
  const roleCode = String(user?.roleCode || "").trim().toLowerCase();
  return ["admin", "system administrator"].includes(roleName) || roleCode === "admin";
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
