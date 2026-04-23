// Scene — container for meshes and lights

import { type Mesh } from "./mesh";
import { type DirectionalLight, type AmbientLight } from "./light";

export class Scene {
  meshes: Mesh[] = [];
  directionalLight: DirectionalLight | null = null;
  ambientLight: AmbientLight | null = null;

  add(mesh: Mesh) {
    this.meshes.push(mesh);
  }

  setDirectionalLight(light: DirectionalLight) {
    this.directionalLight = light;
  }

  setAmbientLight(light: AmbientLight) {
    this.ambientLight = light;
  }

  clear() {
    this.meshes = [];
  }
}
