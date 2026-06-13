// @ts-nocheck
import { ForecastFormulaParser } from "./ForecastFormulaParser";
import { ForecastingError } from "./ForecastingError";

export type DagNode = {
  id: string;
  type: "driver" | "cell_ref";
  dependsOn: string[];
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

  static affectedFromEdit(
    graph: Map<string, DagNode>,
    seedIds: string[]
  ): Set<string> {
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
