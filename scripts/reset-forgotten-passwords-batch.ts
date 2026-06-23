/**
 * Reset passwords for users who forgot them: generate random passwords,
 * update DB, email each user, and print credentials for admin testing.
 *
 * Usage: npx ts-node scripts/reset-forgotten-passwords-batch.ts
 */
import "dotenv/config";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { prisma } from "../src/utils/database";
import { emailTransport, getFromAddress } from "../src/config/email.config";

const TARGET_EMAILS = [
  "brendon@nvccz.com",
  "gilbert@nvccz.com",
  "blessingmwalein+100@gmail.com",
  "leona@nvcc.com",
  "mutandani@nvccz.com",
  "natsai@nvccz.com",
  "nyashakarata1@gmail.com",
  "blessingmwalein+101@gmail.com",
  "sibusiswe@nvccz.com",
  "sophia@nvccz.com",
  "tino@nvccz.com",
  "vongai@nvccz.com",
];

function generateSecurePassword(length = 16): string {
  const uppercase = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lowercase = "abcdefghijkmnopqrstuvwxyz";
  const numbers = "23456789";
  const special = "!@#$%&*";
  const all = uppercase + lowercase + numbers + special;

  const pick = (chars: string) => chars[crypto.randomInt(chars.length)];

  const chars = [pick(uppercase), pick(lowercase), pick(numbers), pick(special)];
  while (chars.length < length) {
    chars.push(pick(all));
  }

  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
}

function passwordResetEmailHtml(params: {
  displayName: string;
  email: string;
  password: string;
}): string {
  const company = process.env.COMPANY_NAME_SHORT || "NVCCZ";
  const loginUrl = `${process.env.FRONTEND_URL || "http://app.kyntaro.com"}/login`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Your new ${company} password</title></head>
<body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;">
  <p>Hi ${params.displayName},</p>
  <p>Your password has been reset. Use the credentials below to log into the platform:</p>
  <div style="background:#f4f6f8;padding:16px;border-radius:6px;margin:20px 0;">
    <p style="margin:0 0 8px;"><strong>Email:</strong> ${params.email}</p>
    <p style="margin:0;"><strong>New password:</strong> <code style="background:#fff;padding:2px 6px;border-radius:3px;">${params.password}</code></p>
  </div>
  <p>Please change your password after you log in.</p>
  <p><a href="${loginUrl}" style="display:inline-block;padding:10px 18px;background:#007bff;color:#fff;text-decoration:none;border-radius:4px;">Log in</a></p>
  <p style="color:#666;font-size:13px;">If you did not request this reset, please contact IT immediately.</p>
</body>
</html>`;
}

function passwordResetEmailText(params: {
  displayName: string;
  email: string;
  password: string;
}): string {
  const company = process.env.COMPANY_NAME_SHORT || "NVCCZ";
  const loginUrl = `${process.env.FRONTEND_URL || "http://app.kyntaro.com"}/login`;

  return `Hi ${params.displayName},

Your password has been reset. Use the credentials below to log into the ${company} platform:

Email: ${params.email}
New password: ${params.password}

Please change your password after you log in.

Login: ${loginUrl}

If you did not request this reset, please contact IT immediately.`;
}

async function sendPasswordResetEmail(params: {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
}): Promise<void> {
  const displayName = [params.firstName, params.lastName].filter(Boolean).join(" ").trim() || params.email;
  const company = process.env.COMPANY_NAME_SHORT || "NVCCZ";
  const from = getFromAddress("it");

  await emailTransport.sendMail({
    from: `"${from.name}" <${from.address}>`,
    to: `"${displayName}" <${params.email}>`,
    subject: `Your new ${company} password`,
    html: passwordResetEmailHtml({ displayName, email: params.email, password: params.password }),
    text: passwordResetEmailText({ displayName, email: params.email, password: params.password }),
  });
}

async function main() {
  const results: Array<{
    email: string;
    name: string;
    password: string;
    status: "ok" | "not_found" | "error";
    message?: string;
  }> = [];

  console.log(`Processing ${TARGET_EMAILS.length} users...\n`);

  for (const rawEmail of TARGET_EMAILS) {
    const email = rawEmail.trim().toLowerCase();

    const user = await prisma.user.findFirst({
      where: { email: { equals: email } },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!user) {
      console.error(`NOT FOUND: ${email}`);
      results.push({ email, name: "", password: "", status: "not_found" });
      continue;
    }

    const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
    const newPassword = generateSecurePassword();

    try {
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await prisma.$executeRawUnsafe(
        `UPDATE users SET password = ?, updatedAt = NOW() WHERE id = ?`,
        hashedPassword,
        user.id
      );

      await sendPasswordResetEmail({
        email: user.email,
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        password: newPassword,
      });

      console.log(`OK: ${user.email} (${displayName}) — password reset and email sent`);
      results.push({
        email: user.email,
        name: displayName,
        password: newPassword,
        status: "ok",
      });
    } catch (err: any) {
      console.error(`ERROR: ${email} — ${err?.message || err}`);
      results.push({
        email,
        name: displayName,
        password: "",
        status: "error",
        message: err?.message || String(err),
      });
    }
  }

  console.log("\n" + "=".repeat(72));
  console.log("CREDENTIALS FOR TESTING");
  console.log("=".repeat(72));

  for (const r of results) {
    if (r.status === "ok") {
      console.log(`${r.email} | ${r.name} | ${r.password}`);
    } else if (r.status === "not_found") {
      console.log(`${r.email} | NOT FOUND IN DATABASE`);
    } else {
      console.log(`${r.email} | FAILED: ${r.message}`);
    }
  }

  console.log("=".repeat(72));

  const ok = results.filter((r) => r.status === "ok").length;
  const failed = results.length - ok;
  console.log(`\nDone: ${ok} succeeded, ${failed} failed/not found`);

  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e?.message || e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
