/**
 * Proves the outbound-mail guard in src/config/email.config.ts actually holds.
 *
 * Writing a guard and trusting it is how a half-configured interceptor gets
 * relied on while it quietly delivers. This calls the real exported transport
 * in each of the three configurations and reports what happened. The redirect
 * case is the only one that touches SMTP, so it is skipped unless
 * MAIL_REDIRECT_TO is set and --live is passed.
 *
 * Run: npx ts-node --transpile-only scripts/_uat/verify-mail-guard.ts
 */
const LIVE = process.argv.includes("--live");

async function withEnv(env: Record<string, string>, label: string) {
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  // Fresh module instance so the guard re-evaluates the env at import time.
  const modPath = require.resolve("../../src/config/email.config");
  delete require.cache[modPath];
  const { emailTransport } = require(modPath);

  const result = await emailTransport.sendMail({
    from: '"Guard test" <noreply@example.invalid>',
    to: "lp-should-never-receive@example.invalid",
    cc: "second-should-never-receive@example.invalid",
    subject: "Mail guard verification",
    html: "<p>If this reaches a real inbox the guard has failed.</p>",
  });
  console.log(`\n[${label}]`);
  console.log(`  response  : ${result.response}`);
  console.log(`  accepted  : ${JSON.stringify(result.accepted)}`);
  console.log(`  messageId : ${result.messageId}`);
  return result;
}

(async () => {
  const blocked = await withEnv(
    { MAIL_REDIRECT_ENFORCE: "true", MAIL_REDIRECT_TO: "" },
    "enforce=true, no address — must NOT send",
  );
  const ok = blocked.accepted.length === 0 && String(blocked.response).includes("Blocked");
  console.log(`  VERDICT   : ${ok ? "PASS — nothing sent" : "FAIL — the guard let it through"}`);

  if (LIVE && process.env.MAIL_REDIRECT_TO) {
    await withEnv(
      { MAIL_REDIRECT_ENFORCE: "true", MAIL_REDIRECT_TO: process.env.MAIL_REDIRECT_TO },
      `enforce=true, redirect to ${process.env.MAIL_REDIRECT_TO} — one real send`,
    );
    console.log("  VERDICT   : check that inbox; subject should be prefixed [TEST -> ...]");
  } else {
    console.log("\n[redirect case] skipped — needs MAIL_REDIRECT_TO set and --live");
  }
  process.exit(ok ? 0 : 1);
})();
