// Lightweight glTF 2.0 / GLB loader — static meshes only (Phase 1)
// Parses geometry (positions, normals, indices) from glTF primitives
// Ignores PBR materials — uses PixelSinter materials instead

import { Geometry, type GeometryDescriptor } from "../scene/geometry";
import { Material } from "../scene/material";
import { Mesh } from "../scene/mesh";
import { Transform } from "../scene/transform";
import { type Vec3 } from "../core/math";

interface GltfJson {
  meshes?: GltfMesh[];
  nodes?: GltfNode[];
  scenes?: { nodes?: number[] }[];
  scene?: number;
  accessors?: GltfAccessor[];
  bufferViews?: GltfBufferView[];
  buffers?: { byteLength: number; uri?: string }[];
  materials?: { pbrMetallicRoughness?: { baseColorFactor?: number[] } }[];
}

interface GltfMesh {
  primitives: {
    attributes: Record<string, number>;
    indices?: number;
    material?: number;
  }[];
}

interface GltfNode {
  mesh?: number;
  children?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
  matrix?: number[];
}

interface GltfAccessor {
  bufferView?: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  type: string;
}

interface GltfBufferView {
  buffer: number;
  byteOffset?: number;
  byteLength: number;
  byteStride?: number;
}

// Component type constants
const FLOAT = 5126;
const UNSIGNED_SHORT = 5123;
const UNSIGNED_INT = 5125;

export async function loadGLB(device: GPUDevice, url: string): Promise<Mesh[]> {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();

  // Parse GLB header
  const header = new DataView(arrayBuffer);
  const magic = header.getUint32(0, true);
  if (magic !== 0x46546C67) throw new Error("Not a valid GLB file");

  const version = header.getUint32(4, true);
  if (version !== 2) throw new Error(`Unsupported glTF version: ${version}`);

  // Parse chunks
  let offset = 12;
  let jsonChunk: string | null = null;
  let binChunk: ArrayBuffer | null = null;

  while (offset < arrayBuffer.byteLength) {
    const chunkLength = header.getUint32(offset, true);
    const chunkType = header.getUint32(offset + 4, true);
    const chunkData = arrayBuffer.slice(offset + 8, offset + 8 + chunkLength);

    if (chunkType === 0x4E4F534A) { // JSON
      jsonChunk = new TextDecoder().decode(chunkData);
    } else if (chunkType === 0x004E4942) { // BIN
      binChunk = chunkData;
    }

    offset += 8 + chunkLength;
  }

  if (!jsonChunk || !binChunk) throw new Error("GLB missing JSON or BIN chunk");

  const gltf: GltfJson = JSON.parse(jsonChunk);
  return parseGltfMeshes(device, gltf, [binChunk]);
}

export async function loadGLTF(device: GPUDevice, url: string): Promise<Mesh[]> {
  const response = await fetch(url);
  const gltf: GltfJson = await response.json();

  // Load binary buffers
  const baseUrl = url.substring(0, url.lastIndexOf("/") + 1);
  const buffers: ArrayBuffer[] = [];

  for (const bufDef of gltf.buffers ?? []) {
    if (bufDef.uri) {
      const bufUrl = bufDef.uri.startsWith("data:")
        ? bufDef.uri
        : baseUrl + bufDef.uri;
      const resp = await fetch(bufUrl);
      buffers.push(await resp.arrayBuffer());
    }
  }

  return parseGltfMeshes(device, gltf, buffers);
}

function parseGltfMeshes(device: GPUDevice, gltf: GltfJson, buffers: ArrayBuffer[]): Mesh[] {
  const meshes: Mesh[] = [];
  const sceneIndex = gltf.scene ?? 0;
  const sceneNodes = gltf.scenes?.[sceneIndex]?.nodes ?? [];

  function processNode(nodeIndex: number) {
    const node = gltf.nodes?.[nodeIndex];
    if (!node) return;

    if (node.mesh !== undefined) {
      const gltfMesh = gltf.meshes?.[node.mesh];
      if (gltfMesh) {
        for (const prim of gltfMesh.primitives) {
          const geometry = parsePrimitive(device, gltf, buffers, prim);
          if (!geometry) continue;

          // Extract material color from glTF PBR or use default
          let albedo: Vec3 = [0.8, 0.8, 0.8];
          if (prim.material !== undefined && gltf.materials) {
            const mat = gltf.materials[prim.material];
            const bc = mat?.pbrMetallicRoughness?.baseColorFactor;
            if (bc) albedo = [bc[0], bc[1], bc[2]];
          }
          const material = new Material(albedo);

          const transform = new Transform();
          if (node.matrix) {
            // glTF matrix is column-major 4x4 — same as our Mat4
            transform.customMatrix = new Float32Array(node.matrix);
          } else {
            if (node.translation) {
              transform.position = node.translation as Vec3;
            }
            if (node.scale) {
              transform.scaling = node.scale as Vec3;
            }
            // Note: glTF rotation is quaternion — Phase 2
          }

          meshes.push(new Mesh(geometry, material, transform));
        }
      }
    }

    for (const child of node.children ?? []) {
      processNode(child);
    }
  }

  for (const nodeIndex of sceneNodes) {
    processNode(nodeIndex);
  }

  return meshes;
}

function parsePrimitive(
  device: GPUDevice,
  gltf: GltfJson,
  buffers: ArrayBuffer[],
  prim: GltfMesh["primitives"][0],
): Geometry | null {
  const posAccessorIdx = prim.attributes["POSITION"];
  const normAccessorIdx = prim.attributes["NORMAL"];
  const idxAccessorIdx = prim.indices;

  if (posAccessorIdx === undefined) return null;

  const positions = getAccessorData(gltf, buffers, posAccessorIdx, Float32Array) as Float32Array;

  let normals: Float32Array;
  if (normAccessorIdx !== undefined) {
    normals = getAccessorData(gltf, buffers, normAccessorIdx, Float32Array) as Float32Array;
  } else {
    // Generate flat normals
    normals = generateFlatNormals(positions);
  }

  let indices: Uint16Array | Uint32Array;
  if (idxAccessorIdx !== undefined) {
    const accessor = gltf.accessors![idxAccessorIdx];
    if (accessor.componentType === UNSIGNED_INT) {
      indices = getAccessorData(gltf, buffers, idxAccessorIdx, Uint32Array) as Uint32Array;
    } else {
      indices = getAccessorData(gltf, buffers, idxAccessorIdx, Uint16Array) as Uint16Array;
    }
  } else {
    // Generate sequential indices
    const count = positions.length / 3;
    indices = new Uint16Array(count);
    for (let i = 0; i < count; i++) indices[i] = i;
  }

  return new Geometry(device, { positions, normals, indices });
}

function getAccessorData(
  gltf: GltfJson,
  buffers: ArrayBuffer[],
  accessorIdx: number,
  TypedArrayClass: typeof Float32Array | typeof Uint16Array | typeof Uint32Array,
): Float32Array | Uint16Array | Uint32Array {
  const accessor = gltf.accessors![accessorIdx];
  const bufferView = gltf.bufferViews![accessor.bufferView ?? 0];
  const buffer = buffers[bufferView.buffer];

  const byteOffset = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const componentCount = TYPE_SIZES[accessor.type] ?? 1;
  const elementCount = accessor.count * componentCount;

  return new TypedArrayClass(buffer, byteOffset, elementCount);
}

const TYPE_SIZES: Record<string, number> = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16,
};

function generateFlatNormals(positions: Float32Array): Float32Array {
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 9) {
    const ax = positions[i + 3] - positions[i];
    const ay = positions[i + 4] - positions[i + 1];
    const az = positions[i + 5] - positions[i + 2];
    const bx = positions[i + 6] - positions[i];
    const by = positions[i + 7] - positions[i + 1];
    const bz = positions[i + 8] - positions[i + 2];
    let nx = ay * bz - az * by;
    let ny = az * bx - ax * bz;
    let nz = ax * by - ay * bx;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 0) { nx /= len; ny /= len; nz /= len; }
    for (let j = 0; j < 3; j++) {
      normals[i + j * 3] = nx;
      normals[i + j * 3 + 1] = ny;
      normals[i + j * 3 + 2] = nz;
    }
  }
  return normals;
}
