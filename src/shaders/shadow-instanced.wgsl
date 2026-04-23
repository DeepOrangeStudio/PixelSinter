// Shadow map instanced vertex shader — depth-only, reads transforms from storage buffer

struct LightUniforms {
  lightViewProjection: mat4x4f,
}

struct InstanceData {
  modelMatrix: mat4x4f,
  normalMatrix: mat4x4f,
}

@group(0) @binding(0) var<uniform> lightCamera: LightUniforms;
@group(1) @binding(0) var<storage, read> instances: array<InstanceData>;

struct VertexInput {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @builtin(instance_index) instanceIdx: u32,
}

@vertex
fn vs(input: VertexInput) -> @builtin(position) vec4f {
  let inst = instances[input.instanceIdx];
  let worldPos = (inst.modelMatrix * vec4f(input.position, 1.0)).xyz;
  return lightCamera.lightViewProjection * vec4f(worldPos, 1.0);
}
