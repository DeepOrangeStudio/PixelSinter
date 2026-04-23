// Shadow map vertex shader — depth-only rendering from light's perspective
// No fragment shader needed (depth is written automatically)

struct LightUniforms {
  lightViewProjection: mat4x4f,
}

struct ObjectUniforms {
  modelMatrix: mat4x4f,
  normalMatrix: mat4x4f,  // unused here but same buffer layout as gbuffer
  albedo: vec4f,           // unused here
}

@group(0) @binding(0) var<uniform> lightCamera: LightUniforms;
@group(1) @binding(0) var<uniform> object: ObjectUniforms;

struct VertexInput {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,  // unused but present in vertex buffer
}

@vertex
fn vs(input: VertexInput) -> @builtin(position) vec4f {
  let worldPos = (object.modelMatrix * vec4f(input.position, 1.0)).xyz;
  return lightCamera.lightViewProjection * vec4f(worldPos, 1.0);
}
