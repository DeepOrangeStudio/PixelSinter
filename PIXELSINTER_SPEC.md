# PixelSinter — Spec Technique (CLAUDE.md)

## Vue d'ensemble

PixelSinter est une bibliothèque de rendu 3D pixel art en TypeScript + WebGPU.
Elle prend une scène 3D (meshes, lumières, caméra, paramètres de style) et produit une image pixel art en temps réel dans un `<canvas>` HTML.

Ce n'est PAS un game engine. Pas de game loop, pas d'input, pas de physique, pas d'audio.
C'est un renderer pur : `scene + camera + style → pixels`.

Lire `PIXELSINTER_VISION.md` pour le contexte complet du projet (références, principes, positionnement).

---

## Stack technique

- **Langage :** TypeScript (strict mode)
- **GPU API :** WebGPU natif (pas de fallback WebGL)
- **Shaders :** WGSL (tous dans `src/shaders/`)
- **Build :** Bun (bundler + dev server + runtime)
- **Assets :** glTF 2.0 (primaire), OBJ (secondaire), FBX (via conversion)
- **Package :** npm sous le nom `pixelsinter`
- **License :** MIT

---

## Structure du projet

```
pixelsinter/
├── src/
│   ├── core/              # WebGPU device, canvas, resource management
│   │   ├── gpu.ts         # Initialisation WebGPU (adapter, device, context)
│   │   ├── canvas.ts      # Canvas setup, resize handling, pixel ratio
│   │   └── resources.ts   # Texture/buffer creation helpers
│   │
│   ├── gbuffer/           # G-Buffer render pass
│   │   ├── gbuffer.ts     # G-Buffer setup (4 render targets MRT)
│   │   └── gbuffer-pass.ts # Render pass qui écrit dans le G-Buffer
│   │
│   ├── stylize/           # Pipeline de stylisation pixel art
│   │   ├── downscale.ts   # Downscale point filtering vers résolution cible
│   │   ├── posterize.ts   # Posterization OKLab (compute pass)
│   │   ├── edges.ts       # Edge detection depth+normals+objectID (compute pass)
│   │   ├── dither.ts      # Dithering Bayer/Blue Noise (compute pass)
│   │   ├── palette.ts     # Palette mapping via LUT (compute pass)
│   │   ├── upscale.ts     # Upscale nearest neighbor vers résolution écran
│   │   └── compositor.ts  # Orchestre les passes de stylisation dans l'ordre
│   │
│   ├── mode-a/            # Pipeline ortho (camera snap + sub-pixel compensation)
│   │   └── ortho.ts       # Camera snapping, sub-pixel offset
│   │
│   ├── mode-b/            # Pipeline perspective (texel splatting) — Phase 3
│   │   ├── probe.ts       # Cubemap capture depuis probe grid-snappé
│   │   ├── shade.ts       # Compute pass shading en cubemap-space
│   │   └── splat.ts       # Splatting des texels en world-space quads
│   │
│   ├── scene/             # Scene graph minimal
│   │   ├── scene.ts       # Container de la scène (meshes, lights)
│   │   ├── mesh.ts        # Mesh (geometry + material + transform)
│   │   ├── geometry.ts    # Vertex buffers, index buffer, primitives
│   │   ├── material.ts    # Material pixel art (couleurs highlight/mid/shadow, outline)
│   │   ├── transform.ts   # Position, rotation, scale (matrice 4x4)
│   │   ├── camera.ts      # Caméra ortho + perspective, projection matrices
│   │   └── light.ts       # Directional light, point light, ambient
│   │
│   ├── loaders/           # Chargement d'assets
│   │   ├── gltf.ts        # Loader glTF 2.0 (.gltf + .glb)
│   │   ├── obj.ts         # Loader OBJ (.obj + .mtl)
│   │   └── fbx.ts         # Loader FBX (via conversion ou lib tierce)
│   │
│   ├── shaders/           # Tous les shaders WGSL
│   │   ├── gbuffer.wgsl          # Vertex + fragment pour le G-Buffer
│   │   ├── downscale.wgsl        # Compute: downscale point filtering
│   │   ├── posterize.wgsl        # Compute: OKLab posterization
│   │   ├── edges.wgsl            # Compute: edge detection 4-voisins
│   │   ├── dither.wgsl           # Compute: dithering Bayer/Blue Noise
│   │   ├── palette.wgsl          # Compute: palette mapping LUT
│   │   ├── upscale.wgsl          # Fragment: fullscreen quad nearest upscale
│   │   ├── debug.wgsl            # Fragment: visualisation debug des buffers
│   │   └── common.wgsl           # Fonctions partagées (OKLab conversions, math)
│   │
│   ├── renderer.ts        # Classe principale PixelSinterRenderer
│   ├── config.ts          # Types de configuration (style, résolution, palette)
│   └── index.ts           # Export public de la bibliothèque
│
├── demo/
│   ├── index.html         # Page HTML de démo
│   ├── demo.ts            # Script de démo (scène, orbit camera, UI)
│   └── assets/            # Modèles de test (cube.glb, suzanne.glb, etc.)
│
├── package.json
├── tsconfig.json
├── bunfig.toml
├── CLAUDE.md              # CE FICHIER
├── PIXELSINTER_VISION.md  # Document de vision
└── README.md
```

---

## Conventions de code

### TypeScript
- Strict mode activé (`"strict": true` dans tsconfig)
- Pas de `any` — typer explicitement tout
- Noms de classes en PascalCase : `PixelSinterRenderer`, `GBuffer`, `OrthoCamera`
- Noms de fonctions/variables en camelCase : `createGBuffer`, `pixelResolution`
- Noms de constantes en UPPER_SNAKE_CASE : `DEFAULT_PIXEL_RESOLUTION`, `MAX_LIGHTS`
- Un fichier = une responsabilité. Pas de fichiers de plus de 300 lignes
- Exports nommés uniquement (pas de `export default`)

### WGSL
- Un fichier `.wgsl` par pass/shader
- Fonctions partagées dans `common.wgsl` (incluses manuellement via string concatenation au build — WGSL n'a pas de `#include`)
- Noms de fonctions en snake_case : `linear_to_oklab`, `detect_edges`
- Noms d'uniforms en camelCase : `pixelResolution`, `posterizeLevels`
- Commentaires explicites sur chaque bind group et binding

### Commits
- Un commit par étape fonctionnelle (1.1, 1.2, etc.)
- Message format : `[1.X] description courte`
- Chaque commit doit laisser le projet dans un état fonctionnel (pas de code cassé)

---

## Configuration du renderer

### Interface TypeScript principale

```typescript
interface PixelSinterConfig {
  canvas: HTMLCanvasElement;
  pixelResolution: [number, number];     // défaut: [320, 180]
  mode: 'ortho' | 'perspective';         // défaut: 'ortho'
  style: PixelSinterStyle;
}

interface PixelSinterStyle {
  // Posterization
  posterizeLevels: number;               // défaut: 4 (nombre de paliers de luminosité)

  // Outlines
  outlineMode: 'color' | 'luminance';    // défaut: 'color'
  outlineColor: [number, number, number]; // défaut: [0, 0, 0] (noir), pour mode 'color'
  outlineLuminanceShift: number;         // défaut: -0.3, pour mode 'luminance'
  depthThreshold: number;               // défaut: 0.1 (seuil de discontinuité depth)
  normalThreshold: number;              // défaut: 0.5 (seuil de discontinuité normales)

  // Dithering
  ditherMode: 'none' | 'bayer4' | 'bayer8' | 'bluenoise'; // défaut: 'none'
  ditherStrength: number;               // défaut: 0.5 (0 = pas d'effet, 1 = full)

  // Palette
  palette: null | number[][];           // défaut: null (pas de mapping)
                                         // Format: [[r,g,b], [r,g,b], ...] en 0-255
}

interface PixelSinterMaterial {
  albedo: [number, number, number];      // couleur de base (0-1)
  highlightColor?: [number, number, number]; // override couleur highlight
  midtoneColor?: [number, number, number];   // override couleur midtone
  shadowColor?: [number, number, number];    // override couleur shadow
  outlineEnabled: boolean;               // défaut: true
  outlineColor?: [number, number, number];   // override outline par matériau
  objectId: number;                      // assigné automatiquement
}
```

### API publique minimale

```typescript
// Initialisation
const renderer = await PixelSinterRenderer.create(config);

// Scène
const scene = new Scene();
const mesh = new Mesh(geometry, material, transform);
scene.add(mesh);
scene.addLight(new DirectionalLight(direction, color, intensity));

// Caméra
const camera = new OrthoCamera(width, height, near, far);
// ou
const camera = new PerspectiveCamera(fov, aspect, near, far);

// Rendu (appelé chaque frame par le consommateur)
renderer.render(scene, camera);

// Mise à jour du style en temps réel
renderer.setStyle({ posterizeLevels: 3, ditherMode: 'bayer4' });

// Resize
renderer.resize(newWidth, newHeight);

// Debug (visualiser un buffer spécifique)
renderer.setDebugView('color' | 'depth' | 'normals' | 'objectId' | 'none');

// Nettoyage
renderer.destroy();
```

---

## Pipeline de rendu — Détail technique

### Vue d'ensemble du pipeline par frame

```
renderer.render(scene, camera) fait :

1. Update des matrices (model, view, projection, MVP par mesh)
2. G-Buffer Pass (rasterisation MRT pleine résolution)
3. Downscale Pass (pleine résolution → résolution pixel art, point filtering)
4. Posterize Pass (compute: OKLab quantification sur la basse résolution)
5. Edge Pass (compute: détection d'edges sur depth+normals+objectID basse résolution)
6. Dither Pass (compute: application dithering si activé)
7. Palette Pass (compute: mapping couleur si palette définie)
8. Upscale Pass (basse résolution → résolution écran, nearest neighbor, fullscreen quad)
```

### Détails par pass

#### Pass 1 — G-Buffer (rasterisation)

**Type :** Render pass avec MRT (Multiple Render Targets)
**Résolution :** Pleine résolution écran (ex: 1920×1080)

**Render targets :**
| Attachment | Format | Contenu |
|------------|--------|---------|
| color0 | `rgba8unorm` | Albedo × éclairage (diffuse Lambert + ambient) |
| color1 | `rgba8snorm` | Normales world-space (XYZ dans RGB, A libre) |
| color2 | `r32uint` | Object ID (entier unique par mesh) |
| depth | `depth24plus` | Depth buffer natif |

**Vertex shader (`gbuffer.wgsl`) :**
- Input : position, normal, UV (depuis vertex buffer)
- Uniforms : model matrix, view matrix, projection matrix, normal matrix
- Output : clip position, world position, world normal, UV

**Fragment shader (`gbuffer.wgsl`) :**
- Calcul Lambert diffuse : `max(dot(normal, lightDir), 0.0) × lightColor × lightIntensity`
- Ambient : `ambientColor × ambientIntensity`
- Color output = `albedo × (diffuse + ambient)`
- Normal output = `worldNormal × 0.5 + 0.5` (remapped en 0-1 pour le stockage)
- ObjectID output = `mesh.objectId`

**Depth buffer** : copié dans une texture `r32float` séparée après le render pass pour lecture dans le compute d'edge detection (WebGPU ne permet pas de sampler un depth attachment directement en compute).

#### Pass 2 — Downscale (point filtering)

**Type :** Compute pass
**Input :** G-Buffer color (pleine résolution), G-Buffer depth (pleine résolution), G-Buffer normals (pleine résolution), G-Buffer objectID (pleine résolution)
**Output :** 4 textures basse résolution (ex: 320×180)

**Logique (`downscale.wgsl`) :**
Pour chaque pixel (x,y) de la texture basse résolution :
```
sourceX = floor(x × (sourceWidth / targetWidth))
sourceY = floor(y × (sourceHeight / targetHeight))
output[x,y] = source[sourceX, sourceY]   // point sampling, pas d'interpolation
```
On downscale les 4 buffers avec la même logique. Le depth et les normals doivent être downscalés en point filtering aussi (pas de moyenne — on veut la valeur exacte du pixel central).

#### Pass 3 — Posterize (OKLab)

**Type :** Compute pass
**Input :** Color basse résolution (`rgba8unorm`)
**Output :** Color posterisée basse résolution (`rgba8unorm`) — même texture, in-place

**Logique (`posterize.wgsl`) :**
```
// Conversions dans common.wgsl
fn linear_to_oklab(c: vec3f) -> vec3f { ... }
fn oklab_to_linear(lab: vec3f) -> vec3f { ... }

// Posterize
let linear = color.rgb;  // déjà en linear (WebGPU travaille en linear)
let lab = linear_to_oklab(linear);
let L = lab.x;  // luminosité 0-1
let quantized_L = floor(L * levels + 0.5) / levels;  // quantification
lab.x = quantized_L;
let result = oklab_to_linear(lab);
output = vec4f(result, 1.0);
```

**Conversions OKLab (dans `common.wgsl`) :**
Linear RGB → LMS (matrice 3×3) → cube root → OKLab (matrice 3×3).
Inverse : OKLab → LMS (matrice 3×3 inverse) → cube → linear RGB (matrice 3×3 inverse).
Source : Björn Ottosson (bottosson.github.io/posts/oklab).

#### Pass 4 — Edge Detection

**Type :** Compute pass
**Input :** Depth basse résolution (`r32float`), Normals basse résolution (`rgba8snorm`), ObjectID basse résolution (`r32uint`)
**Output :** Edge mask basse résolution (`r8unorm`, 0 = pas d'edge, 1 = edge)

**Logique (`edges.wgsl`) :**
```
// Échantillonnage des 4 voisins (haut, bas, gauche, droite)
let depth_c = depth[x, y];
let depth_u = depth[x, y-1];
let depth_d = depth[x, y+1];
let depth_l = depth[x-1, y];
let depth_r = depth[x+1, y];

// Discontinuité de profondeur → silhouette
let depth_diff = max(
  max(abs(depth_c - depth_u), abs(depth_c - depth_d)),
  max(abs(depth_c - depth_l), abs(depth_c - depth_r))
);
let depth_edge = step(depthThreshold, depth_diff);

// Discontinuité de normales → crease
let normal_c = normals[x, y].xyz;
let normal_u = normals[x, y-1].xyz;
// ... (même pattern pour les 4 voisins)
let normal_diff = max(
  max(1.0 - dot(normal_c, normal_u), 1.0 - dot(normal_c, normal_d)),
  max(1.0 - dot(normal_c, normal_l), 1.0 - dot(normal_c, normal_r))
);
let normal_edge = step(normalThreshold, normal_diff);

// Discontinuité d'object ID → séparation d'objets
let id_c = objectId[x, y];
let id_edge = (id_c != objectId[x,y-1] || id_c != objectId[x,y+1]
            || id_c != objectId[x-1,y] || id_c != objectId[x+1,y]) ? 1.0 : 0.0;

// Résultat combiné
edge_mask[x, y] = max(depth_edge, max(normal_edge, id_edge));
```

**Application des edges sur la couleur :**
Après le compute d'edges, un second compute (ou intégré dans le même) applique les edges :
- Mode `'color'` : si `edge_mask > 0`, remplacer la couleur par `outlineColor`
- Mode `'luminance'` : si `edge_mask > 0`, convertir en OKLab, shifter L de `outlineLuminanceShift`, reconvertir

#### Pass 5 — Dithering

**Type :** Compute pass (skip si `ditherMode === 'none'`)
**Input :** Color posterisée + edges appliquées (basse résolution)
**Output :** Color dithered (même texture, in-place)

**Logique (`dither.wgsl`) :**
```
// Matrice Bayer 4×4 (hardcodée)
const BAYER4: array<array<f32, 4>, 4> = ...;

// Seuil Bayer pour ce pixel
let bayer_value = BAYER4[x % 4][y % 4];  // 0.0 - 1.0

// Convertir en OKLab
let lab = linear_to_oklab(color.rgb);
let L = lab.x;

// Calculer la position entre deux paliers
let level_size = 1.0 / f32(posterizeLevels);
let frac = fract(L / level_size);  // position dans le palier (0-1)

// Si la position fractionnelle dépasse le seuil Bayer, monter au palier suivant
if (frac > bayer_value * ditherStrength) {
  lab.x = ceil(L / level_size) * level_size;
} else {
  lab.x = floor(L / level_size) * level_size;
}

output = vec4f(oklab_to_linear(lab), 1.0);
```

Pour le blue noise : même logique mais le seuil vient d'une texture de bruit bleu 64×64 tilable (chargée comme texture, samplée avec `x % 64, y % 64`).

#### Pass 6 — Palette Mapping

**Type :** Compute pass (skip si `palette === null`)
**Input :** Color finalisée (basse résolution)
**Output :** Color remappée (même texture, in-place)

**Logique (`palette.wgsl`) :**
```
// La palette est stockée comme un storage buffer de vec3f (couleurs en OKLab)
// Pré-calculé côté CPU au chargement de la palette

let lab = linear_to_oklab(color.rgb);
var best_dist = 999999.0;
var best_color = vec3f(0.0);

for (var i = 0u; i < paletteSize; i++) {
  let palette_lab = paletteColors[i];
  let dist = distance(lab, palette_lab);
  if (dist < best_dist) {
    best_dist = dist;
    best_color = palette_lab;
  }
}

output = vec4f(oklab_to_linear(best_color), 1.0);
```

Note : pour des palettes de plus de 32 couleurs, on pourra optimiser avec une LUT 3D. Pour la v1, la boucle brute force est suffisante sur 57 600 pixels (320×180).

#### Pass 7 — Upscale (nearest neighbor)

**Type :** Render pass (fullscreen triangle)
**Input :** Texture basse résolution finale
**Output :** Swap chain (écran)

**Logique (`upscale.wgsl`) :**
Un fullscreen triangle qui sample la texture basse résolution avec un sampler `nearest` (point filtering). WebGPU gère le scaling automatiquement — on dessine juste un triangle plein écran et on sample avec les UVs appropriés.

```
// Vertex shader : fullscreen triangle (3 vertices, pas de vertex buffer)
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let uv = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(uv * 2.0 - 1.0, 0.0, 1.0);
}

// Fragment shader : sample nearest
@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let uv = pos.xy / outputResolution;
  return textureSample(lowResTexture, nearestSampler, uv);
}
```

---

## G-Buffer — Format des textures

| Buffer | Format WebGPU | Taille (1080p) | Contenu |
|--------|---------------|----------------|---------|
| Color | `rgba8unorm` | 8.3 MB | Albedo × éclairage |
| Depth (copy) | `r32float` | 8.3 MB | Linear eye depth |
| Normals | `rgba8snorm` | 8.3 MB | World-space normals XYZ |
| Object ID | `r32uint` | 8.3 MB | ID unique par mesh |
| Depth (native) | `depth24plus` | 6.2 MB | Depth buffer pour z-test |

Total GPU : ~39 MB pour le G-Buffer pleine résolution.
Textures basse résolution (320×180) : ~1 MB au total.

---

## Éclairage

### Phase 1 : éclairage minimal
- 1 directional light (direction, couleur, intensité)
- 1 ambient light (couleur, intensité)
- Diffuse Lambert : `max(dot(N, L), 0.0)`
- Pas de spéculaire (le cel-shading le rend inutile en pixel art)
- Pas d'ombres (Phase 2)

### Phase 2 : éclairage étendu
- Jusqu'à 4 point lights
- Shadow map basique pour la directional light
- Cel-shading des ombres (ombre = un palier de luminosité en moins)

### Uniforms d'éclairage
```wgsl
struct DirectionalLight {
  direction: vec3f,
  color: vec3f,
  intensity: f32,
}

struct AmbientLight {
  color: vec3f,
  intensity: f32,
}
```

---

## Chargement d'assets

### glTF 2.0 (priorité haute)
- Support `.gltf` (JSON + fichiers séparés) et `.glb` (binaire)
- Phase 1 : meshes statiques uniquement (positions, normals, UVs, indices)
- Phase 2 : animations (skeletal, morph targets)
- Utiliser une lib existante pour le parsing (`@gltf-transform/core` ou parser custom léger)
- Les materials glTF (PBR) sont ignorés — on utilise `PixelSinterMaterial` à la place
- L'albedo glTF (baseColorFactor/baseColorTexture) est converti en albedo PixelSinter

### OBJ (priorité moyenne)
- Parser custom léger (format texte simple)
- Support positions, normals, UVs, faces triangulées et quads
- Support fichiers `.mtl` pour les couleurs de base (Kd)
- Pas de support des textures OBJ (on utilise vertex colors ou material PixelSinter)

### FBX (priorité basse)
- Format binaire propriétaire, complexe à parser
- Option A : utiliser une lib WASM (fbx2gltf compilé en WASM)
- Option B : documenter que l'utilisateur doit convertir en glTF avant
- Phase 1 : pas de support natif, conversion recommandée
- Phase ultérieure : évaluer l'intégration d'un parser

---

## Caméra

### OrthoCamera (Mode A)
```typescript
class OrthoCamera {
  width: number;       // largeur visible en world units
  height: number;      // hauteur visible en world units
  near: number;        // plan near
  far: number;         // plan far
  position: Vec3;      // position world
  target: Vec3;        // point regardé
  up: Vec3;            // vecteur up (défaut: [0,1,0])
}
```

**Camera snapping (Mode A) :**
Pour éviter le pixel creep en ortho, la position de la caméra est snappée sur une grille de taille `texelSize` (calculé depuis la résolution pixel art et la taille visible) :
```
texelSizeX = camera.width / pixelResolution[0]
texelSizeY = camera.height / pixelResolution[1]
snappedX = round(camera.position.x / texelSizeX) * texelSizeX
snappedY = round(camera.position.y / texelSizeY) * texelSizeY
```
La différence entre la position originale et la position snappée est compensée en screen-space dans le upscale pass (sub-pixel offset).

### PerspectiveCamera (Mode B — Phase 3)
```typescript
class PerspectiveCamera {
  fov: number;         // field of view en degrés
  aspect: number;      // ratio largeur/hauteur
  near: number;
  far: number;
  position: Vec3;
  target: Vec3;
  up: Vec3;
}
```

### OrbitController (démo uniquement)
```typescript
class OrbitController {
  camera: OrthoCamera | PerspectiveCamera;
  target: Vec3;        // point autour duquel on orbite
  distance: number;    // distance au target
  theta: number;       // angle horizontal (radians)
  phi: number;         // angle vertical (radians)
  zoomSpeed: number;
  rotateSpeed: number;
  panSpeed: number;
}
```
- Clic gauche drag = rotation (theta/phi)
- Scroll = zoom (distance)
- Clic droit drag = pan (déplacement du target)
- L'orbit controller vit dans `demo/`, pas dans `src/` — ce n'est pas une responsabilité du renderer

---

## Maths utilitaires

### Nécessaires dès l'étape 1.1
Implémentés dans `src/core/math.ts` (pas de dépendance externe type gl-matrix — on écrit le minimum nécessaire) :

```typescript
type Vec3 = [number, number, number];
type Vec4 = [number, number, number, number];
type Mat4 = Float32Array; // 16 floats, column-major (convention WebGPU)

// Fonctions requises :
mat4_identity(): Mat4
mat4_multiply(a: Mat4, b: Mat4): Mat4
mat4_perspective(fov: number, aspect: number, near: number, far: number): Mat4
mat4_ortho(left: number, right: number, bottom: number, top: number, near: number, far: number): Mat4
mat4_lookAt(eye: Vec3, target: Vec3, up: Vec3): Mat4
mat4_translate(m: Mat4, v: Vec3): Mat4
mat4_rotateX(m: Mat4, angle: number): Mat4
mat4_rotateY(m: Mat4, angle: number): Mat4
mat4_scale(m: Mat4, v: Vec3): Mat4
mat4_invert(m: Mat4): Mat4
mat4_transpose(m: Mat4): Mat4
mat4_normalMatrix(modelMatrix: Mat4): Mat4  // inverse transpose de la 3×3

vec3_normalize(v: Vec3): Vec3
vec3_cross(a: Vec3, b: Vec3): Vec3
vec3_dot(a: Vec3, b: Vec3): number
vec3_sub(a: Vec3, b: Vec3): Vec3
vec3_add(a: Vec3, b: Vec3): Vec3
vec3_scale(v: Vec3, s: number): Vec3
```

---

## Ordre d'implémentation (Phase 1)

Chaque étape est un commit indépendant qui laisse le projet fonctionnel.

### Étape 1.1 — Setup projet + Triangle WebGPU
**Objectif :** Un triangle coloré à l'écran. Validation du setup complet.
**Fichiers créés :**
- `package.json`, `tsconfig.json`, `bunfig.toml`
- `src/core/gpu.ts` — init WebGPU (adapter, device, context, swap chain format)
- `src/shaders/triangle.wgsl` — vertex+fragment shader minimal (hardcoded triangle)
- `demo/index.html` — page HTML avec `<canvas>`
- `demo/demo.ts` — script qui init le renderer et affiche le triangle
**Validation :** Un triangle RGB s'affiche dans le canvas.

### Étape 1.2 — Cube 3D + caméra orbitale
**Objectif :** Un cube 3D avec depth test et caméra orbitale.
**Fichiers créés :**
- `src/core/math.ts` — fonctions matricielles
- `src/scene/geometry.ts` — classe Geometry (vertex buffer, index buffer)
- `src/scene/transform.ts` — classe Transform (model matrix)
- `src/scene/camera.ts` — OrthoCamera + PerspectiveCamera
- `demo/orbit.ts` — OrbitController (mouse events)
**Fichiers modifiés :**
- `src/shaders/` — nouveau shader avec MVP matrix
- `demo/demo.ts` — remplacer triangle par cube
**Validation :** Un cube 3D tourne avec la souris. Depth test fonctionne (faces cachées correctement).

### Étape 1.3 — Éclairage basique
**Objectif :** Lambert diffuse + ambient sur le cube.
**Fichiers créés :**
- `src/scene/light.ts` — DirectionalLight, AmbientLight
- `src/scene/material.ts` — PixelSinterMaterial (albedo)
**Fichiers modifiés :**
- `src/shaders/gbuffer.wgsl` — ajout calcul diffuse Lambert
- Uniforms : lightDirection, lightColor, lightIntensity, ambientColor, ambientIntensity
**Validation :** Le cube est éclairé avec des ombres douces. Rotation de la lumière visible.

### Étape 1.4 — G-Buffer MRT
**Objectif :** Rendu dans 4 textures simultanées + mode debug.
**Fichiers créés :**
- `src/gbuffer/gbuffer.ts` — création des 4 render targets
- `src/gbuffer/gbuffer-pass.ts` — render pass MRT
- `src/shaders/debug.wgsl` — visualisation des buffers individuels
**Fichiers modifiés :**
- `src/shaders/gbuffer.wgsl` — outputs multiples (color, normal, objectID)
- `demo/demo.ts` — toggle debug view (touche 1-5)
**Validation :** Chaque buffer est visualisable individuellement. Le depth buffer montre un dégradé de profondeur, les normals montrent des couleurs RGB selon l'orientation.

### Étape 1.5 — Downscale + Upscale
**Objectif :** La scène est pixelisée. Premier "wow" visuel.
**Fichiers créés :**
- `src/stylize/downscale.ts` — compute pass downscale
- `src/stylize/upscale.ts` — fullscreen quad upscale nearest
- `src/shaders/downscale.wgsl`
- `src/shaders/upscale.wgsl`
- `src/config.ts` — PixelSinterConfig, PixelSinterStyle
**Validation :** La scène s'affiche en "gros pixels" nets. Le cube est pixelisé mais l'éclairage est encore lisse.

### Étape 1.6 — Posterization OKLab
**Objectif :** Les aplats de couleur apparaissent.
**Fichiers créés :**
- `src/stylize/posterize.ts` — compute pass posterization
- `src/shaders/posterize.wgsl`
- `src/shaders/common.wgsl` — fonctions OKLab
**Validation :** Le cube montre des aplats francs de couleur (3-4 niveaux). Changer le nombre de paliers en temps réel.

### Étape 1.7 — Edge Detection
**Objectif :** Les outlines apparaissent. Deuxième "wow".
**Fichiers créés :**
- `src/stylize/edges.ts` — compute pass edges
- `src/shaders/edges.wgsl`
**Validation :** Le cube a des outlines noires nettes de 1px (en résolution pixel art). Les edges de silhouette ET les edges de normales (arêtes du cube) sont visibles. Plusieurs objets dans la scène montrent des outlines distinctes via object ID.

### Étape 1.8 — Dithering
**Objectif :** Le look rétro se matérialise.
**Fichiers créés :**
- `src/stylize/dither.ts` — compute pass dithering
- `src/shaders/dither.wgsl`
- Texture blue noise 64×64 (générée ou incluse comme asset)
**Validation :** Les transitions entre paliers montrent un pattern Bayer visible. Switch entre Bayer 4×4, Bayer 8×8, blue noise, et aucun en temps réel.

### Étape 1.9 — Palette Mapping
**Objectif :** Le style final est là.
**Fichiers créés :**
- `src/stylize/palette.ts` — compute pass palette
- `src/shaders/palette.wgsl`
- Quelques palettes prédéfinies (GameBoy, PICO-8, CGA, Obra Dinn)
**Validation :** La scène entière est remappée vers une palette limitée. Switcher entre palettes en temps réel.

### Étape 1.10 — Chargement glTF
**Objectif :** Validation complète du pipeline sur un asset réel.
**Fichiers créés :**
- `src/loaders/gltf.ts` — parser glTF/GLB
- `src/scene/scene.ts` — container Scene
- `src/scene/mesh.ts` — classe Mesh (geometry + material + transform)
- `src/renderer.ts` — classe PixelSinterRenderer (orchestre tout)
- `src/stylize/compositor.ts` — orchestre les passes de stylisation
- `src/index.ts` — exports publics
**Fichiers modifiés :**
- `demo/demo.ts` — charger un modèle glTF au lieu du cube
- `demo/assets/` — ajouter un modèle de test (Suzanne, un personnage low-poly)
**Validation :** Un modèle glTF s'affiche en pixel art complet (posterisé, outliné, dithered, palette).

### Étape 1.11 — Loader OBJ
**Fichiers créés :**
- `src/loaders/obj.ts` — parser OBJ texte + MTL
**Validation :** Un fichier .obj s'affiche avec le même pipeline.

---

## Notes pour Claude Code

### Priorités
1. **Chaque étape doit compiler et afficher quelque chose.** Pas de code mort, pas de stubs vides. Si une étape est implémentée, elle fonctionne.
2. **Les shaders WGSL sont la partie critique.** Un bug dans un shader produit un écran noir sans message d'erreur. Ajouter des commentaires explicites dans chaque shader.
3. **Pas d'optimisation prématurée.** Le pipeline traite 57 600 pixels en basse résolution. Même un compute shader naïf sera instantané.
4. **Pas de dépendances lourdes.** Le seul `npm install` devrait être Bun + TypeScript. Les maths sont écrites à la main, les loaders sont custom ou légers.
5. **Tester visuellement à chaque étape.** Le mode debug (visualisation des buffers) doit être maintenu fonctionnel à tout moment.

### Pièges WebGPU connus
- `GPUTexture` ne peut pas être samplée ET utilisée comme render target dans le même pass → utiliser des textures séparées pour input/output
- Le depth buffer `depth24plus` ne peut pas être samplé directement dans un compute shader → copier dans un `r32float`
- Les formats `rgba8snorm` ne sont pas garantis comme render target sur tous les GPU → vérifier au runtime et fallback vers `rgba16float` si nécessaire
- `@builtin(vertex_index)` dans un fullscreen triangle sans vertex buffer fonctionne en WebGPU (pas besoin de vertex buffer pour le upscale)
- Les bind groups ont un maximum de bindings par groupe → répartir les textures sur plusieurs bind groups si nécessaire
- Les compute shaders doivent spécifier `@workgroup_size` — utiliser `(8, 8, 1)` pour les passes 2D (8×8 = 64 invocations par workgroup, bon compromis)

### Convention WGSL pour les bind groups
```
Group 0 : Uniforms globaux (caméra, lumières, style)
Group 1 : Textures d'entrée
Group 2 : Textures de sortie (storage textures)
Group 3 : Samplers
```

---

*Spec rédigée le 13 avril 2026 — DeepOrangeStudio*
*À utiliser avec PIXELSINTER_VISION.md pour le contexte complet*
