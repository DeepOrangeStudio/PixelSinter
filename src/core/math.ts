// Minimal math utilities for PixelSinter — no external deps
// Column-major Mat4 (WebGPU convention)

export type Vec3 = [number, number, number];
export type Vec4 = [number, number, number, number];
export type Mat4 = Float32Array; // 16 floats, column-major

// --- Vec3 ---

export function vec3_add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function vec3_sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function vec3_scale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

export function vec3_dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function vec3_cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function vec3_length(v: Vec3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

export function vec3_normalize(v: Vec3): Vec3 {
  const len = vec3_length(v);
  if (len === 0) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

// --- Mat4 (column-major) ---
// Index layout:
//  [0]  [4]  [8]  [12]
//  [1]  [5]  [9]  [13]
//  [2]  [6]  [10] [14]
//  [3]  [7]  [11] [15]

export function mat4_identity(): Mat4 {
  const m = new Float32Array(16);
  m[0] = 1; m[5] = 1; m[10] = 1; m[15] = 1;
  return m;
}

export function mat4_multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += a[k * 4 + row] * b[col * 4 + k];
      }
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

export function mat4_perspective(fov: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1.0 / Math.tan(fov / 2);
  const rangeInv = 1.0 / (near - far);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = far * rangeInv;
  m[11] = -1;
  m[14] = near * far * rangeInv;
  return m;
}

export function mat4_ortho(
  left: number, right: number,
  bottom: number, top: number,
  near: number, far: number
): Mat4 {
  const m = new Float32Array(16);
  const lr = 1 / (left - right);
  const bt = 1 / (bottom - top);
  const nf = 1 / (near - far);
  m[0] = -2 * lr;
  m[5] = -2 * bt;
  m[10] = nf;
  m[12] = (left + right) * lr;
  m[13] = (top + bottom) * bt;
  m[14] = near * nf;
  m[15] = 1;
  return m;
}

export function mat4_lookAt(eye: Vec3, target: Vec3, up: Vec3): Mat4 {
  const z = vec3_normalize(vec3_sub(eye, target)); // forward (camera looks down -z)
  const x = vec3_normalize(vec3_cross(up, z));
  const y = vec3_cross(z, x);

  const m = new Float32Array(16);
  m[0] = x[0]; m[1] = y[0]; m[2] = z[0]; m[3] = 0;
  m[4] = x[1]; m[5] = y[1]; m[6] = z[1]; m[7] = 0;
  m[8] = x[2]; m[9] = y[2]; m[10] = z[2]; m[11] = 0;
  m[12] = -vec3_dot(x, eye);
  m[13] = -vec3_dot(y, eye);
  m[14] = -vec3_dot(z, eye);
  m[15] = 1;
  return m;
}

export function mat4_translate(m: Mat4, v: Vec3): Mat4 {
  const t = mat4_identity();
  t[12] = v[0]; t[13] = v[1]; t[14] = v[2];
  return mat4_multiply(m, t);
}

export function mat4_rotateX(m: Mat4, angle: number): Mat4 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const r = mat4_identity();
  r[5] = c; r[6] = s;
  r[9] = -s; r[10] = c;
  return mat4_multiply(m, r);
}

export function mat4_rotateY(m: Mat4, angle: number): Mat4 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const r = mat4_identity();
  r[0] = c; r[2] = -s;
  r[8] = s; r[10] = c;
  return mat4_multiply(m, r);
}

export function mat4_rotateZ(m: Mat4, angle: number): Mat4 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const r = mat4_identity();
  r[0] = c; r[1] = s;
  r[4] = -s; r[5] = c;
  return mat4_multiply(m, r);
}

export function mat4_scale(m: Mat4, v: Vec3): Mat4 {
  const s = mat4_identity();
  s[0] = v[0]; s[5] = v[1]; s[10] = v[2];
  return mat4_multiply(m, s);
}

export function mat4_invert(m: Mat4): Mat4 {
  const inv = new Float32Array(16);
  const a = m;

  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;

  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (Math.abs(det) < 1e-8) return mat4_identity();

  det = 1.0 / det;

  inv[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  inv[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  inv[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  inv[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  inv[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  inv[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  inv[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  inv[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  inv[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  inv[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  inv[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  inv[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  inv[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  inv[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  inv[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  inv[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;

  return inv;
}

export function mat4_transpose(m: Mat4): Mat4 {
  const out = new Float32Array(16);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      out[j * 4 + i] = m[i * 4 + j];
    }
  }
  return out;
}

export function mat4_normalMatrix(modelMatrix: Mat4): Mat4 {
  // Inverse transpose of the model matrix (only the 3x3 upper-left matters,
  // but we compute full 4x4 for convenience)
  return mat4_transpose(mat4_invert(modelMatrix));
}

export function degToRad(deg: number): number {
  return deg * (Math.PI / 180);
}
