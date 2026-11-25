// opcviewer: OSNAP, AutoCAD-style object snap for the measuring tools.
// While a point is being placed with any measuring tool, the cursor snaps to corners (End),
// segment middles (Mid), the foot of the perpendicular from the previous point (Perp, in
// plan) and crossings of two segments in plan (Int) of all measurements in the scene.
// A vertical bar on the right edge switches each type on and off; its header (or F3)
// switches snapping as a whole. Loaded by opcviewer-ui.js, which calls zmOsnap.attach().
// ES5, no build step (runs on stock Potree 1.8 pages).
(function () {
	'use strict';

	var RADIUS = 12; // px on screen
	var RANK = { end: 0, 'int': 1, mid: 2, perp: 3 };
	var TYPES = [
		{ id: 'end', glyph: '□', sk: 'Koncový bod', en: 'Endpoint' },
		{ id: 'mid', glyph: '△', sk: 'Stred', en: 'Midpoint' },
		{ id: 'perp', glyph: '⊥', sk: 'Kolmo', en: 'Perpendicular' },
		{ id: 'int', glyph: '✕', sk: 'Priesečník', en: 'Intersection' }
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
					var z = surfaceZ ? surfaceZ(onI.x, onI.y, mean) : null;
					consider('int', { x: onI.x, y: onI.y, z: typeof z === 'number' && isFinite(z) ? z : mean });
				}
			}
		}
		return best && { type: best.type, pos: best.pos };
	}

	// ------------------------------------------------------------------ settings

	var state = { on: true, end: true, mid: true, perp: false, 'int': true };
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

	function buildBar() {
		var style = document.createElement('style');
		style.textContent = [
			'#zm-osnap{position:fixed;right:12px;top:50%;z-index:10000;display:flex;flex-direction:column;gap:3px;padding:5px;',
			'border-radius:8px;background:rgba(16,20,26,.78);box-shadow:0 1px 4px rgba(0,0,0,.4);',
			'font:12px/1.2 Arial,Helvetica,sans-serif;color:#e6e9ee;user-select:none}',
			'#zm-osnap button{display:flex;align-items:center;gap:7px;padding:5px 9px 5px 7px;border:0;border-radius:5px;',
			'background:transparent;color:#e6e9ee;font:inherit;cursor:pointer;text-align:left;white-space:nowrap}',
			'#zm-osnap button:hover{background:rgba(255,255,255,.08)}',
			'#zm-osnap .zm-os-head{justify-content:center;font-weight:bold;letter-spacing:.5px;background:#3b4452}',
			'#zm-osnap .zm-os-head.zm-on{background:var(--opcv-accent,#4c8dff);color:#fff}',
			'#zm-osnap .zm-os-head.zm-on:hover{background:var(--opcv-accent-hover,#3a78e6)}',
			'#zm-osnap .zm-os-g{display:inline-block;width:16px;text-align:center;font-size:14px;color:#ffd400}',
			'#zm-osnap .zm-os-t{opacity:.45}',
			'#zm-osnap .zm-os-t .zm-os-g{color:#8a8f98}',
			'#zm-osnap .zm-os-t.zm-on{opacity:1;box-shadow:inset 3px 0 0 var(--opcv-accent,#4c8dff)}',
			'#zm-osnap .zm-os-t.zm-on .zm-os-g{color:#ffd400}',
			'#zm-osnap.zm-off .zm-os-t.zm-on{opacity:.6}',
			'@media (max-width:620px){#zm-osnap .zm-os-l{display:none}#zm-osnap button{padding:5px 6px}',
			'#zm-osnap .zm-os-head{font-size:10px;padding:4px 3px}}',
			'#zm-osnap-mark{position:fixed;z-index:10001;pointer-events:none;display:none;color:#ffd400;',
			'font:bold 12px/1 Arial,Helvetica,sans-serif;text-shadow:0 0 2px #000,0 0 2px #000}',
			'#zm-osnap-mark .zm-os-mg{position:absolute;left:-9px;top:-10px;width:18px;text-align:center;font-size:20px;line-height:20px}',
			'#zm-osnap-mark .zm-os-ml{position:absolute;left:14px;top:10px;white-space:nowrap;padding:1px 4px;border-radius:3px;',
			'background:rgba(16,20,26,.8)}'
		].join('');
		document.head.appendChild(style);

		bar = document.createElement('div');
		bar.id = 'zm-osnap';
		var head = document.createElement('button');
		head.type = 'button';
		head.className = 'zm-os-head';
		head.setAttribute('data-osnap', 'on');
		head.textContent = 'OSNAP';
		head.addEventListener('click', function () { toggle('on'); });
		bar.appendChild(head);
		TYPES.forEach(function (t) {
			var b = document.createElement('button');
			b.type = 'button';
			b.className = 'zm-os-t';
			b.setAttribute('data-osnap', t.id);
			var g = document.createElement('span');
			g.className = 'zm-os-g';
			g.textContent = t.glyph;
			var l = document.createElement('span');
			l.className = 'zm-os-l';
			b.appendChild(g);
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
		['zm-os-mg', 'zm-os-ml'].forEach(function (c) { var sp = document.createElement('span'); sp.className = c; mark.appendChild(sp); });
		document.body.appendChild(mark);

		document.addEventListener('keydown', function (e) {
			if (e.key !== 'F3' && e.keyCode !== 114) return;
			var t = e.target && e.target.tagName;
			if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;
			e.preventDefault();
			toggle('on');
		});
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
		bar.classList.toggle('zm-off', !state.on);
		var head = bar.querySelector('.zm-os-head');
		head.classList.toggle('zm-on', state.on);
		head.setAttribute('aria-pressed', String(state.on));
		head.title = tr('Prichytávanie k objektom zap./vyp. (F3)', 'Object snap on/off (F3)');
		TYPES.forEach(function (t) {
			var b = bar.querySelector('[data-osnap="' + t.id + '"]');
			b.classList.toggle('zm-on', state[t.id]);
			b.setAttribute('aria-pressed', String(state[t.id]));
			b.querySelector('.zm-os-l').textContent = tr(t.sk, t.en);
			b.title = tr(t.sk, t.en);
		});
	}

	function showMark(type, x, y) {
		var t = TYPES.filter(function (d) { return d.id === type; })[0];
		mark.querySelector('.zm-os-mg').textContent = t.glyph;
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
