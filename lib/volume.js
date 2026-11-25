// The Volume tool's calculation, run on the server: reads the points under the outline
// straight from the project's octree files and feeds them to the same grid code the
// viewer uses (viewer/opcviewer-grid.js). Mirrors the viewer's gatherPoints(): same
// breadth-first walk, same depth rule, same point cap.
const octree = require('./octree');
const G = require('../viewer/opcviewer-grid');

const MAX_POINTS = 40e6;
const MAX_HIGHLIGHT_CELLS = 250000;

function overlaps(node, grid) {
  return node.max[0] >= grid.minX && node.min[0] <= grid.maxX && node.max[1] >= grid.minY && node.min[1] <= grid.maxY;
}

// Height grid for the viewer's green/red highlight. Above maxCells, 2 x 2 blocks are
// merged (mean of their counted cells) until it fits; the numbers are not affected.
function encodeHighlight(cells, cell, maxCells) {
  let { nx, ny } = cells;
  let h = Float32Array.from(cells.h);
  let mask = new Uint8Array(nx * ny);
  for (let i = 0; i < nx * ny; i++) mask[i] = cells.inside[i] && cells.has[i] ? 1 : 0;
  while (nx * ny > maxCells) {
    const nx2 = Math.ceil(nx / 2), ny2 = Math.ceil(ny / 2);
    const h2 = new Float32Array(nx2 * ny2), m2 = new Uint8Array(nx2 * ny2);
    for (let y = 0; y < ny2; y++) for (let x = 0; x < nx2; x++) {
      let s = 0, n = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const sx = 2 * x + dx, sy = 2 * y + dy;
        if (sx >= nx || sy >= ny) continue;
        const i = sy * nx + sx;
        if (mask[i]) { s += h[i]; n++; }
      }
      if (n) { h2[y * nx2 + x] = s / n; m2[y * nx2 + x] = 1; }
    }
    nx = nx2; ny = ny2; h = h2; mask = m2; cell *= 2;
  }
  const bits = Buffer.alloc(Math.ceil(nx * ny / 8));
  for (let i = 0; i < nx * ny; i++) if (mask[i]) bits[i >> 3] |= 1 << (i & 7);
  return {
    nx, ny, minX: cells.minX, minY: cells.minY, cell,
    h: Buffer.from(h.buffer, h.byteOffset, h.byteLength).toString('base64'),
    mask: bits.toString('base64'),
  };
}

// outline: [[x, y, z], ...] in the project's coordinates. opts.cell forces a cell size
// (tests); opts.maxHighlightCells overrides the highlight cap.
function computeVolume(metadataPath, outline, opts = {}) {
  const poly = outline.map(([x, y, z]) => ({ x, y, z }));
  const o = octree.openOctree(metadataPath);
  let points = 0, capped = false, grid;
  try {
    // An outline that doesn't touch the cloud at all: no points, no need for its grid.
    const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y);
    if (!overlaps(o.root, { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) })) {
      return { points: 0, capped };
    }
    grid = G.makeVolumeGrid(poly, opts.cell || G.cellSize(poly));
    const queue = [o.root];
    for (let qi = 0; qi < queue.length; qi++) {
      const node = octree.resolve(o, queue[qi]);
      if (!overlaps(node, grid)) continue;
      const p = octree.readPositions(o, node);
      for (let i = 0; i < p.length; i += 3) grid.add(p[i], p[i + 1], p[i + 2]);
      points += node.numPoints;
      // Each level halves the point spacing: go down until the points are at least twice
      // as dense as the grid.
      if (node.spacing <= grid.cell / 2) continue;
      if (points > MAX_POINTS) { capped = true; continue; }
      for (const c of node.children) if (c) queue.push(c);
    }
  } finally {
    octree.closeOctree(o);
  }
  const refined = G.refine(grid);
  const r = refined.result;
  if (!r.points) return { points: 0, capped };
  return {
    above: r.above, below: r.below, area: r.area, maxHeight: r.maxHeight, maxDepth: r.maxDepth,
    cell: r.cell, points: r.points, emptyShare: r.emptyShare, capped, plane: r.plane,
    highlight: encodeHighlight(r.cells, r.cell, opts.maxHighlightCells || MAX_HIGHLIGHT_CELLS),
  };
}

function decodeHighlightForTest(hl) {
  const b = Buffer.from(hl.h, 'base64');
  const heights = Array.from(new Float32Array(b.buffer, b.byteOffset, b.length / 4));
  const bits = Buffer.from(hl.mask, 'base64');
  const mask = heights.map((_, i) => (bits[i >> 3] >> (i & 7)) & 1);
  return { heights, mask };
}

module.exports = { computeVolume, decodeHighlightForTest, MAX_HIGHLIGHT_CELLS };
