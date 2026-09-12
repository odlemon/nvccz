/**
 * UAT — LP Portal MFA enrollment flow.
 * Run: npm run uat:lp-portal:mfa
 */
import "dotenv/config";
import speakeasy from "speakeasy";

const BASE = process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3009}/api`;
const EMAIL = process.env.UAT_EMAIL ?? "admin@nts.com";
const PASSWORD = process.env.UAT_PASSWORD ?? "admin123";

async function login() {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const json = await res.json();
  return json.token as string;
}

async function main() {
  const token = await login();
  if (!token) {
    console.error("login failed");
    process.exit(1);
  }

  const enroll = await fetch(`${BASE}/auth/mfa/enroll`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const enrollJson = await enroll.json();
  console.log(`[${enroll.status === 200 ? "PASS" : "FAIL"}] mfa enroll: status ${enroll.status}`);

  const manualKey = enrollJson?.data?.manualEntryKey;
  if (!manualKey) {
    console.log("skip confirm — no manual key");
    process.exit(enroll.status === 200 ? 0 : 1);
  }

  const totp = speakeasy.totp({ secret: manualKey, encoding: "base32" });
  const confirm = await fetch(`${BASE}/auth/mfa/confirm-enrollment`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ token: totp }),
  });
  console.log(`[${confirm.status === 200 ? "PASS" : "FAIL"}] mfa confirm: status ${confirm.status}`);
  process.exit(confirm.status === 200 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
