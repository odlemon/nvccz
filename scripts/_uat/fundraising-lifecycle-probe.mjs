/**
 * Fundraising lifecycle — pipeline to commitment to approval to closing.
 *
 * Roadmap F.1, F.2, F.3 and F.5. Runs the full cycle as the Fund Manager, the
 * module's real write persona, and reconciles the money afterwards rather than
 * trusting the screen:
 *
 *   campaign -> opportunity -> stage transitions -> commitment
 *            -> approval request -> decision -> closing
 *   then: campaign raised == sum of its commitments
 *
 * The brief asks for two cycles, so it runs twice by default and reports each.
 * Everything it creates is removed at the end unless --keep is passed.
 *
 * Run:  node scripts/_uat/fundraising-lifecycle-probe.mjs [--cycles=2] [--keep]
 * Exit: 0 = every assertion held, 1 = at least one failed
 */
import { PrismaClient } from "@prisma/client";

const API = process.env.API_BASE || "http://127.0.0.1:3009/api";
const arg = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};
const CYCLES = Number(arg("cycles", "2"));
const KEEP = process.argv.includes("--keep");
const prisma = new PrismaClient();

const MAKER = "fr.fundmanager@nts.local";
const PASSWORD = "admin123";
const TAG = "UAT-F1";

const failures = [];
const created = { campaigns: [], opportunities: [], commitments: [], closings: [], approvals: [] };
const ok = (l, d = "") => console.log(`    PASS  ${l}${d ? "  " + d : ""}`);
const bad = (l, d = "") => { failures.push(`${l}${d ? " — " + d : ""}`); console.log(`    FAIL  ${l}${d ? "  " + d : ""}`); };

async function login(email) {
  const r = await fetch(`${API}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, portal: "staff" }),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.token) throw new Error(`login failed for ${email}: ${j.message || r.status}`);
  return j.token;
}

async function call(token, path, method = "GET", body) {
  const r = await fetch(`${API}/fundraising${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  let payload = null;
  try { payload = await r.json(); } catch { /* status classifies it */ }
  const data = payload && (payload.data ?? payload);
  const msg = payload?.error?.message || payload?.message || "";
  return { status: r.status, data, msg };
}

const num = (v) => Number(v ?? 0);
const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;

async function runCycle(token, n, fundId, investorId) {
  console.log(`\n=== cycle ${n} ===`);
  const AMOUNT = 10_000_000 + n * 1_000_000;

  // --- 1. campaign -------------------------------------------------------
  const camp = await call(token, "/campaigns", "POST", {
    name: `${TAG} Campaign ${n}`, fundId, targetAmount: 50_000_000, currency: "USD",
    startDate: "2026-09-01", closeDate: "2027-03-31",
  });
  if (!camp.data?.id) { bad("create campaign", `${camp.status} ${camp.msg}`); return; }
  created.campaigns.push(camp.data.id);
  ok("campaign created", camp.data.id);

  // --- 1b. campaign approval and activation ------------------------------
  // A campaign starts DRAFT and refuses opportunities until it is ACTIVE:
  // "Campaign must be ACTIVE to create opportunities". Activation runs through
  // its own approval, so the lifecycle is submit -> decide -> activate.
  const sub = await call(token, `/campaigns/${camp.data.id}/submit-for-approval`, "POST", {
    reason: `${TAG} activation request`,
  });
  sub.status === 200 || sub.status === 201
    ? ok("campaign submitted for approval")
    : bad("campaign submitted for approval", `${sub.status} ${sub.msg}`);

  const pending = await prisma.$queryRawUnsafe(
    "SELECT id FROM fundraising_approval_requests WHERE object_id = ? AND status = 'PENDING' ORDER BY created_at DESC LIMIT 1",
    camp.data.id,
  );
  if (pending.length) {
    created.approvals.push(pending[0].id);
    const d = await call(token, `/approvals/${pending[0].id}/decide`, "POST", {
      decision: "APPROVED", decisionNotes: `${TAG} activation approved`,
    });
    d.status === 200 ? ok("activation approval decided") : bad("activation approval decided", `${d.status} ${d.msg}`);
  } else {
    console.log("    NOTE  submit-for-approval raised no PENDING approval request");
  }

  const act = await call(token, `/campaigns/${camp.data.id}/activate`, "POST", {});
  act.status === 200 || act.status === 201
    ? ok("campaign activated")
    : bad("campaign activated", `${act.status} ${act.msg}`);

  // --- 2. opportunity ----------------------------------------------------
  const opp = await call(token, "/opportunities", "POST", {
    campaignId: camp.data.id, investorId, opportunityType: "LP_COMMITMENT",
    name: `${TAG} Prospect ${n}`, indicativeAmount: AMOUNT, opportunityCurrency: "USD",
  });
  if (!opp.data?.id) { bad("create opportunity", `${opp.status} ${opp.msg}`); return; }
  created.opportunities.push(opp.data.id);
  ok("opportunity created", opp.data.id);

  // --- 3. stage progression ---------------------------------------------
  const stages = await prisma.$queryRawUnsafe(
    "SELECT id, stage_code, stage_name FROM fundraising_pipeline_stages WHERE campaign_id = ? ORDER BY sort_order",
    camp.data.id,
  );
  if (!stages.length) {
    bad("campaign seeded its own pipeline stages", "none found — the pipeline cannot be progressed");
  } else {
    ok("campaign seeded pipeline stages", `${stages.length} stage(s)`);
    let moved = 0, refused = null;
    for (const st of stages.slice(1, 4)) {
      const t = await call(token, `/opportunities/${opp.data.id}/transition`, "POST", {
        toStageId: st.id, stageId: st.id, reason: `${TAG} progression`,
      });
      if (t.status === 200 || t.status === 201) moved += 1;
      else if (!refused) refused = `${st.stage_code}: ${t.status} ${t.msg}`;
    }
    moved > 0
      ? ok("opportunity advanced through stages", `${moved} transition(s)`)
      : bad("opportunity advanced through stages", refused || "no transition accepted");
  }

  // --- 4. commitment -----------------------------------------------------
  const com = await call(token, "/commitments", "POST", {
    opportunityId: opp.data.id, commitmentAmount: AMOUNT, currency: "USD",
  });
  if (!com.data?.id) { bad("record commitment", `${com.status} ${com.msg}`); return; }
  created.commitments.push(com.data.id);
  ok("commitment recorded", `${AMOUNT.toLocaleString()} USD`);

  near(num(com.data.commitmentAmount), AMOUNT)
    ? ok("commitment stored the amount submitted")
    : bad("commitment stored the amount submitted", `${com.data.commitmentAmount} vs ${AMOUNT}`);

  // --- 5. approval -------------------------------------------------------
  const appr = await call(token, "/approvals", "POST", {
    objectType: "COMMITMENT", objectId: com.data.id,
    requestType: "COMMITMENT_SIGN_OFF", reason: `${TAG} sign-off`,
  });
  if (!appr.data?.id) {
    bad("raise approval request", `${appr.status} ${appr.msg}`);
  } else {
    created.approvals.push(appr.data.id);
    ok("approval request raised", appr.data.id);

    // FINDING-007: the requester deciding its own request is expected to
    // succeed today. Recorded as an observation, not asserted as correct.
    const dec = await call(token, `/approvals/${appr.data.id}/decide`, "POST", {
      decision: "APPROVED", decisionNotes: `${TAG} decided by the requester`,
    });
    console.log(
      dec.status === 200
        ? "    NOTE  the requester decided its own approval and was allowed (FINDING-007)"
        : `    NOTE  self-decision refused: ${dec.status} ${dec.msg}`,
    );
  }

  // --- 6. closing --------------------------------------------------------
  const close = await call(token, "/closings", "POST", {
    campaignId: camp.data.id, closeType: "INTERIM", closingDate: "2026-12-31",
    name: `${TAG} Close ${n}`,
  });
  if (!close.data?.id) bad("create closing", `${close.status} ${close.msg}`);
  else { created.closings.push(close.data.id); ok("closing created", close.data.id); }

  // --- 7. F.5 reconciliation --------------------------------------------
  const rows = await prisma.$queryRawUnsafe(
    "SELECT COALESCE(SUM(commitment_amount),0) total, COUNT(*) n FROM fundraising_commitments WHERE campaign_id = ?",
    camp.data.id,
  );
  const dbTotal = num(rows[0].total);
  near(dbTotal, AMOUNT)
    ? ok("campaign commitments reconcile to what was recorded", `${dbTotal.toLocaleString()} USD across ${Number(rows[0].n)}`)
    : bad("campaign commitments reconcile", `db ${dbTotal} vs recorded ${AMOUNT}`);

  // F.5 reads /metrics, not /campaigns/:id — the campaign record carries
  // targetCapital and no raised figure at all, so an earlier version of this
  // probe reported a defect that was its own mistake.
  const met = await call(token, `/campaigns/${camp.data.id}/metrics`);
  if (met.status !== 200) {
    bad("campaign metrics readable", `${met.status} ${met.msg}`);
  } else {
    const totals = met.data.commitmentTotals || {};
    const reported = num(totals.commitmentAmount);
    const count = Number(totals.count ?? 0);
    near(reported, dbTotal)
      ? ok("campaign metrics report what was committed", `${reported.toLocaleString()} USD across ${count}`)
      : bad("campaign metrics report what was committed", `metrics ${reported} vs rows ${dbTotal}`);
    near(num(met.data.targetCapital), 50_000_000)
      ? ok("campaign target reported unchanged", "50,000,000")
      : bad("campaign target reported unchanged", String(met.data.targetCapital));
  }
}

async function cleanup() {
  console.log("\n--- cleanup ---");
  const del = async (sql, ...a) => { try { await prisma.$executeRawUnsafe(sql, ...a); } catch { /* order-dependent */ } };
  for (const id of created.approvals) {
    await del("DELETE FROM fundraising_approval_events WHERE approval_id = ?", id);
    await del("DELETE FROM fundraising_approval_requests WHERE id = ?", id);
  }
  for (const id of created.commitments) {
    await del("DELETE FROM fundraising_commitment_checklist_items WHERE commitment_id = ?", id);
    await del("DELETE FROM fundraising_commitments WHERE id = ?", id);
  }
  for (const id of created.closings) await del("DELETE FROM fundraising_closings WHERE id = ?", id);
  for (const id of created.opportunities) {
    await del("DELETE FROM opportunity_stage_history WHERE opportunity_id = ?", id);
    await del("DELETE FROM fundraising_opportunities WHERE id = ?", id);
  }
  for (const id of created.campaigns) {
    await del("DELETE FROM fundraising_pipeline_stages WHERE campaign_id = ?", id);
    await del("DELETE FROM fundraising_campaigns WHERE id = ?", id);
  }
  const left = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) n FROM fundraising_campaigns WHERE name LIKE '${TAG}%'`,
  );
  console.log(`  removed ${created.campaigns.length} campaign(s) and everything under them; ${Number(left[0].n)} ${TAG} campaign(s) left`);
}

(async () => {
  console.log("Fundraising lifecycle probe");
  const token = await login(MAKER);
  console.log(`  maker ${MAKER}`);

  const fund = await prisma.$queryRawUnsafe("SELECT id FROM funds LIMIT 1");
  const inv = await prisma.$queryRawUnsafe("SELECT id FROM investor_organisations LIMIT 1");
  if (!fund.length || !inv.length) {
    console.error("  CANNOT RUN — need at least one fund and one investor organisation");
    await prisma.$disconnect();
    process.exit(1);
  }

  for (let n = 1; n <= CYCLES; n += 1) await runCycle(token, n, fund[0].id, inv[0].id);

  if (!KEEP) await cleanup();
  else console.log(`\n  --keep: ${created.campaigns.length} campaign(s) left in place`);

  console.log("\n=== RESULT ===");
  if (failures.length === 0) {
    console.log(`PASS — ${CYCLES} full lifecycle(s), every assertion held.`);
    await prisma.$disconnect();
    process.exit(0);
  }
  console.log(`FAIL — ${failures.length}:`);
  failures.forEach((f) => console.log(`  - ${f}`));
  await prisma.$disconnect();
  process.exit(1);
})().catch(async (e) => {
  console.error("probe failed:", e.message);
  try { await cleanup(); } catch { /* best effort */ }
  await prisma.$disconnect();
  process.exit(1);
});
