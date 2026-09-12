// @ts-nocheck
/**
 * Delete a user via HTTP (dev/staging/prod).
 * Usage:
 *   USER_ID=cmk24c3zx0011kt83fsuqqn84 API_BASE_URL=https://dev-api.arcus.co.zw npm run uat:delete-user
 */
import "dotenv/config";

const USER_ID = process.env.USER_ID || "cmk24c3zx0011kt83fsuqqn84";
const BASE = (process.env.API_BASE_URL || "https://dev-api.arcus.co.zw").replace(/\/$/, "");
const EMAIL = process.env.TEST_ADMIN_EMAIL || process.env.UAT_EMAIL || "admin@nts.com";
const PASSWORD = process.env.TEST_ADMIN_PASSWORD || process.env.UAT_PASSWORD || "admin123";

async function login(): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD })
  });
  const json = await res.json();
  if (!res.ok || !json?.token) {
    throw new Error(`Login failed (${res.status}): ${JSON.stringify(json)}`);
  }
  console.log(`Logged in as ${EMAIL}`);
  return json.token as string;
}

async function main() {
  console.log(`Target: DELETE ${BASE}/api/users/${USER_ID}`);
  const token = await login();

  const res = await fetch(`${BASE}/api/users/${USER_ID}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
  const json = await res.json().catch(() => ({}));
  console.log(`Status: ${res.status}`);
  console.log(JSON.stringify(json, null, 2));

  if (!res.ok || json?.success === false) {
    process.exit(1);
  }

  const check = await fetch(`${BASE}/api/users/${USER_ID}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log(`Post-delete GET status: ${check.status} (404 expected if removed)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
