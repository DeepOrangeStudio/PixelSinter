// PixelSinter — public API exports

export { initGPU, type GPUContext } from "./core/gpu";
export { type Vec3, type Vec4, type Mat4 } from "./core/math";

export { Scene } from "./scene/scene";
export { Mesh } from "./scene/mesh";
export { Geometry, createCubeGeometry } from "./scene/geometry";
export { Material } from "./scene/material";
export { Transform } from "./scene/transform";
export { OrthoCamera, PerspectiveCamera } from "./scene/camera";
export { DirectionalLight, AmbientLight } from "./scene/light";

export { loadGLB, loadGLTF } from "./loaders/gltf";
export { loadOBJ } from "./loaders/obj";

export { type PixelSinterConfig, DEFAULT_PIXEL_RESOLUTION } from "./config";
export { PALETTES } from "./stylize/palette";
