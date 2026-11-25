const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { THUMBS_DIR, LOCAL_URL } = require('./config');

let launch = async () => {
  const { default: puppeteer } = await import('puppeteer');
  return puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
};

// One shared browser. If it has died since, start a new one; if starting fails, report
// that (retrying at once would just fail again, forever).
let browserPromise = null;
async function getBrowser() {
  if (browserPromise) {
    try {
      const browser = await browserPromise;
      if (browser.connected) return browser;
    } catch { /* the earlier launch failed; try a fresh one below */ }
  }
  browserPromise = launch();
  try {
    return await browserPromise;
  } catch (err) {
    browserPromise = null;
    throw err;
  }
}

function thumbnailPath(slug) {
  return path.join(THUMBS_DIR, `${slug}.jpg`);
}

async function hasThumbnail(slug) {
  try {
    await fsp.access(thumbnailPath(slug));
    return true;
  } catch {
    return false;
  }
}

async function generateNow(slug) {
  await fsp.mkdir(THUMBS_DIR, { recursive: true });
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 640, height: 400 });
    const url = `${LOCAL_URL}/${encodeURIComponent(slug)}/`;
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 4500));

    await page.evaluate(() => {
      const hideIds = ['potree_description', 'potree_quick_buttons', 'potree_annotation_container', 'zm-bbox', 'zm-measure', 'zm-branding', 'zm-volume', 'zm-osnap', 'zm-osnap-mark'];
      for (const id of hideIds) {
        const node = document.getElementById(id);
        if (node) node.style.display = 'none';
      }
    });

    const canvasHandle = await page.evaluateHandle(() => {
      const canvases = Array.from(document.querySelectorAll('#potree_render_area canvas'));
      let best = null;
      let bestArea = 0;
      for (const c of canvases) {
        const area = c.clientWidth * c.clientHeight;
        if (area > bestArea) {
          bestArea = area;
          best = c;
        }
      }
      return best;
    });
    const el = canvasHandle.asElement();
    const buf = el
      ? await el.screenshot({ type: 'jpeg', quality: 82 })
      : await page.screenshot({ type: 'jpeg', quality: 82 });
    await fsp.writeFile(thumbnailPath(slug), buf);
  } finally {
    await page.close().catch(() => {});
  }
}

// single-worker queue so we never run more than one headless render at a time
// on this box's limited CPU/RAM
const queue = [];
let running = false;

function enqueue(slug) {
  return new Promise((resolve) => {
    queue.push({ slug, resolve });
    processQueue();
  });
}

async function processQueue() {
  if (running) return;
  running = true;
  try {
    while (queue.length) {
      const { slug, resolve } = queue.shift();
      try {
        await generateNow(slug);
      } catch (err) {
        console.error(`Thumbnail generation failed for ${slug}:`, err.message);
      }
      resolve();
    }
  } finally {
    running = false;
  }
}

async function renameThumbnail(oldSlug, newSlug) {
  if (oldSlug === newSlug) return;
  try {
    await fsp.rename(thumbnailPath(oldSlug), thumbnailPath(newSlug));
  } catch {
    /* no existing thumbnail, nothing to move */
  }
}

async function deleteThumbnail(slug) {
  await fsp.rm(thumbnailPath(slug), { force: true }).catch(() => {});
}

// For tests: replace how the browser is started.
function _setLauncher(fn) { launch = fn; browserPromise = null; }

module.exports = { enqueue, generateNow, hasThumbnail, renameThumbnail, deleteThumbnail, thumbnailPath, _setLauncher };
