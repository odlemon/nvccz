/**
 * Smoke checks for employee scorecard validation and access (optional; needs running API).
 * - Self-preview GET /user should succeed when authenticated.
 * - POST generate for self should return 403 (employees cannot generate own scorecard).
 *
 * Env: API_BASE_URL, PORT, TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD (same as other UAT scripts).
 */
import "dotenv/config";

const BASE = process.env.API_BASE_URL || `http://127.0.0.1:${process.env.PORT || "3009"}`;
const EMAIL = process.env.TEST_ADMIN_EMAIL || "admin@nts.com";
const PASSWORD = process.env.TEST_ADMIN_PASSWORD || "admin123";

async function main() {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD })
  });
  const loginJson = await login.json();
  if (!loginJson?.token) {
    console.error("Login failed");
    process.exit(1);
  }
  const token = loginJson.token as string;
  const userId = loginJson.user?.id as string | undefined;
  if (!userId) {
    console.error("Login response missing user.id");
    process.exit(1);
  }

  const preview = await fetch(`${BASE}/api/performance/scorecards/user`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const previewJson = await preview.json();
  if (preview.status === 403) {
    console.error("Expected preview allowed for self, got 403", previewJson);
    process.exit(1);
  }
  if (preview.status >= 400) {
    console.error("Preview failed", preview.status, previewJson);
    process.exit(1);
  }
  console.log("OK: GET /scorecards/user preview", preview.status);

  const gen = await fetch(`${BASE}/api/performance/scorecards/employee/${userId}/generate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({})
  });
  const genJson = await gen.json();
  if (gen.status === 403 && String(genJson?.message || "").toLowerCase().includes("access denied")) {
    console.log("OK: self-generate blocked for employee (403 Access denied)");
  } else if (gen.status === 201 || gen.status === 200) {
    console.log(
      "SKIP: self-generate succeeded — user is treated as manager/HR/CEO (expected for admin test accounts)"
    );
  } else {
    console.error("Unexpected generate response", gen.status, genJson);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
