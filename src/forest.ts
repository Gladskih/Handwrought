import * as THREE from "three";
import { getHeight, getIndex, getSlopeAt, GroundType } from "./world";
import { cellToWorld } from "./coords";
import { fbm } from "./math";
import { finalizeInstancedMesh, makeHiddenMatrix } from "./instancing";
import type { WorldData, WorldGenConfig } from "./world";

export interface DenseForestRender {
  mesh: THREE.InstancedMesh;
  updateVisibility: (cells: number[]) => void;
}

export function buildDenseForestMask(
  worldData: WorldData,
  noise2D: (x: number, y: number) => number,
  threshold: number,
  config: Pick<WorldGenConfig, "seaLevel" | "treeSlopeMax" | "forestScale">
): Uint8Array {
  const mask = new Uint8Array(worldData.width * worldData.height);
  for (let y = 0; y < worldData.height; y += 1) {
    for (let x = 0; x < worldData.width; x += 1) {
      const index = getIndex(worldData.width, x, y);
      if (worldData.ground[index] !== GroundType.Soil) {
        continue;
      }
      const height = worldData.heightmap[index] ?? 0;
      if (height < config.seaLevel + 0.02) {
        continue;
      }
      const slope = getSlopeAt(worldData.heightmap, worldData.width, worldData.height, x, y);
      if (slope > config.treeSlopeMax) {
        continue;
      }
      const patch = fbm(noise2D, x * config.forestScale, y * config.forestScale, 3, 2.0, 0.5);
      if (patch > threshold) {
        mask[index] = 1;
      }
    }
  }
  return mask;
}

export function createDenseForestMesh(
  worldData: WorldData,
  blockedMask: Uint8Array,
  revealedMask: Uint8Array,
  heightScale: number,
  cellSize: number
): DenseForestRender | null {
  let count = 0;
  const indexMap = new Int32Array(worldData.width * worldData.height).fill(-1);
  for (let i = 0; i < blockedMask.length; i += 1) {
    if (blockedMask[i] === 1) {
      indexMap[i] = count;
      count += 1;
    }
  }

  if (count === 0) {
    return null;
  }

  const canopyHeight = cellSize * 0.9;
  const canopyRadius = cellSize * 0.9;
  const canopyGeo = new THREE.CylinderGeometry(canopyRadius * 0.85, canopyRadius, canopyHeight, 6);
  canopyGeo.translate(0, canopyHeight * 0.5, 0);
  const canopyMat = new THREE.MeshLambertMaterial({ color: 0x2f5f38 });
  const mesh = new THREE.InstancedMesh(canopyGeo, canopyMat, count);
  mesh.count = count;

  const matrices: THREE.Matrix4[] = new Array(count);
  const hiddenMatrices: THREE.Matrix4[] = new Array(count);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scaleVec = new THREE.Vector3(1, 1, 1);

  for (let y = 0; y < worldData.height; y += 1) {
    for (let x = 0; x < worldData.width; x += 1) {
      const index = getIndex(worldData.width, x, y);
      const instance = indexMap[index];
      if (instance === undefined || instance < 0) {
        continue;
      }
      const cellPos = cellToWorld(worldData, x, y, cellSize);
      const height = getHeight(worldData, x, y) * heightScale;
      position.set(cellPos.x, height, cellPos.z);
      matrix.compose(position, rotation, scaleVec);
      const stored = matrix.clone();
      const hidden = new THREE.Matrix4();
      makeHiddenMatrix(stored, hidden);
      matrices[instance] = stored;
      hiddenMatrices[instance] = hidden;
      const visible = revealedMask[index] === 1;
      mesh.setMatrixAt(instance, visible ? stored : hidden);
    }
  }

  finalizeInstancedMesh(mesh);

  const updateVisibility = (cells: number[]): void => {
    let updated = false;
    for (const index of cells) {
      const instance = indexMap[index];
      if (instance === undefined || instance < 0) {
        continue;
      }
      const visible = revealedMask[index] === 1;
      const visibleMatrix = matrices[instance];
      const hiddenMatrix = hiddenMatrices[instance];
      if (!visibleMatrix || !hiddenMatrix) {
        continue;
      }
      mesh.setMatrixAt(instance, visible ? visibleMatrix : hiddenMatrix);
      updated = true;
    }
    if (updated) {
      mesh.instanceMatrix.needsUpdate = true;
    }
  };

  return { mesh, updateVisibility };
}
