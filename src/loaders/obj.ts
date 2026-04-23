// OBJ loader — parses .obj text format (positions, normals, faces)
// Supports triangulated and quad faces (quads are split into two triangles)
// Optional .mtl support for base color (Kd)

import { Geometry } from "../scene/geometry";
import { Material } from "../scene/material";
import { Mesh } from "../scene/mesh";
import { Transform } from "../scene/transform";
import { type Vec3 } from "../core/math";

export async function loadOBJ(
  device: GPUDevice,
  objUrl: string,
  mtlUrl?: string,
): Promise<Mesh[]> {
  const objText = await (await fetch(objUrl)).text();
  const mtlColors = mtlUrl ? await parseMTL(mtlUrl) : new Map<string, Vec3>();
  return parseOBJ(device, objText, mtlColors);
}

async function parseMTL(url: string): Promise<Map<string, Vec3>> {
  const text = await (await fetch(url)).text();
  const colors = new Map<string, Vec3>();
  let currentName = "";

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("newmtl ")) {
      currentName = line.substring(7).trim();
    } else if (line.startsWith("Kd ") && currentName) {
      const parts = line.substring(3).trim().split(/\s+/).map(Number);
      colors.set(currentName, [parts[0], parts[1], parts[2]]);
    }
  }

  return colors;
}

function parseOBJ(
  device: GPUDevice,
  text: string,
  mtlColors: Map<string, Vec3>,
): Mesh[] {
  const positions: number[][] = [];
  const normals: number[][] = [];

  // Expanded vertices (position + normal per unique vertex)
  const outPositions: number[] = [];
  const outNormals: number[] = [];
  const outIndices: number[] = [];
  const vertexMap = new Map<string, number>(); // "posIdx/normIdx" → index

  let currentMaterial = "";
  const meshGroups: {
    material: string;
    startIndex: number;
    count: number;
  }[] = [];
  let currentGroup = { material: "", startIndex: 0, count: 0 };

  function addVertex(posIdx: number, normIdx: number): number {
    const key = `${posIdx}/${normIdx}`;
    const existing = vertexMap.get(key);
    if (existing !== undefined) return existing;

    const idx = outPositions.length / 3;
    const p = positions[posIdx] ?? [0, 0, 0];
    const n = normals[normIdx] ?? [0, 1, 0];
    outPositions.push(p[0], p[1], p[2]);
    outNormals.push(n[0], n[1], n[2]);
    vertexMap.set(key, idx);
    return idx;
  }

  function parseFaceVertex(s: string): { pos: number; norm: number } {
    const parts = s.split("/");
    const pos = parseInt(parts[0]) - 1; // OBJ is 1-indexed
    const norm = parts.length >= 3 && parts[2] ? parseInt(parts[2]) - 1 : -1;
    return { pos, norm };
  }

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    const parts = line.split(/\s+/);
    const cmd = parts[0];

    if (cmd === "v" && parts.length >= 4) {
      positions.push([parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])]);
    } else if (cmd === "vn" && parts.length >= 4) {
      normals.push([parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])]);
    } else if (cmd === "usemtl") {
      if (currentGroup.count > 0) {
        meshGroups.push({ ...currentGroup });
      }
      currentMaterial = parts[1] ?? "";
      currentGroup = { material: currentMaterial, startIndex: outIndices.length, count: 0 };
    } else if (cmd === "f") {
      const faceVerts = parts.slice(1).map(parseFaceVertex);

      // Triangulate: fan from first vertex
      for (let i = 1; i < faceVerts.length - 1; i++) {
        const a = addVertex(faceVerts[0].pos, faceVerts[0].norm);
        const b = addVertex(faceVerts[i].pos, faceVerts[i].norm);
        const c = addVertex(faceVerts[i + 1].pos, faceVerts[i + 1].norm);
        outIndices.push(a, b, c);
        currentGroup.count += 3;
      }
    }
  }

  // Push last group
  if (currentGroup.count > 0) {
    meshGroups.push({ ...currentGroup });
  }

  // If no usemtl was encountered, create a single group from all indices
  if (meshGroups.length === 0 && outIndices.length > 0) {
    meshGroups.push({ material: "", startIndex: 0, count: outIndices.length });
  }

  // If no normals were provided, generate flat normals
  if (normals.length === 0) {
    generateFlatNormalsInPlace(outPositions, outNormals, outIndices);
  }

  // Create meshes per material group
  const posArray = new Float32Array(outPositions);
  const normArray = new Float32Array(outNormals);

  const meshes: Mesh[] = [];

  for (const group of meshGroups) {
    const indices = outIndices.slice(group.startIndex, group.startIndex + group.count);
    const useUint32 = posArray.length / 3 > 65535;
    const indexArray = useUint32 ? new Uint32Array(indices) : new Uint16Array(indices);

    const geometry = new Geometry(device, {
      positions: posArray,
      normals: normArray,
      indices: indexArray,
    });

    const albedo: Vec3 = mtlColors.get(group.material) ?? [0.8, 0.8, 0.8];
    const material = new Material(albedo);
    meshes.push(new Mesh(geometry, material, new Transform()));
  }

  return meshes;
}

function generateFlatNormalsInPlace(
  positions: number[],
  normals: number[],
  indices: number[],
) {
  // Zero out normals
  for (let i = 0; i < normals.length; i++) normals[i] = 0;

  // Accumulate face normals
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i], b = indices[i + 1], c = indices[i + 2];
    const ax = positions[b * 3] - positions[a * 3];
    const ay = positions[b * 3 + 1] - positions[a * 3 + 1];
    const az = positions[b * 3 + 2] - positions[a * 3 + 2];
    const bx = positions[c * 3] - positions[a * 3];
    const by = positions[c * 3 + 1] - positions[a * 3 + 1];
    const bz = positions[c * 3 + 2] - positions[a * 3 + 2];
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;
    for (const idx of [a, b, c]) {
      normals[idx * 3] += nx;
      normals[idx * 3 + 1] += ny;
      normals[idx * 3 + 2] += nz;
    }
  }

  // Normalize
  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.sqrt(normals[i] ** 2 + normals[i + 1] ** 2 + normals[i + 2] ** 2);
    if (len > 0) {
      normals[i] /= len; normals[i + 1] /= len; normals[i + 2] /= len;
    }
  }
}
