/**
 * F.03 UAT — Review integer scale (aligned with BSC 1–6): reject 4.5 and 7; accept integers 1–6.
 * Exercises real HTTP: PUT /api/performance-reviews/:id
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";

const BASE = process.env.API_BASE_URL || `http://127.0.0.1:${process.env.PORT || "3009"}`;
const EMAIL = process.env.TEST_ADMIN_EMAIL || "admin@nts.com";
const PASSWORD = process.env.TEST_ADMIN_PASSWORD || "admin123";

async function req(method: string, path: string, opts: { token?: string; jsonBody?: object } = {}) {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.jsonBody) headers["Content-Type"] = "application/json";
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const r = await fetch(url, {
    method,
    headers,
    body: opts.jsonBody ? JSON.stringify(opts.jsonBody) : undefined
  });
  const text = await r.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text };
  }
  return { status: r.status, json, text };
}

function fail(msg: string): never {
  console.error("F.03 UAT FAILED:", msg);
  process.exit(1);
}

async function main() {
  console.log("F.03 UAT — BASE:", BASE);

  let review = await prisma.performanceReview.findFirst({
    where: { isLocked: false },
    select: { id: true }
  });
  let createdTemp = false;
  if (!review) {
    const u = await prisma.user.findFirst({ select: { id: true } });
    if (!u) {
      fail("No users in DB.");
    }
    review = await prisma.performanceReview.create({
      data: {
        reviewType: "ANNUAL",
        reviewPeriod: "F03-UAT",
        title: "F.03 manager scale UAT (auto)",
        revieweeId: u.id,
        reviewerId: u.id,
        criteria: [],
        scores: [],
        actionItems: []
      },
      select: { id: true }
    });
    createdTemp = true;
    console.log("Created temporary performance_review for UAT:", review.id);
  }

  const login = await req("POST", "/api/auth/login", {
    jsonBody: { email: EMAIL, password: PASSWORD }
  });
  if (login.status !== 200 || !login.json?.token) {
    fail(`Login failed (${login.status}). Start API and check TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD.`);
  }
  const token = login.json.token as string;

  // Invalid: decimal
  let res = await req("PUT", `/api/performance-reviews/${review.id}`, {
    token,
    jsonBody: { scores: [{ criterionId: "uat", managerRating: 4.5 }] }
  });
  if (res.json?.success !== false) {
    fail(`Expected rejection for managerRating 4.5, got: ${res.status} ${res.text?.slice(0, 300)}`);
  }
  const msg45 = String(res.json?.message || "");
  if (!msg45.toLowerCase().includes("whole") && !msg45.toLowerCase().includes("1") && !msg45.toLowerCase().includes("6")) {
    fail(`Unexpected error message for 4.5: "${msg45}"`);
  }
  console.log("OK: 4.5 rejected —", msg45.slice(0, 80));

  // Invalid: out of range
  res = await req("PUT", `/api/performance-reviews/${review.id}`, {
    token,
    jsonBody: { scores: [{ criterionId: "uat", managerRating: 7 }] }
  });
  if (res.json?.success !== false) {
    fail(`Expected rejection for managerRating 7, got: ${res.status} ${res.text?.slice(0, 300)}`);
  }
  console.log("OK: 7 rejected —", String(res.json?.message || "").slice(0, 80));

  // Invalid: ratingValue
  res = await req("PUT", `/api/performance-reviews/${review.id}`, {
    token,
    jsonBody: { ratingValue: 4.5 }
  });
  if (res.json?.success !== false) {
    fail(`Expected rejection for ratingValue 4.5, got: ${res.status}`);
  }
  console.log("OK: ratingValue 4.5 rejected");

  // Valid: integer 4
  res = await req("PUT", `/api/performance-reviews/${review.id}`, {
    token,
    jsonBody: { scores: [{ criterionId: "uat", managerRating: 4 }] }
  });
  if (res.status !== 200 || res.json?.success !== true || !res.json?.data?.id) {
    fail(`Expected success for managerRating 4, got: ${res.status} ${res.text?.slice(0, 400)}`);
  }
  console.log("OK: managerRating 4 accepted");

  // Valid: managerRating 6
  res = await req("PUT", `/api/performance-reviews/${review.id}`, {
    token,
    jsonBody: { scores: [{ criterionId: "uat", managerRating: 6 }] }
  });
  if (res.status !== 200 || res.json?.success !== true || !res.json?.data?.id) {
    fail(`Expected success for managerRating 6, got: ${res.status} ${res.text?.slice(0, 400)}`);
  }
  console.log("OK: managerRating 6 accepted");

  // Valid: ratingValue 6
  res = await req("PUT", `/api/performance-reviews/${review.id}`, {
    token,
    jsonBody: { ratingValue: 6 }
  });
  if (res.status !== 200 || res.json?.success !== true) {
    fail(`Expected success for ratingValue 6, got: ${res.status} ${res.text?.slice(0, 400)}`);
  }
  console.log("OK: ratingValue 6 accepted");

  console.log(JSON.stringify({ uat: "F.03", pass: true, reviewId: review.id }, null, 2));

  if (createdTemp) {
    await prisma.performanceReview.delete({ where: { id: review!.id } }).catch(() => undefined);
    console.log("Removed temporary performance_review.");
  }
}

main()
  .catch((e) => {
    console.error("F.03 UAT FAILED", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
