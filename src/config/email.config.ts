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
      pass: "wSsVR60l/RH4Bqx1mjyuJeg/y19XAFj/FUQujlLz6XP8HPnDpscywkDKUVCmHPgdRGNoEjoS8rJ/mR8H1DMN294lyVsCWyiF9mqRe1U4J3x17qnvhDzJWWlZkRqLJYsMxQRunGdhE8on+g=="
    }
  },
  
  // From Address Configuration
  fromAddress: "noreply@kyntaro.com",
  
  // From Names by Module
  fromNames: {
    investment: "NVCCZ Investment Team",
    payroll: "NVCCZ Payroll Team",
    procurement: "NVCCZ Procurement Team",
    finance: "NVCCZ Finance Team",
    events: "NVCCZ Events Team",
    it: "NVCCZ IT Team",
    platform: "NVCCZ Investment Platform",
    default: "NVCCZ Notifications"
  }
};

// Create and export nodemailer transport
export const emailTransport = nodemailer.createTransport({
  host: emailConfig.smtp.host,
  port: emailConfig.smtp.port,
  auth: {
    user: emailConfig.smtp.auth.user,
    pass: emailConfig.smtp.auth.pass
  }
});

// Helper function to get from address with name
export function getFromAddress(module: keyof typeof emailConfig.fromNames | 'default' = 'default'): { name: string; address: string } {
  return {
    name: emailConfig.fromNames[module] || emailConfig.fromNames.default,
    address: emailConfig.fromAddress
  };
}

