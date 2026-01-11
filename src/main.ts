import "./style.css";
import * as THREE from "three";
import { createNoise2D } from "simplex-noise";
import {
  cellHasObject,
  generateWorld,
  getGround,
  getHeight,
  getIndex,
  getSlopeAt,
  GroundType,
  inBounds,
  WorldData,
  WorldGenConfig
} from "./world";
import { findPath, GridPoint, PathOptions } from "./pathfinding";
import { buildGridMesh, CellColorFn, updateGridCells, VertexColorFn } from "./render";

const worldConfig: WorldGenConfig = {
  width: 256,
  height: 256,
  seed: 1337,
  seaLevel: 0.36,
  mountainHeight: 0.72,
  slopeRock: 0.18,
  sandHeight: 0.07,
  sandChance: 0.55,
  treeSlopeMax: 0.08,
  forestScale: 1 / 48,
  forestThreshold: 0.55,
  treeChance: 0.32,
  rockSlopeMax: 0.14,
  rockChance: 0.02
};

const cellSize = 2;
const heightScale = 20;
const revealRadius = 16;
const moveSpeed = 2.2 * cellSize;
const cameraViewCells = 16;
const renderScale = 0.85;

const pathOptions: PathOptions = {
  maxSlope: 0.16,
  allowDiagonal: true
};

const terrainNoise = createNoise2D(mulberry32(worldConfig.seed + 101));
const macroNoise = createNoise2D(mulberry32(worldConfig.seed + 505));
const waterNoise = createNoise2D(mulberry32(worldConfig.seed + 202));
const forestNoise = createNoise2D(mulberry32(worldConfig.seed + 1337));
const forestBlockThreshold = Math.min(0.95, worldConfig.forestThreshold + 0.18);

const world = generateWorld(worldConfig);
const revealed = new Uint8Array(world.width * world.height);
const denseForestMask = buildDenseForestMask(world, forestNoise, forestBlockThreshold);
pathOptions.blockedMask = denseForestMask;

const spawnCell = findSpawn(world, pathOptions.maxSlope, worldConfig.seaLevel, denseForestMask);
const initialRevealed = revealAround(world, revealed, spawnCell, revealRadius);

const soilColor = new THREE.Color(0x6fb86a);
const sandColor = new THREE.Color(0xe6d3a2);
const rockColor = new THREE.Color(0x8d8d8d);
const waterBaseColor = new THREE.Color(0x4aa5cf);
const trunkBaseColor = new THREE.Color(0x6b4b3a);
const leavesBaseColor = new THREE.Color(0x3e6b3e);
const rockBaseColor = new THREE.Color(0x7a7a7a);

const terrainMaterial = new THREE.MeshLambertMaterial({
  vertexColors: true,
  side: THREE.DoubleSide
});

const waterMaterial = new THREE.MeshLambertMaterial({
  vertexColors: true,
  transparent: true,
  opacity: 0.85,
  side: THREE.DoubleSide
});

const terrainColor: CellColorFn = (index, visible, out) => {
  if (!visible) {
    return out.setRGB(0, 0, 0);
  }
  const x = index % world.width;
  const y = Math.floor(index / world.width);
  const h = getHeight(world, x, y);
  const sandMix = smoothstep(worldConfig.seaLevel + 0.01, worldConfig.seaLevel + 0.09, h);
  out.copy(sandColor).lerp(soilColor, sandMix);
  const rockMix = smoothstep(worldConfig.mountainHeight - 0.06, worldConfig.mountainHeight + 0.08, h);
  out.lerp(rockColor, rockMix);
  const jitter = terrainNoise(x * 0.2, y * 0.2) * 0.05;
  const macro = macroNoise(x * 0.05, y * 0.05) * 0.12;
  out.multiplyScalar(1 + jitter + macro);
  return out;
};

const terrainVertexColor: VertexColorFn = (vx, vy, cellIndex, visible, out) => {
  if (!visible) {
    return out.setRGB(0, 0, 0);
  }
  const h = getTerrainVertexHeight(world, vx, vy, worldConfig.seaLevel);
  const cellX = clamp(Math.floor(vx), 0, world.width - 1);
  const cellY = clamp(Math.floor(vy), 0, world.height - 1);
  const slope = getSlopeAt(world.heightmap, world.width, world.height, cellX, cellY);

  const sandMix = smoothstep(worldConfig.seaLevel + 0.01, worldConfig.seaLevel + 0.09, h);
  out.copy(sandColor).lerp(soilColor, sandMix);

  const rockByHeight = smoothstep(worldConfig.mountainHeight - 0.06, worldConfig.mountainHeight + 0.08, h);
  const rockBySlope = smoothstep(0.12, 0.19, slope);
  const rockMix = Math.max(rockByHeight, rockBySlope);
  out.lerp(rockColor, rockMix);

  const jitter = terrainNoise(vx * 0.2, vy * 0.2) * 0.05;
  const macro = macroNoise(vx * 0.05, vy * 0.05) * 0.12;
  out.multiplyScalar(1 + jitter + macro);
  return out;
};

const waterColor: CellColorFn = (index, visible, out) => {
  if (!visible) {
    return out.setRGB(0, 0, 0);
  }
  const x = index % world.width;
  const y = Math.floor(index / world.width);
  const jitter = waterNoise(x * 0.25, y * 0.25) * 0.05;
  out.copy(waterBaseColor).multiplyScalar(1 + jitter);
  return out;
};

const waterVertexColor: VertexColorFn = (vx, vy, cellIndex, visible, out) => {
  if (!visible) {
    return out.setRGB(0, 0, 0);
  }
  const jitter = waterNoise(vx * 0.25, vy * 0.25) * 0.05;
  const shore = isNearLand(world, vx, vy, worldConfig.seaLevel, 1);
  out.copy(waterBaseColor);
  if (shore) {
    out.lerp(sandColor, 0.2);
  }
  out.multiplyScalar(1 + jitter);
  return out;
};

const terrainMeshData = buildGridMesh(world, {
  cellSize,
  heightScale,
  revealed,
  includeCell: (index) => world.ground[index] !== GroundType.Water,
  heightAtVertex: (x, y) => getTerrainVertexHeight(world, x, y, worldConfig.seaLevel),
  colorForCell: terrainColor,
  colorForVertex: terrainVertexColor,
  material: terrainMaterial
});

const seaHeight = worldConfig.seaLevel * heightScale + 0.08;
const waterMeshData = buildGridMesh(world, {
  cellSize,
  heightScale: 1,
  revealed,
  includeCell: (index) => world.ground[index] === GroundType.Water,
  heightAtVertex: () => seaHeight,
  colorForCell: waterColor,
  colorForVertex: waterVertexColor,
  material: waterMaterial
});
waterMeshData.mesh.renderOrder = 1;

const scene = new THREE.Scene();
scene.add(terrainMeshData.mesh, waterMeshData.mesh);

const ambient = new THREE.AmbientLight(0xfff1d6, 0.9);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xfff3da, 0.9);
sun.position.set(30, 60, 20).multiplyScalar(cellSize);
scene.add(sun);

const canvas = document.querySelector<HTMLCanvasElement>("#scene");
if (!canvas) {
  throw new Error("Canvas not found");
}

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1) * renderScale);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const camera = createIsometricCamera(cellSize, cameraViewCells);
const cameraOffset = new THREE.Vector3(10, 14, 10).multiplyScalar(cellSize);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

const player = createPlayerMesh();
scene.add(player);

let currentCell = spawnCell;
placePlayerAtCell(player, world, currentCell, heightScale, cellSize);
updateCameraFollow(camera, player, cameraOffset);

const minimap = createMinimap(world, revealed, denseForestMask);
minimap?.updateCells(initialRevealed);

const objectRender = createObjectMeshes(world, revealed, heightScale, denseForestMask);
const forestRender = createDenseForestMesh(world, denseForestMask, revealed, heightScale);
scene.add(objectRender.trunks, objectRender.leaves, objectRender.rocks);
if (forestRender) {
  scene.add(forestRender.mesh);
}

let targetCell: GridPoint | null = null;
let path: GridPoint[] = [];
let pathStep = 0;
let needsRepath = false;
let walkPhase = 0;

canvas.addEventListener("contextmenu", (event) => event.preventDefault());
canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 2) {
    return;
  }
  handleRightClick(event);
});

window.addEventListener("resize", () => {
  resizeCamera(camera, cellSize, cameraViewCells);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1) * renderScale);
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();

function animate(): void {
  const delta = clock.getDelta();
  updateMovement(delta);
  updateCameraFollow(camera, player, cameraOffset);
  minimap?.render(currentCell, targetCell);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();

function handleRightClick(event: PointerEvent): void {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  const hits = raycaster.intersectObjects([terrainMeshData.mesh, waterMeshData.mesh], false);
  if (hits.length === 0) {
    return;
  }

  const point = hits[0].point;
  const cell = worldToCell(world, point.x, point.z, cellSize);
  if (!inBounds(world, cell.x, cell.y)) {
    return;
  }

  const index = getIndex(world.width, cell.x, cell.y);
  if (revealed[index] === 0) {
    return;
  }

  if (!isCellStandable(world, cell.x, cell.y)) {
    return;
  }

  targetCell = cell;
  const newPath = findPath(world, revealed, currentCell, targetCell, pathOptions);
  if (!newPath || newPath.length < 2) {
    path = [];
    targetCell = null;
    needsRepath = false;
    return;
  }

  path = newPath;
  pathStep = 1;
}

function updateMovement(delta: number): void {
  const moving = path.length > 1 && pathStep < path.length;
  if (moving) {
    const nextCell = path[pathStep];
    const targetPos = cellToWorld(world, nextCell.x, nextCell.y, cellSize);

    const dx = targetPos.x - player.position.x;
    const dz = targetPos.z - player.position.z;
    const distance = Math.hypot(dx, dz);
    const step = moveSpeed * delta;

    if (distance <= step) {
      player.position.x = targetPos.x;
      player.position.z = targetPos.z;
      pathStep += 1;
    } else {
      player.position.x += (dx / distance) * step;
      player.position.z += (dz / distance) * step;
    }
    if (distance > 0.001) {
      player.rotation.y = Math.atan2(dx, dz);
    }

    const newCell = worldToCell(world, player.position.x, player.position.z, cellSize);
    if (newCell.x !== currentCell.x || newCell.y !== currentCell.y) {
      currentCell = newCell;
      const newlyRevealed = revealAround(world, revealed, currentCell, revealRadius);
      if (newlyRevealed.length > 0) {
        updateGridCells(terrainMeshData, newlyRevealed, revealed, terrainColor, terrainVertexColor);
        updateGridCells(waterMeshData, newlyRevealed, revealed, waterColor, waterVertexColor);
        objectRender.updateVisibility(newlyRevealed);
        forestRender?.updateVisibility(newlyRevealed);
        minimap?.updateCells(newlyRevealed);
        if (targetCell) {
          needsRepath = true;
        }
      }
    }

    if (pathStep >= path.length) {
      path = [];
      targetCell = null;
      needsRepath = false;
    }
  }

  if (needsRepath && targetCell) {
    const newPath = findPath(world, revealed, currentCell, targetCell, pathOptions);
    if (!newPath || newPath.length < 2) {
      path = [];
      targetCell = null;
      needsRepath = false;
    } else {
      path = newPath;
      pathStep = 1;
    }
    needsRepath = false;
  }

  const baseY = alignPlayerHeight(player, world, currentCell, heightScale);
  applyWalkAnimation(player, baseY, moving, delta);
}

function createIsometricCamera(cellSizeValue: number, viewCells: number): THREE.OrthographicCamera {
  const aspect = window.innerWidth / window.innerHeight;
  const size = viewCells * cellSizeValue;
  const camera = new THREE.OrthographicCamera(
    (-size * aspect) / 2,
    (size * aspect) / 2,
    size / 2,
    -size / 2,
    0.1,
    1000
  );
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, 0);
  return camera;
}

function resizeCamera(camera: THREE.OrthographicCamera, cellSizeValue: number, viewCells: number): void {
  const aspect = window.innerWidth / window.innerHeight;
  const size = viewCells * cellSizeValue;
  camera.left = (-size * aspect) / 2;
  camera.right = (size * aspect) / 2;
  camera.top = size / 2;
  camera.bottom = -size / 2;
  camera.updateProjectionMatrix();
}

function updateCameraFollow(
  camera: THREE.OrthographicCamera,
  target: THREE.Object3D,
  offset: THREE.Vector3
): void {
  camera.position.set(
    target.position.x + offset.x,
    target.position.y + offset.y,
    target.position.z + offset.z
  );
  camera.lookAt(target.position.x, target.position.y, target.position.z);
}

function createPlayerMesh(): THREE.Group {
  const group = new THREE.Group();
  const bodyHeight = cellSize * 1.1;
  const bodyRadius = cellSize * 0.28;
  const headRadius = cellSize * 0.28;

  const bodyGeo = new THREE.CylinderGeometry(bodyRadius * 0.85, bodyRadius, bodyHeight, 8);
  const headGeo = new THREE.SphereGeometry(headRadius, 12, 12);
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x40556f });
  const headMat = new THREE.MeshLambertMaterial({ color: 0xf1c072 });

  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = bodyHeight * 0.5;
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = bodyHeight + headRadius * 0.9;

  group.add(body, head);
  return group;
}

function alignPlayerHeight(
  playerMesh: THREE.Object3D,
  worldData: WorldData,
  cell: GridPoint,
  scale: number
): number {
  const height = getHeight(worldData, cell.x, cell.y) * scale;
  const baseY = height + cellSize * 0.02;
  playerMesh.position.y = baseY;
  return baseY;
}

function applyWalkAnimation(
  playerMesh: THREE.Object3D,
  baseY: number,
  moving: boolean,
  delta: number
): void {
  const walkSpeed = 6;
  const walkAmplitude = cellSize * 0.08;
  const walkTilt = 0.08;

  if (moving) {
    walkPhase += delta * walkSpeed;
  } else {
    walkPhase = 0;
  }

  const bob = moving ? Math.sin(walkPhase) * walkAmplitude : 0;
  playerMesh.position.y = baseY + bob;
  playerMesh.rotation.z = moving ? Math.sin(walkPhase) * walkTilt : 0;
}

function placePlayerAtCell(
  playerMesh: THREE.Object3D,
  worldData: WorldData,
  cell: GridPoint,
  scale: number,
  size: number
): void {
  const pos = cellToWorld(worldData, cell.x, cell.y, size);
  playerMesh.position.x = pos.x;
  playerMesh.position.z = pos.z;
  alignPlayerHeight(playerMesh, worldData, cell, scale);
}

function cellToWorld(worldData: WorldData, x: number, y: number, size: number): THREE.Vector3 {
  return new THREE.Vector3(
    (x + 0.5 - worldData.width / 2) * size,
    0,
    (y + 0.5 - worldData.height / 2) * size
  );
}

function worldToCell(worldData: WorldData, x: number, z: number, size: number): GridPoint {
  return {
    x: Math.floor(x / size + worldData.width / 2),
    y: Math.floor(z / size + worldData.height / 2)
  };
}

function getTerrainVertexHeight(
  worldData: WorldData,
  vx: number,
  vy: number,
  seaLevel: number
): number {
  let sum = 0;
  let count = 0;

  for (let dy = -1; dy <= 0; dy += 1) {
    for (let dx = -1; dx <= 0; dx += 1) {
      const cx = vx + dx;
      const cy = vy + dy;
      if (!inBounds(worldData, cx, cy)) {
        continue;
      }
      if (getGround(worldData, cx, cy) === GroundType.Water) {
        continue;
      }
      sum += getHeight(worldData, cx, cy);
      count += 1;
    }
  }

  const base = count > 0 ? sum / count : seaLevel;
  return Math.max(base, seaLevel + 0.002);
}

function isNearLand(
  worldData: WorldData,
  vx: number,
  vy: number,
  seaLevel: number,
  radius: number
): boolean {
  const baseX = Math.floor(vx);
  const baseY = Math.floor(vy);
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const cx = baseX + dx;
      const cy = baseY + dy;
      if (!inBounds(worldData, cx, cy)) {
        continue;
      }
      if (getHeight(worldData, cx, cy) >= seaLevel) {
        return true;
      }
    }
  }
  return false;
}

function revealAround(
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

function isCellStandable(worldData: WorldData, x: number, y: number): boolean {
  const ground = getGround(worldData, x, y);
  if (ground === GroundType.Water) {
    return false;
  }
  const index = getIndex(worldData.width, x, y);
  if (denseForestMask[index] === 1) {
    return false;
  }
  if (cellHasObject(worldData, x, y)) {
    return false;
  }
  return true;
}

function findSpawn(
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
        if (worldData.heightmap[index] < seaLevel) {
          continue;
        }
        if (worldData.ground[index] === GroundType.Water) {
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

function buildDenseForestMask(
  worldData: WorldData,
  noise2D: (x: number, y: number) => number,
  threshold: number
): Uint8Array {
  const mask = new Uint8Array(worldData.width * worldData.height);
  for (let y = 0; y < worldData.height; y += 1) {
    for (let x = 0; x < worldData.width; x += 1) {
      const index = getIndex(worldData.width, x, y);
      if (worldData.ground[index] !== GroundType.Soil) {
        continue;
      }
      const height = worldData.heightmap[index];
      if (height < worldConfig.seaLevel + 0.02) {
        continue;
      }
      const slope = getSlopeAt(worldData.heightmap, worldData.width, worldData.height, x, y);
      if (slope > worldConfig.treeSlopeMax) {
        continue;
      }
      const patch = fbm(noise2D, x * worldConfig.forestScale, y * worldConfig.forestScale, 3, 2.0, 0.5);
      if (patch > threshold) {
        mask[index] = 1;
      }
    }
  }
  return mask;
}

interface DenseForestRender {
  mesh: THREE.InstancedMesh;
  updateVisibility: (cells: number[]) => void;
}

function createDenseForestMesh(
  worldData: WorldData,
  blockedMask: Uint8Array,
  revealedMask: Uint8Array,
  scale: number
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
      if (instance < 0) {
        continue;
      }
      const cellPos = cellToWorld(worldData, x, y, cellSize);
      const height = getHeight(worldData, x, y) * scale;
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
      if (instance < 0) {
        continue;
      }
      const visible = revealedMask[index] === 1;
      mesh.setMatrixAt(instance, visible ? matrices[instance] : hiddenMatrices[instance]);
      updated = true;
    }
    if (updated) {
      mesh.instanceMatrix.needsUpdate = true;
    }
  };

  return { mesh, updateVisibility };
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function fbm(
  noise2D: (x: number, y: number) => number,
  x: number,
  y: number,
  octaves: number,
  lacunarity: number,
  gain: number
): number {
  let amplitude = 0.5;
  let frequency = 1.0;
  let sum = 0;
  let normalization = 0;

  for (let i = 0; i < octaves; i += 1) {
    sum += amplitude * noise2D(x * frequency, y * frequency);
    normalization += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }

  const value = sum / normalization;
  return value * 0.5 + 0.5;
}

function createObjectMeshes(
  worldData: WorldData,
  revealedMask: Uint8Array,
  scale: number,
  blockedMask: Uint8Array
): {
  trunks: THREE.InstancedMesh;
  leaves: THREE.InstancedMesh;
  rocks: THREE.InstancedMesh;
  updateVisibility: (cells: number[]) => void;
} {
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

  const trunkMat = new THREE.MeshLambertMaterial({ color: trunkBaseColor });
  const leavesMat = new THREE.MeshLambertMaterial({ color: leavesBaseColor });
  const rockMat = new THREE.MeshLambertMaterial({ color: rockBaseColor });

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
  const rng = mulberry32(worldConfig.seed + 404);

  let treeCounter = 0;
  let rockCounter = 0;
  for (let i = 0; i < worldData.objects.length; i += 1) {
    const obj = worldData.objects[i];
    const height = getHeight(worldData, obj.x, obj.y) * scale;
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
    const mapEntry = objectIndexMap[i];
    if (!mapEntry) {
      continue;
    }
    const index = getIndex(worldData.width, obj.x, obj.y);
    if (!cellSet.has(index)) {
      continue;
    }
    const visible = revealedMask[index] === 1;
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
    );
    updated = true;
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
): void {
  if (mapEntry.type === "tree") {
    const matrix = visible ? treeMatrices[mapEntry.index] : treeHiddenMatrices[mapEntry.index];
    trunks.setMatrixAt(mapEntry.index, matrix);
    leaves.setMatrixAt(mapEntry.index, matrix);
  } else {
    const matrix = visible ? rockMatrices[mapEntry.index] : rockHiddenMatrices[mapEntry.index];
    rocks.setMatrixAt(mapEntry.index, matrix);
  }
}

function finalizeInstancedMesh(mesh: THREE.InstancedMesh): void {
  if (mesh.count === 0) {
    return;
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
}

function makeHiddenMatrix(source: THREE.Matrix4, out: THREE.Matrix4): void {
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  source.decompose(position, rotation, scale);
  scale.set(0, 0, 0);
  out.compose(position, rotation, scale);
}

interface Minimap {
  updateCells: (indices: number[]) => void;
  render: (playerCell: GridPoint, targetCell: GridPoint | null) => void;
}

function createMinimap(
  worldData: WorldData,
  revealedMask: Uint8Array,
  blockedMask: Uint8Array
): Minimap | null {
  const canvas = document.querySelector<HTMLCanvasElement>("#minimap");
  if (!canvas) {
    return null;
  }
  canvas.width = worldData.width;
  canvas.height = worldData.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }
  ctx.imageSmoothingEnabled = false;

  const baseCanvas = document.createElement("canvas");
  baseCanvas.width = worldData.width;
  baseCanvas.height = worldData.height;
  const baseCtx = baseCanvas.getContext("2d");
  if (!baseCtx) {
    return null;
  }
  baseCtx.imageSmoothingEnabled = false;

  const imageData = baseCtx.createImageData(worldData.width, worldData.height);
  const data = imageData.data;
  for (let i = 0; i < worldData.width * worldData.height; i += 1) {
    data[i * 4 + 3] = 255;
  }
  baseCtx.putImageData(imageData, 0, 0);

  const palette: Record<GroundType, [number, number, number]> = {
    [GroundType.Water]: [22, 78, 118],
    [GroundType.Sand]: [210, 192, 132],
    [GroundType.Soil]: [86, 150, 84],
    [GroundType.Rock]: [120, 120, 120]
  };

  const updateCells = (indices: number[]): void => {
    let updated = false;
    for (const index of indices) {
      if (revealedMask[index] === 0) {
        continue;
      }
      const ground = worldData.ground[index] as GroundType;
      let [r, g, b] = palette[ground];
      if (ground === GroundType.Soil && blockedMask[index] === 1) {
        r = 55;
        g = 100;
        b = 65;
      }
      const base = index * 4;
      data[base] = r;
      data[base + 1] = g;
      data[base + 2] = b;
      data[base + 3] = 255;
      updated = true;
    }
    if (updated) {
      baseCtx.putImageData(imageData, 0, 0);
    }
  };

  const render = (playerCell: GridPoint, targetCell: GridPoint | null): void => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(baseCanvas, 0, 0);

    ctx.fillStyle = "#f5c46b";
    ctx.fillRect(playerCell.x - 1, playerCell.y - 1, 3, 3);

    if (targetCell) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.strokeRect(targetCell.x - 2, targetCell.y - 2, 5, 5);
    }
  };

  return { updateCells, render };
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
