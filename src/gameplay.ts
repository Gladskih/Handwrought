import { cellHasObject, getGround, getIndex, getSlopeAt, GroundType, inBounds } from "./world";
import type { WorldData } from "./world";
import type { GridPoint } from "./types";

export function revealAround(
  worldData: WorldData,
  revealedMask: Uint8Array,
  center: GridPoint,
  radius: number
): number[] {
  const newly: number[] = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx * dx + dy * dy > radius * radius) {
        continue;
      }
      const x = center.x + dx;
      const y = center.y + dy;
      if (!inBounds(worldData, x, y)) {
        continue;
      }
      const index = getIndex(worldData.width, x, y);
      if (revealedMask[index] === 0) {
        revealedMask[index] = 1;
        newly.push(index);
      }
    }
  }
  return newly;
}

export function isCellStandable(
  worldData: WorldData,
  x: number,
  y: number,
  blockedMask: Uint8Array
): boolean {
  const ground = getGround(worldData, x, y);
  if (ground === GroundType.Water) {
    return false;
  }
  const index = getIndex(worldData.width, x, y);
  if (blockedMask[index] === 1) {
    return false;
  }
  if (cellHasObject(worldData, x, y)) {
    return false;
  }
  return true;
}

export function findSpawn(
  worldData: WorldData,
  maxSlope: number,
  seaLevel: number,
  blockedMask: Uint8Array
): GridPoint {
  const centerX = Math.floor(worldData.width / 2);
  const centerY = Math.floor(worldData.height / 2);
  const maxRadius = Math.max(worldData.width, worldData.height);

  for (let r = 0; r < maxRadius; r += 1) {
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        const x = centerX + dx;
        const y = centerY + dy;
        if (!inBounds(worldData, x, y)) {
          continue;
        }
        const index = getIndex(worldData.width, x, y);
        const height = worldData.heightmap[index];
        if (height === undefined || height < seaLevel) {
          continue;
        }
        const ground = worldData.ground[index];
        if (ground === undefined || ground === GroundType.Water) {
          continue;
        }
        if (blockedMask[index] === 1) {
          continue;
        }
        if (cellHasObject(worldData, x, y)) {
          continue;
        }
        const slope = getSlopeAt(worldData.heightmap, worldData.width, worldData.height, x, y);
        if (slope > maxSlope) {
          continue;
        }
        return { x, y };
      }
    }
  }

  return { x: 0, y: 0 };
}
