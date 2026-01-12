import { findSpawnNearCliff, findSpawnNearForest, isCellSpawnable } from "./gameplay";
import type { WorldData } from "./world";
import type { GridPoint } from "./types";

export function getSpawnOverride(
  worldData: WorldData,
  blockedMask: Uint8Array,
  maxSlope: number,
  seaLevel: number
): GridPoint | null {
  const params = new URLSearchParams(window.location.search);
  const spawnParam = params.get("spawn");
  if (!spawnParam) {
    return null;
  }
  if (spawnParam === "forest") {
    return findSpawnNearForest(worldData, maxSlope, seaLevel, blockedMask);
  }
  if (spawnParam === "cliff") {
    return findSpawnNearCliff(worldData, maxSlope, seaLevel, blockedMask);
  }
  const parts = spawnParam.split(",");
  if (parts.length !== 2) {
    return null;
  }
  const [xText, yText] = parts;
  if (!xText || !yText) {
    return null;
  }
  const x = Number.parseInt(xText, 10);
  const y = Number.parseInt(yText, 10);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  if (isCellSpawnable(worldData, x, y, maxSlope, seaLevel, blockedMask)) {
    return { x, y };
  }
  return null;
}
