const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const { WWW_ROOT, UPLOADS_DIR, POTREE_CONVERTER_DIR } = require('./config');
const { renderIndexHtml, DEFAULT_SETTINGS } = require('./template');
const { writeSettingsFile } = require('./settingsIO');
const thumbnails = require('./thumbnails');

const jobs = new Map(); // jobId -> job
const queue = [];
let workerRunning = false;

function createJob({ slug, title, files, encoding }) {
  const id = crypto.randomUUID();
  const job = {
    id,
    slug,
    title,
    files,
    encoding,
    status: 'queued',
    log: [],
    error: null,
    createdAt: new Date(),
    subscribers: new Set(),
  };
  jobs.set(id, job);
  queue.push(id);
  runQueue();
  return job;
}

function appendLog(job, line) {
  job.log.push(line);
  if (job.log.length > 5000) job.log.shift();
  for (const res of job.subscribers) {
    res.write(`data: ${JSON.stringify({ line })}\n\n`);
  }
}

function broadcastStatus(job) {
  for (const res of job.subscribers) {
    res.write(`event: status\ndata: ${JSON.stringify({ status: job.status, error: job.error })}\n\n`);
  }
}

async function runQueue() {
  if (workerRunning) return;
  workerRunning = true;
  try {
    while (queue.length) {
      const id = queue.shift();
      const job = jobs.get(id);
      if (!job) continue;
      await runJob(job);
    }
  } finally {
    workerRunning = false;
  }
}

function runJob(job) {
  return new Promise((resolve) => {
    job.status = 'running';
    broadcastStatus(job);

    const projectDir = path.join(WWW_ROOT, job.slug);
    const outDir = path.join(projectDir, 'pointclouds', 'index');

    const args = [...job.files, '-o', outDir];
    if (job.encoding === 'BROTLI') {
      args.push('--encoding', 'BROTLI');
    }

    appendLog(job, `$ PotreeConverter ${args.join(' ')}`);

    const child = spawn(path.join(POTREE_CONVERTER_DIR, 'PotreeConverter'), args, {
      env: { ...process.env, LD_LIBRARY_PATH: POTREE_CONVERTER_DIR },
    });

    child.stdout.on('data', (chunk) => {
      chunk.toString('utf8').split('\n').filter(Boolean).forEach((l) => appendLog(job, l));
    });
    child.stderr.on('data', (chunk) => {
      chunk.toString('utf8').split('\n').filter(Boolean).forEach((l) => appendLog(job, l));
    });

    child.on('error', async (err) => {
      job.status = 'error';
      job.error = err.message;
      appendLog(job, `ERROR: ${err.message}`);
      broadcastStatus(job);
      resolve();
    });

    child.on('close', async (code) => {
      if (code !== 0) {
        job.status = 'error';
        job.error = `PotreeConverter exited with code ${code}`;
        appendLog(job, job.error);
        broadcastStatus(job);
        return resolve();
      }
      try {
        const settings = {
          ...DEFAULT_SETTINGS,
          title: job.title,
          metadataRelPath: 'pointclouds/index/metadata.json',
        };
        await writeSettingsFile(projectDir, settings);
        await fsp.writeFile(
          path.join(projectDir, 'index.html'),
          renderIndexHtml({ slug: job.slug, settings })
        );
        await cleanupUpload(job);
        job.status = 'done';
        appendLog(job, 'Done.');
        broadcastStatus(job);
        appendLog(job, 'Generating thumbnail...');
        thumbnails
          .enqueue(job.slug)
          .then(() => appendLog(job, 'Thumbnail ready.'))
          .catch(() => appendLog(job, 'Thumbnail generation failed (project still works fine).'));
      } catch (err) {
        job.status = 'error';
        job.error = err.message;
        appendLog(job, `ERROR finalizing project: ${err.message}`);
        broadcastStatus(job);
      }
      resolve();
    });
  });
}

async function cleanupUpload(job) {
  const dirs = new Set(job.files.map((f) => path.dirname(f)));
  for (const d of dirs) {
    if (d.startsWith(UPLOADS_DIR)) {
      await fsp.rm(d, { recursive: true, force: true }).catch(() => {});
    }
  }
}

function getJob(id) {
  return jobs.get(id) || null;
}

function subscribe(id, res) {
  const job = jobs.get(id);
  if (!job) return false;
  job.subscribers.add(res);
  res.on('close', () => job.subscribers.delete(res));
  return true;
}

function listJobs() {
  return Array.from(jobs.values())
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((j) => ({
      id: j.id,
      slug: j.slug,
      title: j.title,
      status: j.status,
      error: j.error,
      createdAt: j.createdAt,
    }));
}

module.exports = { createJob, getJob, subscribe, listJobs, appendLog };
