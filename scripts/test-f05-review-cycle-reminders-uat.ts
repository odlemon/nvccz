/**
 * F.05 UAT — POST /api/performance-reviews/cycles/:cycleId/initiate
 * Creates a narrow-window cycle + one eligible manager-created review, then runs reminders.
 * Eligible review: active Employee reviewee, self stage, no self content, reviewer ≠ reviewee,
 * overlaps cycle window, cycleId null (linked on success).
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
  console.error("F.05 UAT FAILED:", msg);
  process.exit(1);
}

async function main() {
  console.log("F.05 UAT — review cycle reminders — BASE:", BASE);

  const login = await req("POST", "/api/auth/login", {
    jsonBody: { email: EMAIL, password: PASSWORD }
  });
  if (login.status !== 200 || !login.json?.token) {
    fail(`Login failed (${login.status}). Start API and check credentials.`);
  }
  const token = login.json.token as string;
  const admin = await prisma.user.findFirst({
    where: { email: EMAIL },
    select: { id: true }
  });
  if (!admin) fail(`No user with email ${EMAIL}`);

  const emp = await prisma.employee.findFirst({
    where: { isActive: true, userId: { not: admin.id } },
    select: { userId: true }
  });
  if (!emp) {
    fail("No active Employee with userId different from admin — add an employee row for UAT.");
  }
  const revieweeId = emp.userId;

  const tag = `F05UAT${Date.now()}`;
  const cycleStart = "2099-06-01T00:00:00.000Z";
  const cycleEnd = "2099-06-30T23:59:59.999Z";
  const selfDeadline = "2099-06-15T23:59:59.999Z";
  const peerDeadline = "2099-06-20T23:59:59.999Z";
  const mgrDeadline = "2099-06-25T23:59:59.999Z";

  const createCycle = await req("POST", "/api/performance/review-cycles", {
    token,
    jsonBody: {
      title: `Annual ${tag}`,
      reviewPeriodStart: cycleStart,
      reviewPeriodEnd: cycleEnd,
      selfAssessmentDeadline: selfDeadline,
      peerReviewDeadline: peerDeadline,
      managerReviewDeadline: mgrDeadline,
      availableReviewTypes: ["Self", "Manager", "Peer"],
      reviewRatingScale: "1-5 Scale"
    }
  });
  if (!createCycle.json?.success || !createCycle.json?.data?.id) {
    fail(`Create cycle failed: ${createCycle.status} ${createCycle.text?.slice(0, 400)}`);
  }
  const cycleId = createCycle.json.data.id as string;
  console.log("Created cycle:", cycleId);

  const reviewStart = "2099-06-10T00:00:00.000Z";
  const reviewEnd = "2099-06-28T00:00:00.000Z";

  const createReview = await req("POST", "/api/performance-reviews", {
    token,
    jsonBody: {
      reviewType: "ANNUAL",
      reviewPeriod: `2099-Q2-${tag}`,
      title: `Manager-created review ${tag}`,
      revieweeId,
      reviewerId: admin.id,
      reviewStartDate: reviewStart,
      reviewEndDate: reviewEnd,
      criteria: [],
      scores: []
    }
  });
  if (!createReview.json?.success || !createReview.json?.data?.id) {
    fail(`Create review failed: ${createReview.status} ${createReview.text?.slice(0, 400)}`);
  }
  const reviewId = createReview.json.data.id as string;
  console.log("Created review:", reviewId, "revieweeId:", revieweeId);

  const initiate = await req("POST", `/api/performance-reviews/cycles/${cycleId}/initiate`, {
    token
  });

  if (initiate.status !== 200 || initiate.json?.success !== true) {
    fail(`Initiate failed: ${initiate.status} ${initiate.text?.slice(0, 500)}`);
  }

  const d = initiate.json.data;
  console.log("Initiate response data:", JSON.stringify(d, null, 2));

  if (d.cycleId !== cycleId) {
    fail(`cycleId mismatch in response`);
  }
  if (typeof d.emailsSent !== "number" || typeof d.emailsFailed !== "number") {
    fail("Response missing emailsSent / emailsFailed");
  }

  if (d.emailsSent < 1 && d.emailsFailed < 1) {
    fail(
      `No email attempts — likely eligibility filter skipped our review. skippedIneligible=${d.skippedIneligible} candidates=${d.candidatesConsidered}`
    );
  }

  if (d.emailsSent >= 1) {
    console.log("OK: at least one reminder email was sent.");
  } else {
    console.warn(
      "UAT partial: emailsFailed=",
      d.emailsFailed,
      "(check SMTP / ZeptoMail). HTTP initiate path completed.",
      d.errors?.length ? d.errors : ""
    );
  }

  const reviewAfter = await prisma.performanceReview.findUnique({
    where: { id: reviewId },
    select: { cycleId: true, dueDate: true }
  });
  if (d.emailsSent >= 1 && reviewAfter?.cycleId !== cycleId) {
    fail("Expected review.cycleId set after successful email");
  }
  if (d.emailsSent >= 1) {
    console.log("OK: review linked to cycle; dueDate:", reviewAfter?.dueDate);
  }

  await prisma.performanceReview.deleteMany({ where: { id: reviewId } });
  await prisma.performanceReviewCycle.deleteMany({ where: { id: cycleId } });
  console.log("Cleaned up test review + cycle.");
  console.log("F.05 UAT finished.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
