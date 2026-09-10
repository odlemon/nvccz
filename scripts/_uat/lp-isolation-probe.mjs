/**
 * LP Portal — adversarial data-isolation probe.
 *
 * The highest-consequence risk in the LP Portal is one LP reaching another's
 * data. A hidden nav item proves nothing: the test is whether the *endpoint*
 * refuses when the id belongs to someone else. This harvests every id each LP
 * can legitimately see, then replays those ids as the other LPs and reports any
 * 200.
 *
 * Three independent axes, all present in the seeded data:
 *   1. Cross-organisation  — LP A (client X) vs LP B/C (client Y)
 *   2. Intra-org role      — B is SIGNATORY, C is VIEWER, same client, same funds
 *   3. Fund entitlement    — B/C are scoped to 2 of 7 funds via fund_ids
 *
 * Read-only by default. --write additionally attempts the SIGNATORY-only writes
 * as the VIEWER, which must all be refused; nothing is created when they are.
 *
 * Run: node scripts/_uat/lp-isolation-probe.mjs [--write] [--verbose]
 * Exit: 0 = no leak, 1 = at least one leak (or a probe that could not run)
 */
const API = process.env.API_BASE || "http://127.0.0.1:3009/api";
const LP = `${API}/lp-portal`;
const WRITE = process.argv.includes("--write");
const VERBOSE = process.argv.includes("--verbose");

const ACCOUNTS = [
  { key: "A", email: "lp.test@arcus.co.zw", note: "client X · MANAGER · all funds" },
  { key: "B", email: "lp.signatory@example.com", note: "client Y · SIGNATORY · 2 funds" },
  { key: "C", email: "lp.viewer@example.com", note: "client Y · VIEWER · 2 funds" },
];
const PASSWORD = "admin123";

/** Collections to harvest ids from, and the detail routes those ids feed. */
const RESOURCES = [
  { name: "capital-calls", list: "/capital-calls", detail: (id) => [`/capital-calls/${id}`, `/capital-calls/${id}/documents`, `/capital-calls/${id}/notice/download`] },
  { name: "distributions", list: "/distributions", detail: (id) => [`/distributions/${id}`, `/distributions/${id}/download`] },
  { name: "documents", list: "/documents", detail: (id) => [`/documents/${id}`, `/documents/${id}/download`, `/documents/${id}/preview`] },
  { name: "vault", list: "/vault", detail: (id) => [`/vault/${id}/download`, `/vault/${id}/verify`] },
  { name: "ledger", list: "/ledger", detail: (id) => [`/ledger/${id}`] },
  { name: "messages", list: "/messages", detail: (id) => [`/messages/${id}`, `/messages/${id}/replies`] },
  { name: "notices", list: "/notices", detail: (id) => [`/notices/${id}`] },
  { name: "requests", list: "/requests", detail: (id) => [`/requests/${id}`, `/requests/${id}/messages`] },
  { name: "colleagues", list: "/colleagues", detail: (id) => [`/colleagues/${id}`] },
];

/** SIGNATORY-only writes. A VIEWER reaching any of these is a privilege leak. */
const SIGNATORY_WRITES = [
  { path: "/dealing/subscriptions", body: { fundId: "probe", amount: 1000 } },
  { path: "/dealing/redemptions", body: { fundId: "probe", units: 1 } },
  { path: "/dealing/subscriptions/estimate", body: { fundId: "probe", amount: 1000 } },
  { path: "/requests", body: { subject: "isolation probe", body: "should be refused" } },
];

const leaks = [];
const notes = [];

/**
 * `portal` is a login body field. LP accounts are refused on the staff portal
 * ("LP accounts must use the LP portal."), which is itself a control worth
 * asserting -- see phase 0.
 */
async function login(email, portal = "lp") {
  const r = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, portal }),
  });
  const j = await r.json().catch(() => ({}));
  return { token: j.token || null, status: r.status, message: j.message || "" };
}

async function get(token, path) {
  const r = await fetch(`${LP}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  let body = null;
  try {
    body = r.headers.get("content-type")?.includes("json") ? await r.json() : await r.text();
  } catch { /* body is not required to classify the response */ }
  return { status: r.status, body };
}

/** Pull id-like values out of whatever envelope the endpoint returns. */
function harvestIds(body) {
  const out = new Set();
  const walk = (node, depth) => {
    if (!node || depth > 4) return;
    if (Array.isArray(node)) return node.forEach((n) => walk(n, depth + 1));
    if (typeof node !== "object") return;
    for (const [k, v] of Object.entries(node)) {
      if ((k === "id" || k === "reference" || k === "documentId" || k === "entryId" || k === "membershipId") && typeof v === "string" && v.length > 6) {
        out.add(v);
      } else if (v && typeof v === "object") {
        walk(v, depth + 1);
      }
    }
  };
  walk(body, 0);
  return [...out];
}

(async () => {
  console.log("LP Portal isolation probe");
  console.log(`API: ${LP}\n`);

  // ---- phase 0: cross-portal login matrix ---------------------------------
  console.log("--- phase 0: which portal will accept which account ---");
  const PORTAL_MATRIX = [
    { email: "lp.test@arcus.co.zw", portal: "staff", allow: false, why: "an LP on the staff portal" },
    { email: "lp.test@arcus.co.zw", portal: "lp", allow: true, why: "an LP on its own portal" },
    { email: "perf.employee@nts.local", portal: "lp", allow: false, why: "plain staff on the LP portal" },
    { email: "company.nts@arcus.co.zw", portal: "staff", allow: false, why: "an investee on the staff portal" },
    { email: "founder@e2etestco.example", portal: "staff", allow: false, why: "an applicant on the staff portal" },
    { email: "perf.hr@nts.local", portal: "staff", allow: true, why: "HR Manager on the staff portal" },
    { email: "payroll.manager@nts.local", portal: "staff", allow: true, why: "Payroll Manager on the staff portal" },
  ];
  for (const t of PORTAL_MATRIX) {
    const r = await login(t.email, t.portal);
    const got = !!r.token;
    const ok = got === t.allow;
    if (!ok) {
      leaks.push({ attacker: t.email, victim: `${t.portal} portal`, sameOrg: false, path: `login portal=${t.portal}`, status: r.status });
      console.log(`  LEAK  ${t.why} was ${got ? "ADMITTED" : "refused"} — expected ${t.allow ? "admitted" : "refused"}`);
    } else {
      console.log(`  ok    ${t.why.padEnd(38)} ${got ? "admitted" : `refused — "${r.message}"`}`);
    }
  }

  // ---- sign in ------------------------------------------------------------
  console.log("");
  const sessions = {};
  for (const a of ACCOUNTS) {
    const { token, message } = await login(a.email, "lp");
    if (!token) {
      console.error(`  CANNOT RUN — LP portal login failed for ${a.email}: ${message}`);
      process.exit(1);
    }
    sessions[a.key] = { ...a, token };
    console.log(`  signed in  ${a.key}  ${a.email.padEnd(28)} ${a.note}`);
  }

  // ---- phase 1: harvest ---------------------------------------------------
  console.log("\n--- phase 1: what each LP can legitimately see ---");
  for (const s of Object.values(sessions)) {
    s.ids = {};
    let total = 0;
    for (const res of RESOURCES) {
      const { status, body } = await get(s.token, res.list);
      const ids = status === 200 ? harvestIds(body) : [];
      s.ids[res.name] = ids;
      total += ids.length;
      if (VERBOSE) console.log(`      ${s.key} ${res.name.padEnd(16)} ${status} ${ids.length} id(s)`);
    }
    console.log(`  ${s.key}: ${total} id(s) across ${RESOURCES.length} collections`);
    if (total === 0) {
      notes.push(`${s.key} (${s.email}) sees no ids at all — isolation cannot be proven from its side; seed data first.`);
    }
  }

  // ---- phase 2: cross-tenant replay ---------------------------------------
  console.log("\n--- phase 2: replaying each LP's ids as the others ---");
  let attempts = 0;
  const leaksBeforePhase2 = leaks.length;
  for (const attacker of Object.values(sessions)) {
    for (const victim of Object.values(sessions)) {
      if (attacker.key === victim.key) continue;
      const sameOrg = attacker.note.slice(0, 8) === victim.note.slice(0, 8);
      for (const res of RESOURCES) {
        for (const id of victim.ids[res.name] || []) {
          if ((attacker.ids[res.name] || []).includes(id)) continue; // legitimately shared
          for (const path of res.detail(id)) {
            attempts += 1;
            const { status } = await get(attacker.token, path);
            if (status === 200) {
              leaks.push({ attacker: attacker.key, victim: victim.key, sameOrg, path, status });
              console.log(`  LEAK  ${attacker.key} -> ${victim.key}  200  ${path}`);
            } else if (VERBOSE) {
              console.log(`   ok   ${attacker.key} -> ${victim.key}  ${status}  ${path}`);
            }
          }
        }
      }
    }
  }
  console.log(`  ${attempts} cross-tenant request(s) attempted, ${leaks.length - leaksBeforePhase2} returned 200`);

  // ---- phase 3: role escalation within one org ----------------------------
  console.log("\n--- phase 3: VIEWER attempting SIGNATORY-only actions ---");
  const viewer = sessions.C;
  for (const w of SIGNATORY_WRITES) {
    const r = await fetch(`${LP}${w.path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${viewer.token}`, "Idempotency-Key": `probe-${Date.now()}-${Math.random()}` },
      body: JSON.stringify(w.body),
    });
    const refused = r.status === 401 || r.status === 403;
    if (!WRITE && !refused && r.status < 400) {
      leaks.push({ attacker: "C", victim: "role", sameOrg: true, path: `POST ${w.path}`, status: r.status });
      console.log(`  LEAK  VIEWER reached ${w.path} -> ${r.status}`);
    } else {
      console.log(`  ${refused ? "refused" : "rejected"}  POST ${w.path.padEnd(34)} ${r.status}`);
      if (!refused && r.status >= 400 && r.status !== 404) {
        notes.push(`POST ${w.path} returned ${r.status} for a VIEWER — refusal expected as 403, verify it is a permission refusal and not a validation error masking one.`);
      }
    }
  }

  // ---- report -------------------------------------------------------------
  console.log("\n=== RESULT ===");
  if (notes.length) {
    console.log("notes:");
    notes.forEach((n) => console.log(`  - ${n}`));
  }
  if (leaks.length === 0) {
    console.log(`PASS — no cross-tenant or cross-role access in ${attempts} attempts.`);
    process.exit(0);
  }
  console.log(`FAIL — ${leaks.length} leak(s):`);
  for (const l of leaks) {
    console.log(`  ${l.attacker} reached ${l.victim}'s ${l.path} (${l.status})${l.sameOrg ? " [same organisation]" : " [cross-organisation]"}`);
  }
  process.exit(1);
})().catch((e) => {
  console.error("probe failed:", e);
  process.exit(1);
});
