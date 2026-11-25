// opcviewer: OSNAP, AutoCAD-style object snap for the measuring tools.
// While a point is being placed with any measuring tool, the cursor snaps to corners (End),
// segment middles (Mid), the foot of the perpendicular from the previous point (Perp, in
// plan) and crossings of two segments in plan (Int) of all measurements in the scene.
// A vertical bar on the right edge switches each type on and off; its header (or F4)
// switches snapping as a whole. Loaded by opcviewer-ui.js, which calls zmOsnap.attach().
// ES5, no build step (runs on stock Potree 1.8 pages).
(function () {
	'use strict';

	var RADIUS = 12; // px on screen
	var RANK = { end: 0, 'int': 1, mid: 2, perp: 3, near: 4 };
	// AutoCAD's marker shapes, drawn in a 26 x 26 box: [element, attributes].
	var TYPES = [
		{ id: 'end', sk: 'Koncový bod', en: 'Endpoint', shape: [['rect', { x: 6, y: 6, width: 14, height: 14 }]] },
		{ id: 'mid', sk: 'Stred', en: 'Midpoint', shape: [['path', { d: 'M13 5 L21.5 20 L4.5 20 Z' }]] },
		{ id: 'perp', sk: 'Kolmo', en: 'Perpendicular', shape: [['path', { d: 'M5 21 H21 M9 21 V5 M9 15 H15 V21' }]] },
		{ id: 'int', sk: 'Priesečník', en: 'Intersection', shape: [['path', { d: 'M6 6 L20 20 M20 6 L6 20' }]] },
		{ id: 'near', sk: 'Najbližší', en: 'Nearest', shape: [['path', { d: 'M6 6 H20 L6 20 H20 Z' }]] }
	];
	var STORE_KEY = 'zm-osnap';
	var MAX_INT_SEGMENTS = 400; // crossings are checked pairwise

	// ------------------------------------------------------------------ the pure part

	function lerp(a, b, t) {
		return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
	}

	// cursor {x, y} px; segments [[a, b]] and points [v] in world coordinates; prev = the
	// previous point of the measurement being drawn (or null); enabled = {on, end, mid, perp,
	// int}; project(v) -> {x, y} px or null; surfaceZ(x, y, zGuess) -> cloud height or null.
	// Returns {type, pos} of the closest target within RADIUS px, or null.
	function pick(cursor, segments, points, prev, enabled, project, surfaceZ) {
		if (!enabled || !enabled.on) return null;
		var best = null;
		var consider = function (type, pos) {
			var s = project(pos);
			if (!s) return;
			var d = Math.sqrt((s.x - cursor.x) * (s.x - cursor.x) + (s.y - cursor.y) * (s.y - cursor.y));
			if (d > RADIUS) return;
			if (!best || d < best.d - 1e-9 || (Math.abs(d - best.d) <= 1e-9 && RANK[type] < RANK[best.type])) {
				best = { type: type, pos: pos, d: d };
			}
		};
		var i, j;
		if (enabled.end) {
			for (i = 0; i < points.length; i++) consider('end', { x: points[i].x, y: points[i].y, z: points[i].z });
		}
		for (i = 0; i < segments.length; i++) {
			var a = segments[i][0], b = segments[i][1];
			if (enabled.mid) consider('mid', lerp(a, b, 0.5));
			if (enabled.perp && prev) {
				var dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
				if (len2 > 1e-12) {
					var t = ((prev.x - a.x) * dx + (prev.y - a.y) * dy) / len2;
					if (t >= 0 && t <= 1) consider('perp', lerp(a, b, t));
				}
			}
		}
		if (enabled['int'] && segments.length <= MAX_INT_SEGMENTS) {
			for (i = 0; i < segments.length; i++) {
				for (j = i + 1; j < segments.length; j++) {
					var p = segments[i][0], r = { x: segments[i][1].x - p.x, y: segments[i][1].y - p.y };
					var q = segments[j][0], s = { x: segments[j][1].x - q.x, y: segments[j][1].y - q.y };
					var den = r.x * s.y - r.y * s.x;
					if (Math.abs(den) < 1e-12) continue; // parallel in plan
					var tt = ((q.x - p.x) * s.y - (q.y - p.y) * s.x) / den;
					var uu = ((q.x - p.x) * r.y - (q.y - p.y) * r.x) / den;
					var e = 1e-9;
					if (tt < -e || tt > 1 + e || uu < -e || uu > 1 + e) continue;
					// two segments meeting at a corner: that is an end point, not a crossing
					if ((tt < e || tt > 1 - e) && (uu < e || uu > 1 - e)) continue;
					var onI = lerp(segments[i][0], segments[i][1], tt), onJ = lerp(segments[j][0], segments[j][1], uu);
					var mean = (onI.z + onJ.z) / 2;
					var at = { x: onI.x, y: onI.y, z: mean };
					// Ask the cloud for its height (a GPU pick) only for a crossing near the cursor.
					var s0 = project(at);
					if (!s0 || (s0.x - cursor.x) * (s0.x - cursor.x) + (s0.y - cursor.y) * (s0.y - cursor.y) > RADIUS * RADIUS) continue;
					var z = surfaceZ ? surfaceZ(onI.x, onI.y, mean) : null;
					if (typeof z === 'number' && isFinite(z)) at.z = z;
					consider('int', at);
				}
			}
		}
		// Nearest: any point along a line, only when no specific target is in reach (as in
		// AutoCAD, otherwise the cursor would always land on the line and never on its corners).
		if (!best && enabled.near) {
			for (i = 0; i < segments.length; i++) nearest(segments[i][0], segments[i][1]);
		}
		return best && { type: best.type, pos: best.pos };

		function nearest(a, b) {
			var pa = project(a), pb = project(b);
			if (!pa || !pb) return;
			// cheap check on the projected segment first
			var dx = pb.x - pa.x, dy = pb.y - pa.y, l2 = dx * dx + dy * dy;
			var u = l2 > 0 ? Math.max(0, Math.min(1, ((cursor.x - pa.x) * dx + (cursor.y - pa.y) * dy) / l2)) : 0;
			var ex = pa.x + u * dx - cursor.x, ey = pa.y + u * dy - cursor.y;
			if (ex * ex + ey * ey > RADIUS * RADIUS) return;
			// Then along the segment in 3D: perspective bends the screen spacing, so search for
			// the spot whose projection is closest to the cursor (one minimum on a line).
			var lo = 0, hi = 1;
			var dist = function (t) {
				var q = project(lerp(a, b, t));
				return q ? (q.x - cursor.x) * (q.x - cursor.x) + (q.y - cursor.y) * (q.y - cursor.y) : Infinity;
			};
			for (var it = 0; it < 40; it++) {
				var m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
				if (dist(m1) <= dist(m2)) hi = m2; else lo = m1;
			}
			consider('near', lerp(a, b, (lo + hi) / 2));
		}
	}

	// ------------------------------------------------------------------ settings

	var state = { on: true, end: true, mid: true, perp: false, 'int': true, near: false };
	try {
		var saved = JSON.parse(window.localStorage.getItem(STORE_KEY) || 'null');
		if (saved && typeof saved === 'object') {
			for (var k in state) if (typeof saved[k] === 'boolean') state[k] = saved[k];
		}
	} catch (e) { /* private mode, bad JSON */ }
	function store() {
		try { window.localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
	}

	// ------------------------------------------------------------------ in the viewer

	function lang() { return window.zmLang && window.zmLang.get() === 'sk' ? 'sk' : 'en'; }
	function tr(sk, en) { return lang() === 'sk' ? sk : en; }

	var bar = null, mark = null;
	var SVG_NS = 'http://www.w3.org/2000/svg';

	function drawShape(type, cls) {
		var svg = document.createElementNS(SVG_NS, 'svg');
		svg.setAttribute('viewBox', '0 0 26 26');
		svg.setAttribute('class', cls);
		svg.setAttribute('aria-hidden', 'true');
		TYPES.filter(function (t) { return t.id === type; })[0].shape.forEach(function (d) {
			var el = document.createElementNS(SVG_NS, d[0]);
			for (var k in d[1]) el.setAttribute(k, d[1][k]);
			svg.appendChild(el);
		});
		return svg;
	}

	function buildBar() {
		var style = document.createElement('style');
		// Same look as the measuring toolbar (#zm-measure): dark rounded bar, icon over label,
		// the active ones filled with the accent colour.
		style.textContent = [
			'#zm-osnap{position:fixed;right:12px;top:50%;z-index:10000;display:flex;flex-direction:column;align-items:stretch;gap:2px;',
			'padding:4px;border-radius:7px;background:rgba(16,20,26,.62);box-shadow:0 1px 3px rgba(0,0,0,.35);',
			'font:11px/1.2 Arial,Helvetica,sans-serif;color:#e6e9ee;user-select:none}',
			'#zm-osnap button{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;',
			'min-width:58px;padding:4px 4px 3px;border:0;border-radius:5px;background:transparent;color:#8a929e;',
			'font:inherit;font-size:10px;cursor:pointer;white-space:nowrap}',
			'#zm-osnap button:hover{background:rgba(255,255,255,.10);color:#e6e9ee}',
			// on: the icon in a light accent shade on a faint highlight, not a solid block
			'#zm-osnap .zm-os-t.zm-on{background:rgba(255,255,255,.10);color:#fff}',
			'#zm-osnap .zm-os-t.zm-on .zm-os-i{stroke:var(--opcv-accent-text,#9cc0ff)}',
			'#zm-osnap .zm-os-i{width:17px;height:17px;display:block;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linejoin:round;stroke-linecap:round}',
			'#zm-osnap .zm-os-head{flex-direction:row;gap:5px;padding:4px 4px;color:#e6e9ee;font-weight:bold;font-size:10px;letter-spacing:.3px}',
			'#zm-osnap .zm-os-sw{position:relative;flex:none;width:22px;height:12px;border-radius:6px;background:#4a5260;transition:background .15s}',
			'#zm-osnap .zm-os-sw:after{content:"";position:absolute;left:2px;top:2px;width:8px;height:8px;border-radius:50%;background:#fff;transition:left .15s}',
			'#zm-osnap.zm-is-on .zm-os-sw{background:var(--opcv-accent,#4c8dff)}',
			'#zm-osnap.zm-is-on .zm-os-sw:after{left:12px}',
			'#zm-osnap .zm-os-key{margin-top:-3px;text-align:center;font-size:9px;color:#6f7784}',
			'#zm-osnap .zm-os-sep{height:1px;margin:1px 3px;background:rgba(255,255,255,.14)}',
			'#zm-osnap:not(.zm-is-on) .zm-os-t{opacity:.4}',
			'@media (max-width:620px){#zm-osnap .zm-os-l,#zm-osnap .zm-os-key{display:none}#zm-osnap button{min-width:0;padding:5px}',
			'#zm-osnap .zm-os-head .zm-os-name{display:none}}',
			'#zm-osnap-mark{position:fixed;z-index:10001;pointer-events:none;display:none;color:#ffd400;',
			'font:bold 12px/1 Arial,Helvetica,sans-serif}',
			'#zm-osnap-mark svg{position:absolute;left:-11px;top:-11px;width:22px;height:22px;fill:none;stroke:#ffd400;stroke-width:2.5;',
			'stroke-linejoin:round;filter:drop-shadow(0 0 1px #000) drop-shadow(0 0 1px #000)}',
			'#zm-osnap-mark .zm-os-ml{position:absolute;left:15px;top:11px;white-space:nowrap;padding:2px 5px;border-radius:3px;',
			'background:rgba(16,20,26,.85)}'
		].join('');
		document.head.appendChild(style);

		bar = document.createElement('div');
		bar.id = 'zm-osnap';
		var head = document.createElement('button');
		head.type = 'button';
		head.className = 'zm-os-head';
		head.setAttribute('data-osnap', 'on');
		var name = document.createElement('span');
		name.className = 'zm-os-name';
		name.textContent = 'OSNAP';
		var sw = document.createElement('span');
		sw.className = 'zm-os-sw';
		head.appendChild(name);
		head.appendChild(sw);
		head.addEventListener('click', function () { toggle('on'); });
		bar.appendChild(head);
		var key = document.createElement('div');
		key.className = 'zm-os-key';
		key.textContent = 'F4';
		bar.appendChild(key);
		var sep = document.createElement('div');
		sep.className = 'zm-os-sep';
		bar.appendChild(sep);
		TYPES.forEach(function (t) {
			var b = document.createElement('button');
			b.type = 'button';
			b.className = 'zm-os-t';
			b.setAttribute('data-osnap', t.id);
			b.appendChild(drawShape(t.id, 'zm-os-i'));
			var l = document.createElement('span');
			l.className = 'zm-os-l';
			b.appendChild(l);
			b.addEventListener('click', function () { toggle(t.id); });
			bar.appendChild(b);
		});
		// keep clicks on the bar away from Potree (it would place a point under the bar)
		['mousedown', 'mouseup', 'click', 'wheel'].forEach(function (ev) {
			bar.addEventListener(ev, function (e) { e.stopPropagation(); });
		});
		document.body.appendChild(bar);

		mark = document.createElement('div');
		mark.id = 'zm-osnap-mark';
		var ml = document.createElement('span');
		ml.className = 'zm-os-ml';
		mark.appendChild(ml);
		document.body.appendChild(mark);

		label();
		if (window.zmLang && window.zmLang.onChange) window.zmLang.onChange(label);
	}

	function toggle(id) {
		state[id] = !state[id];
		store();
		label();
		if (!state.on) hideMark();
	}

	function label() {
		if (!bar) return;
		bar.classList.toggle('zm-is-on', state.on);
		var head = bar.querySelector('.zm-os-head');
		head.setAttribute('aria-pressed', String(state.on));
		head.title = tr('Prichytávanie k objektom zap./vyp. (F4)', 'Object snap on/off (F4)');
		TYPES.forEach(function (t) {
			var b = bar.querySelector('[data-osnap="' + t.id + '"]');
			b.classList.toggle('zm-on', state[t.id]);
			b.setAttribute('aria-pressed', String(state[t.id]));
			b.querySelector('.zm-os-l').textContent = tr(t.sk, t.en);
			b.title = tr(t.sk, t.en);
		});
	}

	var markType = null;
	function showMark(type, x, y) {
		var t = TYPES.filter(function (d) { return d.id === type; })[0];
		if (markType !== type) {
			var old = mark.querySelector('svg');
			if (old) mark.removeChild(old);
			mark.insertBefore(drawShape(type, 'zm-os-mg'), mark.firstChild);
			markType = type;
		}
		mark.querySelector('.zm-os-ml').textContent = tr(t.sk, t.en);
		mark.style.left = Math.round(x) + 'px';
		mark.style.top = Math.round(y) + 'px';
		mark.style.display = 'block';
	}
	function hideMark() { if (mark) mark.style.display = 'none'; }

	// Middle of the right edge, unless the Bounding Box panel, cube or compass reach down
	// there: then just below them, or to their left when there is no room below.
	function placeBar() {
		var h = window.innerHeight, bh = bar.offsetHeight;
		var top = Math.round((h - bh) / 2), right = 12;
		var above = window.zmTopRightBottom ? window.zmTopRightBottom() : 0;
		if (above && top < above + 8) {
			if (above + 8 + bh <= h - 60) top = Math.round(above + 8);
			else right = 12 + 150 + 12;
		}
		bar.style.top = top + 'px';
		bar.style.right = right + 'px';
	}

	// F4 switches snapping off and on (the owner's choice; AutoCAD uses F3).
	document.addEventListener('keydown', function (e) {
		if (e.key !== 'F4' && e.keyCode !== 115) return;
		var t = e.target && e.target.tagName;
		if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;
		e.preventDefault();
		toggle('on');
	});

	// getPlacing() -> the measurement whose last point is being placed, or null.
	function attach(viewer, getPlacing) {
		if (bar || !viewer || !viewer.renderer) return;
		buildBar();
		var canvas = viewer.renderer.domElement, area = canvas.parentElement;
		var V = viewer.scene.view.position.constructor; // Potree's THREE.Vector3
		var last = null; // the snap applied on the last mouse move

		var project = function (v) {
			var cam = viewer.scene.getActiveCamera();
			var p = new V(v.x, v.y, v.z).project(cam);
			if (!(p.z >= -1 && p.z <= 1)) return null;
			return { x: (p.x + 1) / 2 * canvas.clientWidth, y: (1 - p.y) / 2 * canvas.clientHeight };
		};
		// The cloud's surface where two segments cross: pick the cloud at that spot on screen
		// and use its height if the picked point really lies there (within 30 cm in plan).
		var surfaceZ = function (x, y, zGuess) {
			var s = project({ x: x, y: y, z: zGuess });
			if (!s || !window.Potree || !window.Potree.Utils) return null;
			try {
				var I = window.Potree.Utils.getMousePointCloudIntersection({ x: s.x, y: s.y },
					viewer.scene.getActiveCamera(), viewer, viewer.scene.pointclouds, { pickClipped: true });
				if (!I) return null;
				var dx = I.location.x - x, dy = I.location.y - y;
				return dx * dx + dy * dy <= 0.09 ? I.location.z : null;
			} catch (e) { return null; }
		};

		var placing = function () {
			var m = getPlacing();
			if (!m || viewer.scene.measurements.indexOf(m) < 0 || !m.points.length) return null;
			var drag = viewer.inputHandler && viewer.inputHandler.drag;
			if (!drag || drag.object !== m.spheres[m.spheres.length - 1]) return null;
			return m;
		};

		var targets = function (m) {
			var segs = [], pts = [];
			viewer.scene.measurements.forEach(function (mm) {
				if (mm.visible === false) return;
				var ps = mm.points.map(function (p) { return p.position; });
				var n = mm === m ? ps.length - 1 : ps.length; // not the point being placed
				for (var i = 0; i < n; i++) {
					pts.push(ps[i]);
					if (i + 1 < n) segs.push([ps[i], ps[i + 1]]);
				}
				if (mm !== m && mm.closed && n > 2) segs.push([ps[n - 1], ps[0]]);
			});
			return { segs: segs, pts: pts };
		};

		// Bubble phase on the canvas's parent: after Potree has moved the point to the cloud.
		area.addEventListener('mousemove', function (e) {
			last = null;
			var m = state.on ? placing() : null;
			if (!m) { hideMark(); return; }
			var rect = canvas.getBoundingClientRect();
			var cursor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
			var t = targets(m);
			var n = m.points.length;
			var prev = n >= 2 ? m.points[n - 2].position : null;
			var r = pick(cursor, t.segs, t.pts, prev, state, project, surfaceZ);
			if (!r) { hideMark(); return; }
			var pos = new V(r.pos.x, r.pos.y, r.pos.z);
			m.setPosition(n - 1, pos);
			last = { m: m, index: n - 1, pos: pos, x: e.clientX, y: e.clientY };
			var s = project(r.pos);
			showMark(r.type, rect.left + s.x, rect.top + s.y);
		}, false);
		// Capture phase: before Potree turns the point into a placed one, make sure it is still
		// on the snap (nothing may have moved it since the last mouse move).
		area.addEventListener('mouseup', function (e) {
			if (last && e.button === 0 && e.clientX === last.x && e.clientY === last.y &&
				last.m.points.length === last.index + 1) {
				last.m.setPosition(last.index, last.pos.clone());
			}
			hideMark();
		}, true);
		area.addEventListener('mouseleave', hideMark);

		placeBar();
		viewer.addEventListener('update', placeBar);
		window.addEventListener('resize', placeBar);
	}

	window.zmOsnap = { pick: pick, state: state, attach: attach, RADIUS: RADIUS };
})();
