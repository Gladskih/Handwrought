import { cellHasObject, getHeight, getIndex, getGround, GroundType, inBounds } from "./world";
import type { WorldData } from "./world";
import type { GridPoint } from "./types";

export interface PathOptions {
  maxSlope: number;
  allowDiagonal: boolean;
  blockedMask?: Uint8Array;
}

export function findPath(
  world: WorldData,
  revealed: Uint8Array,
  start: GridPoint,
  goal: GridPoint,
  options: PathOptions
): GridPoint[] | null {
  if (!inBounds(world, start.x, start.y) || !inBounds(world, goal.x, goal.y)) {
    return null;
  }

  const goalIndex = getIndex(world.width, goal.x, goal.y);
  if (revealed[goalIndex] === 0) {
    return null;
  }

  if (!isCellPassable(world, revealed, goal.x, goal.y, options)) {
    return null;
  }

  const total = world.width * world.height;
  const gScore = new Float32Array(total);
  const fScore = new Float32Array(total);
  const cameFrom = new Int32Array(total);
  const closed = new Uint8Array(total);
  const openPositions = new Int32Array(total);

  gScore.fill(1e9);
  fScore.fill(1e9);
  cameFrom.fill(-1);
  openPositions.fill(-1);

  const startIndex = getIndex(world.width, start.x, start.y);
  gScore[startIndex] = 0;
  fScore[startIndex] = heuristic(start.x, start.y, goal.x, goal.y);

  const openHeap = new MinHeap(fScore, openPositions);
  openHeap.push(startIndex);

  const neighbors: Array<[number, number, number]> = options.allowDiagonal
    ? [
        [1, 0, 1],
        [-1, 0, 1],
        [0, 1, 1],
        [0, -1, 1],
        [1, 1, Math.SQRT2],
        [-1, 1, Math.SQRT2],
        [1, -1, Math.SQRT2],
        [-1, -1, Math.SQRT2]
      ]
    : [
        [1, 0, 1],
        [-1, 0, 1],
        [0, 1, 1],
        [0, -1, 1]
      ];

  while (openHeap.size > 0) {
    const current = openHeap.pop();
    if (current === -1) {
      break;
    }

    if (current === goalIndex) {
      return reconstructPath(cameFrom, current, world.width);
    }

    closed[current] = 1;
    const currentX = current % world.width;
    const currentY = Math.floor(current / world.width);

    for (const [dx, dy, cost] of neighbors) {
      const nx = currentX + dx;
      const ny = currentY + dy;
      if (!inBounds(world, nx, ny)) {
        continue;
      }

      const neighborIndex = getIndex(world.width, nx, ny);
      if (closed[neighborIndex] === 1) {
        continue;
      }

      if (!isCellPassable(world, revealed, nx, ny, options)) {
        continue;
      }

      const slope = Math.abs(getHeight(world, currentX, currentY) - getHeight(world, nx, ny));
      if (slope > options.maxSlope) {
        continue;
      }

      const currentScore = gScore[current] ?? 1e9;
      const neighborScore = gScore[neighborIndex] ?? 1e9;
      const tentativeG = currentScore + cost;
      if (tentativeG < neighborScore) {
        cameFrom[neighborIndex] = current;
        gScore[neighborIndex] = tentativeG;
        fScore[neighborIndex] = tentativeG + heuristic(nx, ny, goal.x, goal.y);
        openHeap.update(neighborIndex);
      }
    }
  }

  return null;
}

function isCellPassable(
  world: WorldData,
  revealed: Uint8Array,
  x: number,
  y: number,
  options: PathOptions
): boolean {
  if (!inBounds(world, x, y)) {
    return false;
  }
  const index = getIndex(world.width, x, y);
  if (revealed[index] === 0) {
    return false;
  }
  if (options.blockedMask && options.blockedMask[index] === 1) {
    return false;
  }
  if (getGround(world, x, y) === GroundType.Water) {
    return false;
  }
  if (cellHasObject(world, x, y)) {
    return false;
  }
  return true;
}

function heuristic(x0: number, y0: number, x1: number, y1: number): number {
  const dx = Math.abs(x0 - x1);
  const dy = Math.abs(y0 - y1);
  return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
}

function reconstructPath(cameFrom: Int32Array, current: number, width: number): GridPoint[] {
  const path: GridPoint[] = [];
  let node = current;
  while (node !== -1) {
    const x = node % width;
    const y = Math.floor(node / width);
    path.push({ x, y });
    const next = cameFrom[node];
    if (next === undefined) {
      break;
    }
    node = next;
  }
  path.reverse();
  return path;
}

class MinHeap {
  private heap: number[] = [];

  constructor(private scores: Float32Array, private positions: Int32Array) {}

  get size(): number {
    return this.heap.length;
  }

  push(node: number): void {
    const position = this.positions[node];
    if (position !== undefined && position !== -1) {
      return;
    }
    this.heap.push(node);
    this.positions[node] = this.heap.length - 1;
    this.bubbleUp(this.heap.length - 1);
  }

  update(node: number): void {
    const index = this.positions[node];
    if (index === undefined || index === -1) {
      this.push(node);
      return;
    }
    this.bubbleUp(index);
  }

  pop(): number {
    if (this.heap.length === 0) {
      return -1;
    }
    const root = this.heap[0];
    if (root === undefined) {
      return -1;
    }
    const last = this.heap.pop();
    this.positions[root] = -1;
    if (this.heap.length > 0 && last !== undefined) {
      this.heap[0] = last;
      this.positions[last] = 0;
      this.bubbleDown(0);
    }
    return root;
  }

  private bubbleUp(index: number): void {
    let i = index;
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      const node = this.heap[i];
      const parentNode = this.heap[parent];
      if (node === undefined || parentNode === undefined) {
        return;
      }
      const nodeScore = this.scores[node];
      const parentScore = this.scores[parentNode];
      if (nodeScore === undefined || parentScore === undefined) {
        return;
      }
      if (nodeScore >= parentScore) {
        break;
      }
      this.swap(i, parent);
      i = parent;
    }
  }

  private bubbleDown(index: number): void {
    let i = index;
    const length = this.heap.length;

    while (true) {
      const left = i * 2 + 1;
      const right = i * 2 + 2;
      let smallest = i;

      let smallestNode = this.heap[smallest];
      if (smallestNode === undefined) {
        return;
      }
      let smallestScore = this.scores[smallestNode];
      if (smallestScore === undefined) {
        return;
      }

      if (left < length) {
        const leftNode = this.heap[left];
        if (leftNode !== undefined) {
          const leftScore = this.scores[leftNode];
          if (leftScore !== undefined && leftScore < smallestScore) {
            smallest = left;
            smallestNode = leftNode;
            smallestScore = leftScore;
          }
        }
      }

      if (right < length) {
        const rightNode = this.heap[right];
        if (rightNode !== undefined) {
          const rightScore = this.scores[rightNode];
          if (rightScore !== undefined && rightScore < smallestScore) {
            smallest = right;
            smallestNode = rightNode;
            smallestScore = rightScore;
          }
        }
      }
      if (smallest === i) {
        break;
      }
      this.swap(i, smallest);
      i = smallest;
    }
  }

  private swap(a: number, b: number): void {
    const temp = this.heap[a];
    const other = this.heap[b];
    if (temp === undefined || other === undefined) {
      return;
    }
    this.heap[a] = other;
    this.heap[b] = temp;
    this.positions[other] = a;
    this.positions[temp] = b;
  }
}
