// Dithering compute shader — replaces posterize pass when active
// Applies ordered dithering (Bayer) or noise dithering to quantize luminosity
// Input: posterized color (from posterize pass)
// The dither smooths transitions between the posterize bands

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

// Bayer 4x4
const BAYER4 = array<f32, 16>(
   0.0/16.0,  8.0/16.0,  2.0/16.0, 10.0/16.0,
  12.0/16.0,  4.0/16.0, 14.0/16.0,  6.0/16.0,
   3.0/16.0, 11.0/16.0,  1.0/16.0,  9.0/16.0,
  15.0/16.0,  7.0/16.0, 13.0/16.0,  5.0/16.0,
);

// Bayer 8x8
const BAYER8 = array<f32, 64>(
   0.0/64.0, 32.0/64.0,  8.0/64.0, 40.0/64.0,  2.0/64.0, 34.0/64.0, 10.0/64.0, 42.0/64.0,
  48.0/64.0, 16.0/64.0, 56.0/64.0, 24.0/64.0, 50.0/64.0, 18.0/64.0, 58.0/64.0, 26.0/64.0,
  12.0/64.0, 44.0/64.0,  4.0/64.0, 36.0/64.0, 14.0/64.0, 46.0/64.0,  6.0/64.0, 38.0/64.0,
  60.0/64.0, 28.0/64.0, 52.0/64.0, 20.0/64.0, 62.0/64.0, 30.0/64.0, 54.0/64.0, 22.0/64.0,
   3.0/64.0, 35.0/64.0, 11.0/64.0, 43.0/64.0,  1.0/64.0, 33.0/64.0,  9.0/64.0, 41.0/64.0,
  51.0/64.0, 19.0/64.0, 59.0/64.0, 27.0/64.0, 49.0/64.0, 17.0/64.0, 57.0/64.0, 25.0/64.0,
  15.0/64.0, 47.0/64.0,  7.0/64.0, 39.0/64.0, 13.0/64.0, 45.0/64.0,  5.0/64.0, 37.0/64.0,
  63.0/64.0, 31.0/64.0, 55.0/64.0, 23.0/64.0, 61.0/64.0, 29.0/64.0, 53.0/64.0, 21.0/64.0,
);

struct Params {
  resolution: vec2u,
  mode: u32,          // 0=none (passthrough), 1=bayer4, 2=bayer8, 3=bluenoise
  posterizeLevels: u32,
  strength: f32,      // 0..1
  _pad1: f32,
  _pad2: f32,
  _pad3: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var outputTex: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(3) var<storage, read> blueNoise: array<f32>; // 64×64 blue noise values

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let coord = gid.xy;
  if (coord.x >= params.resolution.x || coord.y >= params.resolution.y) {
    return;
  }

  let color = textureLoad(inputTex, coord, 0);

  // Passthrough if disabled
  if (params.mode == 0u) {
    textureStore(outputTex, coord, color);
    return;
  }

  // Get dither threshold from pattern
  var threshold: f32;
  if (params.mode == 1u) {
    let bx = coord.x % 4u;
    let by = coord.y % 4u;
    threshold = BAYER4[by * 4u + bx];
  } else if (params.mode == 2u) {
    let bx = coord.x % 8u;
    let by = coord.y % 8u;
    threshold = BAYER8[by * 8u + bx];
  } else {
    // Blue noise from pre-computed 64×64 texture (tileable)
    let bx = coord.x % 64u;
    let by = coord.y % 64u;
    threshold = blueNoise[by * 64u + bx];
  }

  // Center threshold around 0: range becomes [-0.5, 0.5]
  let centered_threshold = (threshold - 0.5) * params.strength;

  // Convert to OKLab and apply dither bias BEFORE quantizing
  var lab = linear_to_oklab(color.rgb);
  let L = lab.x;

  // Add dither bias to luminosity, then quantize
  let levels = f32(params.posterizeLevels);
  let level_size = 1.0 / levels;
  let biased_L = L + centered_threshold * level_size;
  let quantized_L = floor(biased_L * levels + 0.5) / levels;
  lab.x = clamp(quantized_L, 0.0, 1.0);

  let result = max(oklab_to_linear(lab), vec3f(0.0));
  textureStore(outputTex, coord, vec4f(result, 1.0));
}
