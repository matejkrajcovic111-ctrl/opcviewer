// Viewer extras shown on every Potree project page (included from lib/template.js;
// source in viewer/ of the opcviewer repo):
//   1. Slovak interface by default, with a SK / EN switch (choice remembered per browser).
//   2. A simple measuring toolbar: point, distance, height, area, angle, volume, clear.
//      (Potree's own measuring icons in the sidebar are hidden; this replaces them.)
//   3. A one-off load-time report, sent as a tiny image request so it lands in Apache's
//      access log, where the admin app (lib/stats.js) picks it up.
(function () {
	'use strict';
	if (window.zmLang) return;

	var STORE_KEY = 'zm-lang';
	// Default when the visitor has not chosen: the branding's language (branding.json).
	var DEFAULT_LANG = 'en';

	// ---------------------------------------------------------------- language

	// Slovak for Potree's own translation keys (resources/lang/en/translation.json).
	var SK = {
		tb: {
			navigation_opt: 'Navigácia', rendering_opt: 'Vzhľad', tools_opt: 'Nástroje',
			measurments_opt: 'Merania', clipping_opt: 'Orezávanie', annotations_opt: 'Poznámky',
			materials_opt: 'Materiály', scene_opt: 'Scéna',
			classification_filter_opt: 'Filter klasifikácie', filters_opt: 'Filtre',
			parameters_opt: 'Ďalšie nastavenia', about_opt: 'O aplikácii'
		},
		tt: {
			angle_measurement: 'Meranie uhla', point_measurement: 'Súradnice bodu',
			distance_measurement: 'Meranie vzdialenosti', height_measurement: 'Meranie výšky',
			circle_measurement: 'Meranie kružnice', area_measurement: 'Meranie plochy',
			volume_measurement: 'Meranie objemu', height_profile: 'Výškový profil',
			annotation: 'Poznámka', clip_volume: 'Orezanie kvádrom', clip_polygon: 'Orezanie polygónom',
			screen_clip_box: 'Nakreslite výberový obdĺžnik. Vyžaduje ortografickú kameru!',
			clip_plane_x: 'Orezávacia rovina v osi x', clip_plane_y: 'Orezávacia rovina v osi y',
			clip_plane_z: 'Orezávacia rovina v osi z',
			remove_all_measurement: 'Odstrániť všetky merania',
			left_view_control: 'Pohľad zľava', right_view_control: 'Pohľad sprava',
			front_view_control: 'Pohľad spredu', back_view_control: 'Pohľad zozadu',
			top_view_control: 'Pohľad zhora', bottom_view_control: 'Pohľad zdola',
			focus_control: 'Zobraziť všetko', orbit_control: 'Otáčanie okolo bodu',
			flight_control: 'Voľný let', heli_control: 'Ovládanie ako vrtuľník',
			earth_control: 'Ovládanie ako mapa',
			perspective_camera_control: 'Perspektívna kamera',
			orthographic_camera_control: 'Ortografická kamera',
			navigation_cube_control: 'Navigačná kocka',
			remove_all_clipping_volumes: 'Odstrániť všetky orezania',
			compass: 'Kompas', camera_animation: 'Animácia kamery'
		},
		appearance: {
			nb_max_pts: 'Počet bodov', point_size: 'Veľkosť bodu', min_point_size: 'Minimálna veľkosť',
			point_opacity: 'Priehľadnosť', field_view: 'Zorné pole', point_size_type: 'Určenie veľkosti bodu',
			point_material: 'Materiály', elevation_range: 'Rozsah výšok', extra_range: 'Rozsah hodnôt',
			point_quality: 'Kvalita', point_shape: 'Tvar', edl_radius: 'Polomer', edl_strength: 'Sila',
			edl_opacity: 'Priehľadnosť', edl_enable: 'Zapnúť', min_node_size: 'Min. veľkosť uzla',
			clip_mode: 'Režim orezania', move_speed: 'Rýchlosť', skybox: 'Obloha',
			bottom_lock: 'Držať nad terénom', box: 'Ohraničenie', length_unit: 'Jednotka dĺžky',
			freeze: 'Uzamknúť pohľad', language: 'Jazyk', backface_culling: 'Skryť odvrátené plochy'
		},
		measurements: { clip: 'orezať', show: 'zobraziť objem' },
		annotations: { show3D: 'zobraziť v 3D', showMap: 'zobraziť na mape' },
		profile: {
			nb_points: 'Počet bodov', title: 'Výškový profil',
			save_las: 'Uložiť LAS (3D)', save_ortho: 'Uložiť CSV (2D)'
		},
		scene: { camera_position: 'Poloha kamery', camera_target: 'Cieľ kamery' },
		filters: {
			return_number: 'Číslo odrazu', number_of_returns: 'Počet odrazov',
			gps_min: 'min', gps_max: 'max', gps_time: 'GPS čas'
		},
		settings: { language: 'Jazyk' }
	};

	// Sidebar texts Potree hard-codes in English (no translation key). Exact matches only.
	var SK_FIXED = {
		'Eye-Dome-Lighting': 'Tieňovanie hrán (EDL)', 'Background': 'Pozadie', 'Other': 'Ostatné',
		'Skybox': 'Obloha', 'Gradient': 'Prechod', 'Black': 'Čierne', 'White': 'Biele', 'None': 'Žiadne',
		'Standard': 'Štandardná', 'High Quality': 'Vysoká kvalita',
		'Splat Quality': 'Kvalita vykreslenia',
		'Measurement': 'Meranie', 'Show': 'Zobraziť', 'Hide': 'Skryť',
		'Show/Hide labels': 'Zobraziť/skryť popisy',
		'Clipping': 'Orezávanie', 'Highlight': 'Zvýrazniť', 'Inside': 'Vnútri', 'Outside': 'Vonku',
		'Inside Any': 'V niektorom', 'Inside All': 'Vo všetkých', 'Clip Task': 'Spôsob orezania',
		'Clip Method': 'Metóda orezania',
		'Navigation': 'Navigácia', 'Camera Animation': 'Animácia kamery',
		'Objects': 'Objekty', 'Properties': 'Vlastnosti',
		'Point Clouds': 'Mračná bodov', 'Measurements': 'Merania', 'Annotations': 'Poznámky',
		'Vectors': 'Vektory', 'Images': 'Snímky', 'Camera': 'Kamera',
		'Classification': 'Klasifikácia', 'Returns': 'Odrazy', 'Time:': 'Čas:', 'Time: ': 'Čas: ',
		'Export:': 'Export:', 'Point size': 'Veľkosť bodu', 'Minimum size': 'Minimálna veľkosť',
		'Point sizing': 'Určenie veľkosti bodu', 'Shape': 'Tvar', 'Opacity': 'Priehľadnosť',
		'Attribute': 'Atribút', 'Attributes': 'Atribúty', 'Elevation': 'Výška', 'Color': 'Farba',
		'Fixed': 'Pevná', 'Attenuated': 'Podľa vzdialenosti', 'Adaptive': 'Adaptívna',
		'Square': 'Štvorec', 'Circle': 'Kruh', 'Paraboloid': 'Paraboloid',
		'Backface Culling': 'Skryť odvrátené plochy'
	};

	var lang = (window.opcvBranding && window.opcvBranding.lang) || DEFAULT_LANG;
	var saved = null;
	try {
		saved = window.localStorage.getItem(STORE_KEY);
		if (saved) lang = saved;
	} catch (e) { /* private mode etc. */ }

	var listeners = [];
	var origSetLanguage = null;
	var bundleAdded = false;

	function translateFixed() {
		var root = document.getElementById('potree_sidebar_container');
		if (!root) return;
		var about = document.getElementById('menu_about');
		var aboutBody = about ? about.nextElementSibling : null;
		var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
		var n;
		while ((n = walker.nextNode())) {
			if (aboutBody && aboutBody.contains(n)) continue;
			var p = n.parentNode;
			if (!p || p.hasAttribute('data-i18n') || /^(SCRIPT|STYLE|TEXTAREA)$/.test(p.tagName)) continue;
			if (p.closest && p.closest('#jstree_scene .jstree-children .jstree-children')) continue; // object names
			var orig = n.__zmOrig !== undefined ? n.__zmOrig : n.nodeValue;
			var key = orig.trim();
			if (!key) continue;
			var want = orig;
			if (lang === 'sk' && Object.prototype.hasOwnProperty.call(SK_FIXED, key)) {
				want = orig.replace(key, SK_FIXED[key]);
				n.__zmOrig = orig;
			} else if (n.__zmOrig === undefined) {
				continue;
			}
			if (n.nodeValue !== want) n.nodeValue = want;
		}
	}

	function applyLanguage() {
		if (!window.i18n || !window.jQuery) return;
		try {
			if (lang === 'sk' && !bundleAdded && window.i18n.addResourceBundle) {
				window.i18n.addResourceBundle('sk', 'translation', SK);
				bundleAdded = true;
			}
			var done = function () {
				try { window.jQuery('body').i18n(); } catch (e) { /* GUI not there yet */ }
				translateFixed();
			};
			window.i18n.setLng(lang, done);
			done();
		} catch (e) { /* i18n not initialised yet; the next call will do it */ }
		document.documentElement.lang = lang;
	}

	function setLang(l) {
		if (!l) return;
		lang = l;
		saved = l;
		try { window.localStorage.setItem(STORE_KEY, l); } catch (e) { /* ignore */ }
		applyLanguage();
		listeners.forEach(function (fn) { try { fn(lang); } catch (e) { /* ignore */ } });
	}

	// Pick the Slovak or the English text; other languages fall back to English.
	function tr(sk, en) { return lang === 'sk' ? sk : en; }

	// branding.json arrives a moment after the page starts. Without a choice of the
	// visitor's own, switch to its language then (not stored, so a later change applies).
	if (!saved && window.opcvBrandingReady) {
		window.opcvBrandingReady.then(function (b) {
			if (saved || !b || !b.lang || b.lang === lang) return;
			lang = b.lang;
			applyLanguage();
			listeners.forEach(function (fn) { try { fn(lang); } catch (e) { /* ignore */ } });
		});
	}

	window.zmLang = {
		get: function () { return lang; },
		set: setLang,
		tr: tr,
		onChange: function (fn) { listeners.push(fn); }
	};

	// Pages call viewer.setLanguage('en') themselves once the sidebar is loaded. Route every
	// such call to the visitor's own choice instead (Slovak unless they switched).
	function patchPotree() {
		if (!window.Potree || !window.Potree.Viewer || origSetLanguage) return;
		origSetLanguage = window.Potree.Viewer.prototype.setLanguage;
		window.Potree.Viewer.prototype.setLanguage = function () { applyLanguage(); };
	}
	patchPotree();

	// Potree's own language row in the sidebar: put SK first and make it use our switch.
	// The toolbar replaces Potree's measuring icons, so take that block out of the sidebar's
	// Tools menu: the "Measurement" divider, the icon row and the show/hide-labels switch.
	function hideSidebarMeasuring() {
		var tools = document.getElementById('tools');
		if (!tools) return;
		var hide = function (el) { if (el) el.style.display = 'none'; };
		hide(tools);
		var prev = tools.previousElementSibling;
		if (prev && prev.classList.contains('divider')) hide(prev);
		var sw = document.getElementById('measurement_options_show');
		var li = sw && sw.closest ? sw.closest('li') : null;
		hide(li);
		// Potree puts the "Show/Hide labels" caption in front of that switch.
		var cap = li && li.previousElementSibling;
		if (cap && cap !== tools && !cap.classList.contains('divider') && cap.id !== 'tools') hide(cap);
	}

	// Potree's sidebar, once Potree has built it (its language list is filled last): the header
	// shows opcviewer and its version instead of Potree's links; the language list (our toolbar
	// has SK/EN), the About panel and the "Box" / "Lock view" options are taken out.
	// info = {version, sourceUrl} from branding.json. Returns false while the sidebar isn't there.
	function cleanSidebar(doc, info) {
		var langs = doc.getElementById('potree_languages');
		var brand = doc.getElementById('potree_branding');
		if (!brand || !langs || !langs.children.length) return false;
		var drop = function (el) { if (el && el.parentNode) el.parentNode.removeChild(el); };
		while (brand.children.length) brand.removeChild(brand.children[0]);
		var a = doc.createElement('a');
		a.textContent = 'opcviewer';
		a.target = '_blank';
		a.rel = 'noopener';
		var src = info && info.sourceUrl ? String(info.sourceUrl).replace(/\/+$/, '') : 'https://github.com/matejkrajcovic111-ctrl/opcviewer';
		a.href = info && info.version ? src + '/releases/tag/v' + info.version : src;
		brand.appendChild(a);
		if (info && info.version) {
			brand.appendChild(doc.createTextNode(' '));
			var v = doc.createElement('span');
			v.className = 'zm-version';
			v.textContent = 'v' + info.version;
			// the header is a flex row (no visible spaces): Potree's own version styling
			v.style.marginLeft = '6px'; v.style.color = '#9AA1A4'; v.style.fontSize = '80%';
			brand.appendChild(v);
		}
		drop(langs);
		var about = doc.getElementById('menu_about');
		if (about) { drop(about.nextElementSibling); drop(about); }
		// Tools → Clipping (the Bounding Box button does the cutting): its divider, the clip
		// icons and the clip task / method rows. Navigation stays.
		var clip = doc.getElementById('clipping_tools');
		if (clip && clip.parentNode) {
			var row = Array.prototype.filter.call(clip.parentNode.children, function (e) { return e.tagName; });
			var before = row[row.indexOf(clip) - 1];
			if (before && /(^|\s)divider(\s|$)/.test(before.className || '')) drop(before);
			drop(clip);
		}
		['cliptask_options', 'clipmethod_options'].forEach(function (id) {
			var el = doc.getElementById(id), li = el;
			while (li && li.tagName !== 'LI') li = li.parentNode;
			drop(li || el);
		});
		['show_bounding_box', 'set_freeze'].forEach(function (id) {
			var input = doc.getElementById(id);
			if (!input) return;
			input.checked = false;
			var li = input;
			while (li && li.tagName !== 'LI') li = li.parentNode;
			drop(li || input);
		});
		return true;
	}
	window.zmCleanSidebar = cleanSidebar;

	// ---------------------------------------------------------------- navigation cube, compass

	// Potree draws the cube in the top-right corner, where the Bounding Box button is. Its
	// viewport is moved down by offsetTop (WebGL counts y from the bottom); every other
	// viewport is passed through unchanged.
	function navCubeViewport(x, y, w, h, width, height, offsetTop) {
		if (offsetTop > 0 && w === h && w !== width && x === width - w && y === height - w) return [x, y - offsetTop, w, h];
		return [x, y, w, h];
	}
	window.zmNavCubeViewport = navCubeViewport;

	// How far down (client px) the Bounding Box button/panel, cube and compass reach; the
	// OSNAP bar keeps clear of them.
	var stackBottom = 0;
	window.zmTopRightBottom = function () { return stackBottom; };

	function placeNavCube(viewer) {
		var r = viewer.renderer, area = viewer.renderArea;
		if (!r || !area || r.__zmCube) return;
		r.__zmCube = true;
		var offset = 0; // px from the top of the render area to the cube
		var orig = r.setViewport.bind(r);
		r.setViewport = function (x, y, w, h) {
			var f = viewer.scaleFactor || 1;
			var v = navCubeViewport(x, y, w, h, f * area.clientWidth, f * area.clientHeight, f * offset);
			return orig(v[0], v[1], v[2], v[3]);
		};
		// Below the Bounding Box button, or its panel while that is open; the compass below the cube.
		viewer.addEventListener('update', function () {
			var bb = document.getElementById('zm-bbox');
			var top = area.getBoundingClientRect().top;
			var rect = bb ? bb.getBoundingClientRect() : null;
			offset = rect && rect.height ? Math.max(0, Math.round(rect.bottom - top + 6)) : 0;
			var cube = viewer.navigationCube;
			var bottom = rect && rect.height ? rect.bottom : 0;
			if (cube && cube.visible) bottom = Math.max(bottom, top + offset + cube.width);
			if (viewer.compass && viewer.compass.dom) {
				var c = (offset || 10) + (cube && cube.visible ? cube.width + 16 : 0); // room for its rotated corners
				viewer.compass.dom.css('top', c + 'px');
				if (viewer.compass.isVisible && viewer.compass.isVisible()) bottom = Math.max(bottom, top + c + 64 + 14);
			}
			stackBottom = bottom;
		});
		// Potree picks cube faces from clientY as if the cube were at the top: a click on the
		// moved cube is handed on with clientY shifted, and the old corner no longer reacts.
		area.addEventListener('mousedown', function (e) {
			var cube = viewer.navigationCube;
			if (!cube || !cube.visible || !offset) return;
			if (e.clientX - (window.innerWidth - cube.width) < 0) return;
			var y = e.clientY - area.getBoundingClientRect().top;
			if (y >= offset && y <= offset + cube.width) {
				try { Object.defineProperty(e, 'clientY', { value: e.clientY - offset }); } catch (err) { /* ignore */ }
			} else if (y <= cube.width) {
				cube.visible = false;
				setTimeout(function () { cube.visible = true; }, 0);
			}
		}, true);
	}

	// ---------------------------------------------------------------- measuring toolbar

	var TOOLS = [
		{ id: 'point', icon: 'point.svg', sk: 'Bod', en: 'Point',
			args: { showDistances: false, showAngles: false, showCoordinates: true, showArea: false, closed: true, maxMarkers: 1, name: 'Point' } },
		{ id: 'distance', icon: 'distance.svg', sk: 'Vzdialenosť', en: 'Distance',
			args: { showDistances: true, showArea: false, closed: false, name: 'Distance' } },
		{ id: 'height', icon: 'height.svg', sk: 'Výška', en: 'Height',
			args: { showDistances: false, showHeight: true, showArea: false, closed: false, maxMarkers: 2, name: 'Height' } },
		{ id: 'area', icon: 'area.svg', sk: 'Plocha', en: 'Area',
			args: { showDistances: true, showArea: true, closed: true, name: 'Area' } },
		{ id: 'angle', icon: 'angle.png', sk: 'Uhol', en: 'Angle',
			args: { showDistances: false, showAngles: true, showArea: false, closed: true, maxMarkers: 3, name: 'Angle' } },
		{ id: 'volume', icon: 'volume.svg', sk: 'Objem', en: 'Volume',
			args: { showDistances: false, showArea: true, closed: true, name: 'Volume' } }
	];
	var HINTS = {
		distance: ['Klikajte ľavým tlačidlom na body. Pravým tlačidlom meranie ukončíte.',
			'Left-click to add points. Right-click to finish.'],
		area: ['Klikajte ľavým tlačidlom na rohy plochy. Pravým tlačidlom meranie ukončíte.',
			'Left-click the corners of the area. Right-click to finish.'],
		height: ['Kliknite na dolný a potom na horný bod.', 'Click the lower point, then the upper point.'],
		angle: ['Kliknite postupne na tri body.', 'Click three points.'],
		point: ['Kliknite na bod – zobrazia sa jeho súradnice.', 'Click a point to show its coordinates.'],
		volume: ['Klikajte ľavým tlačidlom okolo päty kopy (na terén). Pravým tlačidlom ukončíte a objem sa vypočíta.',
			'Left-click around the foot of the pile (on the ground). Right-click to finish and get the volume.']
	};

	var bar = null, hintEl = null, activeTool = null;

	// Other opcviewer scripts in this folder, loaded when first needed (pages list only this one).
	var SCRIPT_BASE = ((document.currentScript && document.currentScript.src) || '').replace(/[^\/]*$/, '');
	function loadScript(name, done) {
		var el = document.createElement('script');
		el.src = SCRIPT_BASE + name;
		el.onload = done;
		el.onerror = function () { if (window.console) console.warn('could not load ' + name); };
		document.head.appendChild(el);
	}

	// The project's folder name from the page address (/<folder>/ or /<folder>/index.html).
	function projectFolder(pathname) {
		return decodeURIComponent(String(pathname).replace(/\/index\.html$/, '').replace(/^\/+|\/+$/g, '').split('/').pop() || '');
	}
	window.zmProjectFolder = projectFolder;

	// The server's compact highlight grid (lib/volume.js) -> what showOverlay() draws from.
	function decodeHighlight(hl, plane) {
		var bin = atob(hl.h), bytes = new Uint8Array(bin.length), i;
		for (i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
		var h = new Float32Array(bytes.buffer, 0, hl.nx * hl.ny);
		var bits = atob(hl.mask), mask = new Uint8Array(hl.nx * hl.ny);
		for (i = 0; i < mask.length; i++) mask[i] = (bits.charCodeAt(i >> 3) >> (i & 7)) & 1;
		return {
			nx: hl.nx, ny: hl.ny, minX: hl.minX, minY: hl.minY, h: h, has: mask, inside: mask,
			baseZ: function (x, y) { return plane.cz + plane.a * (x - plane.cx) + plane.b * (y - plane.cy); }
		};
	}
	window.zmDecodeHighlight = decodeHighlight;

	// The measurement currently being placed (started from this toolbar or Potree's sidebar).
	var current = null;
	window.zmMeasuring = function () { return !!current; };

	// Potree 1.8 bug in current browsers: while placing a measurement, the next point is
	// supposed to follow the cursor, but Potree's own mouseup handler now runs *after* the
	// measuring tool's and drops the point again, so every point lands on the first one.
	// (Browsers used to run the two handlers in the opposite order.) Pick the point back up
	// once all of Potree's handlers have run.
	function hookMeasuring(viewer) {
		var tool = viewer.measuringTool;
		var orig = tool.startInsertion;
		tool.startInsertion = function (args) {
			var m = orig.call(tool, args);
			current = m || null;
			return m;
		};
		viewer.addEventListener('cancel_insertions', function () { current = null; });
		var area = viewer.renderer.domElement.parentElement;
		// Potree ends a fixed-size insertion (height, angle) as soon as the last point appears
		// and only drags it around after that: placing ends when a click adds no point.
		var pointsAtDown = 0;
		area.addEventListener('mousedown', function () {
			pointsAtDown = current ? current.points.length : 0;
		}, true);
		// Bubble phase on the canvas's parent = after every handler on the canvas itself.
		area.addEventListener('mouseup', function (e) {
			var m = current;
			if (!m || e.target !== viewer.renderer.domElement) return;
			var gone = viewer.scene.measurements.indexOf(m) < 0;
			var lastDropped = e.button === 0 && m.points.length >= m.maxMarkers && m.points.length <= pointsAtDown;
			if (gone || e.button === 2 || lastDropped) {
				var tool = activeTool;
				current = null;
				setActiveTool(viewer, null);
				if (tool === 'volume' && !gone) computeVolume(viewer, m);
				return;
			}
			if (e.button === 0 && !viewer.inputHandler.drag && m.spheres.length) {
				viewer.inputHandler.startDragging(m.spheres[m.spheres.length - 1]);
			}
		}, false);

		// Right-drag pans the view while a point is being placed (any measuring tool); a
		// right-click without moving still finishes the measurement. Potree keeps the point
		// being placed "grabbed" (inputHandler.drag), so its camera controls never see a drag:
		// for a right press the camera gets a fresh drag, and the point is grabbed again after.
		var canvas = viewer.renderer.domElement, pan = null;
		var placingSphere = function () {
			var m = current, ih = viewer.inputHandler;
			if (!m || !ih.drag || viewer.scene.measurements.indexOf(m) < 0 || !m.spheres.length) return null;
			var sp = m.spheres[m.spheres.length - 1];
			return ih.drag.object === sp ? sp : null;
		};
		var resume = function () {
			var p = pan;
			pan = null;
			if (!p || !p.moved) return;
			if (viewer.inputHandler.drag && !viewer.inputHandler.drag.object) viewer.inputHandler.drag = null;
			if (current === p.m && viewer.scene.measurements.indexOf(p.m) >= 0) viewer.inputHandler.startDragging(p.sphere);
		};
		area.addEventListener('mousedown', function (e) { // capture: before Potree
			if (e.button !== 2 || e.target !== canvas) return;
			var sp = placingSphere();
			if (!sp) return;
			pan = { m: current, sphere: sp, drag: viewer.inputHandler.drag, x: e.clientX, y: e.clientY, moved: false };
			viewer.inputHandler.drag = null; // so Potree's own mousedown starts a camera drag
		}, true);
		area.addEventListener('mousedown', function (e) { // bubble: after Potree
			if (!pan || e.button !== 2) return;
			var ih = viewer.inputHandler;
			// the point sits under the cursor and Potree may have grabbed it again
			if (!ih.drag || ih.drag.object) ih.startDragging(null);
		}, false);
		window.addEventListener('mousemove', function (e) {
			if (pan && !pan.moved && Math.abs(e.clientX - pan.x) + Math.abs(e.clientY - pan.y) > 3) pan.moved = true;
		}, true);
		area.addEventListener('mouseup', function (e) { // capture: before the measuring tool
			if (!pan || e.button !== 2) return;
			if (pan.moved) {
				// a pan, not a "finish": neither Potree's measuring tool nor the handler above
				// act on a middle-button release
				try { Object.defineProperty(e, 'button', { value: 1 }); } catch (err) { /* ignore */ }
			} else {
				viewer.inputHandler.drag = pan.drag; // a plain right-click: exactly as before
				pan = null;
			}
		}, true);
		area.addEventListener('mouseup', resume, false); // after Potree ended the camera drag
		window.addEventListener('mouseup', resume, false); // released outside the 3D view
	}

	function cancelMeasuring(viewer) {
		var m = current;
		viewer.dispatchEvent({ type: 'cancel_insertions' });
		current = null;
		if (viewer.inputHandler.drag) viewer.inputHandler.drag = null;
		// A measurement abandoned before it has two points is just a stray dot: remove it.
		if (m && m.points.length < 2 && viewer.scene.measurements.indexOf(m) >= 0) {
			viewer.scene.removeMeasurement(m);
		}
		setActiveTool(viewer, null);
	}

	function setActiveTool(viewer, id) {
		activeTool = id;
		if (!bar) return;
		var btns = bar.querySelectorAll('button[data-tool]');
		for (var i = 0; i < btns.length; i++) {
			btns[i].classList.toggle('zm-active', btns[i].getAttribute('data-tool') === id);
		}
		if (!id) { hintEl.style.display = 'none'; return; }
		hintEl.textContent = tr(HINTS[id][0], HINTS[id][1]);
		hintEl.style.display = 'block';
	}

	function labelToolbar() {
		if (!bar) return;
		TOOLS.forEach(function (t) {
			var b = bar.querySelector('button[data-tool="' + t.id + '"]');
			b.querySelector('span').textContent = tr(t.sk, t.en);
			b.title = tr(t.sk, t.en);
		});
		var c = bar.querySelector('.zm-ms-clear');
		c.querySelector('span').textContent = tr('Zmazať', 'Clear');
		c.title = tr('Zmazať všetky merania', 'Remove all measurements');
		var sw = bar.querySelectorAll('.zm-ms-lang button');
		for (var i = 0; i < sw.length; i++) {
			sw[i].classList.toggle('zm-active', sw[i].getAttribute('data-lang') === (lang === 'sk' ? 'sk' : 'en'));
		}
		bar.querySelector('.zm-ms-lang').title = tr('Jazyk', 'Language');
		if (activeTool) hintEl.textContent = tr(HINTS[activeTool][0], HINTS[activeTool][1]);
		renderVolumeResult();
		var guide = document.querySelector('#zm-branding .zm-guide');
		if (guide) guide.textContent = tr('Návod na použitie', 'User guide');
		var tag = document.querySelector('#zm-branding .zm-name');
		if (tag && window.opcvTagline) tag.textContent = ' · ' + window.opcvTagline(lang === 'sk' ? 'sk' : 'en');
	}

	function buildToolbar(viewer) {
		var icons = window.Potree.resourcePath + '/icons/';
		var style = document.createElement('style');
		style.textContent = [
			'#zm-measure{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);z-index:10000;',
			'display:flex;flex-direction:column;align-items:center;gap:6px;',
			'font:13px/1.3 Arial,Helvetica,sans-serif;color:#e6e9ee;user-select:none;pointer-events:none}',
			'#zm-measure .zm-ms-bar{display:flex;align-items:stretch;gap:4px;padding:5px;border-radius:8px;',
			'background:rgba(16,20,26,.78);box-shadow:0 1px 4px rgba(0,0,0,.4);pointer-events:auto}',
			'#zm-measure button{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;',
			'min-width:64px;padding:6px 8px;border:0;border-radius:6px;background:transparent;color:#e6e9ee;',
			'font:inherit;font-size:12px;cursor:pointer}',
			'#zm-measure button:hover{background:rgba(255,255,255,.12)}',
			'#zm-measure button.zm-active{background:var(--opcv-accent,#4c8dff);color:#fff}',
			'#zm-measure button img{width:26px;height:26px;display:block}',
			'#zm-measure .zm-ms-sep{width:1px;margin:4px 3px;background:rgba(255,255,255,.18)}',
			'#zm-measure .zm-ms-lang{display:flex;flex-direction:column;justify-content:center;gap:3px}',
			'#zm-measure .zm-ms-lang button{min-width:0;padding:3px 8px;font-weight:bold;font-size:11px;color:#9aa3af}',
			'#zm-measure .zm-ms-lang button.zm-active{background:rgba(255,255,255,.16);color:#fff}',
			'#zm-measure .zm-ms-hint{display:none;max-width:90vw;padding:6px 12px;border-radius:6px;',
			'background:rgba(76,141,255,.95);color:#fff;font-weight:bold;text-align:center;',
			'box-shadow:0 1px 4px rgba(0,0,0,.4)}',
			'#zm-volume{display:none;position:absolute;left:12px;top:64px;z-index:10000;min-width:300px;max-width:min(430px,calc(100% - 24px));padding:10px 34px 10px 14px;',
			'font:13px/1.3 Arial,Helvetica,sans-serif;color:#e6e9ee;',
			'border-radius:8px;background:rgba(16,20,26,.92);box-shadow:0 1px 6px rgba(0,0,0,.5);pointer-events:auto;user-select:text}',
			'#zm-volume .zm-vol-main{font-size:20px;font-weight:bold;color:#fff}',
			'#zm-volume .zm-vol-sub{margin-top:2px;color:#cfd5de}',
			'#zm-volume .zm-vol-table{margin-top:8px;padding-top:7px;border-top:1px solid rgba(255,255,255,.12);font-size:12px;color:#b9c0cb}',
			'#zm-volume .zm-vol-line{display:flex;align-items:baseline;gap:8px;margin-top:3px}',
			'#zm-volume .zm-vol-label{flex:0 0 132px}',
			'#zm-volume .zm-vol-value{flex:0 0 auto;min-width:74px;text-align:right;color:#e6e9ee;font-variant-numeric:tabular-nums}',
			'#zm-volume .zm-vol-extra{flex:1 1 auto;color:#8f98a6}',
			'#zm-volume .zm-vol-chip{display:inline-block;width:11px;height:11px;border-radius:2px;vertical-align:-1px}',
			'#zm-volume .zm-vol-chip.zm-above{background:#29d973}#zm-volume .zm-vol-chip.zm-below{background:#ff4059}',
			'#zm-volume .zm-vol-row{display:block;margin-top:8px;color:#cfd5de}',
			'#zm-volume .zm-vol-row input{width:74px;padding:3px 6px;border:1px solid #4a5565;border-radius:4px;background:#10141a;color:#fff;font:inherit}',
			'#zm-volume .zm-vol-mass{font-weight:bold;color:#fff}',
			'#zm-volume .zm-vol-note{margin-top:8px;font-size:11px;color:#8f98a6}',
			'#zm-volume button.zm-vol-close{position:absolute;top:4px;right:4px;width:26px;height:26px;padding:0;border:0;border-radius:6px;background:transparent;color:#e6e9ee;font-size:18px;line-height:1;cursor:pointer}',
			'#zm-volume button.zm-vol-close:hover{background:rgba(255,255,255,.12)}',
			'#zm-measure.zm-raised{bottom:54px}',
			'#zm-measure.zm-narrow button[data-tool] span,#zm-measure.zm-narrow .zm-ms-clear span{display:none}',
			'#zm-measure.zm-narrow button{min-width:44px;padding:6px}',
			'@media (max-width:820px){',
			'#zm-measure button{min-width:44px;padding:6px}#zm-measure button[data-tool] span,#zm-measure .zm-ms-clear span{display:none}}'
		].join('');
		document.head.appendChild(style);

		var root = document.createElement('div');
		root.id = 'zm-measure';
		var html = '<div class="zm-ms-hint"></div><div class="zm-ms-bar">';
		TOOLS.forEach(function (t) {
			html += '<button type="button" data-tool="' + t.id + '"><img alt="" src="' + icons + t.icon + '"><span></span></button>';
		});
		html += '<div class="zm-ms-sep"></div>' +
			'<button type="button" class="zm-ms-clear"><img alt="" src="' + icons + 'reset_tools.svg"><span></span></button>' +
			'<div class="zm-ms-sep"></div>' +
			'<div class="zm-ms-lang"><button type="button" data-lang="sk">SK</button>' +
			'<button type="button" data-lang="en">EN</button></div></div>';
		root.innerHTML = html;
		// Inside the render area, so it stays centred on the 3D view when the sidebar opens.
		(viewer.renderer.domElement.parentElement || document.body).appendChild(root);
		bar = root;
		hintEl = root.querySelector('.zm-ms-hint');
		// The volume result sits in the top-left corner, away from the model, so the highlight
		// it describes stays in view.
		resultEl = document.createElement('div');
		resultEl.id = 'zm-volume';
		resultEl.className = 'zm-vol';
		root.parentElement.appendChild(resultEl);

		TOOLS.forEach(function (t) {
			root.querySelector('button[data-tool="' + t.id + '"]').addEventListener('click', function () {
				cancelMeasuring(viewer);
				if (t.id === 'volume') { watched = null; hideVolumeResult(); }
				var args = {};
				for (var k in t.args) args[k] = t.args[k];
				viewer.measuringTool.startInsertion(args);
				setActiveTool(viewer, t.id);
			});
		});
		root.querySelector('.zm-ms-clear').addEventListener('click', function () {
			cancelMeasuring(viewer);
			watched = null;
			hideVolumeResult();
			viewer.scene.removeAllMeasurements();
		});
		var sw = root.querySelectorAll('.zm-ms-lang button');
		for (var i = 0; i < sw.length; i++) {
			(function (b) { b.addEventListener('click', function () { setLang(b.getAttribute('data-lang')); }); })(sw[i]);
		}
		window.addEventListener('keydown', function (e) {
			if (e.key === 'Escape' && current) cancelMeasuring(viewer);
		});
		labelToolbar();
		listeners.push(labelToolbar);
		var fit = function () {
			var w = (root.parentElement || document.body).clientWidth;
			root.classList.toggle('zm-narrow', w < 620);
			// Sit above the branding badge whenever the two would overlap.
			var badge = document.getElementById('zm-branding');
			var a = root.querySelector('.zm-ms-bar').getBoundingClientRect();
			var b = badge ? badge.getBoundingClientRect() : null;
			root.classList.toggle('zm-raised', !!b && a.right > b.left - 10 && a.left < b.right + 10);
		};
		fit();
		setInterval(fit, 500); // the sidebar opening changes the width without a resize event
	}

	// ---------------------------------------------------------------- volume of a pile

	// Feeds every point of every loaded cloud that lies over the outline to grid.add(), going
	// as deep into the octree as the grid needs. Loads the nodes it needs itself, so the
	// result does not depend on what happens to be on screen.
	function gatherPoints(viewer, grid, onProgress, onDone) {
		var MAX_POINTS = 40e6, NODE_TIMEOUT = 90000;
		var queue = [], stats = { nodes: 0, points: 0, capped: false, missing: 0, cancelled: false };
		viewer.scene.pointclouds.forEach(function (pc) {
			if (pc.pcoGeometry && pc.pcoGeometry.root) {
				pc.updateMatrixWorld(true);
				queue.push({ pc: pc, node: pc.pcoGeometry.root, since: 0 });
			}
		});
		function overlaps(pc, node) {
			var bb = node.boundingBox, e = pc.matrixWorld.elements;
			var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
			for (var i = 0; i < 8; i++) {
				var x = i & 1 ? bb.max.x : bb.min.x, y = i & 2 ? bb.max.y : bb.min.y, z = i & 4 ? bb.max.z : bb.min.z;
				var wx = e[0] * x + e[4] * y + e[8] * z + e[12], wy = e[1] * x + e[5] * y + e[9] * z + e[13];
				if (wx < x0) x0 = wx; if (wx > x1) x1 = wx; if (wy < y0) y0 = wy; if (wy > y1) y1 = wy;
			}
			return x1 >= grid.minX && x0 <= grid.maxX && y1 >= grid.minY && y0 <= grid.maxY;
		}
		// Potree 2 octrees contain empty nodes (0 points). Never ask Potree to load one: the
		// decoder never answers for an empty buffer, the node stays "loading" forever and
		// its download slot is lost - eight of those and the whole viewer stops loading.
		// Their children are already known from the hierarchy, so they can be walked as is.
		function isEmpty(node) {
			return node.nodeType !== undefined && node.nodeType !== 2 && !node.numPoints;
		}
		function pushChildren(item) {
			var node = item.node;
			for (var c = 0; c < 8; c++) if (node.children && node.children[c]) queue.push({ pc: item.pc, node: node.children[c], since: 0 });
		}
		function goDeeper(item) {
			// Each octree level halves the point spacing. Go down until the points are at
			// least twice as dense as the grid.
			var spacing = (item.pc.pcoGeometry.spacing || 1) / Math.pow(2, item.node.level || 0);
			if (spacing <= grid.cell / 2) return;
			if (stats.points > MAX_POINTS) stats.capped = true;
			else pushChildren(item);
		}
		function read(pc, node) {
			var attr = node.geometry && node.geometry.attributes && node.geometry.attributes.position;
			if (!attr) return;
			var arr = attr.array, n = Math.floor(arr.length / 3), e = pc.matrixWorld.elements, mn = node.boundingBox.min;
			for (var i = 0; i < n; i++) {
				var x = arr[i * 3] + mn.x, y = arr[i * 3 + 1] + mn.y, z = arr[i * 3 + 2] + mn.z;
				grid.add(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13],
					e[2] * x + e[6] * y + e[10] * z + e[14]);
			}
			stats.points += n;
		}
		function step() {
			if (stats.cancelled) return;
			var t0 = performance.now(), waiting = false;
			while (queue.length && performance.now() - t0 < 14) {
				var item = queue[0], node = item.node;
				if (!overlaps(item.pc, node)) { queue.shift(); continue; }
				if (isEmpty(node)) { queue.shift(); goDeeper(item); continue; }
				if (!node.loaded || !node.geometry) {
					// Take a later node that is already loaded first, if there is one.
					var ready = -1;
					for (var r2 = 1; r2 < queue.length && r2 < 200; r2++) {
						var cand = queue[r2].node;
						if (cand.loaded && cand.geometry) { ready = r2; break; }
					}
					if (ready > 0) { queue.unshift(queue.splice(ready, 1)[0]); continue; }
					if (!item.since) item.since = performance.now();
					if (performance.now() - item.since > NODE_TIMEOUT) { queue.shift(); stats.missing++; continue; }
					// Ask for this one and the next few, so downloads run side by side.
					for (var q = 0, asked = 0; q < queue.length && q < 200 && asked < 8; q++) {
						var nd = queue[q].node;
						if ((nd.loaded && nd.geometry) || isEmpty(nd)) continue;
						if (!overlaps(queue[q].pc, nd)) continue;
						asked++;
						if (!nd.loading) { try { nd.load(); } catch (err) { /* retried on the next pass */ } }
					}
					waiting = true;
					break;
				}
				queue.shift();
				read(item.pc, node);
				stats.nodes++;
				if (window.Potree.lru) { try { window.Potree.lru.touch(node); } catch (err) { /* ignore */ } }
				goDeeper(item);
			}
			if (!queue.length) { onDone(stats); return; }
			onProgress(stats, queue.length);
			setTimeout(step, waiting ? 60 : 0);
		}
		step();
		return { cancel: function () { stats.cancelled = true; } };
	}

	var volumeJob = null, resultEl = null, overlays = [];
	var COL_ABOVE = [0.16, 0.85, 0.45], COL_BELOW = [1.0, 0.25, 0.35]; // green / red

	function removeOverlay() {
		overlays.forEach(function (m) {
			if (m.parent) m.parent.remove(m);
			m.geometry.dispose();
			m.material.dispose();
		});
		overlays = [];
	}

	// Shows what the volume counted.
	//  - A see-through sheet draped over the surface inside the outline: green where it is
	//    above the base plane, red where it is below. One square per grid cell, at the
	//    height the calculation used.
	//  - Holes are also *filled*: a red lid at the base plane over every cell that lies
	//    below it, with walls down to the surface around the edge. A pile shows itself; a
	//    hole only shows what was dug, so the fill is what makes its volume visible.
	function showOverlay(viewer, r) {
		removeOverlay();
		var c = r.cells, pc = viewer.scene.pointclouds[0];
		var rootGeom = pc && pc.pcoGeometry && pc.pcoGeometry.root && pc.pcoGeometry.root.geometry;
		if (!c || !rootGeom || !rootGeom.attributes || !rootGeom.attributes.position) return;
		// THREE is bundled inside potree.js and not exported: borrow the classes from live objects.
		var BufferGeometry = rootGeom.constructor, BufferAttribute = rootGeom.attributes.position.constructor;
		var probe = new window.Potree.BoxVolume();
		var Mesh = probe.box.constructor, Material = probe.box.material.constructor;
		var host = (viewer.measuringTool && viewer.measuringTool.scene) || viewer.scene.scene;

		var nx = c.nx, ny = c.ny, cell = r.cell, idx, ix, iy;
		var top = Math.max(r.maxHeight, 0.05), deep = Math.max(r.maxDepth || 0, 0.05);
		// Ground that is level with the base wobbles a centimetre either way; don't fill that.
		var eps = Math.max(0.02, 0.02 * deep);
		// Vertices are relative to the grid corner: the world coordinates are far too large
		// for 32-bit floats (they would snap to ~6 cm steps).
		var z0 = c.baseZ(c.minX, c.minY);
		var planeAt = function (x, y) { return c.baseZ(c.minX + x, c.minY + y) - z0; };
		var counted = function (i) { return c.inside[i] && c.has[i]; };
		var dug = function (jx, jy) {
			if (jx < 0 || jy < 0 || jx >= nx || jy >= ny) return false;
			var i = jy * nx + jx;
			return counted(i) && c.h[i] < -eps;
		};

		var build = function (pos, col, opts) {
			if (!pos.length) return null;
			var geom = new BufferGeometry();
			geom.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
			geom.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
			var mat = new Material({ vertexColors: true, transparent: true, opacity: opts.opacity, depthTest: opts.depthTest, depthWrite: false, side: 2 });
			var mesh = new Mesh(geom, mat);
			mesh.position.set(c.minX, c.minY, z0);
			mesh.raycast = function () {};
			mesh.frustumCulled = false;
			mesh.renderOrder = opts.order;
			// The measuring tool's own scene is drawn after the point cloud, so this is on top.
			host.add(mesh);
			overlays.push(mesh);
			return mesh;
		};
		var quad = function (pos, col, p, rgb) { // p = 4 corners [x,y,z] in order around the quad
			var order = [0, 1, 2, 0, 2, 3];
			for (var v = 0; v < 6; v++) {
				var q = p[order[v]];
				pos.push(q[0], q[1], q[2]);
				col.push(rgb[0], rgb[1], rgb[2]);
			}
		};

		// 1. the draped sheet
		var sp = [], sc = [];
		for (iy = 0; iy < ny; iy++) for (ix = 0; ix < nx; ix++) {
			idx = iy * nx + ix;
			if (!counted(idx)) continue;
			var x = ix * cell, y = iy * cell, h = c.h[idx];
			var z = planeAt(x + cell / 2, y + cell / 2) + h;
			var base = h >= 0 ? COL_ABOVE : COL_BELOW;
			// Stronger colour the further from the base, so the shape reads.
			var k = 0.45 + 0.55 * Math.min(1, Math.abs(h) / (h >= 0 ? top : deep));
			quad(sp, sc, [[x, y, z], [x + cell, y, z], [x + cell, y + cell, z], [x, y + cell, z]], [base[0] * k, base[1] * k, base[2] * k]);
		}
		window.zmVolumeOverlay = build(sp, sc, { opacity: 0.55, depthTest: false, order: 1 });

		// 2. the fill of everything below the base
		var fp = [], fc = [], lid = [COL_BELOW[0], COL_BELOW[1] * 1.6, COL_BELOW[2] * 1.6], wall = [COL_BELOW[0] * 0.8, COL_BELOW[1] * 0.8, COL_BELOW[2] * 0.8];
		for (iy = 0; iy < ny; iy++) for (ix = 0; ix < nx; ix++) {
			if (!dug(ix, iy)) continue;
			idx = iy * nx + ix;
			var x0 = ix * cell, y0 = iy * cell, x1 = x0 + cell, y1 = y0 + cell;
			var a00 = planeAt(x0, y0), a10 = planeAt(x1, y0), a11 = planeAt(x1, y1), a01 = planeAt(x0, y1);
			quad(fp, fc, [[x0, y0, a00], [x1, y0, a10], [x1, y1, a11], [x0, y1, a01]], lid);
			var zb = planeAt(x0 + cell / 2, y0 + cell / 2) + c.h[idx]; // the surface in this cell
			if (!dug(ix - 1, iy)) quad(fp, fc, [[x0, y0, a00], [x0, y1, a01], [x0, y1, zb], [x0, y0, zb]], wall);
			if (!dug(ix + 1, iy)) quad(fp, fc, [[x1, y0, a10], [x1, y1, a11], [x1, y1, zb], [x1, y0, zb]], wall);
			if (!dug(ix, iy - 1)) quad(fp, fc, [[x0, y0, a00], [x1, y0, a10], [x1, y0, zb], [x0, y0, zb]], wall);
			if (!dug(ix, iy + 1)) quad(fp, fc, [[x0, y1, a01], [x1, y1, a11], [x1, y1, zb], [x0, y1, zb]], wall);
		}
		window.zmVolumeFill = build(fp, fc, { opacity: 0.45, depthTest: false, order: 2 });
	}

	function fmtNum(v, digits) {
		return v.toLocaleString(lang === 'sk' ? 'sk-SK' : 'en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits });
	}

	function hideVolumeResult() {
		if (volumeJob) { volumeJob.cancel(); volumeJob = null; }
		removeOverlay();
		if (resultEl) { resultEl.style.display = 'none'; resultEl.textContent = ''; resultEl.__res = null; }
	}

	function renderVolumeResult() {
		var r = resultEl && resultEl.__res;
		if (!r) return;
		var density = resultEl.__density || '';
		resultEl.textContent = '';
		var add = function (tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; resultEl.appendChild(e); return e; };
		var close = add('button', 'zm-vol-close', '×');
		close.type = 'button'; close.title = tr('Zavrieť', 'Close');
		close.addEventListener('click', hideVolumeResult);
		// A pile or a hole? Lead with whichever volume is the bigger one.
		var hole = r.below > r.above;
		var main = hole ? r.below : r.above, other = hole ? r.above : r.below;
		add('div', 'zm-vol-main', (hole ? tr('Objem jamy: ', 'Hole volume: ') : tr('Objem: ', 'Volume: ')) + fmtNum(main, main < 100 ? 2 : 1) + ' m³');
		if (hole) add('div', 'zm-vol-sub', tr('Toľko materiálu chýba po úroveň základne (na zasypanie / vyťažené).', 'Material missing up to the base level (to fill in / taken out).'));
		// The parts behind the headline, each on its own line, quieter than the headline.
		var table = add('div', 'zm-vol-table');
		var masses = [];
		var line = function (chipCls, label, volume, extra) {
			var rowEl = document.createElement('div');
			rowEl.className = 'zm-vol-line';
			var l = document.createElement('span');
			l.className = 'zm-vol-label';
			if (chipCls) { var sp = document.createElement('span'); sp.className = 'zm-vol-chip ' + chipCls; l.appendChild(sp); l.appendChild(document.createTextNode(' ')); }
			l.appendChild(document.createTextNode(label));
			var v = document.createElement('span');
			v.className = 'zm-vol-value';
			v.textContent = volume;
			rowEl.appendChild(l); rowEl.appendChild(v);
			var x = document.createElement('span');
			x.className = 'zm-vol-extra';
			x.textContent = extra || '';
			rowEl.appendChild(x);
			table.appendChild(rowEl);
			return x;
		};
		var vol = function (v) { return fmtNum(v, v < 100 ? 2 : 1) + ' m³'; };
		var xa = line('zm-above', tr('Nad základňou', 'Above the base'), vol(r.above), tr('max. výška ', 'max height ') + fmtNum(r.maxHeight, 2) + ' m');
		var xb = line('zm-below', tr('Pod základňou', 'Below the base'), vol(r.below), tr('max. hĺbka ', 'max depth ') + fmtNum(r.maxDepth, 2) + ' m');
		var net = r.above - r.below;
		var xn = line('', tr('Rozdiel (nad − pod)', 'Net (above − below)'), (net < 0 ? '−' : '') + vol(Math.abs(net)), '');
		line('', tr('Plocha obrysu', 'Outlined area'), fmtNum(r.area, 1) + ' m²', '');
		masses.push([xa, r.above, tr('max. výška ', 'max height ') + fmtNum(r.maxHeight, 2) + ' m'],
			[xb, r.below, tr('max. hĺbka ', 'max depth ') + fmtNum(r.maxDepth, 2) + ' m'], [xn, net, '']);
		var row = add('label', 'zm-vol-row');
		row.appendChild(document.createTextNode(tr('Hustota (t/m³): ', 'Density (t/m³): ')));
		var inp = document.createElement('input');
		inp.type = 'number'; inp.min = '0'; inp.step = '0.05'; inp.placeholder = tr('napr. 1,6', 'e.g. 1.6'); inp.value = density;
		row.appendChild(inp);
		var mass = document.createElement('span');
		mass.className = 'zm-vol-mass';
		row.appendChild(mass);
		var showMass = function () {
			var d = parseFloat(String(inp.value).replace(',', '.'));
			resultEl.__density = inp.value;
			mass.textContent = d > 0 ? ' → ' + fmtNum(main * d, 1) + ' t' : '';
			// the same density applied to each part
			masses.forEach(function (m) {
				var t = d > 0 ? (m[1] < 0 ? '−' : '') + fmtNum(Math.abs(m[1]) * d, 1) + ' t' : '';
				m[0].textContent = [t, m[2]].filter(Boolean).join(' · ');
			});
		};
		inp.addEventListener('input', showMass);
		inp.addEventListener('keydown', function (e) { e.stopPropagation(); }); // keep typing away from Potree's key controls
		showMass();
		add('div', 'zm-vol-note', tr('Základňa = rovina preložená kliknutými bodmi. Mriežka ', 'Base = plane through the clicked points. Grid ') +
			fmtNum(r.cell * 100, 0) + ' cm, ' + fmtNum(r.points, 0) + tr(' bodov', ' points') +
			(r.emptyShare > 0.05 ? tr('. Pozor: ', '. Note: ') + fmtNum(r.emptyShare * 100, 0) + tr(' % plochy bez bodov (doplnené z okolia)', ' % of the area had no points (filled from neighbours)') : '') +
			(r.capped ? tr('. Výpočet bol obmedzený (veľmi veľa bodov)', '. Calculation was capped (very many points)') : '') +
			(r.missing ? tr('. Pozor: časť dát sa nepodarilo načítať, výsledok môže byť nepresný', '. Note: some data could not be loaded, the result may be off') : '') + '.' +
			(r.where === 'browser' ? tr(' Vypočítané v prehliadači.', ' Calculated in your browser.') : ''));
	}

	// Keep the result in step with the outline: dragging one of its points afterwards
	// drops the old highlight straight away and recalculates when the point is let go.
	var watched = null;
	function watchOutline(viewer, measure) {
		if (watched === measure || !measure.addEventListener) return;
		watched = measure;
		var moved = false;
		measure.addEventListener('marker_moved', function () {
			if (watched !== measure || current === measure) return;
			if (!moved) {
				moved = true;
				hideVolumeResult();
				resultEl.style.display = 'block';
				resultEl.textContent = tr('Obrys sa zmenil – po pustení bodu sa objem prepočíta.', 'Outline changed – the volume is recalculated when you let go.');
			}
		});
		measure.addEventListener('marker_dropped', function () {
			if (watched !== measure || current === measure || !moved) return;
			moved = false;
			if (viewer.scene.measurements.indexOf(measure) >= 0) computeVolume(viewer, measure);
		});
		viewer.scene.addEventListener('measurement_removed', function (e) {
			if (e.measurement === measure && watched === measure) { watched = null; hideVolumeResult(); }
		});
	}

	// The calculation runs on the server (POST /opcviewer-api/volume, lib/volume.js), which
	// reads the points from its own disk: a slow connection no longer matters. The result
	// comes with a compact height grid, and the green/red highlight is drawn here as before.
	// If the server can't do it (an install without that address, busy, too slow, offline),
	// the same calculation runs in the browser. window.zmVolumeMode = 'browser' forces that.
	var VOLUME_API = SCRIPT_BASE.replace(/potree_libs\/$/, '') + 'opcviewer-api/volume';

	function computeVolume(viewer, measure) {
		hideVolumeResult();
		window.zmLastVolume = null;
		watchOutline(viewer, measure);
		var poly = measure.points.map(function (p) { return { x: p.position.x, y: p.position.y, z: p.position.z }; });
		resultEl.style.display = 'block';
		if (poly.length < 3) {
			resultEl.textContent = tr('Na výpočet objemu treba aspoň 3 body.', 'At least 3 points are needed for a volume.');
			return;
		}
		if (window.zmVolumeMode === 'browser' || !window.XMLHttpRequest) { computeInBrowser(viewer, poly); return; }
		var xhr = new XMLHttpRequest(), started = Date.now(), ticker = null;
		var job = { cancel: function () { job.cancelled = true; clearInterval(ticker); try { xhr.abort(); } catch (e) { /* ignore */ } } };
		volumeJob = job;
		var waitText = function () {
			var s = Math.round((Date.now() - started) / 1000);
			resultEl.textContent = tr('Počítam objem na serveri…', 'Calculating volume on the server…') + (s >= 2 ? ' ' + s + ' s' : '');
		};
		waitText();
		ticker = setInterval(waitText, 1000);
		var finish = function () { clearInterval(ticker); if (volumeJob === job) volumeJob = null; };
		var fallback = function () { finish(); computeInBrowser(viewer, poly); };
		xhr.open('POST', VOLUME_API);
		xhr.setRequestHeader('Content-Type', 'application/json');
		xhr.timeout = 95000; // the server gives up at 90 s, Cloudflare at 100 s
		xhr.onload = function () {
			if (job.cancelled) return;
			var r = null;
			try { r = JSON.parse(xhr.responseText); } catch (e) { /* not JSON: the server path is missing */ }
			if (xhr.status === 200 && r) { finish(); showVolume(viewer, r, 'server'); return; }
			if ((xhr.status === 400 || xhr.status === 413) && r && r.error) {
				finish();
				resultEl.textContent = tr('Objem sa nedá vypočítať: ', 'The volume cannot be calculated: ') + r.error;
				return;
			}
			fallback();
		};
		xhr.onerror = xhr.ontimeout = function () { if (!job.cancelled) fallback(); };
		xhr.send(JSON.stringify({ project: projectFolder(location.pathname), outline: poly.map(function (p) { return [p.x, p.y, p.z]; }) }));
	}

	// Shows a result (from the server or the browser): result box and highlight.
	function showVolume(viewer, r, where) {
		if (!r.points) {
			resultEl.textContent = tr('V označenej ploche nie sú žiadne body.', 'There are no points inside the outlined area.');
			return;
		}
		r.where = where;
		var overlay = r;
		if (where === 'server') {
			overlay = { cells: decodeHighlight(r.highlight, r.plane), cell: r.highlight.cell, maxHeight: r.maxHeight, maxDepth: r.maxDepth };
		}
		resultEl.__res = r;
		window.zmLastVolume = r;
		try { showOverlay(viewer, overlay); } catch (err) { if (window.console) console.warn('volume highlight failed', err); }
		renderVolumeResult();
	}

	// The same calculation in the browser: loads the octree nodes over the outline itself.
	function computeInBrowser(viewer, poly) {
		if (!window.zmVolumeGrid) { loadScript('opcviewer-grid.js', function () { computeInBrowser(viewer, poly); }); return; }
		var G = window.zmVolumeGrid, grid;
		try { grid = G.makeVolumeGrid(poly, G.cellSize(poly)); } catch (err) {
			resultEl.textContent = tr('Obrys je na výpočet objemu príliš veľký (viac ako asi 1 × 1 km).', 'The outline is too large for a volume (more than about 1 × 1 km).');
			return;
		}
		resultEl.textContent = tr('Počítam objem…', 'Calculating volume…');
		volumeJob = gatherPoints(viewer, grid, function (st) {
			resultEl.textContent = tr('Počítam objem… načítaných ', 'Calculating volume… ') + fmtNum(st.points, 0) + tr(' bodov', ' points read');
		}, function (st) {
			volumeJob = null;
			var r = G.refine(grid).result;
			r.capped = st.capped;
			r.missing = st.missing;
			showVolume(viewer, r, 'browser');
		});
	}

	// ---------------------------------------------------------------- load-time report

	// Measures how long this visit took to show the model and how fast the point data came
	// down, then reports it once. Nothing personal is sent: project folder, three numbers,
	// and whether the page was opened over the public address or the local network.
	function startLoadReport(viewer) {
		var bytes = 0, firstStart = Infinity, lastEnd = 0, hiddenSeen = document.hidden;
		var tFirst = null, sent = false, quietSince = null;
		document.addEventListener('visibilitychange', function () { if (document.hidden) hiddenSeen = true; });

		function take(list) {
			for (var i = 0; i < list.length; i++) {
				var e = list[i];
				if (!/\/(octree|hierarchy)\.bin(\?|$)/.test(e.name)) continue;
				bytes += e.transferSize || e.encodedBodySize || 0;
				if (e.startTime < firstStart) firstStart = e.startTime;
				if (e.responseEnd > lastEnd) lastEnd = e.responseEnd;
			}
		}
		try {
			new PerformanceObserver(function (l) { if (!sent) take(l.getEntries()); })
				.observe({ type: 'resource', buffered: true });
		} catch (e) { return; }

		function send(tFull) {
			if (sent) return;
			sent = true;
			if (hiddenSeen || tFirst === null) return; // background tab: timings are meaningless
			var slug = projectFolder(location.pathname);
			if (!slug) return;
			var dl = lastEnd > firstStart ? Math.round(lastEnd - firstStart) : 0;
			var lan = /^(localhost|\d+\.\d+\.\d+\.\d+)$/.test(location.hostname);
			var q = 'v=1&s=' + encodeURIComponent(slug) + '&f=' + Math.round(tFirst) + '&l=' + Math.round(tFull) +
				'&b=' + Math.round(bytes) + '&d=' + dl + '&h=' + (lan ? 'lan' : 'pub') + '&r=' + Date.now().toString(36);
			new Image().src = '../potree_libs/opcviewer-stat.gif?' + q;
		}

		var timer = setInterval(function () {
			var now = performance.now();
			var pcs = viewer.scene.pointclouds;
			var visible = 0;
			for (var i = 0; i < pcs.length; i++) visible += (pcs[i].visibleNodes || []).length;
			if (tFirst === null && visible > 0) tFirst = now;
			if (tFirst !== null) {
				// "Loaded" = nothing has been downloading for 1.5 s.
				if (window.Potree.numNodesLoading === 0) {
					if (quietSince === null) quietSince = now;
					else if (now - quietSince >= 1500) { clearInterval(timer); send(quietSince); }
				} else {
					quietSince = null;
				}
			}
			if (now > 180000) { clearInterval(timer); send(now); }
		}, 100);
	}

	// ---------------------------------------------------------------- start

	var tries = 0, guiDone = false;
	(function wait() {
		patchPotree();
		var v = window.viewer;
		if (v && v.scene && v.renderer && window.Potree) {
			if (!bar) {
				hookMeasuring(v);
				window.zmVolumeOf = function (measure) { computeVolume(v, measure); };
				buildToolbar(v);
				placeNavCube(v);
				loadScript('opcviewer-osnap.js', function () {
					if (window.zmOsnap) window.zmOsnap.attach(v, function () { return current; });
				});
				startLoadReport(v);
			}
			if (!guiDone && document.getElementById('potree_languages') && document.getElementById('potree_languages').children.length) {
				guiDone = true;
				hideSidebarMeasuring();
				(window.opcvBrandingReady || Promise.resolve({})).then(function (b) {
					cleanSidebar(document, b || {});
					// Their switches are gone: make sure they are off.
					if (v.setShowBoundingBox) v.setShowBoundingBox(false);
					if (v.setFreeze) v.setFreeze(false);
				});
				applyLanguage();
				// Sidebar panels are built lazily (object properties etc.): keep them translated.
				var sidebar = document.getElementById('potree_sidebar_container');
				var pending = false;
				if (sidebar && window.MutationObserver) {
					new MutationObserver(function () {
						if (pending) return;
						pending = true;
						setTimeout(function () { pending = false; translateFixed(); }, 150);
					}).observe(sidebar, { childList: true, subtree: true });
				}
				return;
			}
		}
		if (tries++ < 1200) setTimeout(wait, 100);
	})();
})();
