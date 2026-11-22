# opcviewer – notes for coding agents

Self-hosted Potree point-cloud viewer with an admin panel. Start with [README.md](README.md), then [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Workflow

1. `git pull` first.
2. Change, with a test where the code allows it (`npm test`; see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)).
3. Commit and push. CI runs tests, syntax checks, shellcheck, a secret scan and `npm audit`.
4. Deploy or restart only after the checks are green. If one is red, fix the cause. Never weaken or delete a check to get green.

Never write passwords, tokens, keys, host names or personal paths into the repo. Installation-specific values belong in `OPCV_*` variables (`lib/config.js`).

## Things that are easy to get wrong

- **Project pages must stay byte-identical** to `test/fixtures/` unless a change to them is intended; existing installations have many pages generated from the template.
- **Viewer scripts** (`viewer/`) run in visitors' browsers on top of stock Potree 1.8, with no build step: ES5-style code, no modules. They are copied into `potree_libs/` by `install.sh`; changing them needs no page regeneration.
- Keep the `zm`-prefixed ids and globals (`#zm-branding`, `#zm-measure`, `#zm-bbox`, `#zm-volume`, `window.zmLang`, `window.zmVolumeGrid`, `window.zmMeasuring`): tests, the thumbnailer and the scripts depend on them.
- Potree 2's `boundingBox` is the cubic octree root. Use the `position` attribute range from `metadata.json` for the real extent.
- Never call `load()` on an empty Potree 2 node (`numPoints` 0): its slot is never released and loading stops.
- Rendering settings (point budget, EDL, high quality) are the owner's per-project choice; don't lower them to "fix" performance.
- Anything referenced from the login page must be in `OPEN_PATHS` in `server.js` (the auth gate runs before `express.static`).
- Test frontend and upload changes in a real browser against an isolated instance (own data and web folder, own port), never against a live web folder: on start the app publishes its `branding.json` there.
- `install.sh` runs as root: root writes into folders the service user owns only through `as_user`, and never runs code from them. Keep it shellcheck-clean.
