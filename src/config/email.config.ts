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
