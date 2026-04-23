// Palette mapping pass — maps colors to nearest palette entry in OKLab space

import paletteWGSL from "../shaders/palette.wgsl" with { type: "text" };

export interface PalettePass {
  pipeline: GPUComputePipeline;
  bindGroup: GPUBindGroup;
  uniformBuffer: GPUBuffer;
  paletteBuffer: GPUBuffer;
  workgroupsX: number;
  workgroupsY: number;
}

// Pre-defined palettes (sRGB 0-255)
export const PALETTES: Record<string, number[][]> = {
  gameboy: [
    [15, 56, 15], [48, 98, 48], [139, 172, 15], [155, 188, 15],
  ],
  pico8: [
    [0, 0, 0], [29, 43, 83], [126, 37, 83], [0, 135, 81],
    [171, 82, 54], [95, 87, 79], [194, 195, 199], [255, 241, 232],
    [255, 0, 77], [255, 163, 0], [255, 236, 39], [0, 228, 54],
    [41, 173, 255], [131, 118, 156], [255, 119, 168], [255, 204, 170],
  ],
  cga: [
    [0, 0, 0], [0, 170, 170], [170, 0, 170], [170, 170, 170],
  ],
  obradinn: [
    [30, 25, 20], [225, 215, 190],
  ],
  nes: [
    [0, 0, 0], [252, 252, 252], [188, 188, 188], [124, 124, 124],
    [168, 0, 16], [248, 56, 0], [252, 160, 68], [252, 228, 160],
    [0, 112, 0], [0, 168, 0], [88, 216, 84], [152, 248, 120],
    [0, 0, 168], [0, 88, 248], [60, 188, 252], [164, 228, 252],
    [148, 0, 132], [216, 0, 204], [248, 120, 248], [248, 184, 248],
  ],
};

// Convert sRGB 0-255 to OKLab
function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function linearToOklab(r: number, g: number, b: number): [number, number, number] {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(Math.max(l, 0));
  const m_ = Math.cbrt(Math.max(m, 0));
  const s_ = Math.cbrt(Math.max(s, 0));
  return [
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  ];
}

function paletteTOklab(palette: number[][]): Float32Array {
  // Pack as vec4f (xyz = OKLab, w = 0)
  const data = new Float32Array(palette.length * 4);
  for (let i = 0; i < palette.length; i++) {
    const [r, g, b] = palette[i];
    const [L, a, bVal] = linearToOklab(srgbToLinear(r), srgbToLinear(g), srgbToLinear(b));
    data[i * 4 + 0] = L;
    data[i * 4 + 1] = a;
    data[i * 4 + 2] = bVal;
    data[i * 4 + 3] = 0;
  }
  return data;
}

const MAX_PALETTE_SIZE = 64;

export function createPalettePass(
  device: GPUDevice,
  inputColor: GPUTexture,
  outputColor: GPUTexture,
  width: number,
  height: number,
): PalettePass {
  const module = device.createShaderModule({ label: "palette compute", code: paletteWGSL });

  const uniformBuffer = device.createBuffer({
    label: "palette uniforms",
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  // Start disabled
  device.queue.writeBuffer(uniformBuffer, 0, new Uint32Array([width, height, 0, 0]));

  const paletteBuffer = device.createBuffer({
    label: "palette colors",
    size: MAX_PALETTE_SIZE * 16, // vec4f per color
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  const bindGroupLayout = device.createBindGroupLayout({
    label: "palette BGL",
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "float" } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "write-only", format: "rgba8unorm" } },
    ],
  });

  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: paletteBuffer } },
      { binding: 2, resource: inputColor.createView() },
      { binding: 3, resource: outputColor.createView() },
    ],
  });

  const pipeline = device.createComputePipeline({
    label: "palette pipeline",
    layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
    compute: { module, entryPoint: "main" },
  });

  return {
    pipeline,
    bindGroup,
    uniformBuffer,
    paletteBuffer,
    workgroupsX: Math.ceil(width / 8),
    workgroupsY: Math.ceil(height / 8),
  };
}

export function setPalette(device: GPUDevice, pass: PalettePass, width: number, height: number, palette: number[][] | null) {
  if (!palette) {
    device.queue.writeBuffer(pass.uniformBuffer, 0, new Uint32Array([width, height, 0, 0]));
    return;
  }
  const oklabData = paletteTOklab(palette);
  device.queue.writeBuffer(pass.paletteBuffer, 0, oklabData);
  device.queue.writeBuffer(pass.uniformBuffer, 0, new Uint32Array([width, height, palette.length, 1]));
}
