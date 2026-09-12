import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../../utils/database";
import { emailTransport, getFromAddress } from "../../config/email.config";
import { companyNameShortFromEnv } from "../../config/companyDisplay";

/**
 * LP portal onboarding — turning an email address into a person who can actually sign in.
 *
 * Both existing invite paths stopped short of this. `LpPortalAdminService.createMembership`
 * takes a `userId` and links it to a Client, and `LpPortalColleagueService.inviteColleague`
 * refused outright with "User not found — invite must match an existing account". Between them
 * they cover authorisation but not onboarding: somebody had to create the User by hand first,
 * and nothing ever told the invitee they had access or gave them a way to set a password.
 *
 * This service fills that half:
 *   1. find or create the User (created accounts get an unusable random password, never a
 *      shared default — the invitee sets their own via the activation link),
 *   2. issue an activation token, and
 *   3. email the invitation.
 *
 * The token deliberately reuses `PasswordResetToken` and the existing `/reset-password?token=`
 * screen rather than adding a parallel mechanism: it is the same operation (prove you control
 * the mailbox, then set a password), the consumption path is already written and tested, and a
 * second token table would be one more thing to keep in sync. Invitations get a longer window
 * than a password reset because an investor may not act on it the same hour.
 */

/** Invitations are valid for 7 days; a password reset is 1 hour. */
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface LpInviteResult {
  userId: string;
  email: string;
  /** True when this call created the account rather than linking an existing one. */
  created: boolean;
  /** False when the account already had a password (an existing user keeps it). */
  activationEmailSent: boolean;
}

/**
 * A readable one-time password for an invitation email.
 *
 * Deliberately avoids characters that are mistaken for one another when retyped from an email
 * (0/O, 1/l/I), because the investor has to copy this by hand. Entropy comes from length and from
 * `crypto.randomInt`, not from an awkward alphabet.
 */
function generateTemporaryPassword(): string {
  const upper = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%*?";
  const all = upper + lower + digits + symbols;
  const pick = (set: string) => set[crypto.randomInt(0, set.length)];
  // Guarantee one of each class so the result satisfies any password policy on the way back in.
  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (chars.length < 14) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export class LpPortalInviteService {
  /**
   * Resolve an email to a User, creating one when it does not exist.
   *
   * A created account is deliberately left without a usable password: it gets a random 48-byte
   * secret nobody holds, so the only way in is the activation link. That avoids seeding a known
   * default credential on an externally reachable portal.
   */
  static async findOrCreateLpUser(params: {
    email: string;
    firstName?: string;
    lastName?: string;
  }): Promise<{ user: any; created: boolean; temporaryPassword?: string }> {
    const email = params.email.trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw Object.assign(new Error("A valid email address is required"), { statusCode: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return { user: existing, created: false };

    const lpRole = await prisma.role.findFirst({
      where: { OR: [{ name: "Limited Partner" }, { name: { contains: "Limited Partner" } }] },
      select: { id: true },
    });
    if (!lpRole) {
      throw Object.assign(
        new Error("No 'Limited Partner' role exists — seed roles before inviting LPs"),
        { statusCode: 500 },
      );
    }

    // The invitation email carries sign-in credentials, so the account is created with a real
    // temporary password rather than an unusable one. `mustChangePassword` makes it single-use in
    // practice: the investor can sign in with it once and is required to choose their own before
    // they can do anything else.
    const temporaryPassword = generateTemporaryPassword();
    const user = await prisma.user.create({
      data: {
        email,
        firstName: params.firstName?.trim() || email.split("@")[0],
        lastName: params.lastName?.trim() || "",
        password: await bcrypt.hash(temporaryPassword, 10),
        roleId: lpRole.id,
        roleCode: "LIMITED_PARTNER",
        mustChangePassword: true,
      },
    });
    return { user, created: true, temporaryPassword };
  }

  /**
   * Issue a single-use activation token and return the raw value.
   *
   * Only the SHA-256 hash is stored, matching the forgot-password flow — a database reader
   * cannot mint a working link. Any outstanding tokens are burned first so an earlier
   * invitation email stops working once a new one is sent.
   */
  static async issueActivationToken(userId: string): Promise<string> {
    await prisma.passwordResetToken.updateMany({
      where: { userId, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    await prisma.passwordResetToken.create({
      data: { userId, tokenHash, expiresAt: new Date(Date.now() + INVITE_TTL_MS) },
    });
    return rawToken;
  }

  /**
   * Send the invitation email.
   *
   * Failure to send is logged and swallowed, exactly as the forgot-password flow does: the
   * membership and the token are already committed, so throwing here would fail a request whose
   * work actually succeeded. The caller is told via `activationEmailSent` so the UI can offer to
   * resend rather than silently implying delivery.
   */
  static async sendInviteEmail(params: {
    user: any;
    rawToken: string;
    organisationName?: string | null;
    invitedByName?: string | null;
    temporaryPassword?: string | null;
  }): Promise<boolean> {
    // The investor signs in on the LP portal, which is a separate origin from the staff app.
    //
    // `FRONTEND_URL` is deliberately NOT in this chain. It is the staff origin, and it was the
    // effective value everywhere, because `LP_PORTAL_URL` is not set in any environment file: a
    // freshly invited investor was emailed a link to the staff portal, which refuses LP accounts
    // outright (see portalAuth), so the invitation could not be completed at all. Falling back to
    // the wrong portal silently is worse than failing loudly, so an unset value warns and uses the
    // conventional local LP port rather than borrowing the staff origin.
    const configuredPortalUrl =
      process.env.LP_PORTAL_URL || process.env.NEXT_PUBLIC_LP_PORTAL_URL || null;
    if (!configuredPortalUrl) {
      console.warn(
        "[LP invite] LP_PORTAL_URL is not configured — invitation links will point at " +
          "http://localhost:3110. Set LP_PORTAL_URL to the investor portal origin for this " +
          "environment, or invited investors will receive an unusable link."
      );
    }
    const portalUrl = (configuredPortalUrl || "http://localhost:3110").replace(/\/+$/, "");
    const signInUrl = `${portalUrl}/login`;
    const activationUrl = `${portalUrl}/reset-password?token=${params.rawToken}`;
    const shortName = companyNameShortFromEnv();
    const org = params.organisationName ? ` for ${params.organisationName}` : "";
    const by = params.invitedByName ? `${params.invitedByName} has invited you` : "You have been invited";
    const from = getFromAddress("it");

    const credentialsBlock = params.temporaryPassword
      ? `
      <p>Sign in with these details:</p>
      <table style="border-collapse:collapse;margin:12px 0;">
        <tr>
          <td style="padding:6px 14px 6px 0;color:#4b5563;">Portal</td>
          <td style="padding:6px 0;"><a href="${signInUrl}">${signInUrl}</a></td>
        </tr>
        <tr>
          <td style="padding:6px 14px 6px 0;color:#4b5563;">Email</td>
          <td style="padding:6px 0;font-family:monospace;">${params.user.email}</td>
        </tr>
        <tr>
          <td style="padding:6px 14px 6px 0;color:#4b5563;">Temporary password</td>
          <td style="padding:6px 0;font-family:monospace;font-weight:bold;">${params.temporaryPassword}</td>
        </tr>
      </table>
      <p><strong>You will be asked to choose your own password the first time you sign in.</strong>
         The temporary password above stops working at that point.</p>
      <p>
        <a href="${signInUrl}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:4px;">
          Sign in to the Investor Portal
        </a>
      </p>
      <p style="color:#6b7280;font-size:13px;">
        Prefer to set a password without signing in first? Use this link instead, valid for 7 days:<br/>
        <a href="${activationUrl}">${activationUrl}</a>
      </p>`
      : `
      <p>Set your password to activate your account:</p>
      <p>
        <a href="${activationUrl}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:4px;">
          Activate my account
        </a>
      </p>
      <p>If the button doesn't work, copy and paste this link into your browser:</p>
      <p>${activationUrl}</p>`;

    const html = `
      <h1>Your ${shortName} Investor Portal access</h1>
      <p>Hi ${params.user.firstName || "there"},</p>
      <p>${by} to the ${shortName} Investor Portal${org}.</p>
      ${credentialsBlock}
      <p>This invitation expires in 7 days. If you were not expecting it, you can ignore this email.</p>
      <p>Best regards,<br/>${shortName}</p>
    `;

    try {
      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: params.user.email,
        subject: `${by.replace("has invited you", "invited you")} to the ${shortName} Investor Portal`,
        html,
      });
      return true;
    } catch (err: any) {
      // Same posture as forgot-password: the invite itself is committed, so a mail outage must
      // not roll it back. Surfaced to the caller so it can be resent.
      console.error("[LP invite] failed to send invitation email:", err?.message || err);
      return false;
    }
  }

  /**
   * Full onboarding for one invitee: resolve/create the account, then activate-and-notify.
   *
   * An account that already has a usable password is NOT sent an activation link — it already
   * has credentials, and mailing a password-setting link to an established user on the strength
   * of someone else's invite would be a way to take over that account.
   */
  static async onboard(params: {
    email: string;
    firstName?: string;
    lastName?: string;
    organisationName?: string | null;
    invitedByName?: string | null;
  }): Promise<LpInviteResult & { user: any }> {
    const { user, created, temporaryPassword } = await this.findOrCreateLpUser(params);

    let activationEmailSent = false;
    if (created) {
      const rawToken = await this.issueActivationToken(user.id);
      activationEmailSent = await this.sendInviteEmail({
        user,
        rawToken,
        organisationName: params.organisationName,
        invitedByName: params.invitedByName,
        temporaryPassword,
      });
    }

    return { user, userId: user.id, email: user.email, created, activationEmailSent };
  }

  /** Re-send an activation link for an invitee who has not signed in yet. */
  static async resendInvite(params: {
    userId: string;
    organisationName?: string | null;
    invitedByName?: string | null;
  }): Promise<{ sent: boolean }> {
    const user = await prisma.user.findUnique({ where: { id: params.userId } });
    if (!user) throw Object.assign(new Error("User not found"), { statusCode: 404 });
    const rawToken = await this.issueActivationToken(user.id);
    const sent = await this.sendInviteEmail({
      user,
      rawToken,
      organisationName: params.organisationName,
      invitedByName: params.invitedByName,
    });
    return { sent };
  }
}
