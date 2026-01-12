import { clamp } from "./math";
import { getHeight, inBounds } from "./world";
import type { WorldData } from "./world";

export function sampleTerrainHeightAtWorld(
  worldData: WorldData,
  worldX: number,
  worldZ: number,
  cellSize: number,
  seaLevel: number
): number {
  const gridX = worldX / cellSize + worldData.width / 2 - 0.5;
  const gridY = worldZ / cellSize + worldData.height / 2 - 0.5;
  return sampleTerrainHeight(worldData, gridX, gridY, seaLevel);
}

export function getTerrainVertexHeight(
  worldData: WorldData,
  vx: number,
  vy: number,
  seaLevel: number
): number {
  let sum = 0;
  let count = 0;
  let hasLand = false;

  for (let dy = -1; dy <= 0; dy += 1) {
    for (let dx = -1; dx <= 0; dx += 1) {
      const cx = vx + dx;
      const cy = vy + dy;
      if (!inBounds(worldData, cx, cy)) {
        continue;
      }
      const height = getHeight(worldData, cx, cy);
      sum += height;
      count += 1;
      if (height >= seaLevel) {
        hasLand = true;
      }
    }
  }

  const base = count > 0 ? sum / count : seaLevel;
  return hasLand ? Math.max(base, seaLevel) : base;
}

function sampleTerrainHeight(
  worldData: WorldData,
  gridX: number,
  gridY: number,
  seaLevel: number
): number {
  const x0 = clamp(Math.floor(gridX), 0, worldData.width - 1);
  const y0 = clamp(Math.floor(gridY), 0, worldData.height - 1);
  const x1 = clamp(x0 + 1, 0, worldData.width);
  const y1 = clamp(y0 + 1, 0, worldData.height);
  const tx = clamp(gridX - x0, 0, 1);
  const ty = clamp(gridY - y0, 0, 1);

  const h00 = getTerrainVertexHeight(worldData, x0, y0, seaLevel);
  const h10 = getTerrainVertexHeight(worldData, x1, y0, seaLevel);
  const h01 = getTerrainVertexHeight(worldData, x0, y1, seaLevel);
  const h11 = getTerrainVertexHeight(worldData, x1, y1, seaLevel);

  const hx0 = h00 + (h10 - h00) * tx;
  const hx1 = h01 + (h11 - h01) * tx;
  return hx0 + (hx1 - hx0) * ty;
}
