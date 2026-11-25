// opcviewer volume grid: the maths behind the Volume tool, shared by the server
// (lib/volume.js, require) and the viewer's in-browser fallback (window.zmVolumeGrid).
// Plain ES5, no dependencies.
(function (root, factory) {
	var api = factory();
	if (typeof module === 'object' && module.exports) {
		module.exports = api;
	} else {
		var fn = function (poly, cell) { return api.makeVolumeGrid(poly, cell); };
		fn.makeVolumeGrid = api.makeVolumeGrid;
		fn.cellSize = api.cellSize;
		fn.refine = api.refine;
		fn.gridCells = api.gridCells;
		root.zmVolumeGrid = fn;
	}
})(typeof window !== 'undefined' ? window : this, function () {
	'use strict';

	// No grid is ever larger than this (4 million cells = about 1 km x 1 km at 50 cm).
	var MAX_CELLS = 4e6;

	// 2.5D volume: a grid of cells over the outlined area, each holding the mean height of
	// the points that fall in it, measured against a plane fitted through the clicked
	// outline points (the ground around the pile).
	function makeVolumeGrid(poly, cell) {
		var i, minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		var cx = 0, cy = 0, cz = 0, n = poly.length;
		for (i = 0; i < n; i++) {
			minX = Math.min(minX, poly[i].x); maxX = Math.max(maxX, poly[i].x);
			minY = Math.min(minY, poly[i].y); maxY = Math.max(maxY, poly[i].y);
			cx += poly[i].x / n; cy += poly[i].y / n; cz += poly[i].z / n;
		}
		// Least-squares plane z = cz + a (x - cx) + b (y - cy) through the outline points.
		var sxx = 0, sxy = 0, syy = 0, sxz = 0, syz = 0;
		for (i = 0; i < n; i++) {
			var dx = poly[i].x - cx, dy = poly[i].y - cy, dz = poly[i].z - cz;
			sxx += dx * dx; sxy += dx * dy; syy += dy * dy; sxz += dx * dz; syz += dy * dz;
		}
		var det = sxx * syy - sxy * sxy, a = 0, b = 0;
		if (Math.abs(det) > 1e-9 * (sxx + syy) * (sxx + syy) && det !== 0) {
			a = (sxz * syy - syz * sxy) / det;
			b = (syz * sxx - sxz * sxy) / det;
		}
		var nx = Math.max(1, Math.ceil((maxX - minX) / cell)), ny = Math.max(1, Math.ceil((maxY - minY) / cell));
		if (!(nx * ny <= MAX_CELLS)) throw new Error('The outline is too large for a volume (grid of ' + Math.round(nx * ny) + ' cells)');
		var sum = new Float64Array(nx * ny), cnt = new Uint32Array(nx * ny), inside = new Uint8Array(nx * ny);
		var insideCount = 0;
		for (var iy = 0; iy < ny; iy++) {
			var py = minY + (iy + 0.5) * cell;
			for (var ix = 0; ix < nx; ix++) {
				var px = minX + (ix + 0.5) * cell, c = false;
				for (var k = 0, j = n - 1; k < n; j = k++) {
					if ((poly[k].y > py) !== (poly[j].y > py) &&
						px < (poly[j].x - poly[k].x) * (py - poly[k].y) / (poly[j].y - poly[k].y) + poly[k].x) c = !c;
				}
				if (c) { inside[iy * nx + ix] = 1; insideCount++; }
			}
		}
		var used = 0;
		return {
			minX: minX, minY: minY, maxX: maxX, maxY: maxY, cell: cell,
			add: function (x, y, z) {
				var ix = Math.floor((x - minX) / cell), iy = Math.floor((y - minY) / cell);
				if (ix < 0 || iy < 0 || ix >= nx || iy >= ny) return;
				var idx = iy * nx + ix;
				if (!inside[idx]) return;
				sum[idx] += z; cnt[idx]++; used++;
			},
			// The same data on a grid with cells twice the size. Used when the scan is not
			// dense enough for this grid (too many cells without a single point).
			coarser: function () {
				var g = makeVolumeGrid(poly, cell * 2);
				for (var iy = 0; iy < ny; iy++) for (var ix = 0; ix < nx; ix++) {
					var idx = iy * nx + ix;
					if (cnt[idx]) g.addCell(minX + (ix + 0.5) * cell, minY + (iy + 0.5) * cell, sum[idx], cnt[idx]);
				}
				return g;
			},
			addCell: function (x, y, zSum, n) {
				var ix = Math.floor((x - minX) / cell), iy = Math.floor((y - minY) / cell);
				if (ix < 0 || iy < 0 || ix >= nx || iy >= ny) return;
				var idx = iy * nx + ix;
				if (!inside[idx]) return;
				sum[idx] += zSum; cnt[idx] += n; used += n;
			},
			finish: function () {
				var h = new Float64Array(nx * ny), has = new Uint8Array(nx * ny), empty = 0, idx, ix, iy;
				for (iy = 0; iy < ny; iy++) for (ix = 0; ix < nx; ix++) {
					idx = iy * nx + ix;
					if (!inside[idx]) continue;
					if (cnt[idx]) {
						h[idx] = sum[idx] / cnt[idx] - (cz + a * (minX + (ix + 0.5) * cell - cx) + b * (minY + (iy + 0.5) * cell - cy));
						has[idx] = 1;
					} else empty++;
				}
				// Cells with no points (holes in the scan): take the average of their neighbours.
				for (var pass = 0, left = empty; pass < 60 && left > 0; pass++) {
					var fill = [];
					for (iy = 0; iy < ny; iy++) for (ix = 0; ix < nx; ix++) {
						idx = iy * nx + ix;
						if (!inside[idx] || has[idx]) continue;
						var s = 0, m = 0;
						if (ix > 0 && has[idx - 1]) { s += h[idx - 1]; m++; }
						if (ix < nx - 1 && has[idx + 1]) { s += h[idx + 1]; m++; }
						if (iy > 0 && has[idx - nx]) { s += h[idx - nx]; m++; }
						if (iy < ny - 1 && has[idx + nx]) { s += h[idx + nx]; m++; }
						if (m) fill.push(idx, s / m);
					}
					if (!fill.length) break;
					for (var f = 0; f < fill.length; f += 2) { h[fill[f]] = fill[f + 1]; has[fill[f]] = 1; left--; }
				}
				var above = 0, below = 0, maxH = 0, maxD = 0;
				for (idx = 0; idx < nx * ny; idx++) {
					if (!inside[idx] || !has[idx]) continue;
					if (h[idx] > 0) above += h[idx]; else below -= h[idx];
					if (h[idx] > maxH) maxH = h[idx];
					if (-h[idx] > maxD) maxD = -h[idx];
				}
				var ca = cell * cell;
				return {
					above: above * ca, below: below * ca, area: insideCount * ca, maxHeight: maxH, maxDepth: maxD,
					cell: cell, points: used, emptyShare: insideCount ? empty / insideCount : 0,
					plane: { cx: cx, cy: cy, cz: cz, a: a, b: b },
					// per-cell data for the highlight: height above the base plane (h), which
					// cells count (has), and what is needed to place them in the world
					cells: { nx: nx, ny: ny, minX: minX, minY: minY, h: h, has: has, inside: inside,
						baseZ: function (x, y) { return cz + a * (x - cx) + b * (y - cy); } }
				};
			}
		};
	}

	// Grid cell size for an outline: about 400 cells across the outlined area, between 1 cm
	// and 50 cm, and never more than ~1.5 million cells over the outline's bounding rectangle.
	function cellSize(poly) {
		var area = 0, i, j, bw = 0, bh = 0;
		for (i = 0, j = poly.length - 1; i < poly.length; j = i++) area += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
		area = Math.abs(area / 2);
		for (i = 0; i < poly.length; i++) for (j = 0; j < poly.length; j++) {
			bw = Math.max(bw, Math.abs(poly[i].x - poly[j].x)); bh = Math.max(bh, Math.abs(poly[i].y - poly[j].y));
		}
		return Math.min(0.5, Math.max(0.01, Math.sqrt(area) / 400, Math.sqrt(bw * bh / 1.5e6)));
	}

	// Finishes a filled grid. If it is finer than the scan itself, many cells are empty:
	// halve the resolution (up to 4 times) until the grid matches what the points support.
	function refine(grid) {
		var r = grid.finish();
		for (var pass = 0; pass < 4 && r.points && r.emptyShare > 0.08; pass++) {
			var g2 = grid.coarser(), r2 = g2.finish();
			if (r2.emptyShare >= r.emptyShare) break; // a real hole in the scan, not resolution
			grid = g2; r = r2;
		}
		return { grid: grid, result: r };
	}

	// Cells the grid for this outline and cell size would have (as makeVolumeGrid counts them).
	function gridCells(poly, cell) {
		var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		for (var i = 0; i < poly.length; i++) {
			minX = Math.min(minX, poly[i].x); maxX = Math.max(maxX, poly[i].x);
			minY = Math.min(minY, poly[i].y); maxY = Math.max(maxY, poly[i].y);
		}
		return Math.max(1, Math.ceil((maxX - minX) / cell)) * Math.max(1, Math.ceil((maxY - minY) / cell));
	}

	return { makeVolumeGrid: makeVolumeGrid, cellSize: cellSize, refine: refine, gridCells: gridCells, MAX_CELLS: MAX_CELLS };
});
