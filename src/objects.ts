import * as THREE from "three";
import { getHeight, getIndex } from "./world";
import { cellToWorld } from "./coords";
import { mulberry32 } from "./math";
import { finalizeInstancedMesh, makeHiddenMatrix } from "./instancing";
import type { WorldData } from "./world";

export interface ObjectRender {
  trunks: THREE.InstancedMesh;
  leaves: THREE.InstancedMesh;
  rocks: THREE.InstancedMesh;
  updateVisibility: (cells: number[]) => void;
}

export function createObjectMeshes(
  worldData: WorldData,
  revealedMask: Uint8Array,
  heightScale: number,
  blockedMask: Uint8Array,
  cellSize: number,
  seed: number
): ObjectRender {
  let treeCount = 0;
  let rockCount = 0;
  for (const obj of worldData.objects) {
    const index = getIndex(worldData.width, obj.x, obj.y);
    if (obj.type === "tree") {
      if (blockedMask[index] === 0) {
        treeCount += 1;
      }
    } else if (obj.type === "rock") {
      rockCount += 1;
    }
  }

  const trunkHeight = cellSize * 0.9;
  const trunkTop = cellSize * 0.12;
  const trunkBottom = cellSize * 0.18;
  const leavesRadius = cellSize * 0.6;
  const leavesHeight = cellSize * 1.4;
  const rockRadius = cellSize * 0.55;

  const trunkGeo = new THREE.CylinderGeometry(trunkTop, trunkBottom, trunkHeight, 6);
  trunkGeo.translate(0, trunkHeight * 0.5, 0);
  const leavesGeo = new THREE.ConeGeometry(leavesRadius, leavesHeight, 7);
  leavesGeo.translate(0, trunkHeight + leavesHeight * 0.5, 0);
  const rockGeo = new THREE.DodecahedronGeometry(rockRadius, 0);
  rockGeo.translate(0, rockRadius, 0);

  const trunkMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(0x6b4b3a) });
  const leavesMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(0x3e6b3e) });
  const rockMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(0x7a7a7a) });

  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, Math.max(1, treeCount));
  const leaves = new THREE.InstancedMesh(leavesGeo, leavesMat, Math.max(1, treeCount));
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, Math.max(1, rockCount));

  trunks.count = treeCount;
  leaves.count = treeCount;
  rocks.count = rockCount;

  trunks.visible = treeCount > 0;
  leaves.visible = treeCount > 0;
  rocks.visible = rockCount > 0;

  const objectIndexMap: Array<{ type: "tree" | "rock"; index: number } | null> = new Array(
    worldData.objects.length
  ).fill(null);
  const treeMatrices: THREE.Matrix4[] = new Array(treeCount);
  const treeHiddenMatrices: THREE.Matrix4[] = new Array(treeCount);
  const rockMatrices: THREE.Matrix4[] = new Array(rockCount);
  const rockHiddenMatrices: THREE.Matrix4[] = new Array(rockCount);

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scaleVec = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const rng = mulberry32(seed + 404);

  let treeCounter = 0;
  let rockCounter = 0;
  for (let i = 0; i < worldData.objects.length; i += 1) {
    const obj = worldData.objects[i];
    if (!obj) {
      continue;
    }
    const height = getHeight(worldData, obj.x, obj.y) * heightScale;
    const cellPos = cellToWorld(worldData, obj.x, obj.y, cellSize);
    const cellIndex = getIndex(worldData.width, obj.x, obj.y);
    const visible = revealedMask[cellIndex] === 1;

    if (obj.type === "tree") {
      if (blockedMask[cellIndex] === 1) {
        continue;
      }
      const size = 0.9 + rng() * 0.35;
      position.set(cellPos.x, height, cellPos.z);
      scaleVec.set(size, size, size);
      matrix.compose(position, rotation, scaleVec);
      const stored = matrix.clone();
      const hidden = new THREE.Matrix4();
      makeHiddenMatrix(stored, hidden);
      treeMatrices[treeCounter] = stored;
      treeHiddenMatrices[treeCounter] = hidden;
      const displayMatrix = visible ? stored : hidden;
      trunks.setMatrixAt(treeCounter, displayMatrix);
      leaves.setMatrixAt(treeCounter, displayMatrix);
      objectIndexMap[i] = { type: "tree", index: treeCounter };
      treeCounter += 1;
    } else if (obj.type === "rock") {
      const size = 0.7 + rng() * 0.4;
      position.set(cellPos.x, height, cellPos.z);
      scaleVec.set(size, size, size);
      matrix.compose(position, rotation, scaleVec);
      const stored = matrix.clone();
      const hidden = new THREE.Matrix4();
      makeHiddenMatrix(stored, hidden);
      rockMatrices[rockCounter] = stored;
      rockHiddenMatrices[rockCounter] = hidden;
      const displayMatrix = visible ? stored : hidden;
      rocks.setMatrixAt(rockCounter, displayMatrix);
      objectIndexMap[i] = { type: "rock", index: rockCounter };
      rockCounter += 1;
    }
  }

  finalizeInstancedMesh(trunks);
  finalizeInstancedMesh(leaves);
  finalizeInstancedMesh(rocks);

  const updateVisibility = (cells: number[]): void => {
    if (cells.length === 0) {
      return;
    }
    const cellSet = new Set(cells);
    updateObjectVisibilityForCells(
      worldData,
      revealedMask,
      cellSet,
      objectIndexMap,
      treeMatrices,
      rockMatrices,
      treeHiddenMatrices,
      rockHiddenMatrices,
      trunks,
      leaves,
      rocks
    );
  };

  return { trunks, leaves, rocks, updateVisibility };
}

function updateObjectVisibilityForCells(
  worldData: WorldData,
  revealedMask: Uint8Array,
  cellSet: Set<number>,
  objectIndexMap: Array<{ type: "tree" | "rock"; index: number } | null>,
  treeMatrices: THREE.Matrix4[],
  rockMatrices: THREE.Matrix4[],
  treeHiddenMatrices: THREE.Matrix4[],
  rockHiddenMatrices: THREE.Matrix4[],
  trunks: THREE.InstancedMesh,
  leaves: THREE.InstancedMesh,
  rocks: THREE.InstancedMesh
): void {
  let updated = false;

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
    if (
      setObjectVisibility(
        mapEntry,
        visible,
        treeMatrices,
        rockMatrices,
        treeHiddenMatrices,
        rockHiddenMatrices,
        trunks,
        leaves,
        rocks
      )
    ) {
      updated = true;
    }
  }

  if (updated) {
    trunks.instanceMatrix.needsUpdate = true;
    leaves.instanceMatrix.needsUpdate = true;
    rocks.instanceMatrix.needsUpdate = true;
  }
}

function setObjectVisibility(
  mapEntry: { type: "tree" | "rock"; index: number },
  visible: boolean,
  treeMatrices: THREE.Matrix4[],
  rockMatrices: THREE.Matrix4[],
  treeHiddenMatrices: THREE.Matrix4[],
  rockHiddenMatrices: THREE.Matrix4[],
  trunks: THREE.InstancedMesh,
  leaves: THREE.InstancedMesh,
  rocks: THREE.InstancedMesh
): boolean {
  if (mapEntry.type === "tree") {
    const visibleMatrix = treeMatrices[mapEntry.index];
    const hiddenMatrix = treeHiddenMatrices[mapEntry.index];
    if (!visibleMatrix || !hiddenMatrix) {
      return false;
    }
    const matrix = visible ? visibleMatrix : hiddenMatrix;
    trunks.setMatrixAt(mapEntry.index, matrix);
    leaves.setMatrixAt(mapEntry.index, matrix);
    return true;
  }

  const visibleMatrix = rockMatrices[mapEntry.index];
  const hiddenMatrix = rockHiddenMatrices[mapEntry.index];
  if (!visibleMatrix || !hiddenMatrix) {
    return false;
  }
  const matrix = visible ? visibleMatrix : hiddenMatrix;
  rocks.setMatrixAt(mapEntry.index, matrix);
  return true;
}
