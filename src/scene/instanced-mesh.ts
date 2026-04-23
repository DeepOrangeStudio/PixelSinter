// InstancedMesh — draws many copies of the same geometry with per-instance transforms
// Uses a storage buffer for instance data, drawn with drawIndexedInstanced

import { type Vec3, type Mat4, mat4_identity, mat4_translate, mat4_rotateY, mat4_scale, mat4_normalMatrix } from "../core/math";
import { type Geometry } from "./geometry";
import { type Material } from "./material";

export interface InstanceData {
  position: Vec3;
  rotation: number;  // Y rotation in radians (simplified for vegetation)
  scale: Vec3;
}

export class InstancedMesh {
  geometry: Geometry;
  material: Material;
  instances: InstanceData[];
  instanceBuffer: GPUBuffer;
  instanceCount: number;

  constructor(
    device: GPUDevice,
    geometry: Geometry,
    material: Material,
    instances: InstanceData[],
  ) {
    this.geometry = geometry;
    this.material = material;
    this.instances = instances;
    this.instanceCount = instances.length;

    // Each instance: modelMatrix(16f) + normalMatrix(16f) = 128 bytes
    const dataSize = instances.length * 128;
    this.instanceBuffer = device.createBuffer({
      label: `instanced mesh (${instances.length} instances)`,
      size: dataSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.uploadInstances(device);
  }

  uploadInstances(device: GPUDevice) {
    const floatsPerInstance = 32; // 16 (model) + 16 (normal)
    const data = new Float32Array(this.instances.length * floatsPerInstance);

    for (let i = 0; i < this.instances.length; i++) {
      const inst = this.instances[i];
      let m = mat4_identity();
      m = mat4_translate(m, inst.position);
      m = mat4_rotateY(m, inst.rotation);
      m = mat4_scale(m, inst.scale);

      const nm = mat4_normalMatrix(m);
      const offset = i * floatsPerInstance;
      data.set(m, offset);
      data.set(nm, offset + 16);
    }

    device.queue.writeBuffer(this.instanceBuffer, 0, data);
  }
}
