import * as THREE from "three";
import { hash2D } from "./math";

export interface TreeVariant {
  name: "pine" | "oak" | "birch";
  trunkGeo: THREE.BufferGeometry;
  leavesGeo: THREE.BufferGeometry;
  trunkColor: THREE.Color;
  leavesColor: THREE.Color;
  baseScale: THREE.Vector3;
  sizeMin: number;
  sizeRange: number;
}

export function createTreeVariants(cellSize: number): TreeVariant[] {
  const pineTrunkHeight = cellSize * 0.95;
  const pineTrunkTop = cellSize * 0.12;
  const pineTrunkBottom = cellSize * 0.18;
  const pineLeavesRadius = cellSize * 0.6;
  const pineLeavesHeight = cellSize * 1.45;

  const pineTrunk = new THREE.CylinderGeometry(pineTrunkTop, pineTrunkBottom, pineTrunkHeight, 6);
  pineTrunk.translate(0, pineTrunkHeight * 0.5, 0);
  const pineLeaves = new THREE.ConeGeometry(pineLeavesRadius, pineLeavesHeight, 7);
  pineLeaves.translate(0, pineTrunkHeight + pineLeavesHeight * 0.5, 0);

  const oakTrunkHeight = cellSize * 0.85;
  const oakTrunkTop = cellSize * 0.2;
  const oakTrunkBottom = cellSize * 0.28;
  const oakLeavesRadius = cellSize * 0.8;

  const oakTrunk = new THREE.CylinderGeometry(oakTrunkTop, oakTrunkBottom, oakTrunkHeight, 7);
  oakTrunk.translate(0, oakTrunkHeight * 0.5, 0);
  const oakLeaves = new THREE.IcosahedronGeometry(oakLeavesRadius, 0);
  oakLeaves.translate(0, oakTrunkHeight + oakLeavesRadius * 0.7, 0);

  const birchTrunkHeight = cellSize * 1.02;
  const birchTrunkTop = cellSize * 0.1;
  const birchTrunkBottom = cellSize * 0.16;
  const birchLeavesRadius = cellSize * 0.55;

  const birchTrunk = new THREE.CylinderGeometry(birchTrunkTop, birchTrunkBottom, birchTrunkHeight, 6);
  birchTrunk.translate(0, birchTrunkHeight * 0.5, 0);
  const birchLeaves = new THREE.SphereGeometry(birchLeavesRadius, 8, 6);
  birchLeaves.scale(1, 1.2, 1);
  birchLeaves.translate(0, birchTrunkHeight + birchLeavesRadius * 0.8, 0);

  [pineTrunk, pineLeaves, oakTrunk, oakLeaves, birchTrunk, birchLeaves].forEach((geometry) =>
    applyWhiteVertexColors(geometry)
  );

  return [
    {
      name: "pine",
      trunkGeo: pineTrunk,
      leavesGeo: pineLeaves,
      trunkColor: new THREE.Color(0x6a4a37),
      leavesColor: new THREE.Color(0x3d6f42),
      baseScale: new THREE.Vector3(1, 1, 1),
      sizeMin: 0.9,
      sizeRange: 0.35
    },
    {
      name: "oak",
      trunkGeo: oakTrunk,
      leavesGeo: oakLeaves,
      trunkColor: new THREE.Color(0x6a4834),
      leavesColor: new THREE.Color(0x5e8a54),
      baseScale: new THREE.Vector3(1.15, 0.9, 1.15),
      sizeMin: 0.85,
      sizeRange: 0.35
    },
    {
      name: "birch",
      trunkGeo: birchTrunk,
      leavesGeo: birchLeaves,
      trunkColor: new THREE.Color(0xd7d0c6),
      leavesColor: new THREE.Color(0x86b67b),
      baseScale: new THREE.Vector3(0.95, 1.05, 0.95),
      sizeMin: 0.85,
      sizeRange: 0.3
    }
  ];
}

export function pickTreeVariant(x: number, y: number, seed: number, variantCount: number): number {
  const roll = hash2D(x, y, seed + 101.3);
  const index = Math.floor(roll * variantCount);
  return Math.min(variantCount - 1, Math.max(0, index));
}

export function makeVariantColor(
  base: THREE.Color,
  x: number,
  y: number,
  seed: number,
  hueJitter: number,
  lightJitter: number,
  out: THREE.Color
): THREE.Color {
  const hueShift = (hash2D(x, y, seed) - 0.5) * hueJitter;
  const lightShift = (hash2D(x, y, seed + 31.1) - 0.5) * lightJitter;
  out.copy(base);
  out.offsetHSL(hueShift, 0, lightShift);
  const brightness = 1 + (hash2D(x, y, seed + 77.7) - 0.5) * lightJitter;
  out.multiplyScalar(brightness);
  return out;
}

function applyWhiteVertexColors(geometry: THREE.BufferGeometry): void {
  const positionAttr = geometry.getAttribute("position");
  if (!positionAttr || geometry.getAttribute("color")) {
    return;
  }
  const colorArray = new Float32Array(positionAttr.count * 3);
  colorArray.fill(1);
  geometry.setAttribute("color", new THREE.BufferAttribute(colorArray, 3));
}
