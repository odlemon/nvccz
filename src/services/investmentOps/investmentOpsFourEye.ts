// @ts-nocheck
import { prisma } from "../../utils/database";

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
  approverId: string
) {
  if (!(await isFourEyeOrdersEnabled())) return;
  const creatorId = order.createdById;
  if (creatorId && creatorId === approverId) {
    throw new Error("Four-eye policy: approver must differ from order creator");
  }
}
