# PixelSinter

**3D pixel art renderer — WebGPU + TypeScript.**
*Every pixel is a choice.*

PixelSinter est une bibliothèque de rendu qui transforme des scènes 3D en pixel art dans le navigateur via WebGPU. Renderer pur, sans game engine : il prend une scène (meshes, lumières, caméra, style) et produit une image pixel art.

Sibling project de la suite [Kiln](https://deeporangestudio.com) (DeepOrangeStudio).

## Statut

**R&D · early.** Phase 1 en cours (Mode A orthographique). Pas encore production-ready.

## Deux modes de projection, un seul look

- **Mode A — Orthographic.** Camera snap sur grille texel, compensation sub-pixel. Pour jeux iso, top-down, side-scroller.
- **Mode B — Perspective / probe-based.** Cubemap depuis probe grid-snappé, splatting en world-space quads. Pour jeux FPS, exploration.

Le pipeline de stylisation (posterization OKLab, edge detection, dithering, palette mapping) est partagé entre les deux modes.

## Prérequis

- Navigateur avec WebGPU : Chrome 113+, Edge 113+, Firefox 141+, Safari 17+ (expérimental)
- Node 20+ pour le build

## Dev

```bash
npm install
npm run dev   # serveur local sur http://localhost:8080
```

Ouvrir `/demo/index.html` pour voir le rendu courant.

## Build

```bash
npm run build   # bundle ESM dans dist/
```

## Documentation

- [`PIXELSINTER_VISION.md`](PIXELSINTER_VISION.md) — vision, positionnement, références
- [`PIXELSINTER_SPEC.md`](PIXELSINTER_SPEC.md) — spec technique, pipeline, API

## Références

- Dylan Ebert — Texel Splatting (arXiv 2603.14587)
- tesseractcat / Project Shadowglass — Texel Marching
- t3ssel8r — pipeline pixel art orthographique
- Björn Ottosson — OKLab
- Lucas Pope — dithering stabilisé (Obra Dinn)

## License

MIT. Voir [LICENSE](LICENSE).
