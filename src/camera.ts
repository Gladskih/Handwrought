import * as THREE from "three";

export function createIsometricCamera(cellSize: number, viewCells: number): THREE.OrthographicCamera {
  const aspect = window.innerWidth / window.innerHeight;
  const size = viewCells * cellSize;
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

export function resizeCamera(camera: THREE.OrthographicCamera, cellSize: number, viewCells: number): void {
  const aspect = window.innerWidth / window.innerHeight;
  const size = viewCells * cellSize;
  camera.left = (-size * aspect) / 2;
  camera.right = (size * aspect) / 2;
  camera.top = size / 2;
  camera.bottom = -size / 2;
  camera.updateProjectionMatrix();
}

export function updateCameraFollow(
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
