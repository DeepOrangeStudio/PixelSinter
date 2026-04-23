// G-Buffer MRT shader — outputs to 4 color attachments
// Supports: 1 directional light + up to 4 point lights + 1 ambient
// Shadow map sampling (when enabled) for the directional light

struct CameraUniforms {
  viewProjectionMatrix: mat4x4f,
  lightViewProjection: mat4x4f,  // for shadow map lookup
  shadowEnabled: vec4u,          // .x = 1 if shadows enabled
}

struct PointLightData {
  positionAndRange: vec4f,   // .xyz = position, .w = range
  colorAndIntensity: vec4f,  // .xyz = color, .w = intensity
}

struct LightUniforms {
  // Directional light
  lightDirection: vec4f,     // .xyz = normalized direction, .w = intensity
  lightColor: vec4f,         // .xyz = color
  // Ambient
  ambientColor: vec4f,       // .xyz = color, .w = intensity
  // Point lights
  pointLightCount: vec4u,    // .x = count (0-4)
  pointLights: array<PointLightData, 4>,
}

struct ObjectUniforms {
  modelMatrix: mat4x4f,
  normalMatrix: mat4x4f,
  albedo: vec4f,             // .xyz = albedo, .w = objectId
}

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(0) @binding(1) var<uniform> light: LightUniforms;
@group(0) @binding(2) var shadowMap: texture_depth_2d;
@group(0) @binding(3) var shadowSampler: sampler_comparison;
@group(1) @binding(0) var<uniform> object: ObjectUniforms;

struct VertexInput {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
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
  let worldPos = (object.modelMatrix * vec4f(input.position, 1.0)).xyz;
  let worldNormal = normalize((object.normalMatrix * vec4f(input.normal, 0.0)).xyz);

  var output: VertexOutput;
  output.clipPosition = camera.viewProjectionMatrix * vec4f(worldPos, 1.0);
  output.worldNormal = worldNormal;
  output.worldPosition = worldPos;
  return output;
}

// Simple hash for procedural ground pattern
fn hash2(p: vec2f) -> f32 {
  let h = dot(p, vec2f(127.1, 311.7));
  return fract(sin(h) * 43758.5453);
}

// Value noise for organic ground variation
fn valueNoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f); // smoothstep
  let a = hash2(i);
  let b = hash2(i + vec2f(1.0, 0.0));
  let c = hash2(i + vec2f(0.0, 1.0));
  let d = hash2(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Procedural grass ground color from world position
fn grassGroundColor(worldPos: vec3f) -> vec3f {
  let uv = worldPos.xz;

  // Multi-octave noise for natural variation
  let n1 = valueNoise(uv * 1.5);
  let n2 = valueNoise(uv * 3.7 + vec2f(50.0, 80.0));
  let n3 = valueNoise(uv * 8.0 + vec2f(20.0, 30.0));
  let noise = n1 * 0.5 + n2 * 0.3 + n3 * 0.2;

  // Base grass colors — MUST match grass.wgsl palette for consistency
  let darkGrass  = vec3f(0.25, 0.42, 0.14);
  let midGrass   = vec3f(0.38, 0.58, 0.20);
  let lightGrass = vec3f(0.50, 0.72, 0.28);
  let dirtPatch  = vec3f(0.35, 0.30, 0.15);

  // Blend between grass tones
  var groundColor = mix(darkGrass, midGrass, smoothstep(0.3, 0.55, noise));
  groundColor = mix(groundColor, lightGrass, smoothstep(0.55, 0.8, noise));

  // Occasional dirt patches
  let dirtNoise = valueNoise(uv * 2.0 + vec2f(100.0, 200.0));
  groundColor = mix(groundColor, dirtPatch, smoothstep(0.78, 0.88, dirtNoise) * 0.5);

  return groundColor;
}

@fragment
fn fs(input: VertexOutput) -> FragmentOutput {
  let normal = normalize(input.worldNormal);

  // Ground detection: if normal points up, use procedural grass coloring
  var albedo = object.albedo.xyz;
  if (normal.y > 0.9) {
    albedo = grassGroundColor(input.worldPosition);
  }

  // --- Shadow map lookup ---
  // Project world position into light space
  let lightSpacePos = camera.lightViewProjection * vec4f(input.worldPosition, 1.0);
  let lightNDC = lightSpacePos.xyz / lightSpacePos.w;
  // Convert from [-1,1] to [0,1] UV space (flip Y)
  let shadowUV = clamp(vec2f(lightNDC.x * 0.5 + 0.5, -lightNDC.y * 0.5 + 0.5), vec2f(0.001), vec2f(0.999));
  let currentDepth = lightNDC.z;

  // textureSampleCompare must be in uniform control flow — no branching on per-pixel values
  // Comparison sampler: returns 1.0 if NOT in shadow, 0.0 if in shadow
  let shadowSample = textureSampleCompare(shadowMap, shadowSampler, shadowUV, currentDepth);
  // Only apply shadow if enabled (uniform condition — OK)
  var shadowFactor = 1.0;
  if (camera.shadowEnabled.x == 1u) {
    shadowFactor = shadowSample;
  }

  // --- Directional light (Lambert diffuse × shadow) ---
  let lightDir = normalize(light.lightDirection.xyz);
  let dirIntensity = light.lightDirection.w;
  let NdotL_dir = max(dot(normal, lightDir), 0.0);
  var diffuse = light.lightColor.xyz * dirIntensity * NdotL_dir * shadowFactor;

  // --- Point lights ---
  let numPointLights = light.pointLightCount.x;
  for (var i = 0u; i < numPointLights; i++) {
    let pl = light.pointLights[i];
    let plPos = pl.positionAndRange.xyz;
    let plRange = pl.positionAndRange.w;
    let plColor = pl.colorAndIntensity.xyz;
    let plIntensity = pl.colorAndIntensity.w;

    let toLight = plPos - input.worldPosition;
    let dist = length(toLight);
    let lightDirPl = toLight / max(dist, 0.001);

    // Smooth attenuation: inverse square with range falloff
    let attenuation = saturate(1.0 - (dist * dist) / (plRange * plRange));
    let att2 = attenuation * attenuation;

    let NdotL_pl = max(dot(normal, lightDirPl), 0.0);
    diffuse += plColor * plIntensity * NdotL_pl * att2;
  }

  // --- Ambient ---
  let ambient = light.ambientColor.xyz * light.ambientColor.w;

  // --- Final lit color ---
  let color = albedo * (diffuse + ambient);
  let linearDepth = input.clipPosition.w;

  var output: FragmentOutput;
  output.color = vec4f(color, 1.0);
  output.normal = vec4f(normal * 0.5 + 0.5, 1.0);
  output.objectId = u32(object.albedo.w);
  output.depthColor = linearDepth;
  return output;
}
