// Transform — position, rotation, scale → model matrix
// Supports optional custom matrix override (for glTF matrix nodes)

import {
  type Vec3,
  type Mat4,
  mat4_identity,
  mat4_translate,
  mat4_rotateX,
  mat4_rotateY,
  mat4_rotateZ,
  mat4_scale,
} from "../core/math";

export class Transform {
  position: Vec3 = [0, 0, 0];
  rotation: Vec3 = [0, 0, 0]; // Euler angles in radians (X, Y, Z)
  scaling: Vec3 = [1, 1, 1];
  customMatrix: Mat4 | null = null; // When set, overrides TRS

  getModelMatrix(): Mat4 {
    if (this.customMatrix) return this.customMatrix;
    let m = mat4_identity();
    m = mat4_translate(m, this.position);
    m = mat4_rotateY(m, this.rotation[1]);
    m = mat4_rotateX(m, this.rotation[0]);
    m = mat4_rotateZ(m, this.rotation[2]);
    m = mat4_scale(m, this.scaling);
    return m;
  }
}
