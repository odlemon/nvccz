import { prisma } from '../src/utils/database';

async function getAccountingRevenue() {
  const revenueAccounts = await prisma.chartOfAccounts.findMany({
    where: {
      accountType: 'Revenue',
      isActive: true
    },
    select: {
      id: true,
      accountNo: true,
      accountName: true
    }
  });

  const accountIds = revenueAccounts.map((account) => account.id);

  const journalLines = await prisma.journalEntryLine.findMany({
    where: {
      chartOfAccountId: {
        in: accountIds
      },
      journalEntry: {
        status: 'POSTED'
      }
    },
    select: {
      chartOfAccount: {
        select: {
          accountNo: true,
          accountName: true
        }
      },
      debitAmount: true,
      creditAmount: true
    }
  });

  const summary = journalLines.reduce((acc, line) => {
    const key = line.chartOfAccount.accountName;
    if (!acc[key]) {
      acc[key] = {
        accountNo: line.chartOfAccount.accountNo,
        accountName: line.chartOfAccount.accountName,
        totalDebits: 0,
        totalCredits: 0,
        netAmount: 0
      };
    }

    acc[key].totalDebits += parseFloat(line.debitAmount.toString());
    acc[key].totalCredits += parseFloat(line.creditAmount.toString());
    acc[key].netAmount = acc[key].totalCredits - acc[key].totalDebits;

    return acc;
  }, {} as Record<string, { accountNo: string; accountName: string; totalDebits: number; totalCredits: number; netAmount: number }>);

  const totalRevenue = Object.values(summary).reduce((sum, account) => sum + account.netAmount, 0);

  console.log(JSON.stringify({ accounts: summary, totalRevenue }, null, 2));
}

getAccountingRevenue()
  .catch((error) => {
    console.error('Failed to get accounting revenue summary', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

