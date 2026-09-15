// @ts-nocheck
// Assembles real, permission-scoped Matanho data into plain-text context blocks for the Matanho
// AI panel (src/controllers/AssistantController.ts). Direct-fetch + text formatting, not a vector
// DB — this app has no document-repository concept and modest data volumes, so a small set of
// capped, formatted queries per source is the right size for the problem (see execution-plan.md's
// Phase 9 note in the frontend repo for why this was scoped this way).
//
// Mirrors the composer's own scope selector ("All connected work" / "My work only" / "People and
// knowledge") and the sidebar's five source toggles (My Work / Calendar / Forums / News / People)
// exactly as they're named in the frontend runtime — see aiSources()/state.aiContextSources in
// components/home-v3-mock/matanho-runtime.js in the frontend repo.
import { prisma } from "../utils/database";

export type AssistantSourceId = "work" | "calendar" | "forums" | "news" | "people";
export type AssistantScope = "All connected work" | "My work only" | "People and knowledge";

export const ASSISTANT_SOURCE_LABELS: Record<AssistantSourceId, string> = {
  work: "My Work",
  calendar: "Calendar",
  forums: "Forums",
  news: "News",
  people: "People directory",
};

const SCOPE_SOURCES: Record<AssistantScope, AssistantSourceId[]> = {
  "All connected work": ["work", "calendar", "forums", "news", "people"],
  "My work only": ["work", "calendar"],
  "People and knowledge": ["people", "forums", "news"],
};

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…(truncated)`;
}

function stripHtml(html: string): string {
  return String(html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

async function workSection(userId: string): Promise<string | null> {
  const tasks = await prisma.task.findMany({
    where: { isTrashed: false, team: { array_contains: userId }, stage: { notIn: ["completed"] } },
    select: { title: true, stage: true, priority: true, date: true, department: true, isPerformanceTask: true },
    orderBy: [{ priority: "desc" }, { date: "asc" }],
    take: 10,
  });
  if (tasks.length === 0) return null;
  const lines = tasks.map((t) => {
    const due = t.date ? new Date(t.date).toISOString().slice(0, 10) : "no date";
    return `- "${t.title}" — ${t.stage}, ${t.priority} priority, due ${due}${t.department ? `, ${t.department}` : ""}${t.isPerformanceTask ? " (performance task)" : ""}`;
  });
  return clip(`## My Work (${tasks.length} open task${tasks.length === 1 ? "" : "s"})\n${lines.join("\n")}`, 1800);
}

async function calendarSection(userId: string): Promise<string | null> {
  const now = new Date();
  const horizon = new Date(now.getTime() + 14 * 86400000);
  const [personal, company] = await Promise.all([
    prisma.$queryRawUnsafe<Array<{ title: string; startDate: Date; location: string | null }>>(
      `SELECT title, start_date AS startDate, location FROM calendar_entries
       WHERE user_id = ? AND start_date >= ? AND start_date <= ? ORDER BY start_date ASC LIMIT 8`,
      userId, now, horizon
    ),
    prisma.event.findMany({
      where: { isActive: true, startDate: { gte: now, lte: horizon } },
      select: { title: true, startDate: true, location: true },
      orderBy: { startDate: "asc" },
      take: 8,
    }),
  ]);
  const items = [...personal, ...company]
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
    .slice(0, 8);
  if (items.length === 0) return null;
  const lines = items.map(
    (e) =>
      `- "${e.title}" — ${new Date(e.startDate).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}${e.location ? `, ${e.location}` : ""}`
  );
  return clip(`## Calendar (next 14 days)\n${lines.join("\n")}`, 1500);
}

async function forumsSection(): Promise<string | null> {
  const rows = await prisma.$queryRawUnsafe<
    Array<{ title: string; content: string; isSolved: boolean; authorName: string; replyCount: number }>
  >(
    `SELECT p.title, p.content, p.isSolved,
            CONCAT(u.firstName, ' ', u.lastName) AS authorName,
            (SELECT COUNT(*) FROM replies r WHERE r.postId = p.id) AS replyCount
     FROM posts p JOIN users u ON u.id = p.authorId
     WHERE p.isActive = 1 AND p.category IS NOT NULL AND p.category != ''
     ORDER BY p.createdAt DESC LIMIT 6`
  );
  if (rows.length === 0) return null;
  const lines = rows.map(
    (r) =>
      `- "${r.title}" by ${r.authorName}${r.isSolved ? " (solved)" : ""}, ${Number(r.replyCount)} repl${Number(r.replyCount) === 1 ? "y" : "ies"} — ${clip(stripHtml(r.content), 160)}`
  );
  return clip(`## Forums (recent discussions)\n${lines.join("\n")}`, 1800);
}

async function newsSection(): Promise<string | null> {
  const rows = await prisma.$queryRawUnsafe<Array<{ title: string; content: string; createdAt: Date; authorName: string }>>(
    `SELECT p.title, p.content, p.createdAt, CONCAT(u.firstName, ' ', u.lastName) AS authorName
     FROM posts p JOIN users u ON u.id = p.authorId
     WHERE p.isActive = 1 AND (p.category IS NULL OR p.category = '')
     ORDER BY p.createdAt DESC LIMIT 6`
  );
  if (rows.length === 0) return null;
  const lines = rows.map(
    (r) => `- "${r.title}" by ${r.authorName}, ${new Date(r.createdAt).toISOString().slice(0, 10)} — ${clip(stripHtml(r.content), 160)}`
  );
  return clip(`## News (recent posts)\n${lines.join("\n")}`, 1800);
}

async function peopleSection(): Promise<string | null> {
  const users = await prisma.user.findMany({
    where: { role: { name: { not: "applicant" } } },
    select: { firstName: true, lastName: true, email: true, userDepartment: true, departmentRole: true, role: { select: { name: true } } },
    take: 40,
  });
  if (users.length === 0) return null;
  const lines = users.map(
    (u) => `- ${u.firstName} ${u.lastName} — ${u.departmentRole || u.role?.name || "Employee"}${u.userDepartment ? `, ${u.userDepartment}` : ""} (${u.email})`
  );
  return clip(`## People directory (${users.length})\n${lines.join("\n")}`, 3000);
}

const SECTION_BUILDERS: Record<AssistantSourceId, (userId: string) => Promise<string | null>> = {
  work: workSection,
  calendar: calendarSection,
  forums: () => forumsSection(),
  news: () => newsSection(),
  people: () => peopleSection(),
};

export async function buildAssistantContext(
  userId: string,
  scope: AssistantScope,
  sources: Partial<Record<AssistantSourceId, boolean>> | null | undefined
): Promise<{ text: string; sourcesUsed: AssistantSourceId[]; enabledEmpty: AssistantSourceId[] }> {
  const scopeAllowed = SCOPE_SOURCES[scope] || SCOPE_SOURCES["All connected work"];
  // Same "!== false" opt-out convention the runtime itself uses for these toggles.
  const enabled = scopeAllowed.filter((id) => sources?.[id] !== false);

  const results = await Promise.all(enabled.map((id) => SECTION_BUILDERS[id](userId)));

  const sections: string[] = [];
  const sourcesUsed: AssistantSourceId[] = [];
  // A source can be enabled but genuinely have nothing in it (e.g. zero open tasks) — that's a
  // real, useful answer ("you have no open tasks"), not the same as "I don't have access to
  // that". Track it separately so the controller can word the two cases honestly.
  const enabledEmpty: AssistantSourceId[] = [];
  enabled.forEach((id, i) => {
    const section = results[i];
    if (section) {
      sections.push(section);
      sourcesUsed.push(id);
    } else {
      enabledEmpty.push(id);
    }
  });

  return { text: sections.join("\n\n"), sourcesUsed, enabledEmpty };
}
