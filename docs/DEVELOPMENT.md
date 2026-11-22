# Development

## Run it locally

Requirements: Node.js 24, and for conversion PotreeConverter 2.1.2 (Linux).

```bash
git clone <this repo> opcviewer && cd opcviewer
npm ci
mkdir -p /tmp/opcv/www /tmp/opcv/data
OPCV_WWW_ROOT=/tmp/opcv/www OPCV_DATA_DIR=/tmp/opcv/data OPCV_PORT=3301 \
OPCV_CONVERTER_DIR=$HOME/potreeconverter OPCV_ACCESS_LOG=/dev/null node server.js
```

Open `http://localhost:3301/` and set a password (no setup code is needed when `data/setup-code.txt` doesn't exist).

To open project pages you need a web server over the web folder with `potree_libs/` in it. Copy `resources/page_template/libs` from the PotreeConverter download to `<www>/potree_libs`, apply `viewer/patch_potree.py`, and copy `viewer/opcviewer-*.js`, `viewer/opcviewer-stat.gif` and `viewer/lang-sk/translation.json` (to `potree_libs/potree/resources/lang/sk/`). This is the same as `install.sh` step 3. Any static server that supports range requests works for development, e.g. a three-line Express app with `express.static`. Set `OPCV_LOCAL_URL` to it for thumbnails.

Never point a development instance at a live web folder: on start it publishes its own `branding.json` there.

## Tests

```bash
npm test            # node --test "test/**/*.test.js"
```

| Test | Covers |
|---|---|
| `config.test.js` | defaults and every `OPCV_*` variable |
| `template.test.js` | generated pages byte for byte against `test/fixtures/` (and against the pages from before the 2.0 rename), HTML escaping |
| `projects.test.js` | project name → folder name |
| `stats.test.js` | views, ignored visitors, load reports (old and new beacon name) |
| `branding.test.js` | validation, publishing, image uploads (type by content, size, SVG scripts in all disguises, safety headers) |
| `viewer-branding.test.js` | the viewer's badge, icons, language and colours, run in a `vm` sandbox with a small fake DOM (`test/helpers/mini-dom.js`) |
| `volume.test.js` | the volume grid on a cone and a pit with known volumes (within 0.5 %) |
| `setup-code.test.js` | the one-time setup code |
| `install-preflight.test.js` | the installer never takes over a site or port in use (sources `install.sh` with `OPCV_SOURCE_ONLY=1` against a fake `/etc/apache2`) |
| `thumbnails.test.js` | a browser that can't start fails the job instead of hanging |

Viewer scripts are plain browser scripts; `test/helpers/viewer-sandbox.js` runs them in Node's `vm` with just enough of `window` and `document`. Anything that needs WebGL is tested in a real browser (below).

**Testing the real thing.** Unit tests don't see the HTTP, session and browser path. For frontend or upload changes, run an isolated instance (own data and web folder, own port) and drive it with Puppeteer the way a user would: fill in the real login form, click real buttons, read the DOM. Headless Chrome renders point clouds in software, so give pages tens of seconds, and poll with `page.evaluate` in a loop rather than `page.waitForFunction` while the page is busy.

## Checks (CI)

`.gitea/workflows/` runs on every push:

- `check.yml`: `npm ci`, `npm test`, every `.js` file parses, `.py` files compile, `shellcheck -S warning` on `*.sh`.
- `security.yml`: gitleaks (rules in `.gitleaks.toml`) and `npm audit --audit-level=high`; also weekly.

The workflows are written for a host-mode runner with Node 24 at `/opt/node24`; adjust the PATH step for other runners. Push, wait for green, then deploy.

`npm audit` reports two moderate advisories in `qs` through Express 4. They are accepted for a single-admin tool; the real fix is moving to Express 5.

## Changing the viewer scripts

- Edit `viewer/*.js`, test, then copy them to `<www>/potree_libs/` (or run the installer, which does it). Pages don't need regenerating.
- After changing a Slovak text in the `SK` table: `node viewer/gen-sk.js viewer/opcviewer-ui.js viewer/lang-sk/translation.json` and copy the file too.
- New text Potree hard-codes in English goes into `SK_FIXED` (exact match).
- Keep `window.zmVolumeGrid`, `window.zmLang`, `window.zmMeasuring` and the `#zm-*` element ids: the tests, the thumbnailer and the other scripts use them. The `zm` prefix predates the name opcviewer.

## Screenshots

`scripts/screenshots.mjs <shots.json>` takes the README screenshots with Puppeteer. The JSON lists the admin and viewer addresses and, per shot, the page, waits, camera framing (`frame`: pitch, yaw, zoom around the data's centre) and clicks. It is meant for an isolated instance whose web folder links only the projects to show. 1600 × 1000, PNG, in `docs/screenshots/`.

## Releases

Version in `package.json`, an entry in `CHANGELOG.md`, a `vX.Y.Z` tag. The installer always installs the tip of `main`.
