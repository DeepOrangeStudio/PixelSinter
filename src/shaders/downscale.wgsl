// Downscale compute shader — point-samples full-res G-Buffer to pixel art resolution
// Each thread handles one pixel of the low-res output

struct Params {
  sourceSize: vec2u,
  targetSize: vec2u,
}

@group(0) @binding(0) var<uniform> params: Params;

// Source (full resolution)
@group(0) @binding(1) var srcColor: texture_2d<f32>;
@group(0) @binding(2) var srcNormals: texture_2d<f32>;
@group(0) @binding(3) var srcObjectId: texture_2d<u32>;
@group(0) @binding(4) var srcDepth: texture_2d<f32>;

// Destination (low resolution, storage textures)
@group(0) @binding(5) var dstColor: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(6) var dstNormals: texture_storage_2d<rgba16float, write>;
@group(0) @binding(7) var dstObjectId: texture_storage_2d<r32uint, write>;
@group(0) @binding(8) var dstDepth: texture_storage_2d<r32float, write>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let targetCoord = gid.xy;

  // Bounds check
  if (targetCoord.x >= params.targetSize.x || targetCoord.y >= params.targetSize.y) {
    return;
  }

  // Point sampling: map target pixel to source pixel (center of the corresponding region)
  let sourceX = u32(f32(targetCoord.x) * f32(params.sourceSize.x) / f32(params.targetSize.x));
  let sourceY = u32(f32(targetCoord.y) * f32(params.sourceSize.y) / f32(params.targetSize.y));
  let sourceCoord = vec2u(sourceX, sourceY);

  // Copy each buffer
  textureStore(dstColor, targetCoord, textureLoad(srcColor, sourceCoord, 0));
  textureStore(dstNormals, targetCoord, textureLoad(srcNormals, sourceCoord, 0));
  textureStore(dstObjectId, targetCoord, textureLoad(srcObjectId, sourceCoord, 0));
  textureStore(dstDepth, targetCoord, textureLoad(srcDepth, sourceCoord, 0));
}
