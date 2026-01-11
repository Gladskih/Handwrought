import * as THREE from "three";
import { getHeight, getIndex } from "./world";
import { cellToWorld } from "./coords";
import { getNeighborDensity } from "./forest";
import { hash2D, mulberry32 } from "./math";
import { finalizeInstancedMesh, makeHiddenMatrix } from "./instancing";
import { updateObjectVisibilityForCells, type ObjectMapEntry } from "./object-visibility";
import { createTreeVariants, makeVariantColor, pickTreeVariant } from "./trees";
import type { WorldData } from "./world";

export interface ObjectRender {
  trunks: THREE.InstancedMesh[];
  leaves: THREE.InstancedMesh[];
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
  const denseCoreThreshold = 0.75;
  const variants = createTreeVariants(cellSize);
  const variantCounts = variants.map(() => 0);
  const treeVariantMap = new Array<number>(worldData.objects.length).fill(-1);

  let rockCount = 0;
  for (let i = 0; i < worldData.objects.length; i += 1) {
    const obj = worldData.objects[i];
    if (!obj) {
      continue;
    }
    if (obj.type === "tree") {
      if (isDenseCore(blockedMask, worldData.width, worldData.height, obj.x, obj.y, denseCoreThreshold)) {
        continue;
      }
      const variantIndex = pickTreeVariant(obj.x, obj.y, seed, variants.length);
      treeVariantMap[i] = variantIndex;
      const currentCount = variantCounts[variantIndex] ?? 0;
      variantCounts[variantIndex] = currentCount + 1;
    } else if (obj.type === "rock") {
      rockCount += 1;
    }
  }

  const trunkMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
  const leavesMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
  const rockMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(0x7a7a7a) });

  const trunks = variants.map((variant, index) => {
    const count = variantCounts[index] ?? 0;
    const mesh = new THREE.InstancedMesh(variant.trunkGeo, trunkMat, Math.max(1, count));
    mesh.count = count;
    mesh.visible = count > 0;
    return mesh;
  });

  const leaves = variants.map((variant, index) => {
    const count = variantCounts[index] ?? 0;
    const mesh = new THREE.InstancedMesh(variant.leavesGeo, leavesMat, Math.max(1, count));
    mesh.count = count;
    mesh.visible = count > 0;
    return mesh;
  });

  const rockRadius = cellSize * 0.55;
  const rockGeo = new THREE.DodecahedronGeometry(rockRadius, 0);
  rockGeo.translate(0, rockRadius, 0);
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, Math.max(1, rockCount));
  rocks.count = rockCount;
  rocks.visible = rockCount > 0;

  const objectIndexMap: Array<ObjectMapEntry | null> = new Array(worldData.objects.length).fill(null);
  const treeMatrices = variantCounts.map((count) => new Array<THREE.Matrix4>(count));
  const treeHiddenMatrices = variantCounts.map((count) => new Array<THREE.Matrix4>(count));
  const rockMatrices: THREE.Matrix4[] = new Array(rockCount);
  const rockHiddenMatrices: THREE.Matrix4[] = new Array(rockCount);

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scaleVec = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const rng = mulberry32(seed + 404);
  const trunkColor = new THREE.Color();
  const leavesColor = new THREE.Color();

  const treeCounters = variantCounts.map(() => 0);
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
      const variantIndex = treeVariantMap[i] ?? -1;
      if (variantIndex < 0) {
        continue;
      }
      const variant = variants[variantIndex];
      const trunkMesh = trunks[variantIndex];
      const leavesMesh = leaves[variantIndex];
      const variantMatrices = treeMatrices[variantIndex];
      const variantHidden = treeHiddenMatrices[variantIndex];
      if (!variant) {
        continue;
      }
      if (!trunkMesh || !leavesMesh || !variantMatrices || !variantHidden) {
        continue;
      }
      const treeIndex = treeCounters[variantIndex];
      if (treeIndex === undefined) {
        continue;
      }

      const size = variant.sizeMin + rng() * variant.sizeRange;
      const angle = hash2D(obj.x, obj.y, seed + 91.7) * Math.PI * 2;
      euler.set(0, angle, 0);
      rotation.setFromEuler(euler);
      position.set(cellPos.x, height, cellPos.z);
      scaleVec.set(
        variant.baseScale.x * size,
        variant.baseScale.y * size,
        variant.baseScale.z * size
      );
      matrix.compose(position, rotation, scaleVec);

      const stored = matrix.clone();
      const hidden = new THREE.Matrix4();
      makeHiddenMatrix(stored, hidden);

      variantMatrices[treeIndex] = stored;
      variantHidden[treeIndex] = hidden;
      const displayMatrix = visible ? stored : hidden;
      trunkMesh.setMatrixAt(treeIndex, displayMatrix);
      leavesMesh.setMatrixAt(treeIndex, displayMatrix);

      const trunkTint = makeVariantColor(
        variant.trunkColor,
        obj.x,
        obj.y,
        seed + 12.3,
        0.03,
        0.12,
        trunkColor
      );
      const leavesTint = makeVariantColor(
        variant.leavesColor,
        obj.x,
        obj.y,
        seed + 22.1,
        0.07,
        0.18,
        leavesColor
      );
      trunkMesh.setColorAt(treeIndex, trunkTint);
      leavesMesh.setColorAt(treeIndex, leavesTint);

      objectIndexMap[i] = { type: "tree", variant: variantIndex, index: treeIndex };
      treeCounters[variantIndex] = treeIndex + 1;
    } else if (obj.type === "rock") {
      const size = 0.7 + rng() * 0.4;
      position.set(cellPos.x, height, cellPos.z);
      scaleVec.set(size, size, size);
      euler.set(0, hash2D(obj.x, obj.y, seed + 11.2) * Math.PI * 2, 0);
      rotation.setFromEuler(euler);
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

  trunks.forEach((mesh) => finalizeInstancedMesh(mesh));
  leaves.forEach((mesh) => finalizeInstancedMesh(mesh));
  finalizeInstancedMesh(rocks);
  trunks.forEach((mesh) => {
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  });
  leaves.forEach((mesh) => {
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  });

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

function isDenseCore(
  blockedMask: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  threshold: number
): boolean {
  const index = getIndex(width, x, y);
  if (blockedMask[index] !== 1) {
    return false;
  }
  const density = getNeighborDensity(blockedMask, width, height, x, y, 3);
  return density >= threshold;
}
