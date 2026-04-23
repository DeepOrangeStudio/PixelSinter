// Camera — ortho + perspective, view + projection matrices

import {
  type Vec3,
  type Mat4,
  mat4_lookAt,
  mat4_perspective,
  mat4_ortho,
  degToRad,
} from "../core/math";

export class OrthoCamera {
  width: number;
  height: number;
  near: number;
  far: number;
  position: Vec3;
  target: Vec3;
  up: Vec3;

  constructor(
    width = 10,
    height = 10,
    near = 0.1,
    far = 100,
    position: Vec3 = [0, 0, 5],
    target: Vec3 = [0, 0, 0],
  ) {
    this.width = width;
    this.height = height;
    this.near = near;
    this.far = far;
    this.position = position;
    this.target = target;
    this.up = [0, 1, 0];
  }

  getViewMatrix(): Mat4 {
    return mat4_lookAt(this.position, this.target, this.up);
  }

  getProjectionMatrix(): Mat4 {
    const hw = this.width / 2;
    const hh = this.height / 2;
    return mat4_ortho(-hw, hw, -hh, hh, this.near, this.far);
  }
}

export class PerspectiveCamera {
  fov: number; // degrees
  aspect: number;
  near: number;
  far: number;
  position: Vec3;
  target: Vec3;
  up: Vec3;

  constructor(
    fov = 60,
    aspect = 16 / 9,
    near = 0.1,
    far = 100,
    position: Vec3 = [0, 0, 5],
    target: Vec3 = [0, 0, 0],
  ) {
    this.fov = fov;
    this.aspect = aspect;
    this.near = near;
    this.far = far;
    this.position = position;
    this.target = target;
    this.up = [0, 1, 0];
  }

  getViewMatrix(): Mat4 {
    return mat4_lookAt(this.position, this.target, this.up);
  }

  getProjectionMatrix(): Mat4 {
    return mat4_perspective(degToRad(this.fov), this.aspect, this.near, this.far);
  }
}
