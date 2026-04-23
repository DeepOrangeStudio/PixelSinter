// Generates a 64×64 blue noise texture as a raw Float32Array
// Uses void-and-cluster approximation (simplified)
// Output: demo/assets/bluenoise64.bin (64×64 float32 values, 0..1)

import { writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";

const SIZE = 64;
const TOTAL = SIZE * SIZE;

// Generate blue noise via Mitchell's best-candidate algorithm
// Not true void-and-cluster but produces good results for dithering
function generateBlueNoise(size) {
  const total = size * size;
  const result = new Float32Array(total);
  const placed = new Uint8Array(total); // 1 if this cell has been assigned a rank
  const ranks = new Int32Array(total).fill(-1);

  // Toroidal distance squared
  function distSq(x0, y0, x1, y1) {
    let dx = Math.abs(x1 - x0);
    let dy = Math.abs(y1 - y0);
    if (dx > size / 2) dx = size - dx;
    if (dy > size / 2) dy = size - dy;
    return dx * dx + dy * dy;
  }

  // Find the cell with the largest minimum distance to all placed cells
  function findVoid(placedCells) {
    if (placedCells.length === 0) {
      return Math.floor(Math.random() * total);
    }

    let bestIdx = 0;
    let bestMinDist = -1;

    // For efficiency, sample random candidates instead of checking all cells
    const candidates = Math.min(total, Math.max(200, total - placedCells.length));

    for (let c = 0; c < candidates; c++) {
      let idx;
      if (candidates >= total) {
        idx = c;
      } else {
        idx = Math.floor(Math.random() * total);
      }

      if (placed[idx]) continue;

      const x = idx % size;
      const y = Math.floor(idx / size);

      let minDist = Infinity;
      for (const pi of placedCells) {
        const px = pi % size;
        const py = Math.floor(pi / size);
        const d = distSq(x, y, px, py);
        if (d < minDist) minDist = d;
      }

      if (minDist > bestMinDist) {
        bestMinDist = minDist;
        bestIdx = idx;
      }
    }

    return bestIdx;
  }

  // Place points one by one, each time picking the cell farthest from existing points
  const placedList = [];

  for (let rank = 0; rank < total; rank++) {
    const idx = findVoid(placedList);
    placed[idx] = 1;
    ranks[idx] = rank;
    placedList.push(idx);

    if (rank % 500 === 0) {
      process.stdout.write(`\r  Generating blue noise: ${Math.floor(rank / total * 100)}%`);
    }
  }
  process.stdout.write(`\r  Generating blue noise: 100%\n`);

  // Normalize ranks to 0..1
  for (let i = 0; i < total; i++) {
    result[i] = ranks[i] / (total - 1);
  }

  return result;
}

console.log("Generating 64×64 blue noise texture...");
const noise = generateBlueNoise(SIZE);

const outPath = "demo/assets/bluenoise64.bin";
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, Buffer.from(noise.buffer));

console.log(`Written to ${outPath} (${noise.byteLength} bytes)`);
