import * as THREE from "three";
import type { WorldData } from "./world";
import type { GridPoint } from "./types";

export function cellToWorld(worldData: WorldData, x: number, y: number, size: number): THREE.Vector3 {
  return new THREE.Vector3(
    (x + 0.5 - worldData.width / 2) * size,
    0,
    (y + 0.5 - worldData.height / 2) * size
  );
}

export function worldToCell(worldData: WorldData, x: number, z: number, size: number): GridPoint {
  return {
    x: Math.floor(x / size + worldData.width / 2),
    y: Math.floor(z / size + worldData.height / 2)
  };
}
