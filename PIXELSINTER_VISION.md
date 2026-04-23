# PixelSinter — Document de Vision

## Identité

**Nom :** PixelSinter
**Type :** Renderer 3D pixel art — bibliothèque de rendu pure, sans game engine
**Créateur :** DeepOrangeStudio (Tobias)
**License :** À définir (MIT envisagé pour maximiser l'adoption)
**Tagline :** *"Every pixel is a choice."*

---

## Pitch

PixelSinter est une bibliothèque de rendu spécialisée qui transforme des scènes 3D en pixel art en temps réel, directement dans le navigateur via WebGPU. Contrairement aux moteurs généralistes qui ajoutent un filtre rétro par-dessus un rendu classique, PixelSinter est conçu dès le départ pour que chaque pixel à l'écran soit un choix délibéré — comme si un artiste pixel art l'avait placé.

PixelSinter est **un renderer pur, pas un game engine**. Il prend une scène (meshes, lumières, caméra, paramètres de style) et produit une image pixel art. Il ne gère pas la game loop, l'input, la physique ou l'audio. Un game engine séparé pourra être construit par-dessus plus tard, ou n'importe quel développeur peut intégrer PixelSinter dans son propre framework.

Cette séparation permet de valider le rendu visuel rapidement et indépendamment, et de faire évoluer le renderer et le game engine en parallèle sans couplage.

---

## Pourquoi ce projet existe

### Le problème
Le rendu pixel art 3D est un domaine fragmenté. Les solutions existantes sont soit :
- Des **post-process naïfs** (downscale + nearest neighbor) qui produisent du shimmer et du pixel creep
- Des **assets Unity/Godot** (ProPixelizer, starter kits) liés à un moteur généraliste et non portables
- Des **techniques de recherche** (texel splatting, Shadowglass) sans moteur jouable autour

Aucun outil ne permet aujourd'hui de rendre une scène 3D en pixel art de qualité pour le web avec un pipeline pensé exclusivement pour cette esthétique, découplé de tout moteur de jeu.

### L'opportunité
- WebGPU est maintenant supporté par Chrome, Edge, Firefox 141+, Safari (expérimental)
- Le pixel art 3D est en pleine explosion (t3ssel8r, David Holland, Project Shadowglass, Godot starter kits)
- Les jeux web (itch.io, Newgrounds) connaissent un renouveau, portés par les game jams et le vibe coding
- Aucun moteur web spécialisé pixel art 3D n'existe

### Le positionnement DeepOrangeStudio
PixelSinter s'inscrit dans l'écosystème d'outils de DeepOrangeStudio :
- La suite **Kiln** (SpriteForge, GlazeKiln, FloraKiln, MégaKiln, RigKiln) couvre le pipeline Blender
- **PixelSinter** couvre le rendu temps réel pixel art (bibliothèque pure)
- Un **game engine** futur (nom à définir) construira la couche jeu par-dessus PixelSinter
- Les assets produits par les outils Kiln alimentent PixelSinter

Le nom "Sinter" (frittage) fait écho à la forge (Kiln) : la forge produit les outils, le frittage assemble les pixels en image.

---

## Références visuelles et techniques

### Références artistiques (le résultat visuel visé)
- **t3ssel8r** — La référence originale du pixel art 3D. Outlines pixel-perfect, cel-shading quantifié, herbe en billboards, terrain en marching squares. Caméra orthographique.
- **Project Shadowglass** — Pixel art 3D en perspective, zéro shimmer, ambiance RPG fantaisie. Premier jeu commercial utilisant le texel marching.
- **David Holland (Godot)** — Implémentation complète dans Godot avec water shader, cloud shadows, volumétrics, planar reflections. Article technique de référence.
- **Return of the Obra Dinn (Lucas Pope)** — Pas du pixel art stricto sensu mais le dithering 1-bit 3D le plus abouti jamais réalisé. Référence pour la stabilité temporelle du dithering.
- **Octopath Traveler** — 3D pixelisé commercial (Square Enix), preuve que le style a un marché AAA.

### Références techniques (comment c'est fait)

#### Texel Splatting — Dylan Ebert (mars 2026)
Paper arXiv 2603.14587. Technique de rendu perspective-stable : rasterisation dans une cubemap depuis un probe fixe grid-snappé, shading en compute pass (OKLab posterization, outlines par discontinuité d'object ID/normales), splatting des texels en world-space quads. Implémentation TypeScript + WebGPU, MIT license.
- **Ce qu'on en retient :** Le pipeline cubemap pour la stabilité perspective (Mode B), le shading OKLab, la structure code src/demo.
- **Repo :** github.com/dylanebert/texel-splatting

#### Texel Marching — tesseractcat / Shadowglass (2025-2026)
Approche alternative au texel splatting : raymarching dans la cubemap en screen-space au lieu de splatting de quads. Utilise la reprojection (technique issue de la VR) pour interpoler entre les positions de probe.
- **Ce qu'on en retient :** La reprojection comme optimisation, le multi-probe pour les grandes scènes.
- **Article :** tesseractc.at/shadowglass

#### ProPixelizer — Elliot Bentine (Unity)
Asset Unity URP. Approche dithered-object + post-process fill. Per-object pixelization, creepless en orthographique, palette LUTs, ShaderGraph compatible.
- **Ce qu'on en retient :** Le per-object pixelization comme feature avancée future, les palette LUTs, l'approche "full resolution render + pixelization post-process".
- **Cité dans :** Le papier de Dylan Ebert comme référence [14].

#### Pixel Perfect (t3ssel8r) — Série YouTube
Part 1 : Downscale point filtering + upscale nearest, quantification couleur vers palette.
Part 2 : Edge detection Sobel sur depth + normals, distinction silhouette vs crease, masque par channel pour outlines sélectives.
Part 3 : Herbe en billboards, wind via noise world-space, normales transférées, cel-shading quantifié.
- **Ce qu'on en retient :** Tout le pipeline du Mode A (ortho). La logique de shading est directement transposable en WGSL.

#### OKLab — Björn Ottosson (2020)
Espace colorimétrique perceptuellement uniforme. Adopté par CSS Color Level 4/5, Photoshop, Unity, Godot. Utilisé par Dylan Ebert pour la posterization.
- **Ce qu'on en retient :** Toute la quantification couleur et le palette mapping se font en OKLab, pas en RGB. Les conversions linear RGB ↔ OKLab sont deux multiplications matricielles + cube root, implémentables en quelques lignes WGSL.

#### Return of the Obra Dinn — Lucas Pope (2018)
Rendu 8-bit grayscale → conversion 1-bit via dithering pattern (Bayer 8×8 pour les surfaces géométriques, blue noise 128×128 pour les surfaces organiques). Stabilisation du dithering en "épinglant" le pattern à la géométrie via une cubemap centrée sur la caméra.
- **Ce qu'on en retient :** Le double pattern Bayer/blue noise comme option, et le problème de stabilité temporelle du dithering (résolu différemment par Pope et par Ebert).

---

## Principes de conception

### 1. Tout est pixel art
Il n'y a pas de mode "rendu normal". Chaque pixel à l'écran passe par le pipeline de stylisation. Le moteur ne sait pas rendre du 3D classique — c'est une feature, pas une limitation.

### 2. Le shading est indépendant de la caméra
Le pipeline de stylisation (posterization, edge detection, dithering, palette mapping) est le même quel que soit le mode de projection. Seul l'espace d'exécution change (screen-space en ortho, cubemap-space en perspective). Les shaders WGSL sont écrits une seule fois.

### 3. Deux modes de projection, un seul look
- **Mode A (Orthographic)** — Camera snap sur grille texel, compensation sub-pixel. Pour les jeux iso, top-down, side-scroller, incrémentaux. Léger, rapide, zéro shimmer.
- **Mode B (Perspective / Probe-based)** — Cubemap depuis probe grid-snappé, splatting en world-space quads. Pour les jeux FPS, third-person, exploration. Plus coûteux mais stabilité perspective totale.

Le développeur choisit le mode selon son type de jeu. Le look pixel art est identique dans les deux cas.

### 4. WebGPU natif, pas de framework
TypeScript + WebGPU API du navigateur + shaders WGSL. Pas de Three.js, pas de Babylon. Le moteur contrôle chaque draw call, chaque texture, chaque shader. C'est ce qui permet les deux modes de rendu et la spécialisation pixel art.

### 5. Web-first, standalone ensuite
Le navigateur est la plateforme primaire. L'intégration dans une app standalone (via Tauri ou autre) est un bonus futur, pas l'objectif principal. Un rendu PixelSinter doit pouvoir tourner dans n'importe quelle page web avec un `<canvas>`.

### 6. Renderer pur, pas de game logic
PixelSinter ne gère que le rendu. Pas de game loop, pas d'input, pas de physique, pas d'audio. L'API est une fonction pure : scène + caméra + style → pixels. Un game engine séparé (projet futur) importera PixelSinter comme dépendance et ajoutera la couche jeu par-dessus. Cette séparation garantit que le renderer peut être validé, itéré et utilisé indépendamment.

### 7. Simple à utiliser, profond à maîtriser
L'API expose des concepts simples : scène, mesh, material, camera, light, style preset. Un rendu basique se crée en quelques dizaines de lignes. La profondeur vient des paramètres de stylisation : nombre de paliers de luminosité, palette de couleurs, type de dithering, épaisseur d'outline, couleurs d'outline par matériau.

---

## Pipeline de rendu

### Vue d'ensemble

```
Scène 3D → G-Buffer → [Mode A: Downscale | Mode B: Cubemap Capture]
    → Cel-Shading OKLab (posterization par paliers)
    → Edge Detection (depth + normals + object ID)
    → Dithering (Bayer / Blue Noise, optionnel)
    → Palette Mapping (LUT ou nearest-color OKLab)
    → [Mode A: Upscale Nearest | Mode B: Splat Quads]
    → Écran
```

### Étapes détaillées

**1. Rasterisation → G-Buffer**
Rendu de la scène dans des render targets multiples (MRT) :
- Color (albedo × light, avant stylisation)
- Depth (linear eye depth)
- Normals (world-space, encodées en 2 canaux octahedral)
- Object ID (entier unique par objet, pour outlines per-object)

**2. Downscale / Capture**
- Mode A : Downscale du G-Buffer vers résolution cible (ex: 320×180) en point filtering
- Mode B : Rasterisation dans 6 faces de cubemap depuis le probe grid-snappé, mêmes buffers

**3. Posterization OKLab**
Conversion linear RGB → OKLab. Quantification de la luminosité L en N paliers configurables (défaut: 4). Les paliers sont perceptuellement uniformes grâce à OKLab. Chaque matériau peut définir ses propres couleurs de highlight, midtone, shadow.

**4. Edge Detection**
Filtre sur les buffers basse résolution :
- Discontinuité de depth → silhouette (outline externe)
- Discontinuité de normals → crease (outline interne, plis, angles)
- Discontinuité d'object ID → séparation d'objets
Les edges sont appliquées soit comme pixels noirs, soit comme shifts de luminosité en OKLab (approche Dylan Ebert), configurable.

**5. Dithering (optionnel)**
Dans les zones de transition entre paliers de luminosité, application d'un pattern :
- Bayer 4×4 ou 8×8 (ordonné, géométrique, style GameBoy/CGA)
- Blue noise (organique, moins de pattern visible, style Obra Dinn)
- Aucun (transitions nettes, style t3ssel8r)
Le pattern peut être configuré globalement ou par matériau.

**6. Palette Mapping**
Mapping des couleurs finales vers une palette limitée :
- Via LUT texture (palettes prédéfinies : NES, GameBoy, CGA, PICO-8, custom)
- Via nearest-color en OKLab (palette arbitraire, calcul GPU)
- Bypass (couleurs libres, juste posterisées)

**7. Upscale / Splat**
- Mode A : Upscale nearest neighbor vers résolution écran
- Mode B : Splatting des texels visibles en world-space quads, depth test, gestion des gaps inter-quads

---

## Cas d'usage

PixelSinter est un renderer pur, mais voici les contextes dans lesquels il sera utilisé (par un game engine futur ou par des développeurs tiers) :

| Contexte | Mode | Caméra | Exemples |
|----------|------|--------|----------|
| Jeu incrémental / idle | A | Ortho fixe | Cookie Clicker 3D, factory idle |
| Jeu top-down RPG | A | Ortho avec rotation | Pokémon-like, action RPG |
| Jeu isométrique | A | Ortho iso | City builder, tactics |
| Jeu side-scroller | A | Ortho latéral | Platformer, metroidvania |
| Exploration 3D | B | Perspective libre | Walking sim pixel art |
| FPS rétro | B | Perspective FPS | Doom-like pixel art |
| Démo visuelle / vitrine | A ou B | Libre | Portfolio, fond animé web, preview d'assets |
| Outil de preview (SpriteForge) | A | Ortho | Rendu pixel art temps réel d'un modèle Blender |

---

## Stack technique

| Couche | Technologie | Rôle |
|--------|-------------|------|
| GPU API | WebGPU (navigateur natif) | Draw calls, compute, textures |
| Shading | WGSL | Tous les shaders (vertex, fragment, compute) |
| Langage | TypeScript | Renderer, scene graph, API |
| Build | Bun (comme Dylan Ebert) | Bundling, dev server |
| Assets | glTF 2.0 | Format de modèles 3D |
| Package | npm (`pixelsinter`) | Distribution |

---

## Roadmap

### Phase 1 — Noyau WebGPU + Pipeline ortho (3-4 semaines)
Socle WebGPU (device, canvas, render pipeline). Primitives géométriques. Chargement glTF. G-Buffer (color, depth, normals, object ID). Downscale point filtering. Cel-shading OKLab. Edge detection. Dithering. Palette mapping. Upscale nearest. Premier résultat visuel dans le navigateur — une scène 3D rendue en pixel art.

**Livrable :** Une page web avec un canvas qui affiche une scène glTF en pixel art, caméra orbitale, paramètres de style modifiables.

### Phase 2 — Animation et scène dynamique (2 semaines)
Support des animations glTF (skeletal, morph targets). Transforms dynamiques (position, rotation, scale animés). Instancing pour les objets répétés (végétation, décor). Lumières dynamiques (directionnelle, point).

**Livrable :** Une scène animée avec des personnages, de la végétation en mouvement, un cycle jour/nuit.

### Phase 3 — Mode B / Texel Splatting (3-4 semaines)
Pipeline cubemap-based pour la perspective stable. Réutilisation des shaders de stylisation du Mode A exécutés en cubemap-space. Système de probes grid-snappés. Gestion de la disocclusion (eye probe). Transitions entre cellules de probe (Bayer crossfade).

**Livrable :** La même scène rendue en perspective sans shimmer.

### Phase 4 — API publique et packaging (2 semaines)
API TypeScript propre et documentée. Packaging npm. Exemples d'intégration (vanilla HTML, React, Vue). Documentation. Site web / page GitHub.

**Livrable :** `npm install pixelsinter` fonctionne et permet de rendre du pixel art 3D en 10 lignes de code.

### Phase 5 — Polish et features avancées (ongoing)
Éditeur de palettes. Presets de style (NES, GameBoy, CGA, PICO-8, Obra Dinn). Per-object pixelization (approche ProPixelizer). Particules stylisées. Water shader. Cloud shadows. Optimisations performance.

---

## Connaissances transférables

Le développement de PixelSinter produit des connaissances réutilisables au-delà du moteur :

**Pour les projets Unity (DEAD LINE, futurs jeux) :**
Les specs de pipeline (G-Buffer → posterize → edge detect → dither → palette) sont moteur-agnostiques. Les algorithmes en WGSL se transposent en HLSL. Les paramètres de stylisation (paliers OKLab, seuils d'edge detection, patterns de dithering) sont les mêmes.

**Pour la suite Kiln (SpriteForge, FloraKiln) :**
La quantification OKLab et le dithering sont applicables dans les shaders EEVEE/Compositor de Blender pour le rendu offline de sprites.

**Pour Claude Code :**
Les specs détaillées et le CLAUDE.md du projet serviront de référence pour tout futur projet de rendu stylisé, quel que soit le moteur.

---

## Contraintes et non-objectifs

### Ce que PixelSinter EST
- Une bibliothèque de rendu 3D pixel art (renderer pur)
- Un module importable (`npm install pixelsinter`)
- Un pipeline de stylisation complet (G-Buffer → posterize → edges → dither → palette)
- Deux modes de projection (ortho stable, perspective stable via probes)

### Ce que PixelSinter N'EST PAS
- Un game engine (pas de game loop, pas d'input, pas de physique, pas d'audio, pas d'ECS)
- Un moteur généraliste (pas de rendu PBR, pas de GI, pas de ray tracing)
- Un éditeur visuel (pas de GUI, pas de drag & drop, code-only)
- Un concurrent de Unity/Godot/Unreal (c'est une brique de rendu, pas un moteur complet)
- Un framework 2D (le pixel art est produit depuis de la 3D, pas dessiné à la main)

### Projet futur séparé : Game Engine
Un game engine (nom à définir) sera un projet distinct qui importera PixelSinter et ajoutera :
- Game loop (fixed timestep + variable render)
- Input (clavier, souris, touch, gamepad)
- Audio (Web Audio API)
- Physique / collision (AABB ou Rapier WASM)
- ECS léger
- Export standalone (Tauri)

Ce projet démarrera quand le renderer sera validé visuellement (fin de Phase 2 environ).

### Contraintes techniques
- WebGPU requis (pas de fallback WebGL — le pipeline nécessite compute shaders et MRT)
- Navigateurs supportés : Chrome 113+, Edge 113+, Firefox 141+, Safari (expérimental)
- Pas de support mobile natif dans un premier temps (WebGPU mobile est encore instable)

---

*Document rédigé le 13 avril 2026 — DeepOrangeStudio*
*v2 — Scope recentré sur renderer pur (séparation renderer / game engine)*
