import { DIAGONAL_COST } from "./constants.ts";
import { DIRS, chebyshev, stepCost, type Point } from "./geometry.ts";

export interface PathOptions {
  /** Termina em qualquer tile vizinho do destino (para ataque corpo a corpo). */
  adjacent?: boolean;
  /** Limite de nós expandidos, para não travar o servidor em buscas impossíveis. */
  maxNodes?: number;
}

class MinHeap {
  private nodes: number[] = [];
  private priorities: number[] = [];

  get size(): number {
    return this.nodes.length;
  }

  push(node: number, priority: number): void {
    const { nodes, priorities } = this;
    let i = nodes.length;
    nodes.push(node);
    priorities.push(priority);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (priorities[parent] <= priority) break;
      nodes[i] = nodes[parent];
      priorities[i] = priorities[parent];
      i = parent;
    }
    nodes[i] = node;
    priorities[i] = priority;
  }

  pop(): number {
    const { nodes, priorities } = this;
    const top = nodes[0];
    const lastNode = nodes.pop()!;
    const lastPriority = priorities.pop()!;
    const n = nodes.length;
    if (n > 0) {
      let i = 0;
      while (true) {
        const left = 2 * i + 1;
        if (left >= n) break;
        const right = left + 1;
        const child = right < n && priorities[right] < priorities[left] ? right : left;
        if (priorities[child] >= lastPriority) break;
        nodes[i] = nodes[child];
        priorities[i] = priorities[child];
        i = child;
      }
      nodes[i] = lastNode;
      priorities[i] = lastPriority;
    }
    return top;
  }
}

/**
 * A* em grid de 8 direções, sem cortar quinas. Retorna os passos (sem o ponto de partida)
 * ou `null` se não houver caminho.
 */
export function findPath(
  width: number,
  height: number,
  from: Point,
  to: Point,
  blocked: (x: number, y: number) => boolean,
  options: PathOptions = {},
): Point[] | null {
  const adjacent = options.adjacent ?? false;
  const maxNodes = options.maxNodes ?? 4000;

  const isGoal = (x: number, y: number) =>
    adjacent ? chebyshev(x, y, to.x, to.y) === 1 : x === to.x && y === to.y;
  const heuristic = (x: number, y: number) => {
    const ddx = Math.abs(x - to.x);
    const ddy = Math.abs(y - to.y);
    const octile = ddx + ddy + (DIAGONAL_COST - 2) * Math.min(ddx, ddy);
    return adjacent ? Math.max(0, octile - DIAGONAL_COST) : octile;
  };

  if (isGoal(from.x, from.y)) return [];
  if (!adjacent && blocked(to.x, to.y)) return null;

  const start = from.y * width + from.x;
  const cost = new Map<number, number>([[start, 0]]);
  const parent = new Map<number, number>();
  const closed = new Set<number>();
  const open = new MinHeap();
  open.push(start, heuristic(from.x, from.y));

  let expanded = 0;
  while (open.size > 0) {
    const current = open.pop();
    if (closed.has(current)) continue;
    closed.add(current);

    const cx = current % width;
    const cy = (current - cx) / width;
    if (isGoal(cx, cy)) return buildPath(current, parent, width);
    if (++expanded > maxNodes) return null;

    const base = cost.get(current)!;
    for (const d of DIRS) {
      const nx = cx + d.x;
      const ny = cy + d.y;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height || blocked(nx, ny)) continue;
      if (d.x !== 0 && d.y !== 0 && (blocked(cx + d.x, cy) || blocked(cx, cy + d.y))) continue;
      const next = ny * width + nx;
      if (closed.has(next)) continue;
      const g = base + stepCost(d.x, d.y);
      if (g < (cost.get(next) ?? Infinity)) {
        cost.set(next, g);
        parent.set(next, current);
        open.push(next, g + heuristic(nx, ny));
      }
    }
  }
  return null;
}

function buildPath(end: number, parent: Map<number, number>, width: number): Point[] {
  const path: Point[] = [];
  let node = end;
  while (parent.has(node)) {
    path.push({ x: node % width, y: Math.floor(node / width) });
    node = parent.get(node)!;
  }
  return path.reverse();
}
