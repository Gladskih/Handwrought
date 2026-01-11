import * as THREE from "three";

export function finalizeInstancedMesh(mesh: THREE.InstancedMesh): void {
  if (mesh.count === 0) {
    return;
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
}

export function makeHiddenMatrix(source: THREE.Matrix4, out: THREE.Matrix4): void {
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  source.decompose(position, rotation, scale);
  scale.set(0, 0, 0);
  out.compose(position, rotation, scale);
}
