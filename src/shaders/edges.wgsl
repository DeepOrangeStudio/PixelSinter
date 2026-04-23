// Edge detection compute shader — detects silhouette, crease, and object boundary edges
// Reads low-res depth, normals, and objectID buffers
// Writes edge mask AND applies edges to the stylized color buffer

struct Params {
  resolution: vec2u,
  depthThreshold: f32,
  normalThreshold: f32,
  outlineMode: u32,        // 0 = color replacement, 1 = luminance shift
  _pad1: u32,
  outlineColor: vec3f,     // for mode 0
  luminanceShift: f32,     // for mode 1 (e.g., -0.3)
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var depthTex: texture_2d<f32>;
@group(0) @binding(2) var normalTex: texture_2d<f32>;
@group(0) @binding(3) var objectIdTex: texture_2d<u32>;
@group(0) @binding(4) var colorIn: texture_2d<f32>;
@group(0) @binding(5) var colorOut: texture_storage_2d<rgba8unorm, write>;

// OKLab conversions for luminance shift mode
fn linear_to_oklab(c: vec3f) -> vec3f {
  let l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
  let m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
  let s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
  let l_ = pow(max(l, 0.0), 1.0 / 3.0);
  let m_ = pow(max(m, 0.0), 1.0 / 3.0);
  let s_ = pow(max(s, 0.0), 1.0 / 3.0);
  return vec3f(
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  );
}

fn oklab_to_linear(lab: vec3f) -> vec3f {
  let l_ = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
  let m_ = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
  let s_ = lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z;
  let l = l_ * l_ * l_;
  let m = m_ * m_ * m_;
  let s = s_ * s_ * s_;
  return vec3f(
     4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  );
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let coord = gid.xy;
  if (coord.x >= params.resolution.x || coord.y >= params.resolution.y) {
    return;
  }

  let ic = vec2i(coord);

  // Clamp helper
  let maxCoord = vec2i(params.resolution) - vec2i(1, 1);

  // Sample center and 4 neighbors
  let depth_c = textureLoad(depthTex, ic, 0).r;
  let depth_u = textureLoad(depthTex, clamp(ic + vec2i(0, -1), vec2i(0), maxCoord), 0).r;
  let depth_d = textureLoad(depthTex, clamp(ic + vec2i(0,  1), vec2i(0), maxCoord), 0).r;
  let depth_l = textureLoad(depthTex, clamp(ic + vec2i(-1, 0), vec2i(0), maxCoord), 0).r;
  let depth_r = textureLoad(depthTex, clamp(ic + vec2i( 1, 0), vec2i(0), maxCoord), 0).r;

  // Depth discontinuity → silhouette
  let depth_diff = max(
    max(abs(depth_c - depth_u), abs(depth_c - depth_d)),
    max(abs(depth_c - depth_l), abs(depth_c - depth_r))
  );
  let depth_edge = step(params.depthThreshold, depth_diff);

  // Normal discontinuity → crease / angle
  let normal_c = textureLoad(normalTex, ic, 0).xyz * 2.0 - 1.0; // remap from 0..1 to -1..1
  let normal_u = textureLoad(normalTex, clamp(ic + vec2i(0, -1), vec2i(0), maxCoord), 0).xyz * 2.0 - 1.0;
  let normal_d = textureLoad(normalTex, clamp(ic + vec2i(0,  1), vec2i(0), maxCoord), 0).xyz * 2.0 - 1.0;
  let normal_l = textureLoad(normalTex, clamp(ic + vec2i(-1, 0), vec2i(0), maxCoord), 0).xyz * 2.0 - 1.0;
  let normal_r = textureLoad(normalTex, clamp(ic + vec2i( 1, 0), vec2i(0), maxCoord), 0).xyz * 2.0 - 1.0;

  let normal_diff = max(
    max(1.0 - dot(normal_c, normal_u), 1.0 - dot(normal_c, normal_d)),
    max(1.0 - dot(normal_c, normal_l), 1.0 - dot(normal_c, normal_r))
  );
  let normal_edge = step(params.normalThreshold, normal_diff);

  // Object ID discontinuity → object separation
  let id_c = textureLoad(objectIdTex, ic, 0).r;
  let id_u = textureLoad(objectIdTex, clamp(ic + vec2i(0, -1), vec2i(0), maxCoord), 0).r;
  let id_d = textureLoad(objectIdTex, clamp(ic + vec2i(0,  1), vec2i(0), maxCoord), 0).r;
  let id_l = textureLoad(objectIdTex, clamp(ic + vec2i(-1, 0), vec2i(0), maxCoord), 0).r;
  let id_r = textureLoad(objectIdTex, clamp(ic + vec2i( 1, 0), vec2i(0), maxCoord), 0).r;

  var id_edge = 0.0;
  if (id_c != id_u || id_c != id_d || id_c != id_l || id_c != id_r) {
    id_edge = 1.0;
  }

  // Combined edge
  let edge = max(depth_edge, max(normal_edge, id_edge));

  // Apply edge to color
  var color = textureLoad(colorIn, ic, 0).rgb;

  if (edge > 0.5) {
    if (params.outlineMode == 0u) {
      // Color replacement mode
      color = params.outlineColor;
    } else {
      // Luminance shift mode (OKLab)
      var lab = linear_to_oklab(color);
      lab.x = clamp(lab.x + params.luminanceShift, 0.0, 1.0);
      color = max(oklab_to_linear(lab), vec3f(0.0));
    }
  }

  textureStore(colorOut, coord, vec4f(color, 1.0));
}
