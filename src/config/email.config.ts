// @ts-nocheck
import nodemailer from 'nodemailer';

/**
 * SMTP credentials are hardcoded (ZeptoMail) for now — From *domain* only.
 * Display names come from `.env` (EMAIL_FROM_NAME_* / COMPANY_NAME_*).
 */
export const emailConfig = {
  smtp: {
    host: "smtp.zeptomail.com",
    port: 587,
    auth: {
      user: "emailapikey",
      pass: "wSsVR60jq0L4Cqt4mDz/I7s7nllWU1zyQUwsiQOi7iL1TfHH98c7kE3NAQauHfNKQGNgQjEbrbt4mhcIgTFciYgon1pRDCiF9mqRe1U4J3x17qnvhDzNXWRblBKALIoMxw1onGlpGsgj+g==",
    },
  },

  // SMTP From address (domain). Names are NOT hardcoded — see fromNames.
  fromAddress: process.env.EMAIL_FROM_ADDRESS || "noreply@khayalami.co.zw",

  fromNames: {
    verification:
      process.env.EMAIL_FROM_NAME_DEFAULT ||
      process.env.COMPANY_NAME_SHORT ||
      "Notifications",
    security: process.env.COMPANY_NAME_SHORT
      ? `${process.env.COMPANY_NAME_SHORT} Security`
      : process.env.EMAIL_FROM_NAME_DEFAULT || "Security",
    notifications:
      process.env.EMAIL_FROM_NAME_DEFAULT ||
      process.env.COMPANY_NAME_SHORT ||
      "Notifications",
    investment:
      process.env.EMAIL_FROM_NAME_INVESTMENT ||
      process.env.COMPANY_NAME_SHORT ||
      "Investment Team",
    payroll:
      process.env.EMAIL_FROM_NAME_PAYROLL ||
      process.env.COMPANY_NAME_SHORT ||
      "Payroll Team",
    procurement:
      process.env.EMAIL_FROM_NAME_PROCUREMENT ||
      process.env.COMPANY_NAME_SHORT ||
      "Procurement Team",
    finance:
      process.env.EMAIL_FROM_NAME_FINANCE ||
      process.env.COMPANY_NAME_SHORT ||
      "Finance Team",
    events:
      process.env.EMAIL_FROM_NAME_EVENTS ||
      process.env.COMPANY_NAME_SHORT ||
      "Events Team",
    it:
      process.env.EMAIL_FROM_NAME_IT ||
      process.env.COMPANY_NAME_SHORT ||
      "IT Team",
    platform:
      process.env.EMAIL_FROM_NAME_PLATFORM ||
      process.env.COMPANY_NAME_SHORT ||
      "Investment Platform",
    default:
      process.env.EMAIL_FROM_NAME_DEFAULT ||
      process.env.COMPANY_NAME_SHORT ||
      "Notifications",
  },
};

export const emailTransport = nodemailer.createTransport({
  host: emailConfig.smtp.host,
  port: emailConfig.smtp.port,
  secure: false,
  requireTLS: true,
  connectionTimeout: 20000,
  greetingTimeout: 20000,
  socketTimeout: 30000,
  auth: {
    user: emailConfig.smtp.auth.user,
    pass: emailConfig.smtp.auth.pass,
  },
  tls: {
    rejectUnauthorized: false,
    minVersion: "TLSv1.2",
  },
});

/**
 * ---------------------------------------------------------------------------
 * Outbound-mail safety interceptor
 * ---------------------------------------------------------------------------
 * This module exports ONE transport, and 52 call sites across 9 services use
 * it — AuthController, EmailNotificationService, LpPortalInviteService,
 * FundraisingMailerService and others. The only place every recipient can be
 * intercepted at once is here.
 *
 * OFF BY DEFAULT. With MAIL_REDIRECT_ENFORCE unset, sendMail is untouched and
 * production behaviour is exactly what it was.
 *
 * With MAIL_REDIRECT_ENFORCE=true:
 *   MAIL_REDIRECT_TO set   -> every to/cc/bcc is replaced by that one address.
 *                             The real recipients survive in the subject and in
 *                             an X-Original-To header, so a test can still
 *                             assert who the message was addressed to.
 *   MAIL_REDIRECT_TO unset -> NOTHING is sent. The message is logged and a
 *                             nodemailer-shaped result is returned, because
 *                             callers read .messageId and .response.
 *
 * Fail-closed is deliberate. A half-configured guard that quietly delivers is
 * worse than no guard, because it gets trusted: LP invitations and payslip
 * notices go to real people, and this transport has live SMTP credentials.
 */
const MAIL_ENFORCE = String(process.env.MAIL_REDIRECT_ENFORCE || "").toLowerCase() === "true";
const MAIL_REDIRECT_TO = String(process.env.MAIL_REDIRECT_TO || "").trim();

if (MAIL_ENFORCE) {
  const realSendMail = emailTransport.sendMail.bind(emailTransport);

  /** nodemailer accepts a string, an {name,address} object, or an array of either. */
  const flatten = (v) => {
    if (!v) return "";
    if (Array.isArray(v)) return v.map(flatten).filter(Boolean).join(", ");
    if (typeof v === "string") return v;
    return v.address || "";
  };

  emailTransport.sendMail = async (options = {}) => {
    const original = ["to", "cc", "bcc"]
      .map((k) => flatten(options[k]))
      .filter(Boolean)
      .join("; ");
    const subject = options.subject || "";

    if (!MAIL_REDIRECT_TO) {
      console.warn(
        `[mail:BLOCKED] to="${original}" subject="${subject}" — MAIL_REDIRECT_ENFORCE is on and MAIL_REDIRECT_TO is not set, so nothing was sent.`,
      );
      return {
        messageId: `<blocked-${Date.now()}@mail-guard.local>`,
        accepted: [],
        rejected: [],
        pending: [],
        response: "250 Blocked by MAIL_REDIRECT_ENFORCE (MAIL_REDIRECT_TO is not configured)",
        envelope: { from: options.from, to: [] },
      };
    }

    console.warn(`[mail:REDIRECT] to="${original}" -> ${MAIL_REDIRECT_TO} subject="${subject}"`);
    return realSendMail({
      ...options,
      to: MAIL_REDIRECT_TO,
      cc: undefined,
      bcc: undefined,
      subject: `[TEST -> ${original}] ${subject}`,
      headers: { ...(options.headers || {}), "X-Original-To": original },
    });
  };

  console.warn(
    MAIL_REDIRECT_TO
      ? `[mail-guard] ACTIVE — every outbound message is redirected to ${MAIL_REDIRECT_TO}`
      : `[mail-guard] ACTIVE — outbound mail is BLOCKED. Set MAIL_REDIRECT_TO to deliver to a single inbox instead.`,
  );
}

export async function verifyEmailConnection(): Promise<boolean> {
  try {
    await emailTransport.verify();
    console.log("✅ Email transport connection verified successfully");
    return true;
  } catch (error: any) {
    console.error("❌ Email transport connection failed:", error);
    return false;
  }
}

export function getFromAddress(
  module: keyof typeof emailConfig.fromNames | "default" = "default"
): { name: string; address: string } {
  return {
    name: emailConfig.fromNames[module] || emailConfig.fromNames.default,
    address: emailConfig.fromAddress,
  };
}

/** Company short name from env — for email body / public pages. */
export function getCompanyShortName(): string {
  return process.env.COMPANY_NAME_SHORT || process.env.EMAIL_FROM_NAME_DEFAULT || "Investment Platform";
}
