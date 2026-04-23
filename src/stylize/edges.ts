// Edge detection pass — detects edges from depth/normals/objectID and applies to color

import edgesWGSL from "../shaders/edges.wgsl" with { type: "text" };

export interface EdgePass {
  pipeline: GPUComputePipeline;
  bindGroup: GPUBindGroup;
  uniformBuffer: GPUBuffer;
  workgroupsX: number;
  workgroupsY: number;
}

export interface EdgeParams {
  depthThreshold: number;    // default: 0.1
  normalThreshold: number;   // default: 0.5
  outlineMode: number;       // 0 = color, 1 = luminance
  outlineColor: [number, number, number]; // default: [0,0,0]
  luminanceShift: number;    // default: -0.3
}

export const DEFAULT_EDGE_PARAMS: EdgeParams = {
  depthThreshold: 0.1,
  normalThreshold: 0.5,
  outlineMode: 0,
  outlineColor: [0, 0, 0],
  luminanceShift: -0.3,
};

export function createEdgePass(
  device: GPUDevice,
  lowResDepth: GPUTexture,
  lowResNormals: GPUTexture,
  lowResObjectId: GPUTexture,
  colorInput: GPUTexture,    // posterized color (read)
  colorOutput: GPUTexture,   // color with edges applied (write)
  width: number,
  height: number,
  params: EdgeParams = DEFAULT_EDGE_PARAMS,
): EdgePass {
  const module = device.createShaderModule({ label: "edges compute", code: edgesWGSL });

  // Uniform: 2u resolution + f32 depthThreshold + f32 normalThreshold
  //        + u32 outlineMode + u32 pad + vec3f outlineColor + f32 luminanceShift
  // = 8 + 8 + 8 + 16 = 40 bytes → align to 48
  const uniformBuffer = device.createBuffer({
    label: "edge uniforms",
    size: 48,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  uploadEdgeParams(device, uniformBuffer, width, height, params);

  const bindGroupLayout = device.createBindGroupLayout({
    label: "edges BGL",
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "unfilterable-float" } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "float" } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "uint" } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "float" } },
      { binding: 5, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "write-only", format: "rgba8unorm" } },
    ],
  });

  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: lowResDepth.createView() },
      { binding: 2, resource: lowResNormals.createView() },
      { binding: 3, resource: lowResObjectId.createView() },
      { binding: 4, resource: colorInput.createView() },
      { binding: 5, resource: colorOutput.createView() },
    ],
  });

  const pipeline = device.createComputePipeline({
    label: "edges pipeline",
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

function uploadEdgeParams(device: GPUDevice, buffer: GPUBuffer, width: number, height: number, params: EdgeParams) {
  const data = new ArrayBuffer(48);
  const u32 = new Uint32Array(data);
  const f32 = new Float32Array(data);

  u32[0] = width;
  u32[1] = height;
  f32[2] = params.depthThreshold;
  f32[3] = params.normalThreshold;
  u32[4] = params.outlineMode;
  u32[5] = 0; // pad
  // Offset 24 (6 floats in): padding to align vec3f at offset 32
  u32[6] = 0;
  u32[7] = 0;
  // outlineColor at offset 32 (vec3f needs 16-byte alignment)
  f32[8] = params.outlineColor[0];
  f32[9] = params.outlineColor[1];
  f32[10] = params.outlineColor[2];
  f32[11] = params.luminanceShift;

  device.queue.writeBuffer(buffer, 0, data);
}

export function updateEdgeParams(device: GPUDevice, pass: EdgePass, width: number, height: number, params: EdgeParams) {
  uploadEdgeParams(device, pass.uniformBuffer, width, height, params);
}
