// @ts-nocheck
import { extractFormulaDependencies, rangesOverlap } from "../utils/forecastFormulaDialect";
import { ForecastFormulaParser } from "./ForecastFormulaParser";
import { ForecastingError } from "./ForecastingError";

export type DagNode = {
  id: string;
  type: "driver" | "cell_ref";
  dependsOn: string[];
};

export type ScenarioDriverInput = {
  id: string;
  formulaExpression: string;
  targetAccountRangeStart: number;
  targetAccountRangeEnd: number;
};

export class ForecastingDagEngine {
  static buildDriverGraph(drivers: Array<{ id: string; formulaExpression: string }>): Map<string, DagNode> {
    const graph = new Map<string, DagNode>();
    for (const d of drivers) {
      const refs = ForecastFormulaParser.extractCellRefs(d.formulaExpression);
      const dependsOn = refs.map((r) => `cell:${r}`);
      graph.set(`driver:${d.id}`, { id: `driver:${d.id}`, type: "driver", dependsOn });
      for (const ref of refs) {
        const cellId = `cell:${ref}`;
        if (!graph.has(cellId)) {
          graph.set(cellId, { id: cellId, type: "cell_ref", dependsOn: [] });
        }
      }
    }
    return graph;
  }

  static assertNoRangeOverlap(drivers: ScenarioDriverInput[]): void {
    for (let i = 0; i < drivers.length; i++) {
      for (let j = i + 1; j < drivers.length; j++) {
        const a = drivers[i];
        const b = drivers[j];
        if (
          rangesOverlap(
            a.targetAccountRangeStart,
            a.targetAccountRangeEnd,
            b.targetAccountRangeStart,
            b.targetAccountRangeEnd
          )
        ) {
          throw ForecastingError.rangeOverlap([
            { start: a.targetAccountRangeStart, end: a.targetAccountRangeEnd, index: i },
            { start: b.targetAccountRangeStart, end: b.targetAccountRangeEnd, index: j }
          ]);
        }
      }
    }
  }

  /** Reject formulas that reference same-range CELL without lag (same-period self dependency). */
  static assertNoSamePeriodCellSelfRef(drivers: ScenarioDriverInput[]): void {
    for (const d of drivers) {
      const refs = ForecastFormulaParser.extractCellRefs(d.formulaExpression);
      if (!refs.length) continue;
      const deps = extractFormulaDependencies(d.formulaExpression);
      const hasLag = deps.lagPeriods.length > 0 || /\bLAG\s*\(/i.test(d.formulaExpression);
      if (hasLag) continue;
      for (const ref of refs) {
        const parts = ref.split("|");
        const accountPart = parts.length > 1 ? parts[1] : parts[0];
        const accountNo = Number(accountPart);
        if (
          Number.isFinite(accountNo) &&
          accountNo >= d.targetAccountRangeStart &&
          accountNo <= d.targetAccountRangeEnd
        ) {
          throw ForecastingError.circularReference([
            `driver:${d.id}`,
            `cell:${ref}`,
            "same-period without LAG"
          ]);
        }
      }
    }
  }

  static validateScenarioDrivers(drivers: ScenarioDriverInput[]): void {
    ForecastingDagEngine.assertNoRangeOverlap(drivers);
    ForecastingDagEngine.assertNoSamePeriodCellSelfRef(drivers);
    const graph = ForecastingDagEngine.buildDriverGraph(
      drivers.map((d) => ({ id: d.id, formulaExpression: d.formulaExpression }))
    );
    ForecastingDagEngine.assertAcyclic(graph);
  }

  static detectCycle(graph: Map<string, DagNode>): string[] | null {
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const stack: string[] = [];

    const dfs = (nodeId: string): string[] | null => {
      if (visiting.has(nodeId)) {
        const cycleStart = stack.indexOf(nodeId);
        return cycleStart >= 0 ? [...stack.slice(cycleStart), nodeId] : [nodeId];
      }
      if (visited.has(nodeId)) return null;
      visiting.add(nodeId);
      stack.push(nodeId);
      const node = graph.get(nodeId);
      if (node) {
        for (const dep of node.dependsOn) {
          const cycle = dfs(dep);
          if (cycle) return cycle;
        }
      }
      stack.pop();
      visiting.delete(nodeId);
      visited.add(nodeId);
      return null;
    };

    for (const nodeId of graph.keys()) {
      const cycle = dfs(nodeId);
      if (cycle) return cycle;
    }
    return null;
  }

  static assertAcyclic(graph: Map<string, DagNode>): void {
    const cycle = ForecastingDagEngine.detectCycle(graph);
    if (cycle) {
      throw ForecastingError.circularReference(cycle);
    }
  }

  static topologicalSort(graph: Map<string, DagNode>): string[] {
    ForecastingDagEngine.assertAcyclic(graph);
    const inDegree = new Map<string, number>();
    const adj = new Map<string, string[]>();

    for (const [id, node] of graph) {
      if (!inDegree.has(id)) inDegree.set(id, 0);
      for (const dep of node.dependsOn) {
        if (!graph.has(dep)) continue;
        adj.set(dep, [...(adj.get(dep) || []), id]);
        inDegree.set(id, (inDegree.get(id) || 0) + 1);
      }
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    const sorted: string[] = [];
    while (queue.length) {
      const id = queue.shift()!;
      sorted.push(id);
      for (const next of adj.get(id) || []) {
        inDegree.set(next, (inDegree.get(next) || 0) - 1);
        if (inDegree.get(next) === 0) queue.push(next);
      }
    }
    return sorted;
  }

  static affectedFromEdit(graph: Map<string, DagNode>, seedIds: string[]): Set<string> {
    const affected = new Set<string>(seedIds);
    const reverse = new Map<string, string[]>();
    for (const [id, node] of graph) {
      for (const dep of node.dependsOn) {
        reverse.set(dep, [...(reverse.get(dep) || []), id]);
      }
    }
    const queue = [...seedIds];
    while (queue.length) {
      const id = queue.shift()!;
      for (const dependent of reverse.get(id) || []) {
        if (!affected.has(dependent)) {
          affected.add(dependent);
          queue.push(dependent);
        }
      }
    }
    return affected;
  }
}
