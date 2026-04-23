// Posterize pass — compute shader that quantifies luminosity in OKLab space

import posterizeWGSL from "../shaders/posterize.wgsl" with { type: "text" };

export interface PosterizePass {
  pipeline: GPUComputePipeline;
  bindGroup: GPUBindGroup;
  uniformBuffer: GPUBuffer;
  workgroupsX: number;
  workgroupsY: number;
}

export function createPosterizePass(
  device: GPUDevice,
  inputColor: GPUTexture,   // low-res color (read)
  outputColor: GPUTexture,  // low-res posterized (write, storage)
  width: number,
  height: number,
  levels: number = 4,
): PosterizePass {
  const module = device.createShaderModule({ label: "posterize compute", code: posterizeWGSL });

  const uniformBuffer = device.createBuffer({
    label: "posterize uniforms",
    size: 16, // vec2u resolution + u32 levels + pad
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(uniformBuffer, 0, new Uint32Array([width, height, levels, 0]));

  const bindGroupLayout = device.createBindGroupLayout({
    label: "posterize BGL",
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "float" } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "write-only", format: "rgba8unorm" } },
    ],
  });

  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: inputColor.createView() },
      { binding: 2, resource: outputColor.createView() },
    ],
  });

  const pipeline = device.createComputePipeline({
    label: "posterize pipeline",
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

export function updatePosterizeLevels(device: GPUDevice, pass: PosterizePass, levels: number) {
  // Only update the levels field (offset 8)
  device.queue.writeBuffer(pass.uniformBuffer, 8, new Uint32Array([levels]));
}
