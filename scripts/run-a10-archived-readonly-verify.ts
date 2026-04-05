/**
 * Verifies archived strategy cannot be updated (A.10). Requires running API.
 * Example archived id: cmnk9hslm000bunpg7goyud82 (override with ARCHIVED_STRATEGY_ID).
 */
import "dotenv/config";

const BASE = process.env.API_BASE_URL || `http://127.0.0.1:${process.env.PORT || "3009"}`;
const STRATEGY_ID = process.env.ARCHIVED_STRATEGY_ID || "cmnk9hslm000bunpg7goyud82";
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

  const put = await fetch(`${BASE}/api/performance/config/strategies/${STRATEGY_ID}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ visionStatement: "must not persist" })
  });
  const putJson = await put.json();
  if (put.status !== 403 || putJson?.success !== false) {
    console.error("Expected 403 on PUT archived strategy, got", put.status, putJson);
    process.exit(1);
  }
  if (!String(putJson?.message || "").includes("read-only")) {
    console.error("Unexpected message:", putJson?.message);
    process.exit(1);
  }
  console.log("OK: PUT archived strategy -> 403", putJson.message);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
