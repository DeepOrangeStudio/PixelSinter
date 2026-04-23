// Upscale shader — fullscreen triangle, samples low-res texture with nearest filtering
// Pixels with objectId == 0 (no geometry) get the background color instead of stylized output

struct Params {
  outputResolution: vec2f,
  backgroundColor: vec4f,  // .xyz = sRGB background color
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var lowResTex: texture_2d<f32>;
@group(0) @binding(2) var objectIdTex: texture_2d<u32>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vs(@builtin(vertex_index) i: u32) -> VertexOutput {
  let uv = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  var output: VertexOutput;
  output.position = vec4f(uv * 2.0 - 1.0, 0.0, 1.0);
  output.uv = vec2f(uv.x, 1.0 - uv.y);
  return output;
}

@fragment
fn fs(input: VertexOutput) -> @location(0) vec4f {
  let uv = input.uv;
  let texSize = textureDimensions(objectIdTex);
  let coord = vec2u(vec2f(texSize) * uv);
  let id = textureLoad(objectIdTex, coord, 0).r;

  // No geometry here — draw background
  if (id == 0u) {
    return params.backgroundColor;
  }

  // Geometry — draw stylized pixel art (nearest sampling)
  let texSizeF = vec2f(textureDimensions(lowResTex));
  let texelCoord = vec2u(texSizeF * uv);
  return textureLoad(lowResTex, texelCoord, 0);
}
