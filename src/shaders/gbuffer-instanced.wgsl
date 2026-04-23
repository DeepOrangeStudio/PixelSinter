// G-Buffer instanced shader — same as gbuffer.wgsl but reads per-instance
// transforms from a storage buffer instead of a uniform buffer

struct CameraUniforms {
  viewProjectionMatrix: mat4x4f,
  lightViewProjection: mat4x4f,
  shadowEnabled: vec4u,
}

struct PointLightData {
  positionAndRange: vec4f,
  colorAndIntensity: vec4f,
}

struct LightUniforms {
  lightDirection: vec4f,
  lightColor: vec4f,
  ambientColor: vec4f,
  pointLightCount: vec4u,
  pointLights: array<PointLightData, 4>,
}

struct InstanceData {
  modelMatrix: mat4x4f,
  normalMatrix: mat4x4f,
}

struct MaterialUniforms {
  albedo: vec4f,  // .xyz = color, .w = objectId
}

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(0) @binding(1) var<uniform> light: LightUniforms;
@group(0) @binding(2) var shadowMap: texture_depth_2d;
@group(0) @binding(3) var shadowSampler: sampler_comparison;
@group(1) @binding(0) var<storage, read> instances: array<InstanceData>;
@group(1) @binding(1) var<uniform> material: MaterialUniforms;

struct VertexInput {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @builtin(instance_index) instanceIdx: u32,
}

struct VertexOutput {
  @builtin(position) clipPosition: vec4f,
  @location(0) worldNormal: vec3f,
  @location(1) worldPosition: vec3f,
}

struct FragmentOutput {
  @location(0) color: vec4f,
  @location(1) normal: vec4f,
  @location(2) objectId: u32,
  @location(3) depthColor: f32,
}

@vertex
fn vs(input: VertexInput) -> VertexOutput {
  let inst = instances[input.instanceIdx];
  let worldPos = (inst.modelMatrix * vec4f(input.position, 1.0)).xyz;
  let worldNormal = normalize((inst.normalMatrix * vec4f(input.normal, 0.0)).xyz);

  var output: VertexOutput;
  output.clipPosition = camera.viewProjectionMatrix * vec4f(worldPos, 1.0);
  output.worldNormal = worldNormal;
  output.worldPosition = worldPos;
  return output;
}

@fragment
fn fs(input: VertexOutput) -> FragmentOutput {
  let normal = normalize(input.worldNormal);
  let albedo = material.albedo.xyz;

  // Shadow
  let lightSpacePos = camera.lightViewProjection * vec4f(input.worldPosition, 1.0);
  let lightNDC = lightSpacePos.xyz / lightSpacePos.w;
  let shadowUV = clamp(vec2f(lightNDC.x * 0.5 + 0.5, -lightNDC.y * 0.5 + 0.5), vec2f(0.001), vec2f(0.999));
  let shadowSample = textureSampleCompare(shadowMap, shadowSampler, shadowUV, lightNDC.z);
  var shadowFactor = 1.0;
  if (camera.shadowEnabled.x == 1u) {
    shadowFactor = shadowSample;
  }

  // Directional light
  let lightDir = normalize(light.lightDirection.xyz);
  let NdotL_dir = max(dot(normal, lightDir), 0.0);
  var diffuse = light.lightColor.xyz * light.lightDirection.w * NdotL_dir * shadowFactor;

  // Point lights
  let numPL = light.pointLightCount.x;
  for (var i = 0u; i < numPL; i++) {
    let pl = light.pointLights[i];
    let toLight = pl.positionAndRange.xyz - input.worldPosition;
    let dist = length(toLight);
    let att = saturate(1.0 - (dist * dist) / (pl.positionAndRange.w * pl.positionAndRange.w));
    let NdotL = max(dot(normal, toLight / max(dist, 0.001)), 0.0);
    diffuse += pl.colorAndIntensity.xyz * pl.colorAndIntensity.w * NdotL * att * att;
  }

  // Ambient
  let ambient = light.ambientColor.xyz * light.ambientColor.w;
  let color = albedo * (diffuse + ambient);

  var output: FragmentOutput;
  output.color = vec4f(color, 1.0);
  output.normal = vec4f(normal * 0.5 + 0.5, 1.0);
  output.objectId = u32(material.albedo.w);
  output.depthColor = input.clipPosition.w;
  return output;
}
