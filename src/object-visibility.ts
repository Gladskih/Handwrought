import { getIndex } from "./world";
import type { WorldData } from "./world";
import type * as THREE from "three";

export type ObjectMapEntry =
  | { type: "tree"; variant: number; index: number }
  | { type: "rock"; index: number };

export function updateObjectVisibilityForCells(
  worldData: WorldData,
  revealedMask: Uint8Array,
  cellSet: Set<number>,
  objectIndexMap: Array<ObjectMapEntry | null>,
  treeMatrices: THREE.Matrix4[][],
  rockMatrices: THREE.Matrix4[],
  treeHiddenMatrices: THREE.Matrix4[][],
  rockHiddenMatrices: THREE.Matrix4[],
  trunks: THREE.InstancedMesh[],
  leaves: THREE.InstancedMesh[],
  rocks: THREE.InstancedMesh
): void {
  const updatedTrunks = new Array(trunks.length).fill(false);
  const updatedLeaves = new Array(leaves.length).fill(false);
  let updatedRocks = false;

  for (let i = 0; i < worldData.objects.length; i += 1) {
    const obj = worldData.objects[i];
    if (!obj) {
      continue;
    }
    const mapEntry = objectIndexMap[i];
    if (!mapEntry) {
      continue;
    }
    const index = getIndex(worldData.width, obj.x, obj.y);
    if (!cellSet.has(index)) {
      continue;
    }
    const visible = revealedMask[index] === 1;
    if (mapEntry.type === "tree") {
      const variant = mapEntry.variant;
      const variantMatrices = treeMatrices[variant];
      const variantHidden = treeHiddenMatrices[variant];
      const trunkMesh = trunks[variant];
      const leavesMesh = leaves[variant];
      if (!variantMatrices || !variantHidden || !trunkMesh || !leavesMesh) {
        continue;
      }
      const visibleMatrix = variantMatrices[mapEntry.index];
      const hiddenMatrix = variantHidden[mapEntry.index];
      if (!visibleMatrix || !hiddenMatrix) {
        continue;
      }
      const matrix = visible ? visibleMatrix : hiddenMatrix;
      trunkMesh.setMatrixAt(mapEntry.index, matrix);
      leavesMesh.setMatrixAt(mapEntry.index, matrix);
      updatedTrunks[variant] = true;
      updatedLeaves[variant] = true;
    } else {
      const visibleMatrix = rockMatrices[mapEntry.index];
      const hiddenMatrix = rockHiddenMatrices[mapEntry.index];
      if (!visibleMatrix || !hiddenMatrix) {
        continue;
      }
      const matrix = visible ? visibleMatrix : hiddenMatrix;
      rocks.setMatrixAt(mapEntry.index, matrix);
      updatedRocks = true;
    }
  }

  updatedTrunks.forEach((updated, index) => {
    if (updated && trunks[index]) {
      trunks[index].instanceMatrix.needsUpdate = true;
    }
  });
  updatedLeaves.forEach((updated, index) => {
    if (updated && leaves[index]) {
      leaves[index].instanceMatrix.needsUpdate = true;
    }
  });
  if (updatedRocks) {
    rocks.instanceMatrix.needsUpdate = true;
  }
}
