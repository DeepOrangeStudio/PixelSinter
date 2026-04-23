// Palette mapping compute shader — maps each pixel to the nearest color in a palette
// Uses OKLab distance for perceptually accurate matching

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

struct Params {
  resolution: vec2u,
  paletteSize: u32,
  enabled: u32,
}

// Palette stored as OKLab colors (pre-computed on CPU)
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> paletteColors: array<vec4f>; // .xyz = OKLab
@group(0) @binding(2) var inputTex: texture_2d<f32>;
@group(0) @binding(3) var outputTex: texture_storage_2d<rgba8unorm, write>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let coord = gid.xy;
  if (coord.x >= params.resolution.x || coord.y >= params.resolution.y) {
    return;
  }

  let color = textureLoad(inputTex, coord, 0);

  // Skip if palette disabled
  if (params.enabled == 0u) {
    textureStore(outputTex, coord, color);
    return;
  }

  // Convert to OKLab
  let lab = linear_to_oklab(color.rgb);

  // Find nearest palette color (brute force — fine for small palettes on 320×180)
  var bestDist = 999999.0;
  var bestColor = vec3f(0.0);

  for (var i = 0u; i < params.paletteSize; i++) {
    let paletteLab = paletteColors[i].xyz;
    let d = distance(lab, paletteLab);
    if (d < bestDist) {
      bestDist = d;
      bestColor = paletteLab;
    }
  }

  // Convert back to linear RGB
  let result = max(oklab_to_linear(bestColor), vec3f(0.0));
  textureStore(outputTex, coord, vec4f(result, 1.0));
}
