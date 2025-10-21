// @ts-nocheck
// Generate a bank statement CSV that matches existing POSTED journal entries hitting cash/bank
// Usage (PowerShell):
//   $env:BASE_URL="https://nvccz-pi.vercel.app"; $env:TOKEN="<JWT>"; npx ts-node scripts/generate-matching-bank-statement.ts
// Output: bank-statement-matching.csv in project root

import fs from 'fs'
import path from 'path'
import axios from 'axios'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const TOKEN = process.env.TOKEN
const CASH_MATCH = process.env.CASH_MATCH || 'Cash|Bank' // regex snippet for account name

if (!TOKEN) {
  console.error('TOKEN env var is required (JWT bearer token).')
  process.exit(1)
}

function toCsvRow(values: Array<string | number>): string {
  return values
    .map(v => {
      const s = String(v ?? '')
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`
      }
      return s
    })
    .join(',')
}

async function main() {
  const headers = {
    Authorization: `Bearer ${TOKEN}`,
    'Content-Type': 'application/json'
  }

  // 1) Fetch POSTED journal entries in a wide date range
  const startDate = new Date()
  startDate.setMonth(startDate.getMonth() - 6)
  const endDate = new Date()

  const url = `${BASE_URL}/api/accounting/journal-entries/by-date-range?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}&status=POSTED`
  const { data } = await axios.get(url, { headers })

  const entries = Array.isArray(data?.data) ? data.data : []
  const cashRegex = new RegExp(CASH_MATCH, 'i')

  // 2) Flatten to rows that hit cash/bank and compute signed amount for CSV
  const rows: Array<{ date: string; description: string; amount: number; reference?: string }> = []

  for (const je of entries) {
    const lines = je?.journalEntryLines || []
    const cashLines = lines.filter((ln: any) => cashRegex.test(ln?.chartOfAccount?.accountName || ''))
    if (cashLines.length === 0) continue

    for (const ln of cashLines) {
      const debit = Number(ln?.debitAmount || 0)
      const credit = Number(ln?.creditAmount || 0)
      const signedAmount = debit > 0 ? debit : credit > 0 ? -credit : 0
      if (signedAmount === 0) continue

      const date = (je?.transactionDate ? new Date(je.transactionDate) : new Date())
      const yyyy = date.getFullYear()
      const mm = String(date.getMonth() + 1).padStart(2, '0')
      const dd = String(date.getDate()).padStart(2, '0')
      const isoDate = `${yyyy}-${mm}-${dd}`

      rows.push({
        date: isoDate,
        description: je?.description || 'Bank Movement',
        amount: Number(signedAmount.toFixed(2)),
        reference: je?.referenceNumber || ''
      })
    }
  }

  if (rows.length === 0) {
    console.log('No POSTED cash/bank journal lines found. Nothing to generate.')
    process.exit(0)
  }

  // 3) Write CSV
  const out = ['TransactionDate,Description,Amount,Reference']
  for (const r of rows) {
    out.push(toCsvRow([r.date, r.description, r.amount.toFixed(2), r.reference || '']))
  }

  const outPath = path.resolve(process.cwd(), 'bank-statement-matching.csv')
  fs.writeFileSync(outPath, out.join('\n'), { encoding: 'utf8' })
  console.log(`Generated ${out.length - 1} rows -> ${outPath}`)
}

main().catch(err => {
  console.error('Failed to generate matching bank statement:', err?.message || err)
  process.exit(1)
})


