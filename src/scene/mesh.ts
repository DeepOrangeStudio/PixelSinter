// Mesh — geometry + material + transform

import { type Geometry } from "./geometry";
import { type Material } from "./material";
import { Transform } from "./transform";

export class Mesh {
  geometry: Geometry;
  material: Material;
  transform: Transform;

  constructor(geometry: Geometry, material: Material, transform?: Transform) {
    this.geometry = geometry;
    this.material = material;
    this.transform = transform ?? new Transform();
  }
}
