/**
 * Makes individual goals scoreable for the employee matched by email (default: karata).
 * Typical fix: clear isPendingApproval, attach performanceContractId, normalize weights to 100.
 *
 * Run: npx ts-node scripts/fix-employee-scorecard-goals-nyasha.ts
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";
import { Decimal } from "@prisma/client/runtime/library";
import { defaultEmployeePerformanceContractPeriod } from "../src/services/EmployeePerformanceContractService";

async function main() {
  const emailFrag = process.env.TARGET_EMAIL_FRAG || "karata";
  const user = await prisma.user.findFirst({
    where: { email: { contains: emailFrag } }
  });
  if (!user) {
    console.error("No user for email contains:", emailFrag);
    process.exit(1);
  }

  const { periodStart, periodEnd } = defaultEmployeePerformanceContractPeriod();
  const contract = await prisma.performanceContract.findFirst({
    where: {
      contractType: "EMPLOYEE",
      subjectUserId: user.id,
      status: { notIn: ["ARCHIVED", "CANCELLED"] },
      periodStart: { lte: periodEnd },
      periodEnd: { gte: periodStart }
    }
  });

  if (!contract) {
    console.error("No active EMPLOYEE contract. Run: npm run db:ensure:employee-performance-contracts");
    process.exit(1);
  }

  const goals = await prisma.performanceGoal.findMany({
    where: {
      assignedToId: user.id,
      type: "individual",
      OR: [
        { performanceContractId: contract.id },
        {
          startDate: { lte: contract.periodEnd },
          endDate: { gte: contract.periodStart }
        }
      ]
    }
  });

  if (goals.length === 0) {
    console.error("No individual goals for this user.");
    process.exit(1);
  }

  const per = new Decimal(Math.round((10000 / goals.length)) / 100);
  let i = 0;
  for (const g of goals) {
    i += 1;
    const t =
      g.preciseTargetValue != null && new Decimal(g.preciseTargetValue.toString()).gt(0)
        ? new Decimal(g.preciseTargetValue.toString())
        : g.targetValue != null && new Decimal(g.targetValue.toString()).gt(0)
          ? new Decimal(g.targetValue.toString())
          : new Decimal(100);

    const patch: Record<string, unknown> = {
      isPendingApproval: false,
      requiresManagerApproval: false,
      performanceContractId: contract.id,
      scorecardWeight: per,
      preciseTargetValue: t,
      targetValue: t
    };

    if (g.preciseCurrentValue == null && g.currentValue == null) {
      patch.preciseCurrentValue = new Decimal(75);
      patch.currentValue = new Decimal(75);
    }

    await prisma.performanceGoal.update({
      where: { id: g.id },
      data: patch as any
    });
    console.log(`Updated ${i}/${goals.length} ${g.id} "${g.title}" — scoreable, contract linked, weight=${per}`);
  }

  console.log("OK:", user.email, user.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
