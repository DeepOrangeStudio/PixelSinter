// Dither pass — applies Bayer or blue noise pattern between posterize levels

import ditherWGSL from "../shaders/dither.wgsl" with { type: "text" };

export type DitherMode = "none" | "bayer4" | "bayer8" | "bluenoise";

const DITHER_MODE_MAP: Record<DitherMode, number> = {
  none: 0,
  bayer4: 1,
  bayer8: 2,
  bluenoise: 3,
};

export interface DitherPass {
  pipeline: GPUComputePipeline;
  bindGroup: GPUBindGroup;
  uniformBuffer: GPUBuffer;
  workgroupsX: number;
  workgroupsY: number;
}

export async function createDitherPass(
  device: GPUDevice,
  inputColor: GPUTexture,
  outputColor: GPUTexture,
  width: number,
  height: number,
  mode: DitherMode = "none",
  posterizeLevels: number = 4,
  strength: number = 0.5,
): Promise<DitherPass> {
  const module = device.createShaderModule({ label: "dither compute", code: ditherWGSL });

  const uniformBuffer = device.createBuffer({
    label: "dither uniforms",
    size: 32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  uploadDitherParams(device, uniformBuffer, width, height, mode, posterizeLevels, strength);

  // Load blue noise texture (64×64 float32)
  const blueNoiseBuffer = device.createBuffer({
    label: "blue noise data",
    size: 64 * 64 * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  try {
    const resp = await fetch(`./assets/bluenoise64.bin?v=${Date.now()}`);
    const data = await resp.arrayBuffer();
    device.queue.writeBuffer(blueNoiseBuffer, 0, data);
  } catch {
    // Fill with fallback random values if file not found
    const fallback = new Float32Array(64 * 64);
    for (let i = 0; i < fallback.length; i++) fallback[i] = Math.random();
    device.queue.writeBuffer(blueNoiseBuffer, 0, fallback);
  }

  const bindGroupLayout = device.createBindGroupLayout({
    label: "dither BGL",
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "float" } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "write-only", format: "rgba8unorm" } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
    ],
  });

  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: inputColor.createView() },
      { binding: 2, resource: outputColor.createView() },
      { binding: 3, resource: { buffer: blueNoiseBuffer } },
    ],
  });

  const pipeline = device.createComputePipeline({
    label: "dither pipeline",
    layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
    compute: { module, entryPoint: "main" },
  });

  return {
    pipeline,
    bindGroup,
    uniformBuffer,
    workgroupsX: Math.ceil(width / 8),
    workgroupsY: Math.ceil(height / 8),
  };
}

function uploadDitherParams(
  device: GPUDevice,
  buffer: GPUBuffer,
  width: number,
  height: number,
  mode: DitherMode,
  posterizeLevels: number,
  strength: number,
) {
  const data = new ArrayBuffer(32);
  const u32 = new Uint32Array(data);
  const f32 = new Float32Array(data);
  u32[0] = width;
  u32[1] = height;
  u32[2] = DITHER_MODE_MAP[mode];
  u32[3] = posterizeLevels;
  f32[4] = strength;
  device.queue.writeBuffer(buffer, 0, data);
}

export function updateDitherParams(
  device: GPUDevice,
  pass: DitherPass,
  width: number,
  height: number,
  mode: DitherMode,
  posterizeLevels: number,
  strength: number,
) {
  uploadDitherParams(device, pass.uniformBuffer, width, height, mode, posterizeLevels, strength);
}
