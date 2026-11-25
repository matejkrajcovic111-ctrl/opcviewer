// The public volume endpoint (POST /opcviewer-api/volume, the one address Apache passes
// to this app): checks the request, finds the project's octree and runs the calculation
// in a worker thread, one at a time with a short waiting line and a time limit.
const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');
const { WWW_ROOT, LIBS_DIR_NAME } = require('./config');
const { assertSafeSlug, locateMetadataRelPath } = require('./projects');
const grid = require('../viewer/opcviewer-grid');

const MAX_OUTLINE_POINTS = 500;
// Cells over the outline's bounding rectangle. The cell size stops at 50 cm, so without
// this a huge outline would ask for a grid far larger than memory. 4 million cells =
// about 1 km x 1 km at 50 cm.
const MAX_GRID_CELLS = 4e6;

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function validateVolumeRequest(body) {
  const { project, outline } = body || {};
  if (typeof project !== 'string' || project.length > 255 || project.startsWith('.') || project === LIBS_DIR_NAME) {
    throw httpError(400, 'Unknown project');
  }
  try { assertSafeSlug(project); } catch { throw httpError(400, 'Unknown project'); }
  if (!Array.isArray(outline) || outline.length < 3 || outline.length > MAX_OUTLINE_POINTS) {
    throw httpError(400, `The outline needs 3 to ${MAX_OUTLINE_POINTS} points`);
  }
  for (const p of outline) {
    if (!Array.isArray(p) || p.length !== 3 || !p.every((v) => typeof v === 'number' && Number.isFinite(v))) {
      throw httpError(400, 'The outline points must be [x, y, z] numbers');
    }
  }
  const poly = outline.map(([x, y, z]) => ({ x, y, z }));
  const cell = grid.cellSize(poly);
  const xs = outline.map((p) => p[0]), ys = outline.map((p) => p[1]);
  const cells = Math.ceil((Math.max(...xs) - Math.min(...xs)) / cell) * Math.ceil((Math.max(...ys) - Math.min(...ys)) / cell);
  if (!(cells <= MAX_GRID_CELLS)) throw httpError(400, 'The outline is too large for a volume (more than about 1 km x 1 km)');
  return { project, outline };
}

async function resolveVolumeProject(project, wwwRoot = WWW_ROOT) {
  const dir = path.join(wwwRoot, project);
  const st = await fs.promises.stat(dir).catch(() => null);
  const rel = st && st.isDirectory() && project !== LIBS_DIR_NAME ? await locateMetadataRelPath(dir) : null;
  if (!rel) throw httpError(400, 'Unknown project');
  return path.join(dir, rel);
}

function createVolumeService({ workerFile = path.join(__dirname, 'volumeWorker.js'), timeoutMs = 120000, maxWaiting = 4 } = {}) {
  const waiting = [];
  let running = false;

  function next() {
    if (running || !waiting.length) return;
    const job = waiting.shift();
    running = true;
    const worker = new Worker(workerFile, { workerData: job.args, resourceLimits: { maxOldGenerationSizeMb: 1024 } });
    let done = false;
    const finish = (err, result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      running = false;
      worker.terminate();
      if (err) job.reject(err); else job.resolve(result);
      next();
    };
    const timer = setTimeout(() => finish(httpError(504, 'The calculation took too long')), timeoutMs);
    worker.once('message', (m) => (m && m.error ? finish(httpError(500, m.error)) : finish(null, m.result)));
    worker.once('error', (e) => finish(httpError(500, e.message)));
    worker.once('exit', () => finish(httpError(500, 'The calculation stopped')));
  }

  return {
    run(metadataPath, outline) {
      if (waiting.length >= maxWaiting) return Promise.reject(httpError(429, 'The server is busy, try again in a moment'));
      return new Promise((resolve, reject) => {
        waiting.push({ args: { metadataPath, outline }, resolve, reject });
        next();
      });
    },
  };
}

module.exports = { validateVolumeRequest, resolveVolumeProject, createVolumeService, MAX_OUTLINE_POINTS, MAX_GRID_CELLS };
