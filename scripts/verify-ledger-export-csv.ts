import { prisma } from "../src/utils/database";
import { InvestmentAccountingFacadeService } from "../src/services/investmentOps/InvestmentAccountingFacadeService";

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: "admin@nvccz.co.zw" },
    include: { role: true },
  });
  const fund = await prisma.fund.findFirst({ where: { fundPurpose: "LISTED_EQUITY" } });
  if (!user || !fund) throw new Error("missing user/fund");

  const created = await InvestmentAccountingFacadeService.createLedgerExport(
    { fundId: fund.id, from: "2026-01-01", to: "2026-12-31", format: "CSV" },
    `test-ledger-export-${Date.now()}`,
    user.id,
    user
  );
  const list = await InvestmentAccountingFacadeService.listLedgerExports(user.id, user, {
    pageSize: 5,
  });
  const dl = await InvestmentAccountingFacadeService.downloadLedgerExport(created.id, user.id, user);

  console.log(
    JSON.stringify(
      {
        created: { id: created.id, fundName: created.fundName, ref: created.exportBatchRef },
        listFirst: list.items?.[0],
        download: {
          fileName: dl.fileName,
          contentType: dl.contentType,
          preview: dl.content.toString("utf8").slice(0, 300),
        },
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
