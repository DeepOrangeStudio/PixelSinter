// Downscale — compute pass that point-samples the G-Buffer from full resolution
// to pixel art resolution (e.g., 320×180). All 4 buffers are downscaled.

import downscaleWGSL from "../shaders/downscale.wgsl" with { type: "text" };

export interface LowResBuffers {
  color: GPUTexture;       // rgba8unorm — raw downscaled color
  colorStylized: GPUTexture; // rgba8unorm — stylized color (posterize/edges/dither write here)
  normals: GPUTexture;     // rgba16float
  objectId: GPUTexture;    // r32uint
  depth: GPUTexture;       // r32float
}

export function createLowResBuffers(
  device: GPUDevice,
  width: number,
  height: number,
): LowResBuffers {
  const usage = GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING;

  return {
    color: device.createTexture({
      label: "lowres color",
      size: { width, height },
      format: "rgba8unorm",
      usage,
    }),
    colorStylized: device.createTexture({
      label: "lowres color stylized",
      size: { width, height },
      format: "rgba8unorm",
      usage,
    }),
    normals: device.createTexture({
      label: "lowres normals",
      size: { width, height },
      format: "rgba16float",
      usage,
    }),
    objectId: device.createTexture({
      label: "lowres objectId",
      size: { width, height },
      format: "r32uint",
      usage,
    }),
    depth: device.createTexture({
      label: "lowres depth",
      size: { width, height },
      format: "r32float",
      usage,
    }),
  };
}

export interface DownscalePass {
  pipeline: GPUComputePipeline;
  bindGroup: GPUBindGroup;
  uniformBuffer: GPUBuffer;
  workgroupsX: number;
  workgroupsY: number;
}

export function createDownscalePass(
  device: GPUDevice,
  sourceColor: GPUTexture,
  sourceNormals: GPUTexture,
  sourceObjectId: GPUTexture,
  sourceDepth: GPUTexture, // r32float copy
  dest: LowResBuffers,
  targetWidth: number,
  targetHeight: number,
): DownscalePass {
  const module = device.createShaderModule({ label: "downscale compute", code: downscaleWGSL });

  const uniformBuffer = device.createBuffer({
    label: "downscale uniforms",
    size: 16, // vec2u source + vec2u target
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const bindGroupLayout = device.createBindGroupLayout({
    label: "downscale BGL",
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
      // Source textures (read)
      { binding: 1, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "float" } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "float" } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "uint" } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "unfilterable-float" } },
      // Dest textures (write)
      { binding: 5, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "write-only", format: "rgba8unorm" } },
      { binding: 6, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "write-only", format: "rgba16float" } },
      { binding: 7, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "write-only", format: "r32uint" } },
      { binding: 8, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "write-only", format: "r32float" } },
    ],
  });

  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: sourceColor.createView() },
      { binding: 2, resource: sourceNormals.createView() },
      { binding: 3, resource: sourceObjectId.createView() },
      { binding: 4, resource: sourceDepth.createView() },
      { binding: 5, resource: dest.color.createView() },
      { binding: 6, resource: dest.normals.createView() },
      { binding: 7, resource: dest.objectId.createView() },
      { binding: 8, resource: dest.depth.createView() },
    ],
  });

  const pipeline = device.createComputePipeline({
    label: "downscale pipeline",
    layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
    compute: { module, entryPoint: "main" },
  });

  // Upload uniforms
  const sourceWidth = sourceColor.width;
  const sourceHeight = sourceColor.height;
  const data = new Uint32Array([sourceWidth, sourceHeight, targetWidth, targetHeight]);
  device.queue.writeBuffer(uniformBuffer, 0, data);

  return {
    pipeline,
    bindGroup,
    uniformBuffer,
    workgroupsX: Math.ceil(targetWidth / 8),
    workgroupsY: Math.ceil(targetHeight / 8),
  };
}
