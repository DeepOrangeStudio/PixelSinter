/**
 * generate-test-glb.mjs
 *
 * Generates a valid glTF 2.0 binary (GLB) file from scratch with zero external
 * dependencies.  The scene contains:
 *
 *   1. UV Sphere  – 16 longitude segments × 8 latitude rings, centered at origin
 *   2. Torus      – 12 tube segments × 6 ring segments, translated to (2.5, 0, 0)
 *   3. Ground     – single quad at y = -1.5, scaled 8 × 8
 *
 * Each mesh uses a glTF PBR metallic-roughness material with a distinct base
 * colour:  orange (sphere), blue (torus), mid-grey (ground).
 *
 * GLB layout (little-endian):
 *   [12-byte file header]
 *   [8-byte JSON chunk header  + JSON payload (padded to 4 bytes with spaces)]
 *   [8-byte BIN  chunk header  + binary payload (padded to 4 bytes with zeros)]
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/** Concatenate an array of Uint8Array / Buffer objects. */
function concatBuffers(buffers) {
  const total = buffers.reduce((s, b) => s + b.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const b of buffers) {
    out.set(new Uint8Array(b.buffer ?? b), offset);
    offset += b.byteLength;
  }
  return out;
}

/** Pad a Uint8Array to a multiple of 4 bytes. */
function pad4(arr, padByte = 0x00) {
  const rem = arr.byteLength % 4;
  if (rem === 0) return arr;
  const padded = new Uint8Array(arr.byteLength + (4 - rem));
  padded.set(arr);
  padded.fill(padByte, arr.byteLength);
  return padded;
}

/** Write a little-endian uint32 into a DataView. */
function writeU32(dv, offset, value) {
  dv.setUint32(offset, value, true);
}

/** Write a little-endian float32 into a DataView. */
function writeF32(dv, offset, value) {
  dv.setFloat32(offset, value, true);
}

/** Write a little-endian uint16 into a DataView. */
function writeU16(dv, offset, value) {
  dv.setUint16(offset, value, true);
}

// ---------------------------------------------------------------------------
// Mesh generation helpers
// ---------------------------------------------------------------------------

/**
 * Build interleaved position + normal + uv data and a flat index array.
 * Returns { positions: Float32Array, normals: Float32Array, uvs: Float32Array,
 *           indices: Uint16Array, min: [x,y,z], max: [x,y,z] }
 */

// ---- UV Sphere -------------------------------------------------------------
// longSegments: number of slices around Y axis (longitude)
// latRings:     number of stacks from pole to pole (latitude)
function buildUVSphere(longSegments = 16, latRings = 8, radius = 1.0) {
  // Vertices: (latRings+1) rings × (longSegments+1) verts per ring
  const vertCount = (latRings + 1) * (longSegments + 1);
  const positions = new Float32Array(vertCount * 3);
  const normals   = new Float32Array(vertCount * 3);
  const uvs       = new Float32Array(vertCount * 2);

  let vi = 0;
  for (let lat = 0; lat <= latRings; lat++) {
    // theta goes from 0 (north pole) to PI (south pole)
    const theta    = (lat / latRings) * Math.PI;
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);

    for (let lon = 0; lon <= longSegments; lon++) {
      // phi goes from 0 to 2*PI around the equator
      const phi    = (lon / longSegments) * 2 * Math.PI;
      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);

      // Unit normal == position on unit sphere
      const nx = cosPhi * sinTheta;
      const ny = cosTheta;
      const nz = sinPhi * sinTheta;

      positions[vi * 3 + 0] = radius * nx;
      positions[vi * 3 + 1] = radius * ny;
      positions[vi * 3 + 2] = radius * nz;

      normals[vi * 3 + 0] = nx;
      normals[vi * 3 + 1] = ny;
      normals[vi * 3 + 2] = nz;

      uvs[vi * 2 + 0] = lon / longSegments;
      uvs[vi * 2 + 1] = lat / latRings;

      vi++;
    }
  }

  // Indices: 2 triangles per quad, latRings × longSegments quads
  const indexCount = latRings * longSegments * 6;
  const indices = new Uint16Array(indexCount);
  let ii = 0;
  for (let lat = 0; lat < latRings; lat++) {
    for (let lon = 0; lon < longSegments; lon++) {
      const a = lat * (longSegments + 1) + lon;
      const b = a + (longSegments + 1);
      // triangle 1
      indices[ii++] = a;
      indices[ii++] = b;
      indices[ii++] = a + 1;
      // triangle 2
      indices[ii++] = b;
      indices[ii++] = b + 1;
      indices[ii++] = a + 1;
    }
  }

  // Compute AABB for accessor min/max
  let minX =  Infinity, minY =  Infinity, minZ =  Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < vertCount; i++) {
    const x = positions[i * 3 + 0];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }

  return { positions, normals, uvs, indices,
           min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

// ---- Torus -----------------------------------------------------------------
// ringSegments:  segments around the torus ring (major circle)
// tubeSegments:  segments around the tube cross-section (minor circle)
function buildTorus(ringSegments = 12, tubeSegments = 6,
                    majorRadius = 0.6, minorRadius = 0.25) {
  const vertCount = (ringSegments + 1) * (tubeSegments + 1);
  const positions = new Float32Array(vertCount * 3);
  const normals   = new Float32Array(vertCount * 3);
  const uvs       = new Float32Array(vertCount * 2);

  let vi = 0;
  for (let ring = 0; ring <= ringSegments; ring++) {
    const u     = ring / ringSegments;
    const theta = u * 2 * Math.PI;          // angle around the major circle
    const cosT  = Math.cos(theta);
    const sinT  = Math.sin(theta);

    for (let tube = 0; tube <= tubeSegments; tube++) {
      const v    = tube / tubeSegments;
      const phi  = v * 2 * Math.PI;          // angle around the tube
      const cosP = Math.cos(phi);
      const sinP = Math.sin(phi);

      // Centre of the tube cross-section at this ring angle
      const cx = majorRadius * cosT;
      const cy = 0;
      const cz = majorRadius * sinT;

      // Position on tube surface
      const px = (majorRadius + minorRadius * cosP) * cosT;
      const py =  minorRadius * sinP;
      const pz = (majorRadius + minorRadius * cosP) * sinT;

      positions[vi * 3 + 0] = px;
      positions[vi * 3 + 1] = py;
      positions[vi * 3 + 2] = pz;

      // Normal = (position - centre_of_tube) / minorRadius
      const nx = (px - cx) / minorRadius;
      const ny = (py - cy) / minorRadius;
      const nz = (pz - cz) / minorRadius;
      normals[vi * 3 + 0] = nx;
      normals[vi * 3 + 1] = ny;
      normals[vi * 3 + 2] = nz;

      uvs[vi * 2 + 0] = u;
      uvs[vi * 2 + 1] = v;

      vi++;
    }
  }

  const indexCount = ringSegments * tubeSegments * 6;
  const indices = new Uint16Array(indexCount);
  let ii = 0;
  for (let ring = 0; ring < ringSegments; ring++) {
    for (let tube = 0; tube < tubeSegments; tube++) {
      const a = ring * (tubeSegments + 1) + tube;
      const b = a + (tubeSegments + 1);
      indices[ii++] = a;
      indices[ii++] = b;
      indices[ii++] = a + 1;
      indices[ii++] = b;
      indices[ii++] = b + 1;
      indices[ii++] = a + 1;
    }
  }

  let minX =  Infinity, minY =  Infinity, minZ =  Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < vertCount; i++) {
    const x = positions[i * 3 + 0];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }

  return { positions, normals, uvs, indices,
           min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

// ---- Ground Plane ----------------------------------------------------------
// A single axis-aligned quad (2 triangles) in the XZ plane at y=0.
// Caller is responsible for translating / scaling via node transform.
function buildGroundQuad(halfSize = 1.0) {
  const h = halfSize;
  // 4 corners:  (-h, 0, -h)  (h, 0, -h)  (h, 0, h)  (-h, 0, h)
  const positions = new Float32Array([
    -h, 0, -h,
     h, 0, -h,
     h, 0,  h,
    -h, 0,  h,
  ]);
  const normals = new Float32Array([
    0, 1, 0,
    0, 1, 0,
    0, 1, 0,
    0, 1, 0,
  ]);
  const uvs = new Float32Array([
    0, 0,
    1, 0,
    1, 1,
    0, 1,
  ]);
  // Two triangles: CCW winding when viewed from above (+Y)
  const indices = new Uint16Array([0, 2, 1, 0, 3, 2]);

  return {
    positions, normals, uvs, indices,
    min: [-h, 0, -h],
    max: [ h, 0,  h],
  };
}

// ---------------------------------------------------------------------------
// Binary buffer builder
// ---------------------------------------------------------------------------

/**
 * Given mesh data, appends:
 *   - index data  (Uint16, padded to 4 bytes)
 *   - position data (Vec3 Float32)
 *   - normal data   (Vec3 Float32)
 *   - uv data       (Vec2 Float32)
 *
 * Returns an array of { byteOffset, byteLength } descriptors in the same order,
 * plus the raw bytes to push into the global BIN chunk.
 */
function packMesh(meshData, currentByteOffset) {
  const { positions, normals, uvs, indices } = meshData;

  const indexBytes    = new Uint8Array(indices.buffer);
  const positionBytes = new Uint8Array(positions.buffer);
  const normalBytes   = new Uint8Array(normals.buffer);
  const uvBytes       = new Uint8Array(uvs.buffer);

  // Index data must be padded to 4-byte boundary before the float data.
  const indexPadded   = pad4(indexBytes);

  const views = [];
  let offset = currentByteOffset;

  views.push({ data: indexPadded,   byteOffset: offset, byteLength: indexBytes.byteLength });
  offset += indexPadded.byteLength;

  views.push({ data: positionBytes, byteOffset: offset, byteLength: positionBytes.byteLength });
  offset += positionBytes.byteLength;

  views.push({ data: normalBytes,   byteOffset: offset, byteLength: normalBytes.byteLength });
  offset += normalBytes.byteLength;

  views.push({ data: uvBytes,       byteOffset: offset, byteLength: uvBytes.byteLength });
  offset += uvBytes.byteLength;

  const totalBytes = concatBuffers(views.map(v => v.data));
  return { views, totalBytes, nextOffset: offset };
}

// ---------------------------------------------------------------------------
// Main GLB construction
// ---------------------------------------------------------------------------

function main() {
  const OUTPUT_PATH = 'E:/Tool/PIXELSINTER/demo/assets/test-scene.glb';

  // ---- 1. Generate geometry ------------------------------------------------
  const sphere = buildUVSphere(16, 8, 1.0);
  const torus  = buildTorus(12, 6, 0.6, 0.25);
  const ground = buildGroundQuad(1.0);   // unit quad; scaled via node matrix

  // ---- 2. Pack all binary data --------------------------------------------
  let binChunkData  = [];   // array of Uint8Arrays to concatenate at the end
  let globalOffset  = 0;

  // gltf structure bookkeeping
  const bufferViews = [];
  const accessors   = [];

  function addMesh(meshData, label) {
    const { views, totalBytes, nextOffset } = packMesh(meshData, globalOffset);
    globalOffset = nextOffset;
    binChunkData.push(totalBytes);

    const baseViewIndex = bufferViews.length;

    // bufferView 0: indices
    bufferViews.push({
      buffer:     0,
      byteOffset: views[0].byteOffset,
      byteLength: views[0].byteLength,
      // no byteStride for scalar index data
      name: `${label}_indices_view`,
    });
    // bufferView 1: positions
    bufferViews.push({
      buffer:     0,
      byteOffset: views[1].byteOffset,
      byteLength: views[1].byteLength,
      byteStride: 12,
      target:     34962, // ARRAY_BUFFER
      name: `${label}_positions_view`,
    });
    // bufferView 2: normals
    bufferViews.push({
      buffer:     0,
      byteOffset: views[2].byteOffset,
      byteLength: views[2].byteLength,
      byteStride: 12,
      target:     34962,
      name: `${label}_normals_view`,
    });
    // bufferView 3: uvs
    bufferViews.push({
      buffer:     0,
      byteOffset: views[3].byteOffset,
      byteLength: views[3].byteLength,
      byteStride: 8,
      target:     34962,
      name: `${label}_uvs_view`,
    });

    const baseAccIndex = accessors.length;
    const indexCount   = meshData.indices.length;
    const vertCount    = meshData.positions.length / 3;

    // accessor 0: indices  (SCALAR UNSIGNED_SHORT)
    accessors.push({
      bufferView:    baseViewIndex + 0,
      byteOffset:    0,
      componentType: 5123,   // UNSIGNED_SHORT
      count:         indexCount,
      type:          'SCALAR',
      name:          `${label}_indices`,
    });
    // accessor 1: positions  (VEC3 FLOAT)
    accessors.push({
      bufferView:    baseViewIndex + 1,
      byteOffset:    0,
      componentType: 5126,   // FLOAT
      count:         vertCount,
      type:          'VEC3',
      min:           meshData.min.map(v => parseFloat(v.toFixed(6))),
      max:           meshData.max.map(v => parseFloat(v.toFixed(6))),
      name:          `${label}_positions`,
    });
    // accessor 2: normals  (VEC3 FLOAT)
    accessors.push({
      bufferView:    baseViewIndex + 2,
      byteOffset:    0,
      componentType: 5126,
      count:         vertCount,
      type:          'VEC3',
      name:          `${label}_normals`,
    });
    // accessor 3: uvs  (VEC2 FLOAT)
    accessors.push({
      bufferView:    baseViewIndex + 3,
      byteOffset:    0,
      componentType: 5126,
      count:         vertCount,
      type:          'VEC2',
      name:          `${label}_uvs`,
    });

    return { baseAccIndex };
  }

  const sphereAcc = addMesh(sphere, 'sphere');
  const torusAcc  = addMesh(torus,  'torus');
  const groundAcc = addMesh(ground, 'ground');

  // ---- 3. Build the full binary chunk (padded to 4 bytes) -----------------
  const rawBin   = concatBuffers(binChunkData);
  const paddedBin = pad4(rawBin, 0x00);

  // ---- 4. Assemble glTF JSON ----------------------------------------------

  // Materials
  const materials = [
    {
      name: 'OrangePBR',
      pbrMetallicRoughness: {
        baseColorFactor: [1.0, 0.45, 0.05, 1.0],  // vivid orange
        metallicFactor:  0.0,
        roughnessFactor: 0.6,
      },
      doubleSided: false,
    },
    {
      name: 'BluePBR',
      pbrMetallicRoughness: {
        baseColorFactor: [0.08, 0.35, 0.85, 1.0], // vivid blue
        metallicFactor:  0.15,
        roughnessFactor: 0.5,
      },
      doubleSided: false,
    },
    {
      name: 'GroundGrayPBR',
      pbrMetallicRoughness: {
        baseColorFactor: [0.50, 0.50, 0.50, 1.0], // neutral mid-grey
        metallicFactor:  0.0,
        roughnessFactor: 0.85,
      },
      doubleSided: true,
    },
  ];

  // Meshes
  const meshes = [
    {
      name: 'SphereMesh',
      primitives: [{
        attributes: {
          POSITION: sphereAcc.baseAccIndex + 1,
          NORMAL:   sphereAcc.baseAccIndex + 2,
          TEXCOORD_0: sphereAcc.baseAccIndex + 3,
        },
        indices:  sphereAcc.baseAccIndex + 0,
        material: 0,
        mode:     4,  // TRIANGLES
      }],
    },
    {
      name: 'TorusMesh',
      primitives: [{
        attributes: {
          POSITION: torusAcc.baseAccIndex + 1,
          NORMAL:   torusAcc.baseAccIndex + 2,
          TEXCOORD_0: torusAcc.baseAccIndex + 3,
        },
        indices:  torusAcc.baseAccIndex + 0,
        material: 1,
        mode:     4,
      }],
    },
    {
      name: 'GroundMesh',
      primitives: [{
        attributes: {
          POSITION: groundAcc.baseAccIndex + 1,
          NORMAL:   groundAcc.baseAccIndex + 2,
          TEXCOORD_0: groundAcc.baseAccIndex + 3,
        },
        indices:  groundAcc.baseAccIndex + 0,
        material: 2,
        mode:     4,
      }],
    },
  ];

  // Nodes
  // Ground: translate to y=-2.0, scale 12×1×12
  const groundMatrix = [
    12,   0,    0,    0,   // col 0  (scale X)
    0,    1,    0,    0,   // col 1  (scale Y)
    0,    0,    12,   0,   // col 2  (scale Z)
    0,   -2.0,  0,    1,   // col 3  (translation)
  ];

  const nodes = [
    {
      name: 'SphereNode',
      mesh: 0,
      translation: [0.0, 0.0, 0.0],
    },
    {
      name: 'TorusNode',
      mesh: 1,
      translation: [-2.5, -0.7, 0.0],
    },
    {
      name: 'GroundNode',
      mesh: 2,
      matrix: groundMatrix,
    },
  ];

  // Scene
  const scenes = [
    {
      name: 'TestScene',
      nodes: [0, 1, 2],
    },
  ];

  // Strip undefined / null fields that might confuse parsers
  function clean(obj) {
    if (Array.isArray(obj)) return obj.map(clean);
    if (obj !== null && typeof obj === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(obj)) {
        if (v !== undefined && v !== null) out[k] = clean(v);
      }
      return out;
    }
    return obj;
  }

  const gltf = clean({
    asset: {
      version:   '2.0',
      generator: 'generate-test-glb.mjs (no-deps raw binary)',
      copyright: 'test asset',
    },
    scene: 0,
    scenes,
    nodes,
    meshes,
    materials,
    accessors,
    bufferViews,
    buffers: [
      { byteLength: paddedBin.byteLength },
    ],
  });

  // ---- 5. Encode JSON chunk -----------------------------------------------
  const jsonString  = JSON.stringify(gltf);
  const jsonBytes   = new TextEncoder().encode(jsonString);
  const paddedJson  = pad4(jsonBytes, 0x20);   // pad with ASCII space (0x20)

  // ---- 6. Build GLB file --------------------------------------------------
  //
  // GLB header (12 bytes):
  //   magic   uint32  0x46546C67  ('glTF')
  //   version uint32  2
  //   length  uint32  total file length in bytes
  //
  // Chunk header (8 bytes each):
  //   chunkLength  uint32  byte length of chunk data
  //   chunkType    uint32  0x4E4F534A ('JSON') or 0x004E4942 ('BIN\0')
  //
  const JSON_CHUNK_TYPE = 0x4E4F534A;
  const BIN_CHUNK_TYPE  = 0x004E4942;

  const fileLength = 12
                   + 8 + paddedJson.byteLength
                   + 8 + paddedBin.byteLength;

  // File header
  const headerBuf = new ArrayBuffer(12);
  const headerDV  = new DataView(headerBuf);
  writeU32(headerDV, 0, 0x46546C67);   // magic 'glTF'
  writeU32(headerDV, 4, 2);            // version 2
  writeU32(headerDV, 8, fileLength);   // total length

  // JSON chunk header
  const jsonChunkHeaderBuf = new ArrayBuffer(8);
  const jsonChunkDV        = new DataView(jsonChunkHeaderBuf);
  writeU32(jsonChunkDV, 0, paddedJson.byteLength);
  writeU32(jsonChunkDV, 4, JSON_CHUNK_TYPE);

  // BIN chunk header
  const binChunkHeaderBuf  = new ArrayBuffer(8);
  const binChunkDV         = new DataView(binChunkHeaderBuf);
  writeU32(binChunkDV, 0, paddedBin.byteLength);
  writeU32(binChunkDV, 4, BIN_CHUNK_TYPE);

  // Concatenate everything
  const glbData = concatBuffers([
    new Uint8Array(headerBuf),
    new Uint8Array(jsonChunkHeaderBuf),
    paddedJson,
    new Uint8Array(binChunkHeaderBuf),
    paddedBin,
  ]);

  // ---- 7. Write file -------------------------------------------------------
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, glbData);

  // ---- 8. Print summary ----------------------------------------------------
  const sphereVerts  = sphere.positions.length / 3;
  const sphereTris   = sphere.indices.length / 3;
  const torusVerts   = torus.positions.length / 3;
  const torusTris    = torus.indices.length / 3;
  const groundVerts  = ground.positions.length / 3;
  const groundTris   = ground.indices.length / 3;

  console.log('GLB written to:', OUTPUT_PATH);
  console.log(`  File size       : ${glbData.byteLength} bytes`);
  console.log(`  BIN chunk size  : ${paddedBin.byteLength} bytes`);
  console.log(`  JSON chunk size : ${paddedJson.byteLength} bytes`);
  console.log('');
  console.log('  Meshes:');
  console.log(`    Sphere  (UV 16x8)  : ${sphereVerts} verts, ${sphereTris} tris`);
  console.log(`    Torus   (12x6)     : ${torusVerts} verts, ${torusTris} tris`);
  console.log(`    Ground  (quad 8x8) : ${groundVerts} verts, ${groundTris} tris`);
  console.log('');
  console.log('  Materials:');
  console.log('    0 OrangePBR   -> sphere  [1.0, 0.45, 0.05]');
  console.log('    1 BluePBR     -> torus   [0.08, 0.35, 0.85]');
  console.log('    2 GroundGray  -> ground  [0.50, 0.50, 0.50]');
  console.log('');
  console.log('  Nodes:');
  console.log('    SphereNode  translation=[0, 0, 0]');
  console.log('    TorusNode   translation=[2.5, 0, 0]');
  console.log('    GroundNode  matrix: scale=[8,1,8], translate=[0,-1.5,0]');
  console.log('');
  console.log('  glTF 2.0 validity checks:');
  console.log(`    magic bytes      : 0x${(0x46546C67).toString(16).toUpperCase()}`);
  console.log(`    version          : 2`);
  console.log(`    BIN 4-byte align : ${paddedBin.byteLength % 4 === 0 ? 'OK' : 'FAIL'}`);
  console.log(`    JSON 4-byte align: ${paddedJson.byteLength % 4 === 0 ? 'OK' : 'FAIL'}`);
  console.log(`    bufferViews      : ${bufferViews.length}`);
  console.log(`    accessors        : ${accessors.length}`);

  // Quick sanity: verify all accessor byteOffsets are within their bufferView
  let accessorOK = true;
  for (const acc of accessors) {
    const bv = bufferViews[acc.bufferView];
    if (acc.byteOffset > bv.byteLength) {
      console.error(`  ERROR: accessor ${acc.name} byteOffset out of range`);
      accessorOK = false;
    }
  }
  if (accessorOK) console.log('    accessor ranges  : OK');

  // Verify that all bufferView ranges stay within the binary buffer
  let bvOK = true;
  for (const bv of bufferViews) {
    const end = bv.byteOffset + bv.byteLength;
    if (end > paddedBin.byteLength) {
      console.error(`  ERROR: bufferView "${bv.name}" end=${end} > binSize=${paddedBin.byteLength}`);
      bvOK = false;
    }
  }
  if (bvOK) console.log('    bufferView ranges: OK');
}

main();
