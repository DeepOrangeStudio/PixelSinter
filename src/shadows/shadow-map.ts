// Shadow map — depth-only render from directional light's perspective

import { type Vec3, type Mat4, mat4_lookAt, mat4_ortho, mat4_multiply, vec3_normalize, vec3_scale } from "../core/math";
import { Geometry } from "../scene/geometry";
import shadowWGSL from "../shaders/shadow.wgsl" with { type: "text" };

export const SHADOW_MAP_SIZE = 1024;

export interface ShadowMapResources {
  depthTexture: GPUTexture;
  depthView: GPUTextureView;
  pipeline: GPURenderPipeline;
  lightViewProjection: Mat4;
  uniformBuffer: GPUBuffer;
  cameraBindGroup: GPUBindGroup;
}

export function createShadowMap(
  device: GPUDevice,
  lightDirection: Vec3,
  sceneRadius: number,
  objectBindGroupLayout: GPUBindGroupLayout, // reuse from gbuffer
): ShadowMapResources {
  const depthTexture = device.createTexture({
    label: "shadow map depth",
    size: { width: SHADOW_MAP_SIZE, height: SHADOW_MAP_SIZE },
    format: "depth32float",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });
  const depthView = depthTexture.createView();

  // Light matrices (ortho projection from light direction)
  const lightDir = vec3_normalize(lightDirection);
  const lightPos: Vec3 = vec3_scale(lightDir, sceneRadius * 2);
  const lightView = mat4_lookAt(lightPos, [0, 0, 0], [0, 1, 0]);
  const r = sceneRadius;
  const lightProj = mat4_ortho(-r, r, -r, r, 0.1, sceneRadius * 4);
  const lightViewProjection = mat4_multiply(lightProj, lightView);

  // Uniform buffer for light VP
  const uniformBuffer = device.createBuffer({
    label: "shadow light VP",
    size: 64,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(uniformBuffer, 0, lightViewProjection);

  const module = device.createShaderModule({ label: "shadow shader", code: shadowWGSL });

  const shadowCameraBGL = device.createBindGroupLayout({
    label: "shadow camera BGL",
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } },
    ],
  });

  const cameraBindGroup = device.createBindGroup({
    layout: shadowCameraBGL,
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });

  const pipeline = device.createRenderPipeline({
    label: "shadow pipeline",
    layout: device.createPipelineLayout({
      bindGroupLayouts: [shadowCameraBGL, objectBindGroupLayout],
    }),
    vertex: {
      module,
      entryPoint: "vs",
      buffers: [Geometry.VERTEX_BUFFER_LAYOUT],
    },
    primitive: {
      topology: "triangle-list",
      cullMode: "back",
      frontFace: "ccw",
    },
    depthStencil: {
      format: "depth32float",
      depthWriteEnabled: true,
      depthCompare: "less",
      depthBias: 2,
      depthBiasSlopeScale: 1.5,
    },
  });

  return {
    depthTexture,
    depthView,
    pipeline,
    lightViewProjection,
    uniformBuffer,
    cameraBindGroup,
  };
}
