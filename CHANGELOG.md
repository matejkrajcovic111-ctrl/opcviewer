# Changelog

Versions follow [semantic versioning](https://semver.org/) from 2.0.0 on. Earlier versions were the author's private "Point Cloud Viewer"; their numbers were counted by hand and only 1.5 was tagged.

## 2.2.3 – 2026-11-25

### Changed
- **Volume grid 5 cm** (was about 400 cells across the outline, up to 50 cm). Small piles that already got a finer grid keep it, so their results don't change; larger outlines now come out finer and their numbers move slightly. Outlines over about 40 000 m² get the finest size that fits in 16 million cells; a scan sparser than the grid still makes it coarser automatically. The browser fallback stays at its earlier size (1.5 million cells). The coloured highlight is still drawn from at most 250 000 cells, so it stays smooth on phones; the numbers use the full grid.

## 2.2.2 – 2026-11-25

### Changed
- **Left-drag rotates while measuring.** With a point not yet placed, dragging with the left button turns the view and you keep measuring; a left click without moving still places the point. A click's small hand movement (up to 3 px) no longer nudges the view.

## 2.2.1 – 2026-11-25

### Changed
- **Right-drag pans while measuring.** With a point not yet placed (distance, area, height, angle, volume…), dragging with the right mouse button moves the view and you keep measuring. A right-click without moving still finishes the measurement, as before.
### Fixed
- **Height and Angle:** the last point was treated as placed as soon as it appeared under the cursor, so the toolbar button went dark and OSNAP didn't snap that point. Both now stay on until the point is clicked.

### Changed (bar)
- **OSNAP bar smaller and quieter:** about a third smaller, more transparent, and the snaps that are on get a soft highlight with a light-blue icon instead of a solid blue block.

## 2.2.0 – 2026-11-25

### Added
- **Nearest** snap (*Najbližší*): any point along a measured line, closest to the cursor. It gives way to Endpoint, Midpoint, Intersection and Perpendicular when one of those is in reach, as in AutoCAD. Off by default.

### Changed
- **OSNAP bar redesigned** to match the measuring toolbar: drawn AutoCAD-style icons over labels, active snaps filled with the accent colour, an on/off switch at the top. The yellow marker on the model uses the same drawn shapes.
- OSNAP is switched on and off with **F4** (was F3).
- Removed the **Clipping** part of the sidebar's Tools menu (the Bounding Box button does the cutting).

## 2.1.1 – 2026-11-25

### Security
- A cancelled volume calculation keeps its slot until its worker has really stopped. Before, a visitor who disconnected freed the slot at once while the old worker could still be busy in a file read, so repeated request-and-disconnect could run several calculations at the same time.

## 2.1.0 – 2026-11-25

### Added
- **Volume is calculated on the server.** The project page sends the outline to `POST /opcviewer-api/volume` (Apache passes exactly this one address to the app); the server reads the points from its own disk and returns the numbers and a compact height grid for the green/red highlight. Same maths as before (shared `viewer/opcviewer-grid.js`), so results are unchanged, but a slow connection no longer matters: on a real project 3.3 s instead of 8.8 s and 0.9 MB instead of 13 MB downloaded. Requests run one at a time in a worker thread (4 waiting, then "busy"), at most 90 s from arrival, and stop when the visitor leaves; the outline is size-limited. If the server can't answer, the page calculates in the browser as before.
- **OSNAP bar** (right edge, middle): snaps measuring points to **End** points, **Mid**points, the **Perp**endicular foot from the previous point and **Int**ersections of measurements, AutoCAD-style, with a yellow marker. Each type on and off on its own; the OSNAP header or **F3** snapping as a whole (F4 since 2.2.0). Remembered per visitor.
- **English second line** for the badge (*Branding → Second line in English*), shown on English pages.
- Sidebar header shows **opcviewer** and its version, linked to the release. `branding.json` now carries `version` and `sourceUrl` (`OPCV_SOURCE_URL`).

### Changed
- The navigation cube and the compass sit below the Bounding Box button (and its panel while it is open) instead of on top of it.
- Removed from Potree's sidebar: the About section, the language list (the toolbar has SK/EN) and the *Box* and *Lock view* switches.
- The installer enables Apache's `proxy` and `proxy_http` modules for the volume address.

## 2.0.1 – 2026-11-22

### Security
- SVG uploads: scripts hidden in character references, entity declarations or embedded pages (`foreignObject`, `iframe`, `embed`, `object`) are refused. Uploaded images are served with `Content-Security-Policy: sandbox` and `nosniff`, by the admin panel and by Apache (`.htaccess`), so an SVG can never run a script when opened directly.

### Fixed
- Installer no longer takes over a website that lives in Apache's `000-default.conf`; only the untouched stock default site is replaced.
- Installer stops with a clear message when the chosen port is used by another program (e.g. nginx), or when port 80 is taken and Apache isn't installed yet. It used to fail halfway.
- Installer reloads Apache instead of restarting it, so other sites on the same Apache keep running.
- The installer runs as one function, so a download cut short runs nothing.

## 2.0.0 – 2026-11-22

Renamed to **opcviewer** and made installable by anyone.

### Added
- **One-command installer** (`install.sh`) for Ubuntu 22.04 / 24.04 and Debian 12: Node.js 24 and PotreeConverter 2.1.2 with verified checksums, Apache site, systemd service, the patched Potree with the opcviewer scripts. Running it again updates and keeps projects, settings and password.
- **Branding in the admin panel**: company name, second line, website, user-guide link, logo, browser-tab icon, accent colour and default viewer language, applied to every project page from one file.
- **One-time setup code** printed by the installer and required for setting the first admin password.
- All installation-specific settings as `OPCV_*` environment variables (`/etc/opcviewer/opcviewer.env`).
- Documentation, screenshots, unit tests (configuration, branding, page generation, statistics, volume maths), shellcheck in CI.
- Licensed under the GNU AGPL, version 3 or later.

### Changed
- Viewer scripts renamed `opcviewer-branding.js`, `opcviewer-ui.js`, `opcviewer-bbox.js` and moved to `viewer/`; the load report is `opcviewer-stat.gif` (the old `zm-stat.gif` is still counted).
- Without branding, pages show no badge and default to English.
- Thumbnails open pages at `OPCV_LOCAL_URL`, so Apache can run on any port.
- Runs on Node.js 24 (18 is end-of-life).

### Fixed
- Thumbnails: when headless Chrome can't start, the job now fails with the reason. It used to retry endlessly and silently.
- Folder listings of the web root and `potree_libs/` are off; the root shows a landing page.
- Uploading a logo in the branding dialog no longer clears fields typed but not yet saved.

## 1.5 – 2026-11-13

- **Measuring toolbar** at the bottom of every page: point, distance, height, area, angle, volume, clear. Fixes Potree 1.8's measuring in current browsers, where every point landed on the first.
- **Volume tool** for stockpiles and excavations: base plane through the outline, fine grid read from the octree, above / below / net / area, tonnes from a density, green and red highlight, holes shown filled, recalculated when the outline moves.
- **Bounding Box** section tool modelled on 3Dsurvey (per-project setting): move sides, rotate by an edge, keyboard steps, hide the box and keep the cut.
- **Slovak interface** with an SK / EN switch.
- **View counts and load times** on each project card, from Apache's log and a report sent by each page.
- Automatic checks on every push: tests, syntax, secret scan, dependency audit.

## 1.2 – 2026-10-24

- **Potree loader fix**: timeouts, status checks and error handling for node downloads, 8 parallel downloads. Before, a few stalled requests through the tunnel stopped the viewer from loading more detail.
- Company badge with a user-guide link and the company favicon on every project page.

## 1.1 – 2026-09-10

First version: upload LAS/LAZ and convert with PotreeConverter, live conversion log, project list with thumbnails, settings per project, rename, trash, disk usage, one admin password, sessions that survive restarts, "Copy link" with the public address. (A Cloudflare cache-warming feature was added and removed again the next day; see decision 5.)
