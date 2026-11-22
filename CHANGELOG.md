# Changelog

Versions follow [semantic versioning](https://semver.org/) from 2.0.0 on. Earlier versions were the author's private "Point Cloud Viewer"; their numbers were counted by hand and only 1.5 was tagged.

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
