// @ts-nocheck
import nodemailer from 'nodemailer';

// Centralized Email Configuration - All settings hardcoded here
export const emailConfig = {
  // SMTP Configuration
  smtp: {
    host: "smtp.zeptomail.com",
    port: 587,
    auth: {
      user: "emailapikey",
      pass: "wSsVR61/qEShC6x4zjT7IOowmVlWBlKiF0gv3QfzvST8HqqT/cdqnkfNU1KnFfhOEmY7QTQVp7kvkEpU1zFdh9x+ngkICyiF9mqRe1U4J3x17qnvhDzIWmRdkxeKLY8IzwVommVjG88l+g=="
    }
  },
  
  // From Address Configuration
  fromAddress: "noreply@ntsarcus.com",
  
  // From Names by Module (using environment variables)
  fromNames: {
    investment: process.env.EMAIL_FROM_NAME_INVESTMENT || "NVCCZ Investment Team",
    payroll: process.env.EMAIL_FROM_NAME_PAYROLL || "NVCCZ Payroll Team",
    procurement: process.env.EMAIL_FROM_NAME_PROCUREMENT || "NVCCZ Procurement Team",
    finance: process.env.EMAIL_FROM_NAME_FINANCE || "NVCCZ Finance Team",
    events: process.env.EMAIL_FROM_NAME_EVENTS || "NVCCZ Events Team",
    it: process.env.EMAIL_FROM_NAME_IT || "NVCCZ IT Team",
    platform: process.env.EMAIL_FROM_NAME_PLATFORM || "NVCCZ Investment Platform",
    default: process.env.EMAIL_FROM_NAME_DEFAULT || "NVCCZ Notifications"
  }
};

// Create and export nodemailer transport
export const emailTransport = nodemailer.createTransport({
  host: emailConfig.smtp.host,
  port: emailConfig.smtp.port,
  secure: false, // Use TLS for port 587
  auth: {
    user: emailConfig.smtp.auth.user,
    pass: emailConfig.smtp.auth.pass
  },
  tls: {
    rejectUnauthorized: false // Allow self-signed certificates if needed
  }
});

// Verify email transport connection on startup (optional - can be called manually)
export async function verifyEmailConnection(): Promise<boolean> {
  try {
    await emailTransport.verify();
    console.log('✅ Email transport connection verified successfully');
    return true;
  } catch (error: any) {
    console.error('❌ Email transport connection failed:', error);
    return false;
  }
}

// Helper function to get from address with name
export function getFromAddress(module: keyof typeof emailConfig.fromNames | 'default' = 'default'): { name: string; address: string } {
  return {
    name: emailConfig.fromNames[module] || emailConfig.fromNames.default,
    address: emailConfig.fromAddress
  };
}

