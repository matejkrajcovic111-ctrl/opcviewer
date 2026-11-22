// Bounding Box tool for Potree project pages, modelled on the one in 3Dsurvey.
// Included from a project's index.html only when the project's "Bounding box" setting
// is on (lib/template.js). Source: viewer/ in the opcviewer repo.
//
// One button puts a box around the whole model; everything outside it is hidden.
//   Right-drag a side            move that side
//   Right-drag a vertical edge   rotate the box (edge lights up on hover)
//   Ctrl + right-drag            move the whole box
//   Ctrl + left-drag a side      slide the box along that side's direction
//   Ctrl + Up/Down               step the box up/down      (+ Shift: fine steps)
//   Ctrl + Left/Right            rotate the box            (+ Shift: fine steps)
//   Reset                        box back around the whole model
// Clicking the button again hides the box but keeps the cut, so the inside of the model
// stays visible without the box in the way; clicking once more brings the box back.
(function () {
	'use strict';
	if (window.__zmBBoxLoaded) return;
	window.__zmBBoxLoaded = true;

	var MIN_SIZE = 0.01;          // metres; a side can't be pushed through its opposite
	var ROT_STEP = 5, ROT_FINE = 1; // degrees
	// Accent colour from the branding (frame and wall tint) and a lighter shade of it (side /
	// edge under the cursor). Read again on every enable(), see accentColours().
	var COLOR = 0x4c8dff;
	var HILITE = 0xb7d1ff;

	function accentColours() {
		var a = window.opcvBranding && window.opcvBranding.accent;
		if (!/^#[0-9a-f]{6}$/i.test(a || '')) return;
		var n = parseInt(a.slice(1), 16), light = 0;
		for (var sh = 16; sh >= 0; sh -= 8) {
			var v = (n >> sh) & 255;
			light |= Math.round(v + (255 - v) * 0.6) << sh;
		}
		COLOR = n;
		HILITE = light;
	}
	var WALL_OPACITY = 0.07;       // walls are mostly see-through

	var EDGE_PX = 9;               // how close (pixels) the cursor must be to a vertical edge

	var viewer = null, volume = null, faceMesh = null, edgeMesh = null, wallMesh = null;
	var V3 = null, M4 = null;
	var active = false, shown = false, drag = null, prevClipTask = null, modelSize = null;
	var ui = {};

	// ---------- geometry helpers ----------

	// World-space bounds of the actual points of all loaded clouds. Potree 2's own
	// boundingBox is the cubic octree root, usually far taller than the data, so prefer
	// the real position range from metadata.json.
	function modelBounds() {
		var pcs = viewer.scene.pointclouds;
		if (!pcs.length) return null;
		var min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
		pcs.forEach(function (pc) {
			pc.updateMatrixWorld(true);
			var g = pc.pcoGeometry || {}, lmin = null, lmax = null;
			var attrs = g.pointAttributes && g.pointAttributes.attributes;
			var pos = attrs && attrs.find(function (a) { return a.name === 'position'; });
			var r = pos && pos.range;
			if (r && Array.isArray(r[0]) && Array.isArray(r[1]) && g.offset &&
				r[0].concat(r[1]).every(function (v) { return isFinite(v); })) {
				lmin = [r[0][0] - g.offset.x, r[0][1] - g.offset.y, r[0][2] - g.offset.z];
				lmax = [r[1][0] - g.offset.x, r[1][1] - g.offset.y, r[1][2] - g.offset.z];
			} else {
				var b = g.tightBoundingBox || pc.boundingBox;
				if (!b) return;
				lmin = [b.min.x, b.min.y, b.min.z];
				lmax = [b.max.x, b.max.y, b.max.z];
			}
			for (var i = 0; i < 8; i++) {
				var p = new V3(i & 1 ? lmax[0] : lmin[0], i & 2 ? lmax[1] : lmin[1], i & 4 ? lmax[2] : lmin[2])
					.applyMatrix4(pc.matrixWorld);
				var c = [p.x, p.y, p.z];
				for (var k = 0; k < 3; k++) {
					if (c[k] < min[k]) min[k] = c[k];
					if (c[k] > max[k]) max[k] = c[k];
				}
			}
		});
		if (!isFinite(min[0]) || !isFinite(max[0])) return null;
		return { min: min, max: max };
	}

	function fitToModel() {
		var b = modelBounds();
		if (!b) return false;
		var size = [], center = [];
		for (var k = 0; k < 3; k++) {
			var s = b.max[k] - b.min[k];
			size[k] = Math.max(s * 1.002 + 0.02, MIN_SIZE); // small margin so edge points stay in
			center[k] = (b.max[k] + b.min[k]) / 2;
		}
		modelSize = size.slice();
		volume.rotation.set(0, 0, 0);
		volume.position.set(center[0], center[1], center[2]);
		volume.scale.set(size[0], size[1], size[2]);
		volume.updateMatrixWorld(true);
		refreshDims();
		return true;
	}

	function rayFromEvent(e) {
		var r = viewer.renderer.domElement.getBoundingClientRect();
		var x = ((e.clientX - r.left) / r.width) * 2 - 1;
		var y = -((e.clientY - r.top) / r.height) * 2 + 1;
		var cam = viewer.scene.getActiveCamera();
		cam.updateMatrixWorld();
		var o = new V3(x, y, -1).unproject(cam);
		var f = new V3(x, y, 1).unproject(cam);
		return { o: o, d: f.sub(o).normalize() };
	}

	// Which side of the box is under the ray: the first one the ray meets (the far one
	// when the camera is inside the box). Works for a rotated box (done in box space).
	function pickFace(ray) {
		volume.updateMatrixWorld(true);
		var inv = new M4().copy(volume.matrixWorld).invert();
		var lo = ray.o.clone().applyMatrix4(inv);
		var ld = ray.o.clone().add(ray.d).applyMatrix4(inv).sub(lo);
		var tmin = -Infinity, tmax = Infinity, aMin = -1, aMax = -1, sMin = 0, sMax = 0;
		for (var a = 0; a < 3; a++) {
			var o = lo.getComponent(a), d = ld.getComponent(a);
			if (Math.abs(d) < 1e-12) {
				if (o < -0.5 || o > 0.5) return null;
				continue;
			}
			var t1 = (-0.5 - o) / d, t2 = (0.5 - o) / d, s1 = -1, s2 = 1;
			if (t1 > t2) { var t = t1; t1 = t2; t2 = t; s1 = 1; s2 = -1; }
			if (t1 > tmin) { tmin = t1; aMin = a; sMin = s1; }
			if (t2 < tmax) { tmax = t2; aMax = a; sMax = s2; }
		}
		if (tmin > tmax || tmax < 0) return null;
		var useNear = tmin > 0;
		var axis = useNear ? aMin : aMax, sign = useNear ? sMin : sMax, tt = useNear ? tmin : tmax;
		if (axis < 0) return null;
		var el = volume.matrixWorld.elements;
		var n = new V3(el[axis * 4], el[axis * 4 + 1], el[axis * 4 + 2]).normalize().multiplyScalar(sign);
		return { axis: axis, sign: sign, point: ray.o.clone().add(ray.d.clone().multiplyScalar(tt)), normal: n };
	}

	// Parameter s of the point on the line p0 + s*n that is closest to the ray.
	function lineParam(ray, p0, n) {
		var w = p0.clone().sub(ray.o);
		var b = n.dot(ray.d), d1 = n.dot(w), e = ray.d.dot(w);
		var denom = 1 - b * b;
		if (denom < 1e-4) return null; // looking straight along the line: no usable answer
		return (b * e - d1) / denom;
	}

	function planeHit(ray, p0, n) {
		var dn = ray.d.dot(n);
		if (Math.abs(dn) < 0.05) return null;
		var t = p0.clone().sub(ray.o).dot(n) / dn;
		if (t <= 0) return null;
		return ray.o.clone().add(ray.d.clone().multiplyScalar(t));
	}

	// ---------- vertical edges (rotation handles) ----------

	var EDGES = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];

	function toScreen(p, cam, rect) {
		var c = p.clone().applyMatrix4(cam.matrixWorldInverse);
		if (c.z > -1e-6 && cam.isPerspectiveCamera) return null; // behind the camera
		var n = p.clone().project(cam);
		return [rect.left + (n.x + 1) / 2 * rect.width, rect.top + (1 - n.y) / 2 * rect.height];
	}

	// The vertical edge of the box under the cursor, if the cursor is within EDGE_PX of it.
	function pickEdge(e) {
		volume.updateMatrixWorld(true);
		var cam = viewer.scene.getActiveCamera();
		cam.updateMatrixWorld();
		var rect = viewer.renderer.domElement.getBoundingClientRect();
		var best = null, N = 24;
		for (var i = 0; i < 4; i++) {
			var prev = null, prevW = null;
			for (var k = 0; k <= N; k++) {
				var w = new V3(EDGES[i][0], EDGES[i][1], -0.5 + k / N).applyMatrix4(volume.matrixWorld);
				var sp = toScreen(w, cam, rect);
				if (sp && prev) {
					var vx = sp[0] - prev[0], vy = sp[1] - prev[1], len2 = vx * vx + vy * vy;
					var t = len2 > 0 ? ((e.clientX - prev[0]) * vx + (e.clientY - prev[1]) * vy) / len2 : 0;
					t = Math.max(0, Math.min(1, t));
					var dx = e.clientX - (prev[0] + t * vx), dy = e.clientY - (prev[1] + t * vy);
					var d = Math.sqrt(dx * dx + dy * dy);
					if (d <= EDGE_PX && (!best || d < best.dist)) {
						best = { edge: i, dist: d, point: prevW.clone().lerp(w, t) };
					}
				}
				prev = sp; prevW = w;
			}
		}
		return best;
	}

	// World size of one screen pixel at a given point.
	function pixelSize(point) {
		var cam = viewer.scene.getActiveCamera();
		var h = viewer.renderer.domElement.clientHeight || 1;
		if (cam.isPerspectiveCamera) {
			var dist = point.distanceTo(cam.getWorldPosition(new V3()));
			return 2 * dist * Math.tan(cam.fov * Math.PI / 360) / h;
		}
		return (cam.top - cam.bottom) / (cam.zoom || 1) / h;
	}

	function showEdge(hit, strong) {
		if (!edgeMesh) return;
		if (!hit) { edgeMesh.visible = false; return; }
		var w = pixelSize(hit.point) * (strong ? 6 : 4.5);
		edgeMesh.position.set(EDGES[hit.edge][0], EDGES[hit.edge][1], 0);
		edgeMesh.scale.set(w / volume.scale.x, w / volume.scale.y, 1);
		edgeMesh.visible = true;
	}

	// Angle of the cursor around the box's vertical axis, measured on the horizontal plane
	// through the grabbed point. Null when the view is too side-on for that to be usable.
	function angleAt(e, drag) {
		var q = planeHit(rayFromEvent(e), drag.grab, drag.up);
		if (!q) return null;
		return Math.atan2(q.y - drag.pos.y, q.x - drag.pos.x);
	}

	// ---------- side highlight ----------

	function showFace(hit, strong) {
		if (!faceMesh) return;
		if (!hit) { faceMesh.visible = false; return; }
		faceMesh.position.set(0, 0, 0);
		faceMesh.position.setComponent(hit.axis, hit.sign * 0.5);
		faceMesh.scale.set(1, 1, 1);
		faceMesh.scale.setComponent(hit.axis, 0.0001);
		faceMesh.material.opacity = strong ? 0.32 : 0.16;
		faceMesh.visible = true;
	}

	// ---------- on / off ----------

	function enable() {
		accentColours();
		if (active) return;
		if (!viewer.scene.pointclouds.length) return; // cloud still loading
		volume = new Potree.BoxVolume();
		V3 = volume.position.constructor;
		M4 = volume.matrixWorld.constructor;
		volume.name = 'Bounding Box';
		volume.clip = true;
		volume.frame.material.color.set(COLOR);
		// Keep Potree's own picking off this box, so its transform gizmo never pops up on it.
		volume.frame.raycast = function () {};
		volume.box.raycast = function () {};

		// Faint tint on all six walls, seen from outside and inside.
		wallMesh = volume.box.clone();
		wallMesh.material = volume.box.material.clone();
		wallMesh.material.color.set(COLOR);
		wallMesh.material.opacity = WALL_OPACITY;
		wallMesh.material.side = 2; // THREE.DoubleSide
		wallMesh.raycast = function () {};
		wallMesh.visible = true;
		volume.add(wallMesh);

		faceMesh = volume.box.clone();
		faceMesh.material = volume.box.material.clone();
		faceMesh.material.color.set(HILITE);
		faceMesh.material.depthTest = false;
		faceMesh.raycast = function () {}; // never let Potree's own picking see it
		faceMesh.visible = false;
		volume.add(faceMesh);

		edgeMesh = volume.box.clone();
		edgeMesh.material = volume.box.material.clone();
		edgeMesh.material.color.set(HILITE);
		edgeMesh.material.opacity = 0.95;
		edgeMesh.material.depthTest = false;
		edgeMesh.raycast = function () {};
		edgeMesh.visible = false;
		volume.add(edgeMesh);

		if (!fitToModel()) { volume = null; faceMesh = null; edgeMesh = null; wallMesh = null; return; }
		viewer.scene.addVolume(volume);
		prevClipTask = viewer.clipTask;
		viewer.setClipTask(Potree.ClipTask.SHOW_INSIDE);
		active = true;
		shown = true;
		refreshUI();
	}

	function disable(alreadyRemoved) {
		if (!active) return;
		active = false;
		shown = false;
		endDrag();
		var v = volume;
		volume = null; faceMesh = null; edgeMesh = null; wallMesh = null;
		if (!alreadyRemoved && v) viewer.scene.removeVolume(v);
		var others = viewer.scene.volumes.some(function (x) { return x.clip; });
		if (!others && prevClipTask !== null) viewer.setClipTask(prevClipTask);
		refreshUI();
	}

	// Hide or show the box itself. The cut stays either way: Potree clips by every clip
	// volume in the scene whether or not it is visible.
	function setShown(v) {
		if (!active) return;
		shown = !!v;
		if (!shown) { endDrag(); showFace(null); showEdge(null); }
		volume.visible = shown;
		refreshUI();
	}

	function toggle() {
		if (!active) enable();
		else setShown(!shown);
	}

	// ---------- mouse ----------

	function measuring() {
		return (window.zmMeasuring && window.zmMeasuring()) || !!(viewer.inputHandler && viewer.inputHandler.drag);
	}

	function onMouseDown(e) {
		if (!active || !shown || drag) return;
		if (e.target !== viewer.renderer.domElement) return;
		if (measuring()) return; // a measurement is being placed: its clicks are not ours
		var mode = null;
		if (e.button === 2) mode = e.ctrlKey ? 'box' : 'face';
		else if (e.button === 0 && e.ctrlKey) mode = 'slide';
		if (!mode) return;
		var edge = (mode === 'face') ? pickEdge(e) : null;
		if (edge) {
			e.preventDefault();
			e.stopPropagation();
			drag = {
				mode: 'rotate', edge: edge, grab: edge.point, up: new V3(0, 0, 1),
				pos: volume.position.clone(), rot: volume.rotation.z, x0: e.clientX
			};
			drag.a0 = angleAt(e, drag);
			showFace(null);
			showEdge(edge, true);
			window.addEventListener('mousemove', onDragMove, true);
			window.addEventListener('mouseup', onDragEnd, true);
			return;
		}
		var ray = rayFromEvent(e);
		var hit = pickFace(ray);
		if (!hit) return; // not on the box: leave it to Potree (pan / orbit)
		e.preventDefault();
		e.stopPropagation();
		drag = {
			mode: mode, hit: hit,
			pos: volume.position.clone(), scale: volume.scale.clone(),
			s0: lineParam(ray, hit.point, hit.normal) || 0
		};
		showFace(hit, true);
		window.addEventListener('mousemove', onDragMove, true);
		window.addEventListener('mouseup', onDragEnd, true);
	}

	function onDragMove(e) {
		if (!drag) return;
		e.preventDefault();
		e.stopPropagation();
		if (drag.mode === 'rotate') {
			var a = drag.a0 === null ? null : angleAt(e, drag);
			if (a !== null) {
				volume.rotation.z = drag.rot + (a - drag.a0);
			} else {
				// View too side-on to read an angle off the ground plane: use sideways movement.
				volume.rotation.z = drag.rot + (e.clientX - drag.x0) * 0.4 * Math.PI / 180;
			}
			volume.updateMatrixWorld(true);
			showEdge({ edge: drag.edge.edge, point: drag.edge.point }, true);
			return;
		}
		var ray = rayFromEvent(e), h = drag.hit;
		if (drag.mode === 'box') {
			var q = planeHit(ray, h.point, h.normal);
			if (!q) return;
			volume.position.copy(drag.pos).add(q.sub(h.point));
		} else {
			var s = lineParam(ray, h.point, h.normal);
			if (s === null) return;
			var delta = s - drag.s0;
			if (drag.mode === 'slide') {
				volume.position.copy(drag.pos).add(h.normal.clone().multiplyScalar(delta));
			} else {
				var start = drag.scale.getComponent(h.axis);
				var size = Math.max(MIN_SIZE, start + delta);
				volume.scale.copy(drag.scale);
				volume.scale.setComponent(h.axis, size);
				volume.position.copy(drag.pos).add(h.normal.clone().multiplyScalar((size - start) / 2));
			}
		}
		volume.updateMatrixWorld(true);
		refreshDims();
	}

	function endDrag() {
		if (!drag) return;
		drag = null;
		window.removeEventListener('mousemove', onDragMove, true);
		window.removeEventListener('mouseup', onDragEnd, true);
		showFace(null);
		showEdge(null);
	}

	function onDragEnd(e) {
		e.preventDefault();
		e.stopPropagation();
		endDrag();
	}

	function onHover(e) {
		if (!active || !shown || drag) return;
		if (measuring()) { showFace(null); showEdge(null); return; }
		if (e.target !== viewer.renderer.domElement || e.buttons) { showFace(null); showEdge(null); return; }
		var edge = pickEdge(e);
		showEdge(edge, false);
		showFace(edge ? null : pickFace(rayFromEvent(e)), false);
	}

	// ---------- keyboard (3Dsurvey shortcuts) ----------

	function onKeyDown(e) {
		if (!active || !shown || !e.ctrlKey || e.altKey || e.metaKey) return;
		var k = e.key;
		if (k !== 'ArrowUp' && k !== 'ArrowDown' && k !== 'ArrowLeft' && k !== 'ArrowRight') return;
		var t = e.target && e.target.tagName;
		if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;
		e.preventDefault();
		e.stopPropagation();
		if (k === 'ArrowUp' || k === 'ArrowDown') {
			// One step = the box's own height, so a thin slice walks through the model
			// slice by slice; capped so a tall box doesn't jump out of the model at once.
			var step = Math.min(volume.scale.z, (modelSize ? modelSize[2] : volume.scale.z) * 0.05);
			if (e.shiftKey) step /= 10;
			volume.position.z += (k === 'ArrowUp' ? 1 : -1) * step;
		} else {
			var deg = e.shiftKey ? ROT_FINE : ROT_STEP;
			volume.rotation.z += (k === 'ArrowLeft' ? 1 : -1) * deg * Math.PI / 180;
		}
		volume.updateMatrixWorld(true);
		refreshDims();
	}

	// ---------- panel ----------

	function fmt(v) { return v >= 100 ? v.toFixed(1) : v.toFixed(2); }

	function refreshDims() {
		if (!ui.dims || !volume) return;
		ui.dims.textContent = fmt(volume.scale.x) + ' × ' + fmt(volume.scale.y) + ' × ' + fmt(volume.scale.z) + ' m';
	}

	function refreshUI() {
		if (!ui.root) return;
		ui.root.className = !active ? '' : (shown ? 'zm-on' : 'zm-cut');
		ui.toggle.setAttribute('aria-pressed', shown ? 'true' : 'false');
		ui.toggle.title = !active ? 'Bounding Box' :
			(shown ? (isSk() ? 'Skryť box (orez zostane)' : 'Hide the box (the cut stays)')
				: (isSk() ? 'Zobraziť box (orez je aktívny)' : 'Show the box (a cut is active)'));
		refreshDims();
	}

	var HINTS = [
		['Pravé tlačidlo + ťahanie', 'posun steny', 'Right-drag a side', 'move that side'],
		['Pravé tlačidlo na zvislej hrane', 'otočenie boxu', 'Right-drag a vertical edge', 'rotate the box'],
		['Ctrl + pravé tlačidlo', 'posun celého boxu', 'Ctrl + right-drag', 'move the whole box'],
		['Ctrl + ľavé tlačidlo', 'posun boxu v smere steny', 'Ctrl + left-drag', 'slide the box along a side'],
		['Ctrl + ↑ ↓', 'krok hore / dole', 'Ctrl + ↑ ↓', 'step up / down'],
		['Ctrl + ← →', 'otočenie boxu', 'Ctrl + ← →', 'rotate the box'],
		['+ Shift', 'jemný krok', '+ Shift', 'fine step']
	];

	function isSk() { return !window.zmLang || window.zmLang.get() === 'sk'; }

	function renderHints() {
		if (!ui.hints) return;
		var sk = isSk();
		ui.hints.textContent = '';
		HINTS.forEach(function (h) {
			var li = document.createElement('li'), b = document.createElement('b');
			b.textContent = sk ? h[0] : h[2];
			li.appendChild(b);
			li.appendChild(document.createTextNode(' – ' + (sk ? h[1] : h[3])));
			ui.hints.appendChild(li);
		});
	}

	function buildUI() {
		var style = document.createElement('style');
		style.textContent = [
			'#zm-bbox{position:fixed;top:12px;right:12px;z-index:10000;width:max-content;max-width:270px;',
			'font:13px/1.35 Arial,Helvetica,sans-serif;color:#e6e9ee;user-select:none}',
			'#zm-bbox button{font:inherit;cursor:pointer;border:0;border-radius:4px;color:#fff}',
			'#zm-bbox .zm-bb-toggle{display:flex;align-items:center;gap:8px;margin-left:auto;padding:7px 12px 7px 9px;font-weight:bold;white-space:nowrap;',
			'background:rgba(16,20,26,.78);box-shadow:0 1px 4px rgba(0,0,0,.4)}',
			'#zm-bbox .zm-bb-toggle svg{width:22px;height:22px;flex:none}',
			'#zm-bbox .zm-bb-toggle:hover{background:rgba(40,48,60,.9)}',
			'#zm-bbox.zm-on .zm-bb-toggle{background:var(--opcv-accent,#4c8dff)}',
			'#zm-bbox.zm-cut .zm-bb-toggle{box-shadow:inset 0 0 0 2px var(--opcv-accent,#4c8dff),0 1px 4px rgba(0,0,0,.4);color:var(--opcv-accent-text,#9cc0ff)}',
			'#zm-bbox .zm-bb-body{display:none;margin-top:6px;padding:9px 11px;border-radius:6px;',
			'background:rgba(16,20,26,.78);box-shadow:0 1px 4px rgba(0,0,0,.4)}',
			'#zm-bbox.zm-on .zm-bb-body{display:block}',
			'#zm-bbox .zm-bb-row{display:flex;align-items:center;justify-content:space-between;gap:10px}',
			'#zm-bbox .zm-bb-dims{font-weight:bold;font-variant-numeric:tabular-nums}',
			'#zm-bbox .zm-bb-reset{padding:4px 10px;background:#3b4452}',
			'#zm-bbox .zm-bb-reset:hover{background:#4a5565}',
			'#zm-bbox ul{margin:8px 0 0;padding:0;list-style:none;font-size:12px;color:#b9c0cb}',
			'#zm-bbox li{margin-top:3px}',
			'#zm-bbox b{color:#e6e9ee;font-weight:bold}',
			'@media (max-width:600px){#zm-bbox ul{display:none}}'
		].join('');
		document.head.appendChild(style);

		var root = document.createElement('div');
		root.id = 'zm-bbox';
		root.innerHTML =
			'<button type="button" class="zm-bb-toggle" aria-pressed="false" title="Bounding Box">' +
			'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">' +
			'<path d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7z"/><path d="M3.5 7 12 11.5 20.5 7M12 11.5v10"/></svg>' +
			'<span>Bounding Box</span></button>' +
			'<div class="zm-bb-body">' +
			'<div class="zm-bb-row"><span class="zm-bb-dims"></span>' +
			'<button type="button" class="zm-bb-reset">Reset</button></div>' +
			'<ul class="zm-bb-hints"></ul></div>';
		document.body.appendChild(root);
		ui.root = root;
		ui.toggle = root.querySelector('.zm-bb-toggle');
		ui.dims = root.querySelector('.zm-bb-dims');
		ui.hints = root.querySelector('.zm-bb-hints');
		renderHints();
		if (window.zmLang) window.zmLang.onChange(function () { renderHints(); refreshUI(); });
		ui.toggle.addEventListener('click', toggle);
		root.querySelector('.zm-bb-reset').addEventListener('click', function () { if (active && shown) fitToModel(); });
	}

	// ---------- start ----------

	function start(v) {
		viewer = v;
		buildUI();
		var area = viewer.renderer.domElement.parentElement || document.body;
		// Capture phase on the canvas's parent: runs before Potree's own handlers on the canvas.
		area.addEventListener('mousedown', onMouseDown, true);
		area.addEventListener('mousemove', onHover, true);
		area.addEventListener('contextmenu', function (e) { if (active && shown) e.preventDefault(); }, true);
		window.addEventListener('keydown', onKeyDown, true);
		// Removed from Potree's own scene tree / Delete key: keep our state in step.
		viewer.scene.addEventListener('volume_removed', function (e) {
			if (active && e.volume === volume) disable(true);
		});
		window.zmBBox = {
			enable: enable, disable: disable, reset: fitToModel, show: function () { setShown(true); },
			hide: function () { setShown(false); },
			isActive: function () { return active; },
			isShown: function () { return shown; },
			getVolume: function () { return volume; }
		};
	}

	var tries = 0;
	(function wait() {
		if (window.viewer && window.viewer.scene && window.viewer.renderer && window.Potree) start(window.viewer);
		else if (tries++ < 600) setTimeout(wait, 100);
	})();
})();
