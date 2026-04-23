// Geometry — vertex buffers, index buffer, draw info

export interface GeometryDescriptor {
  positions: Float32Array;  // vec3 per vertex
  normals: Float32Array;    // vec3 per vertex
  indices: Uint16Array | Uint32Array;
}

export class Geometry {
  readonly vertexBuffer: GPUBuffer;
  readonly indexBuffer: GPUBuffer;
  readonly indexCount: number;
  readonly indexFormat: GPUIndexFormat;

  constructor(device: GPUDevice, desc: GeometryDescriptor) {
    // Interleave positions + normals into a single buffer: [px,py,pz, nx,ny,nz] per vertex
    const vertexCount = desc.positions.length / 3;
    const stride = 6; // 3 pos + 3 normal
    const interleavedData = new Float32Array(vertexCount * stride);

    for (let i = 0; i < vertexCount; i++) {
      interleavedData[i * stride + 0] = desc.positions[i * 3 + 0];
      interleavedData[i * stride + 1] = desc.positions[i * 3 + 1];
      interleavedData[i * stride + 2] = desc.positions[i * 3 + 2];
      interleavedData[i * stride + 3] = desc.normals[i * 3 + 0];
      interleavedData[i * stride + 4] = desc.normals[i * 3 + 1];
      interleavedData[i * stride + 5] = desc.normals[i * 3 + 2];
    }

    this.vertexBuffer = device.createBuffer({
      label: "geometry vertex buffer",
      size: interleavedData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.vertexBuffer, 0, interleavedData);

    this.indexBuffer = device.createBuffer({
      label: "geometry index buffer",
      size: desc.indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.indexBuffer, 0, desc.indices);

    this.indexCount = desc.indices.length;
    this.indexFormat = desc.indices instanceof Uint32Array ? "uint32" : "uint16";
  }

  static readonly VERTEX_BUFFER_LAYOUT: GPUVertexBufferLayout = {
    arrayStride: 6 * 4, // 6 floats × 4 bytes
    attributes: [
      { shaderLocation: 0, offset: 0, format: "float32x3" },     // position
      { shaderLocation: 1, offset: 3 * 4, format: "float32x3" }, // normal
    ],
  };

  destroy() {
    this.vertexBuffer.destroy();
    this.indexBuffer.destroy();
  }
}

// --- Primitive generators ---

export function createCubeGeometry(device: GPUDevice): Geometry {
  // Unit cube centered at origin, with per-face normals (24 vertices, 36 indices)
  const positions = new Float32Array([
    // Front face (+Z)
    -0.5, -0.5,  0.5,   0.5, -0.5,  0.5,   0.5,  0.5,  0.5,  -0.5,  0.5,  0.5,
    // Back face (-Z)
     0.5, -0.5, -0.5,  -0.5, -0.5, -0.5,  -0.5,  0.5, -0.5,   0.5,  0.5, -0.5,
    // Top face (+Y)
    -0.5,  0.5,  0.5,   0.5,  0.5,  0.5,   0.5,  0.5, -0.5,  -0.5,  0.5, -0.5,
    // Bottom face (-Y)
    -0.5, -0.5, -0.5,   0.5, -0.5, -0.5,   0.5, -0.5,  0.5,  -0.5, -0.5,  0.5,
    // Right face (+X)
     0.5, -0.5,  0.5,   0.5, -0.5, -0.5,   0.5,  0.5, -0.5,   0.5,  0.5,  0.5,
    // Left face (-X)
    -0.5, -0.5, -0.5,  -0.5, -0.5,  0.5,  -0.5,  0.5,  0.5,  -0.5,  0.5, -0.5,
  ]);

  const normals = new Float32Array([
    // Front
    0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,
    // Back
    0, 0, -1,  0, 0, -1,  0, 0, -1,  0, 0, -1,
    // Top
    0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,
    // Bottom
    0, -1, 0,  0, -1, 0,  0, -1, 0,  0, -1, 0,
    // Right
    1, 0, 0,  1, 0, 0,  1, 0, 0,  1, 0, 0,
    // Left
    -1, 0, 0,  -1, 0, 0,  -1, 0, 0,  -1, 0, 0,
  ]);

  const indices = new Uint16Array([
     0,  1,  2,   0,  2,  3,  // front
     4,  5,  6,   4,  6,  7,  // back
     8,  9, 10,   8, 10, 11,  // top
    12, 13, 14,  12, 14, 15,  // bottom
    16, 17, 18,  16, 18, 19,  // right
    20, 21, 22,  20, 22, 23,  // left
  ]);

  return new Geometry(device, { positions, normals, indices });
}
