# LP Portal — Frontend handoff

Use the single API document (all 68 endpoints with request + response bodies):

→ **[lp-portal-api.md](./lp-portal-api.md)**

Product contract: [lp_portal_srd.md](./lp_portal_srd.md)

**UI:** `/lp-portal`  
**API base:** `/api/lp-portal`  
**Auth:** Bearer JWT (LP membership via `lp_user_relations`; GP impersonation uses `?clientId=`)

Demo seed (`nts`): `npm run db:seed:lp-portal-srd`  
- `lp.signatory@example.com` / `Password123!`  
- `lp.viewer@example.com` / `Password123!`
