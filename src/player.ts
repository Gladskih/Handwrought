import * as THREE from "three";
import { sampleTerrainHeightAtWorld } from "./terrain";
import { cellToWorld } from "./coords";
import type { WorldData } from "./world";
import type { GridPoint } from "./types";

export function createPlayerMesh(cellSize: number): THREE.Group {
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

export function alignPlayerHeight(
  playerMesh: THREE.Object3D,
  worldData: WorldData,
  heightScale: number,
  cellSize: number,
  seaLevel: number
): number {
  const height =
    sampleTerrainHeightAtWorld(
      worldData,
      playerMesh.position.x,
      playerMesh.position.z,
      cellSize,
      seaLevel
    ) * heightScale;
  const baseY = height + cellSize * 0.02;
  playerMesh.position.y = baseY;
  return baseY;
}

export function applyWalkAnimation(
  playerMesh: THREE.Object3D,
  baseY: number,
  moving: boolean,
  delta: number,
  cellSize: number,
  phase: number
): number {
  const walkSpeed = 6;
  const walkAmplitude = cellSize * 0.08;
  const walkTilt = 0.08;

  const nextPhase = moving ? phase + delta * walkSpeed : 0;
  const bob = moving ? Math.sin(nextPhase) * walkAmplitude : 0;

  playerMesh.position.y = baseY + bob;
  playerMesh.rotation.z = moving ? Math.sin(nextPhase) * walkTilt : 0;

  return nextPhase;
}

export function placePlayerAtCell(
  playerMesh: THREE.Object3D,
  worldData: WorldData,
  cell: GridPoint,
  heightScale: number,
  cellSize: number,
  seaLevel: number
): void {
  const pos = cellToWorld(worldData, cell.x, cell.y, cellSize);
  playerMesh.position.x = pos.x;
  playerMesh.position.z = pos.z;
  alignPlayerHeight(playerMesh, worldData, heightScale, cellSize, seaLevel);
}
