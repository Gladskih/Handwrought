import "./style.css";
import * as THREE from "three";
import { createNoise2D } from "simplex-noise";
import { generateWorld, getIndex, inBounds } from "./world";
import { findPath } from "./pathfinding";
import { updateGridCells } from "./render";
import { createIsometricCamera, resizeCamera, updateCameraFollow } from "./camera";
import { applyWalkAnimation, alignPlayerHeight, createPlayerMesh, placePlayerAtCell } from "./player";
import { createMinimap } from "./minimap";
import { createObjectMeshes } from "./objects";
import { buildDenseForestMask, createDenseForestMesh } from "./forest";
import { createTerrainRenderData } from "./terrain";
import { findSpawn, isCellStandable, revealAround } from "./gameplay";
import { cellToWorld, worldToCell } from "./coords";
import { clamp, mulberry32 } from "./math";
import { getSpawnOverride } from "./spawn";
import type { PathOptions } from "./pathfinding";
import type { WorldGenConfig } from "./world";
import type { GridPoint } from "./types";

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
const heightScale = 24;
const revealRadius = 16;
const moveSpeed = 2.2 * cellSize;
const cameraViewCells = 16;
const renderScale = 0.85;

const pathOptions: PathOptions = {
  maxSlope: 0.16,
  allowDiagonal: true
};

const forestNoise = createNoise2D(mulberry32(worldConfig.seed + 1337));
const forestBlockThreshold = Math.min(0.95, worldConfig.forestThreshold + 0.18);

const world = generateWorld(worldConfig);
const revealed = new Uint8Array(world.width * world.height);
const denseForestMask = buildDenseForestMask(world, forestNoise, forestBlockThreshold, worldConfig);
pathOptions.blockedMask = denseForestMask;

const spawnOverride = getSpawnOverride(world, denseForestMask, pathOptions.maxSlope, worldConfig.seaLevel);
const spawnCell = spawnOverride ?? findSpawn(world, pathOptions.maxSlope, worldConfig.seaLevel, denseForestMask);
const initialRevealed = revealAround(world, revealed, spawnCell, revealRadius);

const terrainRender = createTerrainRenderData(world, worldConfig, revealed, cellSize, heightScale);

const scene = new THREE.Scene();
scene.add(terrainRender.terrain.mesh, terrainRender.water.mesh);

const ambient = new THREE.AmbientLight(0xfff1d6, 0.8);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xfff3da, 1.0);
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
const zoomConfig = {
  min: 0.8,
  max: 1.5,
  step: 0.1
};
let cameraZoom = 1.0;
applyCameraZoom(camera, cameraZoom);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

const player = createPlayerMesh(cellSize);
scene.add(player);

let currentCell = spawnCell;
placePlayerAtCell(player, world, currentCell, heightScale, cellSize);
updateCameraFollow(camera, player, cameraOffset);

const minimap = createMinimap(world, revealed, denseForestMask);
minimap?.updateCells(initialRevealed);

const objectRender = createObjectMeshes(world, revealed, heightScale, denseForestMask, cellSize, worldConfig.seed);
const forestRender = createDenseForestMesh(world, denseForestMask, revealed, heightScale, cellSize);
objectRender.trunks.forEach((mesh) => scene.add(mesh));
objectRender.leaves.forEach((mesh) => scene.add(mesh));
scene.add(objectRender.rocks);
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
canvas.addEventListener(
  "wheel",
  (event) => {
    if (event.deltaY === 0) {
      return;
    }
    event.preventDefault();
    const direction = Math.sign(event.deltaY);
    cameraZoom = clamp(cameraZoom - direction * zoomConfig.step, zoomConfig.min, zoomConfig.max);
    applyCameraZoom(camera, cameraZoom);
  },
  { passive: false }
);

window.addEventListener("resize", () => {
  resizeCamera(camera, cellSize, cameraViewCells);
  applyCameraZoom(camera, cameraZoom);
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

  const hits = raycaster.intersectObjects(
    [terrainRender.terrain.mesh, terrainRender.water.mesh],
    false
  );
  const hit = hits[0];
  if (!hit) {
    return;
  }

  const cell = worldToCell(world, hit.point.x, hit.point.z, cellSize);
  if (!inBounds(world, cell.x, cell.y)) {
    return;
  }

  const index = getIndex(world.width, cell.x, cell.y);
  if (revealed[index] === 0) {
    return;
  }

  if (!isCellStandable(world, cell.x, cell.y, denseForestMask)) {
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
    if (!nextCell) {
      path = [];
      targetCell = null;
      needsRepath = false;
      return;
    }
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
        updateGridCells(
          terrainRender.terrain,
          newlyRevealed,
          revealed,
          terrainRender.terrainColor,
          terrainRender.terrainVertexColor
        );
        updateGridCells(
          terrainRender.water,
          newlyRevealed,
          revealed,
          terrainRender.waterColor,
          terrainRender.waterVertexColor
        );
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

  const baseY = alignPlayerHeight(player, world, currentCell, heightScale, cellSize);
  walkPhase = applyWalkAnimation(player, baseY, moving, delta, cellSize, walkPhase);
}

function applyCameraZoom(cameraValue: THREE.OrthographicCamera, zoom: number): void {
  cameraValue.zoom = zoom;
  cameraValue.updateProjectionMatrix();
}
