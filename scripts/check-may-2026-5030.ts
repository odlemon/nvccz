import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const BASE = `http://127.0.0.1:${process.env.PORT || "3007"}`;

async function main() {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@nts.com", password: "admin123" }),
  });
  const { token } = (await login.json()) as { token: string };
  const r = await fetch(
    `${BASE}/api/accounting/income-statement?periodType=month&periodValue=2026-05&type=detailed`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const j = await r.json();
  const a = j.data?.sections?.operatingExpenses?.accounts?.find((x: any) => x.accountNo === "5030");
  console.log("May 2026 IS — 5030 netAmount:", a?.netAmount);
  console.log("May 2026 IS — transaction count on 5030:", a?.transactions?.length ?? 0);
  const kpiByStatus = await prisma.journalEntry.groupBy({
    by: ["status"],
    where: {
      description: { contains: "KPI Achievement" },
      transactionDate: { gte: new Date("2026-05-01"), lte: new Date("2026-05-31") },
    },
    _count: true,
  });
  console.log("KPI Achievement JE status breakdown (May 2026):", kpiByStatus);
}

main().finally(() => prisma.$disconnect());
