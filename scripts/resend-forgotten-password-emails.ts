/**
 * Resend password-reset emails only (no DB password changes).
 * Uses the passwords issued in the prior reset-forgotten-passwords-batch run.
 *
 * Usage: npx ts-node scripts/resend-forgotten-password-emails.ts
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";
import { emailTransport, getFromAddress } from "../src/config/email.config";

/** Plaintext passwords from the initial batch reset — do not regenerate. */
const CREDENTIALS: Record<string, string> = {
  "brendon@nvccz.com": "g9bQum6&$LBxM8LD",
  "gilbert@nvccz.com": "KuFZ*K3k7AQu#Cg!",
  "blessingmwalein+100@gmail.com": "F@W2V!ycq!qGp!M3",
  "leona@nvcc.com": "4bUC6*&BBZbnxF$A",
  "mutandani@nvccz.com": "iw#6omVxq@o75j#S",
  "natsai@nvccz.com": "2SR$z#7@RvzP8b2w",
  "nyashakarata1@gmail.com": "UmigoRP9n%iCLRyw",
  "blessingmwalein+101@gmail.com": "#z!9fJ8UeG6nJQRc",
  "sibusiswe@nvccz.com": "Y6dWQ3!f2bMGFjDz",
  "sophia@nvccz.com": "KTddo@nWQPo4%x5n",
  "tino@nvccz.com": "Wj4#9cQ2vXMk#Jt4",
  "vongai@nvccz.com": "VC!v5cdjx!U*D7UK",
};

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
  const company = process.env.COMPANY_NAME_SHORT || "NVCCZ";
  const loginUrl = process.env.FRONTEND_URL || "(not set)";
  console.log(`Resending emails only — company: ${company}, login URL: ${loginUrl}/login\n`);

  let ok = 0;
  let failed = 0;

  for (const [rawEmail, password] of Object.entries(CREDENTIALS)) {
    const email = rawEmail.trim().toLowerCase();

    const user = await prisma.user.findFirst({
      where: { email: { equals: email } },
      select: { email: true, firstName: true, lastName: true },
    });

    if (!user) {
      console.error(`NOT FOUND: ${email}`);
      failed++;
      continue;
    }

    const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();

    try {
      await sendPasswordResetEmail({
        email: user.email,
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        password,
      });
      console.log(`OK: resent to ${user.email} (${displayName})`);
      ok++;
    } catch (err: any) {
      console.error(`ERROR: ${email} — ${err?.message || err}`);
      failed++;
    }
  }

  console.log(`\nDone: ${ok} resent, ${failed} failed/not found`);
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
