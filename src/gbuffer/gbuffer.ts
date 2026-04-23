// G-Buffer — creates and manages the render targets for MRT rendering
// color0: rgba8unorm  — albedo × lighting
// color1: rgba16float — world-space normals
// color2: r32uint     — object ID
// color3: r32float    — linear depth (written from fragment shader)
// depth:  depth24plus — native depth for z-test only

export interface GBufferTextures {
  color: GPUTexture;        // rgba8unorm
  normals: GPUTexture;      // rgba16float
  objectId: GPUTexture;     // r32uint
  depthColor: GPUTexture;   // r32float — linear depth as color output (readable in compute)
  depth: GPUTexture;        // depth24plus (z-test only, not readable)
}

export const GBUFFER_FORMATS = {
  color: "rgba8unorm" as GPUTextureFormat,
  normals: "rgba16float" as GPUTextureFormat,
  objectId: "r32uint" as GPUTextureFormat,
  depthColor: "r32float" as GPUTextureFormat,
  depth: "depth24plus" as GPUTextureFormat,
};

export function createGBuffer(device: GPUDevice, width: number, height: number): GBufferTextures {
  const color = device.createTexture({
    label: "gbuffer color",
    size: { width, height },
    format: GBUFFER_FORMATS.color,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });

  const normals = device.createTexture({
    label: "gbuffer normals",
    size: { width, height },
    format: GBUFFER_FORMATS.normals,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });

  const objectId = device.createTexture({
    label: "gbuffer objectId",
    size: { width, height },
    format: GBUFFER_FORMATS.objectId,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });

  const depthColor = device.createTexture({
    label: "gbuffer depth color (r32float)",
    size: { width, height },
    format: GBUFFER_FORMATS.depthColor,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });

  const depth = device.createTexture({
    label: "gbuffer depth (z-test)",
    size: { width, height },
    format: GBUFFER_FORMATS.depth,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });

  return { color, normals, objectId, depthColor, depth };
}

export function destroyGBuffer(gbuffer: GBufferTextures) {
  gbuffer.color.destroy();
  gbuffer.normals.destroy();
  gbuffer.objectId.destroy();
  gbuffer.depthColor.destroy();
  gbuffer.depth.destroy();
}
