const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { execFile } = require('child_process');
const util = require('util');
const execFileP = util.promisify(execFile);

const { WWW_ROOT, LIBS_DIR_NAME, TRASH_DIR } = require('./config');
const { renderIndexHtml } = require('./template');
const { readSettingsFile, writeSettingsFile } = require('./settingsIO');
const stats = require('./stats');
const thumbnails = require('./thumbnails');

function slugify(name) {
  return String(name)
    .trim()
    .replace(/[^a-zA-Z0-9_\- ]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 80);
}

async function pathExists(p) {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

// Find the metadata.json for a project regardless of which layout convention was used.
// Returns the path relative to the project directory (posix-style, for use in HTML), or null.
async function locateMetadataRelPath(projectDir) {
  const candidates = [
    'pointclouds/index/metadata.json',
    'pointclouds/metadata.json',
  ];
  for (const rel of candidates) {
    if (await pathExists(path.join(projectDir, rel))) return rel;
  }
  const pointcloudsDir = path.join(projectDir, 'pointclouds');
  if (await pathExists(pointcloudsDir)) {
    const entries = await fsp.readdir(pointcloudsDir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const rel = `pointclouds/${entry.name}/metadata.json`;
        if (await pathExists(path.join(projectDir, rel))) return rel;
      }
    }
  }
  return null;
}

async function dirSizeBytes(dir) {
  try {
    const { stdout } = await execFileP('du', ['-sb', dir]);
    return parseInt(stdout.split(/\s+/)[0], 10) || 0;
  } catch {
    return 0;
  }
}

async function listProjects() {
  await stats.scan(); // pick up new views / load reports from Apache's log (cheap, incremental)
  const entries = await fsp.readdir(WWW_ROOT, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === LIBS_DIR_NAME) continue;
    if (entry.name.startsWith('.')) continue;
    const projectDir = path.join(WWW_ROOT, entry.name);
    const metaRel = await locateMetadataRelPath(projectDir);
    if (!metaRel) continue; // not a recognizable potree project, skip

    let meta = {};
    try {
      meta = JSON.parse(await fsp.readFile(path.join(projectDir, metaRel), 'utf8'));
    } catch {
      meta = {};
    }

    const [size, stat, settings, thumb] = await Promise.all([
      dirSizeBytes(projectDir),
      fsp.stat(projectDir),
      readSettingsFile(projectDir, { title: entry.name, metadataRelPath: metaRel }),
      thumbnails.hasThumbnail(entry.name),
    ]);

    results.push({
      slug: entry.name,
      title: settings.title || entry.name,
      points: meta.points || null,
      boundingBox: meta.boundingBox || null,
      sizeBytes: size,
      modifiedAt: stat.mtime,
      metadataRelPath: metaRel,
      settings,
      hasThumbnail: thumb,
      stats: stats.summary(entry.name),
    });
  }
  results.sort((a, b) => a.title.localeCompare(b.title));
  return results;
}

async function getProject(slug) {
  const projectDir = path.join(WWW_ROOT, slug);
  if (!(await pathExists(projectDir))) return null;
  const metaRel = await locateMetadataRelPath(projectDir);
  if (!metaRel) return null;
  const settings = await readSettingsFile(projectDir, { title: slug, metadataRelPath: metaRel });
  let meta = {};
  try {
    meta = JSON.parse(await fsp.readFile(path.join(projectDir, metaRel), 'utf8'));
  } catch {
    meta = {};
  }
  const hasThumbnail = await thumbnails.hasThumbnail(slug);
  return { slug, projectDir, metadataRelPath: metaRel, settings, meta, hasThumbnail };
}

function assertSafeSlug(slug) {
  if (!slug || slug.includes('..') || slug.includes('/') || slug.includes('\\')) {
    throw new Error('Invalid project name');
  }
}

async function saveSettings(slug, partialSettings) {
  assertSafeSlug(slug);
  const projectDir = path.join(WWW_ROOT, slug);
  if (!(await pathExists(projectDir))) throw new Error('Project not found');
  const metaRel = await locateMetadataRelPath(projectDir);
  if (!metaRel) throw new Error('Project has no metadata.json');

  const current = await readSettingsFile(projectDir, { title: slug, metadataRelPath: metaRel });
  const merged = { ...current, ...partialSettings, metadataRelPath: metaRel };
  await writeSettingsFile(projectDir, merged);
  await fsp.writeFile(
    path.join(projectDir, 'index.html'),
    renderIndexHtml({ slug, settings: merged })
  );
  return merged;
}

async function renameProject(oldSlug, newName) {
  assertSafeSlug(oldSlug);
  const newSlug = slugify(newName);
  if (!newSlug) throw new Error('New name is empty after sanitizing');
  const oldDir = path.join(WWW_ROOT, oldSlug);
  const newDir = path.join(WWW_ROOT, newSlug);

  if (!(await pathExists(oldDir))) throw new Error('Project not found');
  if (newSlug !== oldSlug && (await pathExists(newDir))) {
    throw new Error(`A project named "${newSlug}" already exists`);
  }

  const metaRel = await locateMetadataRelPath(oldDir);
  const settings = await readSettingsFile(oldDir, { title: oldSlug, metadataRelPath: metaRel });
  settings.title = newName.trim();
  settings.metadataRelPath = metaRel;

  if (newSlug !== oldSlug) {
    await fsp.rename(oldDir, newDir);
    await stats.renameSlug(oldSlug, newSlug); // keep the view history with the project
    await thumbnails.renameThumbnail(oldSlug, newSlug);
  }
  await writeSettingsFile(newDir, settings);
  await fsp.writeFile(
    path.join(newDir, 'index.html'),
    renderIndexHtml({ slug: newSlug, settings })
  );
  return newSlug;
}

async function trashProject(slug) {
  assertSafeSlug(slug);
  const projectDir = path.join(WWW_ROOT, slug);
  if (!(await pathExists(projectDir))) throw new Error('Project not found');
  await fsp.mkdir(TRASH_DIR, { recursive: true });
  const trashName = `${slug}--${Date.now()}`;
  await fsp.rename(projectDir, path.join(TRASH_DIR, trashName));
  return trashName;
}

async function listTrash() {
  await fsp.mkdir(TRASH_DIR, { recursive: true });
  const entries = await fsp.readdir(TRASH_DIR, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const idx = entry.name.lastIndexOf('--');
    const originalSlug = idx > -1 ? entry.name.slice(0, idx) : entry.name;
    const ts = idx > -1 ? parseInt(entry.name.slice(idx + 2), 10) : null;
    const size = await dirSizeBytes(path.join(TRASH_DIR, entry.name));
    results.push({
      trashId: entry.name,
      originalSlug,
      deletedAt: ts ? new Date(ts) : null,
      sizeBytes: size,
    });
  }
  results.sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));
  return results;
}

async function restoreFromTrash(trashId) {
  if (trashId.includes('..') || trashId.includes('/')) throw new Error('Invalid trash id');
  const trashDir = path.join(TRASH_DIR, trashId);
  if (!(await pathExists(trashDir))) throw new Error('Not found in trash');
  const idx = trashId.lastIndexOf('--');
  const originalSlug = idx > -1 ? trashId.slice(0, idx) : trashId;
  let targetSlug = originalSlug;
  let n = 1;
  while (await pathExists(path.join(WWW_ROOT, targetSlug))) {
    targetSlug = `${originalSlug}_restored${n > 1 ? n : ''}`;
    n += 1;
  }
  await fsp.rename(trashDir, path.join(WWW_ROOT, targetSlug));
  return targetSlug;
}

async function purgeFromTrash(trashId) {
  if (trashId.includes('..') || trashId.includes('/')) throw new Error('Invalid trash id');
  const trashDir = path.join(TRASH_DIR, trashId);
  if (!(await pathExists(trashDir))) throw new Error('Not found in trash');
  await fsp.rm(trashDir, { recursive: true, force: true });
  const idx = trashId.lastIndexOf('--');
  const originalSlug = idx > -1 ? trashId.slice(0, idx) : trashId;
  await thumbnails.deleteThumbnail(originalSlug);
}

async function projectExists(slug) {
  return pathExists(path.join(WWW_ROOT, slug));
}

module.exports = {
  slugify,
  listProjects,
  getProject,
  saveSettings,
  renameProject,
  trashProject,
  listTrash,
  restoreFromTrash,
  purgeFromTrash,
  projectExists,
  dirSizeBytes,
};
