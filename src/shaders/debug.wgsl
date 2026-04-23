// Debug visualization shader — displays individual G-Buffer channels
// Fullscreen triangle, samples the selected buffer and outputs to screen

struct DebugUniforms {
  outputResolution: vec2f,
  mode: u32,              // 0=color, 1=depth, 2=normals, 3=objectId
  _pad: u32,
}

@group(0) @binding(0) var<uniform> debug: DebugUniforms;
@group(0) @binding(1) var colorTex: texture_2d<f32>;
@group(0) @binding(2) var normalTex: texture_2d<f32>;
@group(0) @binding(3) var objectIdTex: texture_2d<u32>;
@group(0) @binding(4) var depthTex: texture_2d<f32>;

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

  switch debug.mode {
    // Color
    case 0u: {
      let texSize = textureDimensions(colorTex);
      let coord = vec2u(vec2f(texSize) * uv);
      return textureLoad(colorTex, coord, 0);
    }
    // Depth (grayscale, remapped for visibility)
    case 1u: {
      let texSize = textureDimensions(depthTex);
      let coord = vec2u(vec2f(texSize) * uv);
      let d = textureLoad(depthTex, coord, 0).r;
      // linear depth: near=white, far=black
      let vis = 1.0 - saturate(d * 0.1);
      return vec4f(vis, vis, vis, 1.0);
    }
    // Normals
    case 2u: {
      let texSize = textureDimensions(normalTex);
      let coord = vec2u(vec2f(texSize) * uv);
      let n = textureLoad(normalTex, coord, 0).xyz;
      return vec4f(n, 1.0);
    }
    // Object ID (hash to color)
    case 3u: {
      let texSize = textureDimensions(objectIdTex);
      let coord = vec2u(vec2f(texSize) * uv);
      let id = textureLoad(objectIdTex, coord, 0).r;
      if (id == 0u) { return vec4f(0.0, 0.0, 0.0, 1.0); }
      let r = f32((id * 37u) % 255u) / 255.0;
      let g = f32((id * 73u) % 255u) / 255.0;
      let b = f32((id * 127u) % 255u) / 255.0;
      return vec4f(r, g, b, 1.0);
    }
    default: {
      return vec4f(1.0, 0.0, 1.0, 1.0);
    }
  }
}
