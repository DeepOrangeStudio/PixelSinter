// Configuration types for PixelSinter renderer

export interface PixelSinterConfig {
  canvas: HTMLCanvasElement;
  pixelResolution: [number, number]; // default: [320, 180]
}

export const DEFAULT_PIXEL_RESOLUTION: [number, number] = [320, 180];
