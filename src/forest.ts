import * as THREE from "three";
import { getHeight, getIndex, getSlopeAt, GroundType } from "./world";
import { cellToWorld } from "./coords";
import { fbm, hash2D, smoothstep } from "./math";
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

  const canopyGeo = new THREE.IcosahedronGeometry(1, 0);
  const positionAttr = canopyGeo.getAttribute("position");
  if (positionAttr) {
    const colorArray = new Float32Array(positionAttr.count * 3);
    for (let i = 0; i < colorArray.length; i += 3) {
      colorArray[i] = 1;
      colorArray[i + 1] = 1;
      colorArray[i + 2] = 1;
    }
    canopyGeo.setAttribute("color", new THREE.BufferAttribute(colorArray, 3));
  }
  const canopyMat = new THREE.MeshLambertMaterial({ color: 0x2f5f38, vertexColors: true });
  const canopyBase = new THREE.Color(0x487e52);
  const canopyEdge = new THREE.Color(0x7fb67b);
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
      const density = getNeighborDensity(blockedMask, worldData.width, worldData.height, x, y, 3);
      const edgeFactor = smoothstep(0.05, 0.9, density);
      const canopyHeight = cellSize * (1.05 + edgeFactor * 1.65);
      const canopyRadius = cellSize * (0.5 + edgeFactor * 1.05);
      const canopyLift = cellSize * (0.1 + edgeFactor * 0.35);
      const jitterX = (hash2D(x, y, 12.3) - 0.5) * cellSize * 0.6;
      const jitterZ = (hash2D(x, y, 93.7) - 0.5) * cellSize * 0.6;
      const sizeJitter = 0.75 + hash2D(x, y, 52.1) * 0.45;

      position.set(cellPos.x + jitterX, height + canopyLift, cellPos.z + jitterZ);
      scaleVec.set(canopyRadius * sizeJitter, canopyHeight * sizeJitter, canopyRadius * sizeJitter);
      matrix.compose(position, rotation, scaleVec);
      const stored = matrix.clone();
      const hidden = new THREE.Matrix4();
      makeHiddenMatrix(stored, hidden);
      matrices[instance] = stored;
      hiddenMatrices[instance] = hidden;
      const visible = revealedMask[index] === 1;
      mesh.setMatrixAt(instance, visible ? stored : hidden);

      const color = canopyBase.clone().lerp(canopyEdge, 1 - edgeFactor);
      const hueShift = (hash2D(x, y, 31.7) - 0.5) * 0.05;
      color.offsetHSL(hueShift, 0, 0);
      const brightness = 1.0 + edgeFactor * 0.35 + (hash2D(x, y, 77.1) - 0.5) * 0.14;
      color.multiplyScalar(brightness);
      mesh.setColorAt(instance, color);
    }
  }

  finalizeInstancedMesh(mesh);
  if (mesh.instanceColor) {
    mesh.instanceColor.needsUpdate = true;
  }

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

export function getNeighborDensity(
  mask: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  radius = 1
): number {
  let count = 0;
  let total = 0;

  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
        continue;
      }
      total += 1;
      const index = getIndex(width, nx, ny);
      if (mask[index] === 1) {
        count += 1;
      }
    }
  }

  return total > 0 ? count / total : 0;
}
