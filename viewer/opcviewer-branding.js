// Branding on every opcviewer project page: the badge (company name, website, user-guide
// button, optional logo), the browser-tab icon, the default language and the accent colour.
// Settings come from potree_libs/opcviewer/branding.json, written by the admin panel
// (Branding dialog). Without it the page is plain opcviewer: no badge, English, blue.
(function () {
	'use strict';
	if (window.opcvBrandingReady) return;

	var DEFAULTS = { name: '', tagline: '', url: '', guideUrl: '', lang: 'en', accent: '#4c8dff', logo: null, icons: [] };
	var LIBS = '../potree_libs/';
	var DEFAULT_HOVER = { '#4c8dff': '#3a78e6' };

	// Paths in branding.json are either site paths ("/favicon.ico") or files published
	// next to it ("opcviewer/logo.png", relative to potree_libs).
	function src(href) { return href.charAt(0) === '/' ? href : LIBS + href; }

	function hex(c) { return /^#[0-9a-f]{6}$/i.test(c || '') ? c.toLowerCase() : DEFAULTS.accent; }

	// Mix a colour with white (amount > 0) or black (amount < 0).
	function mix(c, amount) {
		var n = parseInt(c.slice(1), 16), out = '#';
		for (var s = 16; s >= 0; s -= 8) {
			var v = (n >> s) & 255;
			v = amount > 0 ? v + (255 - v) * amount : v * (1 + amount);
			out += ('0' + Math.round(v).toString(16)).slice(-2);
		}
		return out;
	}

	function storedLang() {
		try { return window.localStorage.getItem('zm-lang'); } catch (e) { return null; }
	}

	function setIcons(icons) {
		if (!icons || !icons.length) return;
		var old = document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]');
		for (var i = 0; i < old.length; i++) old[i].parentNode.removeChild(old[i]);
		icons.forEach(function (d) {
			var l = document.createElement('link');
			l.rel = d.rel; l.href = src(d.href);
			if (d.type) l.type = d.type;
			if (d.sizes) l.sizes = d.sizes;
			document.head.appendChild(l);
		});
	}

	function link(cls, href) {
		var a = document.createElement('a');
		if (cls) a.className = cls;
		a.href = href;
		a.target = '_blank';
		a.rel = 'noopener';
		return a;
	}

	function injectBadge(b) {
		if (!b.name && !b.logo) return;
		if (document.getElementById('zm-branding')) return;
		var style = document.createElement('style');
		style.textContent = [
			'#zm-branding{position:fixed;right:12px;bottom:12px;z-index:10000;',
			'display:flex;align-items:center;gap:10px;padding:6px 12px;border-radius:6px;',
			'background:rgba(16,20,26,.78);color:#e6e9ee;font:13px/1.3 Arial,Helvetica,sans-serif;',
			'box-shadow:0 1px 4px rgba(0,0,0,.4);pointer-events:auto;user-select:none}',
			'#zm-branding a{color:#e6e9ee;text-decoration:none}',
			'#zm-branding a:hover{text-decoration:underline}',
			'#zm-branding .zm-guide{background:var(--opcv-accent,#4c8dff);color:#fff;padding:3px 9px;border-radius:4px;font-weight:bold}',
			'#zm-branding .zm-guide:hover{text-decoration:none;background:var(--opcv-accent-hover,#3a78e6)}',
			'#zm-branding .zm-logo{height:20px;width:auto;display:block}',
			'#zm-branding a.zm-site{display:flex;align-items:center;gap:8px}',
			'@media (max-width:600px){#zm-branding{font-size:11px;padding:4px 8px;gap:6px;right:6px;bottom:6px}',
			'#zm-branding .zm-name{display:none}}'
		].join('');
		document.head.appendChild(style);

		var box = document.createElement('div');
		box.id = 'zm-branding';
		var lang = storedLang() || b.lang;
		if (b.guideUrl) {
			var g = link('zm-guide', b.guideUrl);
			g.textContent = lang === 'sk' ? 'Návod na použitie' : 'User guide';
			box.appendChild(g);
		}
		// Without a website the name is plain text in a span instead of a link.
		var site = b.url ? link(b.logo ? 'zm-site' : '', b.url) : document.createElement('span');
		if (b.logo) {
			if (!b.url) site.className = 'zm-site';
			var img = document.createElement('img');
			img.className = 'zm-logo';
			img.src = src(b.logo);
			img.alt = '';
			site.appendChild(img);
		}
		if (b.name) site.appendChild(document.createTextNode(b.name));
		if (b.tagline) {
			var t = document.createElement('span');
			t.className = 'zm-name';
			t.textContent = ' · ' + b.tagline;
			site.appendChild(t);
		}
		box.appendChild(site);
		document.body.appendChild(box);
	}

	function apply(b) {
		var accent = hex(b.accent);
		b.accent = accent;
		var root = document.documentElement.style;
		root.setProperty('--opcv-accent', accent);
		root.setProperty('--opcv-accent-hover', DEFAULT_HOVER[accent] || mix(accent, -0.12));
		root.setProperty('--opcv-accent-light', mix(accent, 0.6));   // #b7d1ff for the default
		root.setProperty('--opcv-accent-text', mix(accent, 0.445));  // #9cc0ff for the default
		setIcons(b.icons);
		if (document.readyState === 'loading') {
			document.addEventListener('DOMContentLoaded', function () { injectBadge(b); });
		} else {
			injectBadge(b);
		}
	}

	function merge(json) {
		var b = {};
		for (var k in DEFAULTS) b[k] = DEFAULTS[k];
		if (json && typeof json === 'object') {
			for (var j in DEFAULTS) if (json[j] !== undefined && json[j] !== null) b[j] = json[j];
			if (json.logo === null) b.logo = null;
		}
		if (b.lang !== 'sk' && b.lang !== 'en') b.lang = DEFAULTS.lang;
		if (!Array.isArray(b.icons)) b.icons = [];
		return b;
	}

	// The other viewer scripts read window.opcvBranding (defaults until the file arrives)
	// and can wait for window.opcvBrandingReady, which never rejects and never takes long.
	window.opcvBranding = merge(null);
	window.opcvBrandingReady = new Promise(function (resolve) {
		var done = false;
		function finish(json) {
			if (done) return;
			done = true;
			var b = merge(json);
			window.opcvBranding = b;
			try { apply(b); } catch (e) { /* branding is decoration: never break the viewer */ }
			resolve(b);
		}
		setTimeout(function () { finish(null); }, 1500);
		try {
			window.fetch(LIBS + 'opcviewer/branding.json', { cache: 'no-store' })
				.then(function (r) { return r.ok ? r.json() : null; })
				.then(finish, function () { finish(null); });
		} catch (e) { finish(null); }
	});
})();
