/**
 * Sets performance_goals.assigned_to_id for organisational (company) and department goals
 * where it is currently NULL — CEO / department HEAD / admin fallback (same rules as runtime create).
 *
 * Usage: npm run db:backfill:performance-goal-assignees
 * Safe to re-run: only touches rows with assigned_to_id IS NULL for types company | department.
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";
import {
  resolveDefaultCompanyGoalAssigneeId,
  resolveDefaultDepartmentGoalAssigneeId
} from "../src/services/performanceGoalDefaultAssignee";

async function main() {
  const goals = await prisma.performanceGoal.findMany({
    where: {
      assignedToId: null,
      type: { in: ["company", "department"] }
    },
    select: { id: true, type: true, departmentName: true, title: true }
  });

  console.log(`Found ${goals.length} performance goal(s) (company|department) with null assignee.`);

  let updated = 0;
  for (const g of goals) {
    let uid: string | null = null;
    if (g.type === "company") {
      uid = await resolveDefaultCompanyGoalAssigneeId();
    } else {
      uid = await resolveDefaultDepartmentGoalAssigneeId(String(g.departmentName || ""));
    }

    if (!uid) {
      console.warn(`[skip] ${g.id} (${g.type}) — no CEO/admin/department resolution`);
      continue;
    }

    await prisma.performanceGoal.update({
      where: { id: g.id },
      data: { assignedToId: uid, updatedAt: new Date() }
    });
    updated += 1;
    console.log(`[ok] ${g.id} type=${g.type} assignee=${uid} title=${String(g.title).slice(0, 60)}`);
  }

  console.log(`Done. Updated ${updated} of ${goals.length}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
