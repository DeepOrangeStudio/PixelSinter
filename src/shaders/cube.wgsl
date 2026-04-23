// Cube shader — MVP transform + flat color from normal direction
// Validates: vertex buffers, uniform buffers, depth test, 3D rendering

struct Uniforms {
  mvpMatrix: mat4x4f,
  modelMatrix: mat4x4f,
  normalMatrix: mat4x4f,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexInput {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
}

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) worldNormal: vec3f,
}

@vertex
fn vs(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.position = uniforms.mvpMatrix * vec4f(input.position, 1.0);
  // Transform normal to world space (using the upper 3x3 of normalMatrix)
  output.worldNormal = normalize(
    (uniforms.normalMatrix * vec4f(input.normal, 0.0)).xyz
  );
  return output;
}

@fragment
fn fs(input: VertexOutput) -> @location(0) vec4f {
  // Simple directional light for visual validation
  let lightDir = normalize(vec3f(0.5, 1.0, 0.8));
  let normal = normalize(input.worldNormal);
  let diffuse = max(dot(normal, lightDir), 0.0);
  let ambient = 0.15;
  let brightness = ambient + diffuse * 0.85;

  // Base color: warm orange
  let baseColor = vec3f(0.95, 0.55, 0.25);
  let color = baseColor * brightness;

  return vec4f(color, 1.0);
}
