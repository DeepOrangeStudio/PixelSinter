// Material — pixel art material with albedo and outline settings

import { type Vec3 } from "../core/math";

let nextObjectId = 1;

export class Material {
  albedo: Vec3;
  outlineEnabled: boolean;
  objectId: number;

  constructor(albedo: Vec3 = [0.8, 0.8, 0.8]) {
    this.albedo = albedo;
    this.outlineEnabled = true;
    this.objectId = nextObjectId++;
  }
}

export function resetObjectIdCounter() {
  nextObjectId = 1;
}
