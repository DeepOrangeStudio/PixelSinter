// Lights — directional, ambient, point

import { type Vec3 } from "../core/math";

export const MAX_POINT_LIGHTS = 4;

export class DirectionalLight {
  direction: Vec3;
  color: Vec3;
  intensity: number;

  constructor(
    direction: Vec3 = [0.5, 1.0, 0.8],
    color: Vec3 = [1, 1, 1],
    intensity: number = 1.0,
  ) {
    this.direction = direction;
    this.color = color;
    this.intensity = intensity;
  }
}

export class PointLight {
  position: Vec3;
  color: Vec3;
  intensity: number;
  range: number;

  constructor(
    position: Vec3 = [0, 0, 0],
    color: Vec3 = [1, 1, 1],
    intensity: number = 1.0,
    range: number = 10.0,
  ) {
    this.position = position;
    this.color = color;
    this.intensity = intensity;
    this.range = range;
  }
}

export class AmbientLight {
  color: Vec3;
  intensity: number;

  constructor(
    color: Vec3 = [1, 1, 1],
    intensity: number = 0.15,
  ) {
    this.color = color;
    this.intensity = intensity;
  }
}
