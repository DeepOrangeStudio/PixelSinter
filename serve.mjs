// Dev server — serves demo with esbuild bundling for TypeScript + WGSL imports

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import * as esbuild from "esbuild";

const PORT = 3000;
const ROOT = process.cwd();

// esbuild plugin: import .wgsl files as text
const wgslPlugin = {
  name: "wgsl-loader",
  setup(build) {
    build.onLoad({ filter: /\.wgsl$/ }, async (args) => {
      const text = await readFile(args.path, "utf8");
      return { contents: text, loader: "text" };
    });
  },
};

// Bundle demo/demo.ts on the fly (no cache — always rebuild)
async function bundleDemo() {

  const result = await esbuild.build({
    entryPoints: [join(ROOT, "demo/demo.ts")],
    bundle: true,
    format: "esm",
    target: "es2022",
    write: false,
    plugins: [wgslPlugin],
    sourcemap: "inline",
  });

  return result.outputFiles[0].text;
}

const MIME = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".obj": "text/plain",
  ".wgsl": "text/plain",
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let path = url.pathname;

  // Root → demo/index.html
  if (path === "/" || path === "/index.html") {
    const html = await readFile(join(ROOT, "demo/index.html"), "utf8");
    // Rewrite .ts script src to .js for the bundled output
    const patched = html.replace(
      'src="./demo.ts"',
      'src="./demo.js"'
    );
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(patched);
    return;
  }

  // Bundle request for demo.js (or demo.ts)
  if (path === "/demo.js" || path === "/demo.ts" || path === "/demo/demo.js") {
    try {
      const js = await bundleDemo();
      res.writeHead(200, { "Content-Type": "application/javascript" });
      res.end(js);
    } catch (err) {
      console.error("Bundle error:", err);
      res.writeHead(500, { "Content-Type": "application/javascript" });
      res.end(`console.error(${JSON.stringify(String(err))})`);
    }
    return;
  }

  // Static files from demo/ or project root
  const candidates = [
    join(ROOT, "demo", path),
    join(ROOT, path),
  ];

  for (const filePath of candidates) {
    try {
      const data = await readFile(filePath);
      const ext = extname(filePath);
      const mime = MIME[ext] || "application/octet-stream";
      res.writeHead(200, { "Content-Type": mime, "Cache-Control": "no-store" });
      res.end(data);
      return;
    } catch {
      // try next candidate
    }
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`[PixelSinter] Dev server running at http://localhost:${PORT}`);
});
