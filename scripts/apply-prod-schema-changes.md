# Apply schema changes to production

These schema changes were made **without** Prisma migrate (direct SQL / scripts). Apply them to production so the app and API work.

---

## 1. Procurement invoices: `cashbook_entry_id` (fixes `/api/procurement/invoices`)

**Error if missing:**  
`The column procurement_invoices.cashbook_entry_id does not exist in the current database.`

### Option A – Run the script (idempotent, recommended)

From the project root, point at **production** DB and run:

```bash
# Set prod DB URL (replace with your prod host/user/pass/database)
set DATABASE_URL=mysql://USER:PASSWORD@31.220.82.129:3306/client1_db

npx ts-node scripts/add-procurement-invoice-cashbook-field.ts
```

Or with a `.env.production` that only has `DATABASE_URL` for prod:

```bash
# Windows PowerShell
$env:DATABASE_URL = "mysql://user:pass@31.220.82.129:3306/client1_db"
npx ts-node scripts/add-procurement-invoice-cashbook-field.ts
```

The script checks if the column (and FK) already exist and skips if so.

### Option B – Run SQL on prod once

If you prefer to run SQL directly on the prod server:

```bash
mysql -h 31.220.82.129 -u YOUR_USER -p client1_db < scripts/sql/apply_procurement_cashbook_entry_id_prod.sql
```

If the column already exists, the `ALTER TABLE` will error once; that’s fine and means the change is already applied.

---

## 2. After applying

- No need to run `prisma migrate` (this change is outside migrations).
- Ensure `npx prisma generate` has been run with the current schema (e.g. in your deploy pipeline).
- Restart the app and retry:  
  `GET http://31.220.82.129:3010/api/procurement/invoices?limit=10`

---

## Other script-based schema changes

If you have other one-off changes (e.g. financial report fields, term sheet columns), run those scripts the same way against prod (same `DATABASE_URL` or same `mysql` session) as needed. This doc only covers the procurement `cashbook_entry_id` fix.
