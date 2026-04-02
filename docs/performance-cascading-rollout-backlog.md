# Performance module — backlog notes

Living doc for things we still want to implement or tighten. **More sections will be added** as requirements show up; this file is not only about roll-ups.

---

## Alignment we want (strategic → tactical → operational)

Leadership sets **org** goals, departments get **department** goals that support them, people get **individual** goals and tasks. Everyone’s daily work should visibly connect to the firm’s objectives.

**Pseudocode — when progress happens at the bottom:**

```
on individual_progress_updated:
  refresh individual goal
  refresh department goal (from its children)
  refresh organizational goal (from its children)
  // same rule everywhere: tasks, activities, imports, manual edits, etc.
```

**Open point:** Decide *how* parent numbers combine (e.g. sum of values vs average of percentages) and use **one** rule app-wide so dashboards and APIs don’t disagree.

---

## To implement / fix later (short list)

- Wire **every** place that updates individual progress so the **department** and **org** layers always update too (some paths today don’t complete the chain).
- **Activity-based** updates: finish the “bubble up” behavior so it matches the task path.
- **One roll-up rule** — replace mixed formulas with a single agreed approach + tests on a sample org → dept → person tree.
- **Department on goals** — keep DB, schema, and “breakdown” flows consistent (naming / IDs vs department name only).
- **Reporting depth** — clarify or support deeper trees if we allow more than org → dept → individual.

*(Add new bullets below as new performance topics come up.)*

### Implemented without new DB columns

- **Sibling weights:** set `contributionWeightPercent` (0–100) in the goal’s **`activities` JSON** (object). API: optional `contributionWeightPercent` on create / update / breakdown payloads merges into `activities`. Missing weights → equal split. Parent roll-up uses weighted achievement %.
- **Direction:** `targetOperator` on the goal (`>=`, `<=`, `=`) drives achievement scoring and task/activity completion checks (`<=` = lower actual is better for caps).

---

## Related

- `docs/performance-kpi-data-sources.md` — where KPI numbers should come from.
