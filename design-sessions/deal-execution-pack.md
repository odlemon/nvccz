# Deal Execution Pack — frontend design session

Wire screens to [`docs/deal-execution-pack-backend-requirements.md`](../docs/deal-execution-pack-backend-requirements.md).

**API:** `/api/deal-execution-packs/*` — Swagger tag **Deal Execution Pack**.

**Related:** [Cap Table Management](cap-table-management.md), [Fundraising LP Pipeline](fundraising-lp-pipeline.md) (out of scope for auto-trigger).

---

## 1. Purpose

GP closing workspace for portfolio equity transactions: document slots, weighted CP tracker, role sign-offs, SHA-256 integrity, and programmatic execute handoff to cap table + GL.

### Who uses it

| Role | Tasks |
|------|-------|
| Investment Analyst / Legal Coordinator | Init pack, upload drafts, manage CPs |
| Lead Partner / CCO | Satisfy CPs, verify checksums |
| IC Member | Final execute sign-off |
| Compliance | Audit trail review |

---

## 2. Design tokens

| Token | Value |
|-------|-------|
| Body | **Noto Sans** |
| Numeric / checksum | **JetBrains Mono** |
| Background panel | `#0A0F19` |
| Card panels | `#151F32` |
| Border | `#1E293B` |
| Satisfied / Verified | `#10B981` |
| Pending | `#F59E0B` |
| Optional | Soft slate |

---

## 3. Desktop closing workspace (§6.2)

```text
+------------------------------------------------------------------------+
| [ARCUS CAPITAL]   Deal Workspace: Project Alpha (Stage: Sign-off Run)   |
+------------------------------------------------------------------------+
| Base Currency: USD | CP Progress: [========---] 68% | Signatures: 0/3 |
+------------------------------------------------------------------------+
| [Left: Closing Documents]      | [Right: CPs Checklist]               |
| Document Name      Size  Status | Description        Weight  Status     |
| Share Purchase Agr. 4.2MB VERIFIED | ZIMRA Tax Clearance  10  SATISFIED |
| Subscription Agr.  2.1MB VERIFIED | Board Resolution      5   SATISFIED |
| Shareholders Agr.  1.8MB PENDING | RBZ Fund Approval    15   PENDING   |
|                                  |                                     |
| [Upload Draft] [Verify Checksums] | [Sign off Selected CP]             |
+------------------------------------------------------------------------+
```

---

## 4. Micro-interactions

- **Checksum hover:** Verified badge tooltip shows SHA-256; click copies to clipboard.
- **CP satisfy:** Row fades green; global I_CP bar updates.
- **Execute blocked:** Show R_legal breakdown (missing docs, CPs, signatures).
