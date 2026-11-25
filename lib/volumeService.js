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
const MAX_GRID_CELLS = grid.MAX_CELLS;

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
  const cells = grid.gridCells(poly, grid.cellSize(poly)); // counted exactly as the grid allocates
  if (!(cells <= MAX_GRID_CELLS)) throw httpError(400, 'The outline is too large for a volume (more than about 1 km x 1 km)');
  return { project, outline };
}

async function resolveVolumeProject(project, wwwRoot = WWW_ROOT) {
  const dir = path.join(wwwRoot, project);
  const st = await fs.promises.stat(dir).catch(() => null);
  const rel = st && st.isDirectory() && project !== LIBS_DIR_NAME ? await locateMetadataRelPath(dir) : null;
  // 404: the page then calculates in the browser (e.g. a page at an unusual address).
  if (!rel) throw httpError(404, 'Unknown project');
  return path.join(dir, rel);
}

// Per request, counted from its arrival (waiting included): ends before Cloudflare's own
// 100 s limit, after which nobody would receive the answer.
const TIMEOUT_MS = 90000;

// run(metadataPath, outline, signal): signal (AbortSignal, optional) = the visitor went
// away; a waiting job is dropped, a running one stopped, and its place freed (499).
function createVolumeService({ workerFile = path.join(__dirname, 'volumeWorker.js'), timeoutMs = TIMEOUT_MS, maxWaiting = 4 } = {}) {
  const waiting = [];
  let current = null; // the running job

  function settle(job, err, result) {
    if (job.done) return;
    job.done = true;
    clearTimeout(job.timer);
    if (job.signal) job.signal.removeEventListener('abort', job.onAbort);
    const i = waiting.indexOf(job);
    if (i >= 0) waiting.splice(i, 1);
    if (current === job) {
      current = null;
      if (job.worker) job.worker.terminate();
    }
    if (err) job.reject(err); else job.resolve(result);
    setImmediate(next);
  }

  function next() {
    if (current || !waiting.length) return;
    const job = waiting.shift();
    current = job;
    try {
      job.worker = new Worker(workerFile, { workerData: job.args, resourceLimits: { maxOldGenerationSizeMb: 1024 } });
    } catch (e) {
      settle(job, httpError(500, e.message));
      return;
    }
    job.worker.once('message', (m) => (m && m.error ? settle(job, httpError(500, m.error)) : settle(job, null, m.result)));
    job.worker.once('error', (e) => settle(job, httpError(500, e.message)));
    job.worker.once('exit', () => settle(job, httpError(500, 'The calculation stopped')));
  }

  return {
    run(metadataPath, outline, signal) {
      if (signal && signal.aborted) return Promise.reject(httpError(499, 'Cancelled'));
      if (waiting.length >= maxWaiting) return Promise.reject(httpError(429, 'The server is busy, try again in a moment'));
      return new Promise((resolve, reject) => {
        const job = { args: { metadataPath, outline }, resolve, reject, signal, done: false };
        job.timer = setTimeout(() => settle(job, httpError(504, 'The calculation took too long')), timeoutMs);
        if (signal) {
          job.onAbort = () => settle(job, httpError(499, 'Cancelled'));
          signal.addEventListener('abort', job.onAbort);
        }
        waiting.push(job);
        next();
      });
    },
  };
}

module.exports = { validateVolumeRequest, resolveVolumeProject, createVolumeService, MAX_OUTLINE_POINTS, MAX_GRID_CELLS, TIMEOUT_MS };
