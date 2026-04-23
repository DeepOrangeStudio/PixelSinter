// PixelSinter demo — Step 1.10: Full pipeline with glTF loading
// Loads a glTF model and renders it through the complete pixel art pipeline
// Falls back to procedural cubes if glTF loading fails
// Controls: 1-5 views, +/- posterize, D dither, P palette, G toggle glTF/cubes

import { initGPU } from "../src/core/gpu";
import {
  mat4_multiply,
  mat4_normalMatrix,
  mat4_lookAt,
  mat4_ortho,
  vec3_normalize,
} from "../src/core/math";
import { Geometry, createCubeGeometry } from "../src/scene/geometry";
import { Transform } from "../src/scene/transform";
import { PerspectiveCamera } from "../src/scene/camera";
import { DirectionalLight, AmbientLight, PointLight, MAX_POINT_LIGHTS } from "../src/scene/light";
import { Material } from "../src/scene/material";
import { Mesh } from "../src/scene/mesh";
import { OrbitController } from "./orbit";
import { createGBuffer, GBUFFER_FORMATS } from "../src/gbuffer/gbuffer";
import { createLowResBuffers, createDownscalePass } from "../src/stylize/downscale";
import { createPosterizePass, updatePosterizeLevels } from "../src/stylize/posterize";
import { createEdgePass } from "../src/stylize/edges";
import { createDitherPass, updateDitherParams, type DitherMode } from "../src/stylize/dither";
import { createPalettePass, setPalette, PALETTES } from "../src/stylize/palette";
import { DEFAULT_PIXEL_RESOLUTION } from "../src/config";
import { loadGLB } from "../src/loaders/gltf";
import { createShadowMap } from "../src/shadows/shadow-map";
import { InstancedMesh, type InstanceData } from "../src/scene/instanced-mesh";
import gbufferWGSL from "../src/shaders/gbuffer.wgsl" with { type: "text" };
import gbufferInstancedWGSL from "../src/shaders/gbuffer-instanced.wgsl" with { type: "text" };
import shadowInstancedWGSL from "../src/shaders/shadow-instanced.wgsl" with { type: "text" };
import debugWGSL from "../src/shaders/debug.wgsl" with { type: "text" };
import upscaleWGSL from "../src/shaders/upscale.wgsl" with { type: "text" };

// Helper: create per-mesh GPU resources (uniform buffer + bind group)
interface MeshGPU {
  mesh: Mesh;
  uniformBuffer: GPUBuffer;
  bindGroup: GPUBindGroup;
}

function createMeshGPU(device: GPUDevice, mesh: Mesh, objectBGL: GPUBindGroupLayout, index: number): MeshGPU {
  const uniformBuffer = device.createBuffer({
    label: `mesh ${index} uniforms`,
    size: 144, // model(64) + normal(64) + albedo+id(16)
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const bindGroup = device.createBindGroup({
    layout: objectBGL,
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });
  return { mesh, uniformBuffer, bindGroup };
}

function buildCubeScene(device: GPUDevice): Mesh[] {
  const cube = createCubeGeometry(device);
  return [
    new Mesh(cube, new Material([0.95, 0.55, 0.25]), Object.assign(new Transform(), { position: [0, 0, 0] as [number, number, number] })),
    new Mesh(cube, new Material([0.3, 0.75, 0.45]),  Object.assign(new Transform(), { position: [2.0, 0, 0] as [number, number, number], scaling: [0.6, 0.6, 0.6] as [number, number, number] })),
    new Mesh(cube, new Material([0.45, 0.5, 0.9]),   Object.assign(new Transform(), { position: [-2.0, 0, 0] as [number, number, number], scaling: [0.8, 0.8, 0.8] as [number, number, number] })),
    new Mesh(cube, new Material([0.9, 0.3, 0.4]),    Object.assign(new Transform(), { position: [0, 1.5, 0] as [number, number, number], scaling: [0.5, 0.5, 0.5] as [number, number, number] })),
    new Mesh(cube, new Material([0.6, 0.6, 0.6]),    Object.assign(new Transform(), { position: [0, -1.0, 0] as [number, number, number], scaling: [6, 0.1, 6] as [number, number, number] })),
  ];
}

async function main() {
  const canvas = document.getElementById("canvas") as HTMLCanvasElement;
  const errorDiv = document.getElementById("error") as HTMLDivElement;
  const infoDiv = document.getElementById("info") as HTMLDivElement;

  try {
    const gpu = await initGPU(canvas);
    const { device } = gpu;

    // Global GPU error handler — catches all uncaptured validation errors
    device.addEventListener("uncapturederror", (e: Event) => {
      const err = (e as GPUUncapturedErrorEvent).error;
      console.error("[GPU ERROR]", err.message);
    });
    const PIXEL_RES = DEFAULT_PIXEL_RESOLUTION;

    // --- Lights ---
    const directionalLight = new DirectionalLight(vec3_normalize([0.4, 0.8, 0.5]), [1, 0.97, 0.92], 1.2);
    const ambientLight = new AmbientLight([0.6, 0.65, 0.8], 0.35);
    const pointLights: PointLight[] = [
      new PointLight([2.0, 1.5, 1.0], [1.0, 0.3, 0.1], 2.5, 8.0),   // warm red-orange
      new PointLight([-2.0, 1.0, -1.0], [0.1, 0.4, 1.0], 2.0, 8.0), // cool blue
      new PointLight([0.0, 2.0, 2.0], [0.2, 1.0, 0.3], 1.5, 6.0),   // green
    ];

    // --- Load scenes ---
    const cubeMeshes = buildCubeScene(device);
    let gltfMeshes: Mesh[] | null = null;
    try {
      gltfMeshes = await loadGLB(device, `./assets/test-scene.glb?v=${Date.now()}`);
      console.log(`[PixelSinter] Loaded glTF: ${gltfMeshes.length} meshes`);
    } catch (e) {
      console.warn("[PixelSinter] glTF load failed, using cubes:", e);
    }

    let useGltf = gltfMeshes !== null;
    let activeMeshes = useGltf ? gltfMeshes! : cubeMeshes;

    // --- Camera ---
    const camera = new PerspectiveCamera(60, canvas.width / canvas.height, 0.1, 100);
    const orbit = new OrbitController(canvas);
    orbit.distance = 6; orbit.theta = 0.6; orbit.phi = 0.35;

    // --- G-Buffer ---
    const gbuffer = createGBuffer(device, canvas.width, canvas.height);
    const lowRes = createLowResBuffers(device, PIXEL_RES[0], PIXEL_RES[1]);
    const downscale = createDownscalePass(device, gbuffer.color, gbuffer.normals, gbuffer.objectId, gbuffer.depthColor, lowRes, PIXEL_RES[0], PIXEL_RES[1]);

    // --- Stylize chain ---
    // posterize(color→stylized) → dither(stylized→color, does re-quantize with bias) → edges(color→stylized) → palette(stylized→color)
    // When dither=none, dither pass is a simple passthrough
    const posterize = createPosterizePass(device, lowRes.color, lowRes.colorStylized, PIXEL_RES[0], PIXEL_RES[1], 4);
    // Dither reads raw color (not posterized) to apply its own biased quantization
    const dither = await createDitherPass(device, lowRes.color, lowRes.colorStylized, PIXEL_RES[0], PIXEL_RES[1], "none", 4, 0.5);
    const edges = createEdgePass(device, lowRes.depth, lowRes.normals, lowRes.objectId, lowRes.colorStylized, lowRes.color, PIXEL_RES[0], PIXEL_RES[1]);
    const palette = createPalettePass(device, lowRes.color, lowRes.colorStylized, PIXEL_RES[0], PIXEL_RES[1]);

    // --- Shaders ---
    const gbufferModule = device.createShaderModule({ label: "gbuffer shader", code: gbufferWGSL });
    const debugModule = device.createShaderModule({ label: "debug shader", code: debugWGSL });
    const upscaleModule = device.createShaderModule({ label: "upscale shader", code: upscaleWGSL });

    let shadowsEnabled = true;
    let dayNightEnabled = false;

    // --- Global uniforms ---
    // Camera buffer: VP(64) + lightVP(64) + shadowEnabled(16) = 144 bytes
    const cameraBuffer = device.createBuffer({ label: "camera uniforms", size: 144, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    // Light buffer: directional(16) + color(16) + ambient(16) + pointCount(16) + 4×pointLight(32) = 192 bytes
    const LIGHT_BUFFER_SIZE = 192;
    const lightBuffer = device.createBuffer({ label: "light uniforms", size: LIGHT_BUFFER_SIZE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

    function uploadLights() {
      const data = new Float32Array(LIGHT_BUFFER_SIZE / 4);
      // Directional
      data[0] = directionalLight.direction[0]; data[1] = directionalLight.direction[1]; data[2] = directionalLight.direction[2]; data[3] = directionalLight.intensity;
      data[4] = directionalLight.color[0]; data[5] = directionalLight.color[1]; data[6] = directionalLight.color[2]; data[7] = 0;
      // Ambient
      data[8] = ambientLight.color[0]; data[9] = ambientLight.color[1]; data[10] = ambientLight.color[2]; data[11] = ambientLight.intensity;
      // Point light count (as u32 in first component of vec4u)
      const countView = new Uint32Array(data.buffer, 48, 4);
      countView[0] = pointLights.length; countView[1] = 0; countView[2] = 0; countView[3] = 0;
      // Point lights (offset 64, each 32 bytes = 8 floats)
      for (let i = 0; i < MAX_POINT_LIGHTS; i++) {
        const base = 16 + i * 8; // offset in floats from start of point lights section
        if (i < pointLights.length) {
          const pl = pointLights[i];
          data[base] = pl.position[0]; data[base + 1] = pl.position[1]; data[base + 2] = pl.position[2]; data[base + 3] = pl.range;
          data[base + 4] = pl.color[0]; data[base + 5] = pl.color[1]; data[base + 6] = pl.color[2]; data[base + 7] = pl.intensity;
        }
      }
      device.queue.writeBuffer(lightBuffer, 0, data);
    }
    uploadLights();

    // --- Pipeline layouts ---
    const shadowComparisonSampler = device.createSampler({
      compare: "less",
      magFilter: "linear",
      minFilter: "linear",
    });

    const globalBGL = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "depth" } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "comparison" } },
      ],
    });
    const objectBGL = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }],
    });

    // --- Shadow map (needs objectBGL) ---
    const shadow = createShadowMap(device, directionalLight.direction, 8, objectBGL);

    const globalBG = device.createBindGroup({ layout: globalBGL, entries: [
      { binding: 0, resource: { buffer: cameraBuffer } },
      { binding: 1, resource: { buffer: lightBuffer } },
      { binding: 2, resource: shadow.depthView },
      { binding: 3, resource: shadowComparisonSampler },
    ]});

    const gbufferPipeline = device.createRenderPipeline({
      label: "gbuffer MRT pipeline",
      layout: device.createPipelineLayout({ bindGroupLayouts: [globalBGL, objectBGL] }),
      vertex: { module: gbufferModule, entryPoint: "vs", buffers: [Geometry.VERTEX_BUFFER_LAYOUT] },
      fragment: {
        module: gbufferModule, entryPoint: "fs",
        targets: [
          { format: GBUFFER_FORMATS.color },
          { format: GBUFFER_FORMATS.normals },
          { format: GBUFFER_FORMATS.objectId, writeMask: GPUColorWrite.RED },
          { format: GBUFFER_FORMATS.depthColor, writeMask: GPUColorWrite.RED },
        ],
      },
      primitive: { topology: "triangle-list", cullMode: "back", frontFace: "ccw" },
      depthStencil: { format: GBUFFER_FORMATS.depth, depthWriteEnabled: true, depthCompare: "less" },
    });

    // --- Instanced pipeline ---
    const instancedModule = device.createShaderModule({ label: "gbuffer instanced", code: gbufferInstancedWGSL });
    const instancedBGL = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
        { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      ],
    });
    const instancedPipeline = device.createRenderPipeline({
      label: "gbuffer instanced pipeline",
      layout: device.createPipelineLayout({ bindGroupLayouts: [globalBGL, instancedBGL] }),
      vertex: { module: instancedModule, entryPoint: "vs", buffers: [Geometry.VERTEX_BUFFER_LAYOUT] },
      fragment: {
        module: instancedModule, entryPoint: "fs",
        targets: [
          { format: GBUFFER_FORMATS.color },
          { format: GBUFFER_FORMATS.normals },
          { format: GBUFFER_FORMATS.objectId, writeMask: GPUColorWrite.RED },
          { format: GBUFFER_FORMATS.depthColor, writeMask: GPUColorWrite.RED },
        ],
      },
      primitive: { topology: "triangle-list", cullMode: "back", frontFace: "ccw" },
      depthStencil: { format: GBUFFER_FORMATS.depth, depthWriteEnabled: true, depthCompare: "less" },
    });

    // Create instanced "rocks" scattered on the ground
    const rockInstances: InstanceData[] = [];
    const rng = (seed: number) => { let s = seed; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; };
    const rand = rng(42);
    for (let i = 0; i < 60; i++) {
      const x = (rand() - 0.5) * 14;
      const z = (rand() - 0.5) * 14;
      const s = 0.08 + rand() * 0.18;
      rockInstances.push({
        position: [x, -1.9 + s * 0.5, z],
        rotation: rand() * Math.PI * 2,
        scale: [s, s * (0.5 + rand() * 0.8), s],
      });
    }

    const rockCube = createCubeGeometry(device);
    const rockMaterial = new Material([0.45, 0.4, 0.35]);
    const rockMesh = new InstancedMesh(device, rockCube, rockMaterial, rockInstances);

    const rockMaterialBuffer = device.createBuffer({ label: "rock material", size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(rockMaterialBuffer, 0, new Float32Array([rockMaterial.albedo[0], rockMaterial.albedo[1], rockMaterial.albedo[2], rockMaterial.objectId]));

    const rockBindGroup = device.createBindGroup({
      layout: instancedBGL,
      entries: [
        { binding: 0, resource: { buffer: rockMesh.instanceBuffer } },
        { binding: 1, resource: { buffer: rockMaterialBuffer } },
      ],
    });

    // Instanced shadow pipeline
    const shadowInstancedModule = device.createShaderModule({ label: "shadow instanced", code: shadowInstancedWGSL });
    const shadowInstancedBGL = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
      ],
    });
    const shadowCameraBGL = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } }],
    });
    const shadowInstancedPipeline = device.createRenderPipeline({
      label: "shadow instanced pipeline",
      layout: device.createPipelineLayout({ bindGroupLayouts: [shadowCameraBGL, shadowInstancedBGL] }),
      vertex: { module: shadowInstancedModule, entryPoint: "vs", buffers: [Geometry.VERTEX_BUFFER_LAYOUT] },
      primitive: { topology: "triangle-list", cullMode: "back", frontFace: "ccw" },
      depthStencil: { format: "depth32float", depthWriteEnabled: true, depthCompare: "less", depthBias: 2, depthBiasSlopeScale: 1.5 },
    });
    const shadowCameraBG = device.createBindGroup({
      layout: shadowCameraBGL,
      entries: [{ binding: 0, resource: { buffer: shadow.uniformBuffer } }],
    });
    const shadowRockBindGroup = device.createBindGroup({
      layout: shadowInstancedBGL,
      entries: [{ binding: 0, resource: { buffer: rockMesh.instanceBuffer } }],
    });

    // --- Per-mesh GPU resources ---
    function buildMeshGPUs(meshes: Mesh[]): MeshGPU[] {
      return meshes.map((m, i) => createMeshGPU(device, m, objectBGL, i));
    }

    let meshGPUs = buildMeshGPUs(activeMeshes);

    // --- Upscale pipeline ---
    const nearestSampler = device.createSampler({ magFilter: "nearest", minFilter: "nearest" });
    // Uniforms: vec2f outputResolution + vec4f backgroundColor = 32 bytes
    const upscaleUniformBuf = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    // Background: dark blue-gray
    const bgColor = [0.08, 0.08, 0.12, 1.0];
    device.queue.writeBuffer(upscaleUniformBuf, 0, new Float32Array([canvas.width, canvas.height, 0, 0, ...bgColor]));

    const upscaleBGL = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "uint" } },
      ],
    });
    const upscaleBG = device.createBindGroup({ layout: upscaleBGL, entries: [
      { binding: 0, resource: { buffer: upscaleUniformBuf } },
      { binding: 1, resource: lowRes.colorStylized.createView() },
      { binding: 2, resource: lowRes.objectId.createView() },
    ]});
    const upscalePipeline = device.createRenderPipeline({
      label: "upscale pipeline",
      layout: device.createPipelineLayout({ bindGroupLayouts: [upscaleBGL] }),
      vertex: { module: upscaleModule, entryPoint: "vs" },
      fragment: { module: upscaleModule, entryPoint: "fs", targets: [{ format: gpu.format }] },
      primitive: { topology: "triangle-list" },
    });

    // --- Debug pipeline ---
    const debugUniformBuffer = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const debugBGL = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "uint" } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "unfilterable-float" } },
      ],
    });
    const debugBG = device.createBindGroup({ layout: debugBGL, entries: [
      { binding: 0, resource: { buffer: debugUniformBuffer } },
      { binding: 1, resource: gbuffer.color.createView() },
      { binding: 2, resource: gbuffer.normals.createView() },
      { binding: 3, resource: gbuffer.objectId.createView() },
      { binding: 4, resource: gbuffer.depthColor.createView() },
    ]});
    const debugPipeline = device.createRenderPipeline({
      label: "debug pipeline",
      layout: device.createPipelineLayout({ bindGroupLayouts: [debugBGL] }),
      vertex: { module: debugModule, entryPoint: "vs" },
      fragment: { module: debugModule, entryPoint: "fs", targets: [{ format: gpu.format }] },
      primitive: { topology: "triangle-list" },
    });

    // --- Controls ---
    let viewMode = 4;
    let posterizeLevels = 4;
    let ditherModeIndex = 0;
    let paletteIndex = 0;
    const ditherModes: DitherMode[] = ["none", "bayer4", "bayer8", "bluenoise"];
    const paletteNames = ["none", ...Object.keys(PALETTES)];
    const modeLabels = ["Color", "Depth", "Normals", "ObjectID", "PixelArt"];

    function updateInfo() {
      const src = useGltf ? "glTF" : "Cubes";
      const sh = shadowsEnabled ? "ON" : "OFF";
      const dn = dayNightEnabled ? "ON" : "OFF";
      infoDiv.textContent = `[${src}] ${modeLabels[viewMode]} | Lvl:${posterizeLevels} Dither:${ditherModes[ditherModeIndex]} Pal:${paletteNames[paletteIndex]} Shadow:${sh} DayNight:${dn} | +/- D P G S N 1-5`;
    }

    window.addEventListener("keydown", (e) => {
      const key = parseInt(e.key);
      if (key >= 1 && key <= 5) { viewMode = key - 1; updateInfo(); }
      if (e.key === "+" || e.key === "=") {
        posterizeLevels = Math.min(posterizeLevels + 1, 16);
        updatePosterizeLevels(device, posterize, posterizeLevels);
        updateDitherParams(device, dither, PIXEL_RES[0], PIXEL_RES[1], ditherModes[ditherModeIndex], posterizeLevels, 0.5);
        updateInfo();
      }
      if (e.key === "-" || e.key === "_") {
        posterizeLevels = Math.max(posterizeLevels - 1, 2);
        updatePosterizeLevels(device, posterize, posterizeLevels);
        updateDitherParams(device, dither, PIXEL_RES[0], PIXEL_RES[1], ditherModes[ditherModeIndex], posterizeLevels, 0.5);
        updateInfo();
      }
      if (e.key === "d" || e.key === "D") {
        ditherModeIndex = (ditherModeIndex + 1) % ditherModes.length;
        updateDitherParams(device, dither, PIXEL_RES[0], PIXEL_RES[1], ditherModes[ditherModeIndex], posterizeLevels, 0.5);
        updateInfo();
      }
      if (e.key === "p" || e.key === "P") {
        paletteIndex = (paletteIndex + 1) % paletteNames.length;
        const name = paletteNames[paletteIndex];
        setPalette(device, palette, PIXEL_RES[0], PIXEL_RES[1], name === "none" ? null : PALETTES[name]);
        updateInfo();
      }
      if (e.key === "g" || e.key === "G") {
        if (gltfMeshes) {
          useGltf = !useGltf;
          activeMeshes = useGltf ? gltfMeshes! : cubeMeshes;
          meshGPUs = buildMeshGPUs(activeMeshes);
          updateInfo();
        }
      }
      if (e.key === "s" || e.key === "S") {
        shadowsEnabled = !shadowsEnabled;
        updateInfo();
      }
      if (e.key === "n" || e.key === "N") {
        dayNightEnabled = !dayNightEnabled;
        updateInfo();
      }
    });

    updateInfo();
    let time = 0;
    let frameCount = 0;

    // --- Render loop ---
    function frame() {
      try {
      time += 0.016;
      frameCount++;

      if (frameCount === 1) console.log("[PixelSinter] First frame starting...");

      // Capture GPU errors on first few frames
      if (frameCount <= 3) {
        device.pushErrorScope("validation");
      }

      // Animate cube scene objects (skip for glTF)
      if (!useGltf && activeMeshes.length >= 4) {
        activeMeshes[1].transform.rotation[1] = time * 0.8;
        activeMeshes[2].transform.rotation[1] = -time * 0.6;
        activeMeshes[3].transform.rotation[0] = time * 1.2;
        activeMeshes[3].transform.rotation[1] = time * 0.9;
      }

      // Animate point lights (gentle orbit)
      pointLights[0].position = [Math.sin(time * 0.5) * 3, 1.5, Math.cos(time * 0.5) * 3];
      pointLights[1].position = [Math.cos(time * 0.3) * 3, 1.0, Math.sin(time * 0.3) * -3];
      if (pointLights[2]) {
        pointLights[2].position = [Math.sin(time * 0.7) * 2, 2.0 + Math.sin(time) * 0.5, Math.cos(time * 0.7) * 2];
      }

      // Day/night cycle (toggle with N key)
      if (dayNightEnabled) {
        const dayPhase = time * 0.15; // full cycle ~42s
        const sunY = Math.sin(dayPhase);
        const sunX = Math.cos(dayPhase) * 0.5;
        const sunZ = Math.cos(dayPhase) * 0.8;
        directionalLight.direction = vec3_normalize([sunX, Math.max(sunY, 0.05), sunZ]);

        const dayFactor = Math.max(0, sunY);
        directionalLight.intensity = 0.3 + dayFactor * 1.0;
        directionalLight.color = [0.4 + dayFactor * 0.6, 0.3 + dayFactor * 0.65, 0.5 + dayFactor * 0.4];
        ambientLight.intensity = 0.15 + dayFactor * 0.2;
        ambientLight.color = [0.3 + dayFactor * 0.3, 0.3 + dayFactor * 0.35, 0.5 + dayFactor * 0.3];

        // Update shadow map light direction
        const ld = directionalLight.direction;
        const lp: [number, number, number] = [ld[0] * 16, ld[1] * 16, ld[2] * 16];
        const lv = mat4_multiply(
          mat4_ortho(-8, 8, -8, 8, 0.1, 32),
          mat4_lookAt(lp, [0, 0, 0], [0, 1, 0]),
        );
        device.queue.writeBuffer(shadow.uniformBuffer, 0, lv);
        shadow.lightViewProjection = lv;
      }

      uploadLights();

      // Update camera
      camera.position = orbit.getEyePosition();
      camera.target = orbit.target;
      const vp = mat4_multiply(camera.getProjectionMatrix(), camera.getViewMatrix());
      device.queue.writeBuffer(cameraBuffer, 0, vp);
      device.queue.writeBuffer(cameraBuffer, 64, shadow.lightViewProjection);
      device.queue.writeBuffer(cameraBuffer, 128, new Uint32Array([shadowsEnabled ? 1 : 0, 0, 0, 0]));

      // Update per-mesh uniforms
      for (const mg of meshGPUs) {
        const model = mg.mesh.transform.getModelMatrix();
        device.queue.writeBuffer(mg.uniformBuffer, 0, model);
        device.queue.writeBuffer(mg.uniformBuffer, 64, mat4_normalMatrix(model));
        device.queue.writeBuffer(mg.uniformBuffer, 128, new Float32Array([
          mg.mesh.material.albedo[0], mg.mesh.material.albedo[1], mg.mesh.material.albedo[2],
          mg.mesh.material.objectId,
        ]));
      }

      const encoder = device.createCommandEncoder();

      // Shadow map pass (render depth from light's perspective)
      if (shadowsEnabled) {
        const shadowPass = encoder.beginRenderPass({
          colorAttachments: [],
          depthStencilAttachment: {
            view: shadow.depthView,
            depthClearValue: 1.0,
            depthLoadOp: "clear",
            depthStoreOp: "store",
          },
        });
        shadowPass.setPipeline(shadow.pipeline);
        shadowPass.setBindGroup(0, shadow.cameraBindGroup);
        for (const mg of meshGPUs) {
          const geo = mg.mesh.geometry;
          shadowPass.setVertexBuffer(0, geo.vertexBuffer);
          shadowPass.setIndexBuffer(geo.indexBuffer, geo.indexFormat);
          shadowPass.setBindGroup(1, mg.bindGroup);
          shadowPass.drawIndexed(geo.indexCount);
        }
        // Instanced rocks in shadow
        shadowPass.setPipeline(shadowInstancedPipeline);
        shadowPass.setBindGroup(0, shadowCameraBG);
        shadowPass.setBindGroup(1, shadowRockBindGroup);
        shadowPass.setVertexBuffer(0, rockMesh.geometry.vertexBuffer);
        shadowPass.setIndexBuffer(rockMesh.geometry.indexBuffer, rockMesh.geometry.indexFormat);
        shadowPass.drawIndexed(rockMesh.geometry.indexCount, rockMesh.instanceCount);
        shadowPass.end();
      }

      // G-Buffer MRT pass
      const gbufferPass = encoder.beginRenderPass({
        colorAttachments: [
          { view: gbuffer.color.createView(), clearValue: { r: 0.15, g: 0.15, b: 0.22, a: 1 }, loadOp: "clear", storeOp: "store" },
          { view: gbuffer.normals.createView(), clearValue: { r: 0.5, g: 0.5, b: 0.5, a: 1 }, loadOp: "clear", storeOp: "store" },
          { view: gbuffer.objectId.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: "clear", storeOp: "store" },
          { view: gbuffer.depthColor.createView(), clearValue: { r: 100, g: 0, b: 0, a: 0 }, loadOp: "clear", storeOp: "store" },
        ],
        depthStencilAttachment: { view: gbuffer.depth.createView(), depthClearValue: 1.0, depthLoadOp: "clear", depthStoreOp: "store" },
      });
      gbufferPass.setPipeline(gbufferPipeline);
      gbufferPass.setBindGroup(0, globalBG);

      // Draw each mesh with its own geometry and uniforms
      for (const mg of meshGPUs) {
        const geo = mg.mesh.geometry;
        gbufferPass.setVertexBuffer(0, geo.vertexBuffer);
        gbufferPass.setIndexBuffer(geo.indexBuffer, geo.indexFormat);
        gbufferPass.setBindGroup(1, mg.bindGroup);
        gbufferPass.drawIndexed(geo.indexCount);
      }

      // Draw instanced rocks (60 instances in 1 draw call)
      gbufferPass.setPipeline(instancedPipeline);
      gbufferPass.setBindGroup(0, globalBG);
      gbufferPass.setBindGroup(1, rockBindGroup);
      gbufferPass.setVertexBuffer(0, rockMesh.geometry.vertexBuffer);
      gbufferPass.setIndexBuffer(rockMesh.geometry.indexBuffer, rockMesh.geometry.indexFormat);
      gbufferPass.drawIndexed(rockMesh.geometry.indexCount, rockMesh.instanceCount);

      gbufferPass.end();

      if (viewMode === 4) {
        // Stylize pipeline
        // Step 1: Downscale full-res G-Buffer → low-res
        const ds = encoder.beginComputePass(); ds.setPipeline(downscale.pipeline); ds.setBindGroup(0, downscale.bindGroup); ds.dispatchWorkgroups(downscale.workgroupsX, downscale.workgroupsY); ds.end();

        // Step 2: Posterize (color→stylized) — always runs for clean quantization
        const ps = encoder.beginComputePass(); ps.setPipeline(posterize.pipeline); ps.setBindGroup(0, posterize.bindGroup); ps.dispatchWorkgroups(posterize.workgroupsX, posterize.workgroupsY); ps.end();

        // Step 3: Dither (reads raw color→stylized, overwrites posterize when active; passthrough when none)
        const dt = encoder.beginComputePass(); dt.setPipeline(dither.pipeline); dt.setBindGroup(0, dither.bindGroup); dt.dispatchWorkgroups(dither.workgroupsX, dither.workgroupsY); dt.end();

        // Step 4: Edges (stylized→color)
        const ed = encoder.beginComputePass(); ed.setPipeline(edges.pipeline); ed.setBindGroup(0, edges.bindGroup); ed.dispatchWorkgroups(edges.workgroupsX, edges.workgroupsY); ed.end();

        // Step 5: Palette (color→stylized)
        const pl = encoder.beginComputePass(); pl.setPipeline(palette.pipeline); pl.setBindGroup(0, palette.bindGroup); pl.dispatchWorkgroups(palette.workgroupsX, palette.workgroupsY); pl.end();

        // Upscale
        const up = encoder.beginRenderPass({ colorAttachments: [{ view: gpu.context.getCurrentTexture().createView(), clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: "clear", storeOp: "store" }] });
        up.setPipeline(upscalePipeline); up.setBindGroup(0, upscaleBG); up.draw(3); up.end();
      } else {
        // Debug view
        const dd = new ArrayBuffer(16); const dv = new DataView(dd);
        dv.setFloat32(0, canvas.width, true); dv.setFloat32(4, canvas.height, true); dv.setUint32(8, viewMode, true);
        device.queue.writeBuffer(debugUniformBuffer, 0, dd);
        const dbg = encoder.beginRenderPass({ colorAttachments: [{ view: gpu.context.getCurrentTexture().createView(), clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: "clear", storeOp: "store" }] });
        dbg.setPipeline(debugPipeline); dbg.setBindGroup(0, debugBG); dbg.draw(3); dbg.end();
      }

      device.queue.submit([encoder.finish()]);

      if (frameCount <= 3) {
        device.popErrorScope().then((err) => {
          if (err) console.error(`[GPU VALIDATION ERROR frame ${frameCount}]:`, err.message);
          else if (frameCount === 1) console.log("[GPU] Frame 1 — no validation errors");
        });
      }

      if (frameCount === 1) console.log("[PixelSinter] First frame submitted.");
      requestAnimationFrame(frame);
      } catch (e) {
        console.error("[PixelSinter] FRAME ERROR:", e);
      }
    }

    requestAnimationFrame(frame);
    console.log(`[PixelSinter] Ready. ${activeMeshes.length} meshes. Press G to toggle glTF/cubes.`);

  } catch (err) {
    console.error(err);
    errorDiv.style.display = "block";
    errorDiv.textContent = `${err}`;
  }
}

main();
