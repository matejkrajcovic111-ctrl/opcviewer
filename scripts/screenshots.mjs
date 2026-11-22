// Developer tool: takes the README screenshots with headless Chrome (puppeteer).
//
//   node scripts/screenshots.mjs shots.json
//
// shots.json:
//   { "admin": "http://127.0.0.1:3301", "viewer": "http://127.0.0.1:3302",
//     "password": "…", "out": "docs/screenshots", "width": 1600, "height": 1000,
//     "shots": [ { "name": "hero", "page": "viewer", "path": "/Project/", "wait": 25000,
//                  "sidebar": false, "steps": [ ... ] }, ... ] }
//
// Steps run in order before the picture is taken:
//   { "click": "#selector" }                 click an element
//   { "mouse": [x, y], "button": "left" }    click at a point (also "right")
//   { "wait": 5000 }                         wait (ms)
//   { "eval": "js expression" }              run in the page
//   { "frame": { "pitch": -0.5, "yaw": 0.6, "zoom": 1.2 } }
//        point the camera at the middle of the data (from the position range in
//        metadata.json; Potree's own bounding box is the cubic octree root) from that
//        angle, at zoom × the data's width
// Point clouds render in software in headless Chrome, so waits are long.
import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';

const cfg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const only = process.argv[3] ? process.argv[3].split(',') : null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Potree slides a closed sidebar off-screen (its width stays); the render area's left
// edge tells whether it is open.
const SIDEBAR_CLOSE = () => {
  const area = document.getElementById('potree_render_area');
  if (window.viewer && area && area.getBoundingClientRect().left > 10) window.viewer.toggleSidebar();
};
fs.mkdirSync(cfg.out, { recursive: true });

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

async function adminLogin(page) {
  await page.goto(`${cfg.admin}/login.html`, { waitUntil: 'networkidle0' });
  const status = await page.evaluate(() => fetch('/api/setup-status').then((r) => r.json()));
  const url = status.needsSetup ? '/api/setup' : '/api/login';
  await page.evaluate((u, pw) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) }), url, cfg.password);
}

for (const shot of cfg.shots) {
  if (only && !only.includes(shot.name)) continue;
  const page = await browser.newPage();
  await page.setViewport({ width: shot.width || cfg.width, height: shot.height || cfg.height, deviceScaleFactor: 1 });
  if (shot.page === 'admin') await adminLogin(page);
  const base = shot.page === 'admin' ? cfg.admin : cfg.viewer;
  await page.goto(base + shot.path, { waitUntil: 'load', timeout: 120000 });
  if (shot.page === 'viewer' && shot.sidebar === false) {
    await sleep(3000);
    await page.evaluate(SIDEBAR_CLOSE);
  }
  await sleep(shot.wait || 3000);
  for (const step of shot.steps || []) {
    if (step.click) await page.click(step.click);
    if (step.mouse) await page.mouse.click(step.mouse[0], step.mouse[1], { button: step.button || 'left' });
    if (step.eval) await page.evaluate(step.eval);
    if (step.frame) {
      await page.evaluate((f) => {
        const pc = window.viewer.scene.pointclouds[0];
        const r = pc.pcoGeometry.pointAttributes.attributes[0].range;
        const c = pc.position.clone().set((r[0][0] + r[1][0]) / 2, (r[0][1] + r[1][1]) / 2, (r[0][2] + r[1][2]) / 2);
        const v = window.viewer.scene.view;
        v.yaw = f.yaw ?? v.yaw;
        v.pitch = f.pitch ?? -0.5;
        v.radius = Math.max(r[1][0] - r[0][0], r[1][1] - r[0][1]) * (f.zoom ?? 1.2);
        v.position.copy(c).sub(v.direction.clone().multiplyScalar(v.radius));
      }, step.frame);
    }
    await sleep(step.wait || 400);
  }
  if (shot.page === 'viewer' && shot.sidebar === false) {
    // Some pages build the sidebar late and open it again; close it once more.
    await page.evaluate(SIDEBAR_CLOSE);
    await sleep(1500);
  }
  const file = path.join(cfg.out, `${shot.name}.png`);
  await page.screenshot({ path: file });
  console.log('saved', file);
  await page.close();
}
await browser.close();
