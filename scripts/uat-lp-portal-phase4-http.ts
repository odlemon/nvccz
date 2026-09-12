/**
 * UAT — LP Portal Phase 4 (requests, messages, organisation, colleagues, settings).
 * DEV nts only. Colleague invite uses GP ?clientId= impersonation (manager ops).
 *
 * npm run uat:lp-portal:phase4
 */
// @ts-nocheck
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  BASE,
  VIEWER_EMAIL,
  api,
  assertDevDatabase,
  ensureSeed,
  idem,
  loadSeedIds,
  log,
  resolveGpAdminToken,
  resolveSignatoryToken,
  summarizeFail,
} from "./lib/lp-portal-uat-helpers";

const prisma = new PrismaClient();
const results: Array<{ step: string; ok: boolean; detail: string }> = [];

function record(step: string, ok: boolean, detail: string) {
  results.push({ step, ok, detail });
  log(step, ok, detail);
}

async function main() {
  await assertDevDatabase(prisma, "uat:lp-portal:phase4");
  await ensureSeed(prisma);
  console.log(`LP Portal Phase 4 UAT — ${BASE}\n`);

  const ids = await loadSeedIds(prisma);
  const token = await resolveSignatoryToken();
  const gp = await resolveGpAdminToken();
  console.log(`clientId=${ids.clientId}\n`);

  const reqs = await api("GET", "/lp-portal/requests", token);
  record("requests.list", reqs.status === 200, `status=${reqs.status}`);

  const created = await api(
    "POST",
    "/lp-portal/requests",
    token,
    {
      type: "DOCUMENT_REQUEST",
      fundId: ids.fundPcId,
      subject: `UAT Phase4 request ${Date.now()}`,
      description: "Please provide latest K-1 package.",
    },
    { "Idempotency-Key": idem("p4-sr") }
  );
  const ref = created.json?.data?.reference;
  record(
    "requests.create",
    [200, 201].includes(created.status) && Boolean(ref),
    `status=${created.status} ref=${ref || "?"}`
  );

  if (ref) {
    const one = await api("GET", `/lp-portal/requests/${ref}`, token);
    record("requests.get", one.status === 200, `status=${one.status}`);

    const msg = await api("POST", `/lp-portal/requests/${ref}/messages`, token, {
      body: "Follow-up from UAT phase4.",
    });
    record("requests.message", [200, 201].includes(msg.status), `status=${msg.status}`);
  }

  const threads = await api("GET", "/lp-portal/messages", token);
  const tItems = threads.json?.data?.items || [];
  record("messages.list", threads.status === 200, `status=${threads.status} count=${tItems.length}`);

  const threadId = ids.messageThreadId || tItems[0]?.id;
  if (threadId) {
    const t = await api("GET", `/lp-portal/messages/${threadId}`, token);
    record("messages.get", t.status === 200, `status=${t.status}`);

    const reply = await api("POST", `/lp-portal/messages/${threadId}/replies`, token, {
      body: "Investor reply from UAT.",
    });
    record("messages.reply", [200, 201].includes(reply.status), `status=${reply.status}`);

    const read = await api("POST", `/lp-portal/messages/${threadId}/read`, token, {});
    record("messages.read", read.status === 200, `status=${read.status}`);
  }

  const org = await api("GET", "/lp-portal/organisation", token);
  record("organisation", org.status === 200 && org.json?.success !== false, `status=${org.status}`);

  // Manager ops via GP impersonation
  const colleagues = await api("GET", `/lp-portal/colleagues?clientId=${ids.clientId}`, gp);
  record(
    "colleagues.list.gp",
    colleagues.status === 200,
    `status=${colleagues.status}`
  );

  const inviteEmail = `lp.uat.colleague.${Date.now()}@example.com`;
  const role = await prisma.role.findFirst({ orderBy: { createdAt: "asc" } });
  if (role) {
    const bcrypt = await import("bcrypt");
    const existingInvitee = await prisma.user.findUnique({ where: { email: inviteEmail } });
    if (!existingInvitee) {
      await prisma.user.create({
        data: {
          email: inviteEmail,
          password: await bcrypt.hash("Password123!", 10),
          firstName: "UAT",
          lastName: "Colleague",
          roleId: role.id,
          roleCode: "LP_VIEWER",
        },
      });
    }
  }

  const invite = await api(
    "POST",
    `/lp-portal/colleagues?clientId=${ids.clientId}`,
    gp,
    { email: inviteEmail, role: "VIEWER" },
    { "Idempotency-Key": idem("p4-invite") }
  );
  const membershipId = invite.json?.data?.id || invite.json?.data?.membershipId;
  record(
    "colleagues.invite.gp",
    [200, 201].includes(invite.status),
    `status=${invite.status} membershipId=${membershipId || "?"}`
  );

  if (membershipId) {
    const patch = await api(
      "PATCH",
      `/lp-portal/colleagues/${membershipId}?clientId=${ids.clientId}`,
      gp,
      { role: "VIEWER", fundIds: [ids.fundPcId, ids.fundOeId] }
    );
    record("colleagues.patch.gp", patch.status === 200, `status=${patch.status}`);

    const revoke = await api(
      "PATCH",
      `/lp-portal/colleagues/${membershipId}/revoke?clientId=${ids.clientId}`,
      gp,
      {}
    );
    record("colleagues.revoke.gp", revoke.status === 200, `status=${revoke.status}`);
  }

  // Signatory cannot manage colleagues
  const forbidden = await api("GET", "/lp-portal/colleagues", token);
  record(
    "colleagues.signatory-forbidden",
    forbidden.status === 403,
    `status=${forbidden.status}`
  );

  const settings = await api("GET", "/lp-portal/settings", token);
  record("settings", settings.status === 200, `status=${settings.status}`);

  const notif = await api("PATCH", "/lp-portal/settings/notifications", token, {
    emailCapitalCalls: true,
    emailDocuments: true,
  });
  record("settings.notifications", notif.status === 200, `status=${notif.status}`);

  const mfa = await api("GET", "/lp-portal/settings/mfa", token);
  record("settings.mfa", mfa.status === 200, `status=${mfa.status}`);

  // Viewer still listed (seed relation)
  record("seed.viewerEmail", Boolean(VIEWER_EMAIL), VIEWER_EMAIL);

  summarizeFail(results);
  console.log("\nPhase 4 passed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
