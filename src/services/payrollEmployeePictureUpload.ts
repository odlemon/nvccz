// @ts-nocheck
import type { Request } from "express";
import { RemoteUploadService, rewritePublicMediaUrl } from "./RemoteUploadService";

export function payrollFormField(req: Request, key: string): string | undefined {
  const v = req.body?.[key];
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

/**
 * Prefer multipart file field `picture`; fall back to `pictureUrl` text (legacy).
 */
export async function resolveEmployeePictureUrl(req: Request): Promise<string | null> {
  const file = (req as { file?: Express.Multer.File }).file;
  if (file?.buffer?.length) {
    const upload = await new RemoteUploadService().uploadFiles(file, "payroll-employee-pictures");
    if (!upload?.success || !upload.files?.length) {
      throw new Error(upload?.error || "Employee picture upload failed");
    }
    return upload.files[0].url;
  }
  const legacyUrl = payrollFormField(req, "pictureUrl");
  return legacyUrl ?? null;
}

/** Public URL for profile photo; `picture` mirrors `pictureUrl` for the payroll UI. */
export function formatEmployeeForApi<T extends { pictureUrl?: string | null }>(employee: T) {
  const raw = employee.pictureUrl ?? null;
  const pictureUrl = raw ? rewritePublicMediaUrl(raw) || raw : null;
  return {
    ...employee,
    pictureUrl,
    picture: pictureUrl,
  };
}
