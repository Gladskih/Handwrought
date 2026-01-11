import * as THREE from "three";
import { getIndex } from "./world";
import type { WorldData } from "./world";

export type CellColorFn = (index: number, visible: boolean, out: THREE.Color) => THREE.Color;
export type VertexColorFn = (
  vx: number,
  vy: number,
  cellIndex: number,
  visible: boolean,
  out: THREE.Color
) => THREE.Color;

export interface GridMeshOptions {
  cellSize: number;
  heightScale: number;
  revealed: Uint8Array;
  includeCell: (index: number) => boolean;
  heightAtVertex: (x: number, y: number) => number;
  colorForCell: CellColorFn;
  colorForVertex?: VertexColorFn;
  material: THREE.Material;
}

export interface GridMeshData {
  mesh: THREE.Mesh;
  cellStarts: Int32Array;
  colors: Float32Array;
  colorAttribute: THREE.BufferAttribute;
  verticesPerCell: number;
  width: number;
  height: number;
}

export function buildGridMesh(world: WorldData, options: GridMeshOptions): GridMeshData {
  const positions: number[] = [];
  const colors: number[] = [];
  const cellStarts = new Int32Array(world.width * world.height).fill(-1);
  const tempColor = new THREE.Color();
  let vertexIndex = 0;

  for (let y = 0; y < world.height; y += 1) {
    for (let x = 0; x < world.width; x += 1) {
      const index = getIndex(world.width, x, y);
      if (!options.includeCell(index)) {
        continue;
      }

      cellStarts[index] = vertexIndex;

      const x0 = (x - world.width / 2) * options.cellSize;
      const x1 = (x + 1 - world.width / 2) * options.cellSize;
      const z0 = (y - world.height / 2) * options.cellSize;
      const z1 = (y + 1 - world.height / 2) * options.cellSize;

      const h00 = options.heightAtVertex(x, y) * options.heightScale;
      const h10 = options.heightAtVertex(x + 1, y) * options.heightScale;
      const h01 = options.heightAtVertex(x, y + 1) * options.heightScale;
      const h11 = options.heightAtVertex(x + 1, y + 1) * options.heightScale;

      const visible = options.revealed[index] === 1;
      const colorFn = options.colorForVertex;

      const color0 = colorFn
        ? colorFn(x, y, index, visible, tempColor)
        : options.colorForCell(index, visible, tempColor);
      pushVertex(positions, colors, color0, x0, h00, z0);
      const color1 = colorFn
        ? colorFn(x + 1, y, index, visible, tempColor)
        : options.colorForCell(index, visible, tempColor);
      pushVertex(positions, colors, color1, x1, h10, z0);
      const color2 = colorFn
        ? colorFn(x, y + 1, index, visible, tempColor)
        : options.colorForCell(index, visible, tempColor);
      pushVertex(positions, colors, color2, x0, h01, z1);

      const color3 = colorFn
        ? colorFn(x + 1, y, index, visible, tempColor)
        : options.colorForCell(index, visible, tempColor);
      pushVertex(positions, colors, color3, x1, h10, z0);
      const color4 = colorFn
        ? colorFn(x + 1, y + 1, index, visible, tempColor)
        : options.colorForCell(index, visible, tempColor);
      pushVertex(positions, colors, color4, x1, h11, z1);
      const color5 = colorFn
        ? colorFn(x, y + 1, index, visible, tempColor)
        : options.colorForCell(index, visible, tempColor);
      pushVertex(positions, colors, color5, x0, h01, z1);

      vertexIndex += 6;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const colorAttribute = new THREE.Float32BufferAttribute(colors, 3);
  geometry.setAttribute("color", colorAttribute);
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, options.material);
  mesh.castShadow = false;
  mesh.receiveShadow = true;

  return {
    mesh,
    cellStarts,
    colors: colorAttribute.array as Float32Array,
    colorAttribute,
    verticesPerCell: 6,
    width: world.width,
    height: world.height
  };
}

export function updateGridCells(
  meshData: GridMeshData,
  indices: number[],
  revealed: Uint8Array,
  colorForCell: CellColorFn,
  colorForVertex?: VertexColorFn
): void {
  const tempColor = new THREE.Color();
  let updated = false;

  for (const index of indices) {
    const start = meshData.cellStarts[index];
    if (start === undefined || start < 0) {
      continue;
    }
    const visible = revealed[index] === 1;
    const cellX = index % meshData.width;
    const cellY = Math.floor(index / meshData.width);
    const vertexCoords: Array<{ vx: number; vy: number }> = [
      { vx: cellX, vy: cellY },
      { vx: cellX + 1, vy: cellY },
      { vx: cellX, vy: cellY + 1 },
      { vx: cellX + 1, vy: cellY },
      { vx: cellX + 1, vy: cellY + 1 },
      { vx: cellX, vy: cellY + 1 }
    ];

    vertexCoords.forEach((coord, v) => {
      const base = (start + v) * 3;
      const color = colorForVertex
        ? colorForVertex(coord.vx, coord.vy, index, visible, tempColor)
        : colorForCell(index, visible, tempColor);
      meshData.colors[base] = color.r;
      meshData.colors[base + 1] = color.g;
      meshData.colors[base + 2] = color.b;
    });
    updated = true;
  }

  if (updated) {
    meshData.colorAttribute.needsUpdate = true;
  }
}

function pushVertex(
  positions: number[],
  colors: number[],
  color: THREE.Color,
  x: number,
  y: number,
  z: number
): void {
  positions.push(x, y, z);
  colors.push(color.r, color.g, color.b);
}
