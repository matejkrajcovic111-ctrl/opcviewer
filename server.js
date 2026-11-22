const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const util = require('util');
const execFileP = util.promisify(execFile);
const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const multer = require('multer');
const crypto = require('crypto');

const config = require('./lib/config');
const authStore = require('./lib/authStore');
const projects = require('./lib/projects');
const convert = require('./lib/convert');
const thumbnails = require('./lib/thumbnails');
const stats = require('./lib/stats');
const branding = require('./lib/branding');
const setupCode = require('./lib/setupCode');

fs.mkdirSync(config.DATA_DIR, { recursive: true });
fs.mkdirSync(config.UPLOADS_DIR, { recursive: true });
fs.mkdirSync(config.TRASH_DIR, { recursive: true });
fs.mkdirSync(config.SESSIONS_DIR, { recursive: true });

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(
  session({
    store: new FileStore({ path: config.SESSIONS_DIR, ttl: 60 * 60 * 24 * 30, retries: 0, logFn: () => {} }),
    secret: authStore.getSessionSecret(),
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 30 },
  })
);

const OPEN_PATHS = new Set(['/login.html', '/login.js', '/login-style.css', '/logo.svg']);
const OPEN_API = new Set(['/api/login', '/api/setup', '/api/setup-status']);

app.use((req, res, next) => {
  if (OPEN_PATHS.has(req.path) || OPEN_API.has(req.path)) return next();
  if (req.session && req.session.authed) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Not authenticated' });
  return res.redirect('/login.html');
});

app.use(express.static(path.join(__dirname, 'public'), {
  // Force revalidation (a cheap 304 if unchanged) instead of letting browsers
  // heuristically cache app.js/style.css - otherwise a tab left open across
  // a deploy keeps running the old JS indefinitely with no visible sign of it.
  setHeaders: (res, filePath) => {
    if (/\.(js|css|html)$/.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
  },
}));
app.use('/thumbnails', express.static(config.THUMBS_DIR, { maxAge: '5m' }));

// ---- auth ----
app.get('/api/setup-status', (req, res) => {
  res.json({ needsSetup: !authStore.isSetup(), needsCode: !authStore.isSetup() && setupCode.required() });
});

app.post('/api/setup', (req, res) => {
  if (authStore.isSetup()) return res.status(409).json({ error: 'Already set up' });
  const { password, code } = req.body || {};
  if (!setupCode.check(code)) {
    return res.status(403).json({ error: 'Wrong setup code. It was printed at the end of the installation.' });
  }
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  authStore.setPassword(password);
  setupCode.consume();
  req.session.authed = true;
  res.json({ ok: true });
});

app.post('/api/login', (req, res) => {
  const { password } = req.body || {};
  if (!authStore.isSetup()) return res.status(409).json({ error: 'Needs setup', needsSetup: true });
  if (!password || !authStore.checkPassword(password)) {
    return res.status(401).json({ error: 'Incorrect password' });
  }
  req.session.authed = true;
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// ---- client config ----
// The admin may load this panel from a LAN IP or a different hostname than
// the public viewer URL, so the frontend can't safely derive shareable links
// from window.location - it needs the actual public domain from here.
app.get('/api/config', (req, res) => {
  res.json({ publicBase: config.PUBLIC_URL });
});

// ---- branding ----
app.get('/api/branding', (req, res) => {
  res.json(branding.load());
});

app.put('/api/branding', (req, res) => {
  try {
    // Logo and favicon are changed by their own upload/remove routes, never by this form.
    const current = branding.load();
    const clean = branding.validate({ ...(req.body || {}), logo: current.logo, icons: current.icons });
    res.json(branding.save(clean));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

const brandingUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: branding.MAX_IMAGE_BYTES, files: 1 } });

app.post('/api/branding/:kind(logo|favicon)', (req, res) => {
  brandingUpload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Image must be at most 1 MB' : err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    try {
      branding.storeImage(req.params.kind, req.file.buffer, req.file.originalname);
      res.json(branding.load());
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
});

app.delete('/api/branding/:kind(logo|favicon)', (req, res) => {
  branding.removeImage(req.params.kind);
  res.json(branding.load());
});

// The admin panel runs on its own port, so it shows the uploaded images through here.
app.get('/api/branding/image/:kind(logo|favicon)', (req, res) => {
  const b = branding.load();
  const href = req.params.kind === 'logo' ? b.logo : (b.icons[0] && b.icons[0].href);
  const file = branding.imageFile(href);
  if (!file || !fs.existsSync(file)) return res.status(404).end();
  res.sendFile(file, { headers: { 'Cache-Control': 'no-cache' } });
});

// ---- disk usage ----
app.get('/api/disk-usage', async (req, res) => {
  try {
    const { stdout } = await execFileP('df', ['-B1', '--output=size,used,avail,pcent', config.WWW_ROOT]);
    const lines = stdout.trim().split('\n');
    const [sizeStr, usedStr, availStr, pcentStr] = lines[1].trim().split(/\s+/);
    res.json({
      totalBytes: parseInt(sizeStr, 10),
      usedBytes: parseInt(usedStr, 10),
      freeBytes: parseInt(availStr, 10),
      usedPercent: parseInt(pcentStr, 10),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- projects ----
app.get('/api/projects', async (req, res) => {
  try {
    res.json(await projects.listProjects());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/projects/:slug', async (req, res) => {
  try {
    const p = await projects.getProject(req.params.slug);
    if (!p) return res.status(404).json({ error: 'Not found' });
    res.json(p);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/projects/:slug/settings', async (req, res) => {
  try {
    const merged = await projects.saveSettings(req.params.slug, req.body || {});
    res.json(merged);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/projects/:slug/rename', async (req, res) => {
  try {
    const { newName } = req.body || {};
    if (!newName || !newName.trim()) return res.status(400).json({ error: 'newName is required' });
    const newSlug = await projects.renameProject(req.params.slug, newName);
    res.json({ slug: newSlug });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/projects/:slug', async (req, res) => {
  try {
    const trashId = await projects.trashProject(req.params.slug);
    res.json({ trashId });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---- thumbnails ----
app.post('/api/projects/:slug/thumbnail', async (req, res) => {
  try {
    if (!(await projects.projectExists(req.params.slug))) {
      return res.status(404).json({ error: 'Project not found' });
    }
    await thumbnails.enqueue(req.params.slug);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/thumbnails/backfill', async (req, res) => {
  try {
    const list = await projects.listProjects();
    const missing = list.filter((p) => !p.hasThumbnail);
    missing.forEach((p) => {
      thumbnails.enqueue(p.slug).catch(() => {});
    });
    res.json({ queued: missing.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- trash ----
app.get('/api/trash', async (req, res) => {
  try {
    res.json(await projects.listTrash());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/trash/:trashId/restore', async (req, res) => {
  try {
    const slug = await projects.restoreFromTrash(req.params.trashId);
    res.json({ slug });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/trash/:trashId', async (req, res) => {
  try {
    await projects.purgeFromTrash(req.params.trashId);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---- upload + convert ----
const ALLOWED_EXT = new Set(['.las', '.laz']);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(config.UPLOADS_DIR, req.uploadId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, file.originalname),
});

const upload = multer({
  storage,
  limits: { fileSize: config.MAX_UPLOAD_BYTES, files: 50 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) return cb(new Error(`Unsupported file type: ${file.originalname}`));
    cb(null, true);
  },
});

app.post(
  '/api/upload',
  (req, res, next) => {
    req.uploadId = crypto.randomUUID();
    next();
  },
  (req, res, next) => {
    upload.array('files', 50)(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message });
      next();
    });
  },
  async (req, res) => {
    try {
      const name = (req.body.name || '').trim();
      if (!name) return res.status(400).json({ error: 'Project name is required' });
      const slug = projects.slugify(name);
      if (!slug) return res.status(400).json({ error: 'Project name is invalid' });
      if (await projects.projectExists(slug)) {
        return res.status(409).json({ error: `A project named "${slug}" already exists` });
      }
      if (!req.files || !req.files.length) {
        return res.status(400).json({ error: 'No .las/.laz files uploaded' });
      }
      const encoding = req.body.encoding === 'BROTLI' ? 'BROTLI' : 'UNCOMPRESSED';
      const files = req.files.map((f) => f.path);
      const job = convert.createJob({ slug, title: name, files, encoding });
      res.json({ jobId: job.id, slug });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.get('/api/jobs', (req, res) => {
  res.json(convert.listJobs());
});

app.get('/api/jobs/:id', (req, res) => {
  const job = convert.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Not found' });
  res.json({
    id: job.id,
    slug: job.slug,
    title: job.title,
    status: job.status,
    error: job.error,
    log: job.log,
  });
});

app.get('/api/jobs/:id/stream', (req, res) => {
  const job = convert.getJob(req.params.id);
  if (!job) return res.status(404).end();
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(`event: status\ndata: ${JSON.stringify({ status: job.status, error: job.error })}\n\n`);
  for (const line of job.log) {
    res.write(`data: ${JSON.stringify({ line })}\n\n`);
  }
  convert.subscribe(req.params.id, res);
});

app.listen(config.PORT, config.HOST, () => {
  console.log(`opcviewer listening on http://${config.HOST}:${config.PORT}`);
});

// Read Apache's access log for views / load reports. Also runs whenever the project list
// is opened; the timer makes sure a daily log rotation is never missed while nobody looks.
stats.scan(true);
try { branding.publish(); } catch (err) { console.error('branding publish failed:', err.message); }
setInterval(() => stats.scan(true), 10 * 60 * 1000).unref();
