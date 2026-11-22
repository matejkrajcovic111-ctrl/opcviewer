const DEFAULT_SETTINGS = {
  title: '',
  metadataRelPath: 'pointclouds/index/metadata.json',
  pointBudget: 4_000_000,
  fov: 60,
  edlEnabled: true,
  useHQ: false,
  pointSize: 1,
  pointSizeType: 'ADAPTIVE', // ADAPTIVE | FIXED
  shape: 'SQUARE', // SQUARE | CIRCLE
  background: 'gradient', // skybox | gradient | black | white | none
  showSidebar: true,
  boundingBox: false, // 3Dsurvey-style Bounding Box tool (potree_libs/opcviewer-bbox.js)
  menus: { appearance: true, tools: true, clipping: true, measurements: false },
};

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function jsStr(str) {
  return JSON.stringify(String(str));
}

function renderIndexHtml({ slug, settings }) {
  const s = { ...DEFAULT_SETTINGS, ...settings, menus: { ...DEFAULT_SETTINGS.menus, ...(settings.menus || {}) } };
  const title = s.title || slug;
  const menuShowLines = Object.entries(s.menus)
    .filter(([, enabled]) => enabled)
    .map(([key]) => `\t\t\t$("#menu_${key}").next().show();`)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
	<title>${esc(title)}</title>

	<link rel="stylesheet" type="text/css" href="../potree_libs/potree/potree.css">
	<link rel="stylesheet" type="text/css" href="../potree_libs/jquery-ui/jquery-ui.min.css">
	<link rel="stylesheet" type="text/css" href="../potree_libs/openlayers3/ol.css">
	<link rel="stylesheet" type="text/css" href="../potree_libs/spectrum/spectrum.css">
	<link rel="stylesheet" type="text/css" href="../potree_libs/jstree/themes/mixed/style.css">
</head>

<body>
	<script src="../potree_libs/jquery/jquery-3.1.1.min.js"></script>
	<script src="../potree_libs/spectrum/spectrum.js"></script>
	<script src="../potree_libs/jquery-ui/jquery-ui.min.js"></script>
	<script src="../potree_libs/three.js/build/three.min.js"></script>
	<script src="../potree_libs/other/BinaryHeap.js"></script>
	<script src="../potree_libs/tween/tween.min.js"></script>
	<script src="../potree_libs/d3/d3.js"></script>
	<script src="../potree_libs/proj4/proj4.js"></script>
	<script src="../potree_libs/openlayers3/ol.js"></script>
	<script src="../potree_libs/i18next/i18next.js"></script>
	<script src="../potree_libs/jstree/jstree.js"></script>
	<script src="../potree_libs/potree/potree.js"></script>
	<script src="../potree_libs/opcviewer-branding.js"></script>
	<script src="../potree_libs/opcviewer-ui.js"></script>
${s.boundingBox ? '\t<script src="../potree_libs/opcviewer-bbox.js"></script>\n' : ''}	<script src="../potree_libs/plasio/js/laslaz.js"></script>

	<div class="potree_container" style="position: absolute; width: 100%; height: 100%; left: 0px; top: 0px; ">
		<div id="potree_render_area"></div>
		<div id="potree_sidebar_container"> </div>
	</div>

	<script>
		window.viewer = new Potree.Viewer(document.getElementById("potree_render_area"));

		viewer.setEDLEnabled(${!!s.edlEnabled});
		viewer.setFOV(${Number(s.fov) || 60});
		viewer.setPointBudget(${Math.max(100000, parseInt(s.pointBudget, 10) || 4000000)});
		viewer.useHQ = ${!!s.useHQ};
		viewer.setBackground(${jsStr(s.background)});

		viewer.loadSettingsFromURL();
		viewer.setDescription(${jsStr(title)});

		viewer.loadGUI(() => {
			viewer.setLanguage('en');
${menuShowLines}
			${s.showSidebar ? 'viewer.toggleSidebar();' : ''}
		});

		Potree.loadPointCloud(${jsStr('./' + s.metadataRelPath)}, ${jsStr(title)}, e => {
			let scene = viewer.scene;
			let pointcloud = e.pointcloud;

			let material = pointcloud.material;
			material.size = ${Number(s.pointSize) || 1};
			material.pointSizeType = Potree.PointSizeType.${s.pointSizeType === 'FIXED' ? 'FIXED' : 'ADAPTIVE'};
			material.shape = Potree.PointShape.${s.shape === 'CIRCLE' ? 'CIRCLE' : 'SQUARE'};

			scene.addPointCloud(pointcloud);

			viewer.fitToScreen();
		});
	</script>
</body>
</html>
`;
}

module.exports = { renderIndexHtml, DEFAULT_SETTINGS };
