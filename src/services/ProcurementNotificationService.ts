// @ts-nocheck
import { prisma } from "../utils/database";
import { emitToUsers } from "./RealtimeSocketService";
import { emailTransport, getFromAddress } from "../config/email.config";
import {
  getEmailBrandingCached,
  renderEmailHeader,
  renderEmailFooter,
  renderEmailSignature,
} from "../utils/emailBranding";
import { wrapTransactionalNewsletterEmailDocument } from "../utils/newsletterEmailLayout";

export interface ProcurementNotificationEmail {
  to: string[];
  subject: string;
  /** Just the message body -- header, footer and signature are added automatically from the shared template. */
  bodyInnerHtml: string;
  preheader?: string;
}

export interface DispatchProcurementNotificationParams {
  /** Staff/internal user ids to notify in-app and push in real time. Omit for vendor-only events (vendors have no in-app account). */
  userIds?: string[];
  title: string;
  message: string;
  /** Short, unique event code, e.g. "PROCUREMENT_GRN_RECORDED". Used as the Notification.type and the realtime payload's type. */
  type: string;
  relatedEntity?: string;
  relatedEntityId?: string;
  data?: Record<string, unknown>;
  /** In-app row only: no live push (a person's own receipt should not pop up over what they just did). */
  quiet?: boolean;
  email?: ProcurementNotificationEmail;
}

/**
 * The one shared handoff-notification path for Procurement: an in-app row (pushed live over the
 * existing socket channel other modules already use) and a branded email, from a single call.
 * Adding a new procurement notification should mean calling this with new params, not writing a
 * new in-app+email pipeline per event.
 *
 * Each half is independent and best-effort: an email transport failure (e.g. no SMTP configured,
 * as on dev today) never blocks the in-app notification, and vice versa.
 */
export async function dispatchProcurementNotification(
  params: DispatchProcurementNotificationParams
): Promise<{ inAppCount: number; emailSent: boolean; emailBlocked?: boolean; emailError?: string }> {
  let inAppCount = 0;
  if (params.userIds?.length) {
    try {
      const uniqueUserIds = Array.from(new Set(params.userIds.filter(Boolean)));
      if (uniqueUserIds.length) {
        await prisma.notification.createMany({
          data: uniqueUserIds.map((userId) => ({
            title: params.title,
            message: params.message,
            type: params.type,
            userId,
            data: params.data ?? undefined,
            relatedEntity: params.relatedEntity,
            relatedEntityId: params.relatedEntityId,
          })),
        });
        inAppCount = uniqueUserIds.length;
        if (!params.quiet) emitToUsers(uniqueUserIds, "notification_created", {
          type: params.type,
          title: params.title,
          message: params.message,
          relatedEntity: params.relatedEntity,
          relatedEntityId: params.relatedEntityId,
          ...(params.data ?? {}),
        });
      }
    } catch (err: any) {
      console.error(`[ProcurementNotification] in-app dispatch failed for type=${params.type}:`, err?.message || err);
    }
  }

  let emailSent = false;
  let emailBlocked = false;
  let emailError: string | undefined;
  if (params.email?.to?.length) {
    try {
      const branding = await getEmailBrandingCached();
      const headerAndTitleTrsHtml = renderEmailHeader(branding, {
        title: params.email.subject,
        tagline: "Procurement",
      });
      const footerTrHtml = renderEmailFooter(branding);
      const signatureHtml = renderEmailSignature("Procurement Team", branding);
      const html = wrapTransactionalNewsletterEmailDocument({
        pageTitle: params.email.subject,
        preheader: params.email.preheader || params.message,
        headerAndTitleTrsHtml,
        bodyInnerHtml: params.email.bodyInnerHtml + signatureHtml,
        footerTrHtml,
      });
      const from = getFromAddress("procurement");
      const info: any = await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: params.email.to.join(", "),
        subject: params.email.subject,
        html,
      });
      emailSent = true;
      emailBlocked = /mail-guard\.local|Blocked by MAIL_REDIRECT/i.test(String(info?.messageId ?? "") + String(info?.response ?? ""));
    } catch (err: any) {
      emailError = err?.message || String(err);
      console.error(`[ProcurementNotification] email send failed for type=${params.type}:`, emailError);
    }
  }

  return { inAppCount, emailSent, emailBlocked, emailError };
}
