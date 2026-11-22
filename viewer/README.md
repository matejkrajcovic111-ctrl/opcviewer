# viewer/ – files for potree_libs

These files go into `<www>/potree_libs/` next to Potree. `install.sh` copies them on every run; after changing one by hand, copy it there yourself. Project pages don't need regenerating.

| File | Goes to | What it is |
|---|---|---|
| `opcviewer-branding.js` | `potree_libs/` | Badge, browser-tab icons, default language and accent colour from `potree_libs/opcviewer/branding.json` (written by the admin panel). Loaded by every page |
| `opcviewer-ui.js` | `potree_libs/` | SK/EN interface, measuring toolbar (with the fix for Potree 1.8's measuring in current browsers), volume tool, load-time report. Loaded by every page |
| `opcviewer-bbox.js` | `potree_libs/` | Bounding Box section tool. Loaded only by pages whose project has it on |
| `opcviewer-stat.gif` | `potree_libs/` | 1×1 image the load-time report requests; only the line in Apache's log matters |
| `lang-sk/translation.json` | `potree_libs/potree/resources/lang/sk/` | Slovak for Potree's own texts. Generated from the `SK` table in `opcviewer-ui.js`: `node gen-sk.js opcviewer-ui.js lang-sk/translation.json` |
| `patch_potree.py` | run on `potree_libs/potree/potree.js` | Fixes Potree's node loader (see below) |

## patch_potree.py

```bash
cp potree.js potree.js.orig
python3 patch_potree.py potree.js
```

It adds a 20 s timeout and status/length checks to the range requests for `octree.bin` and `hierarchy.bin`, frees the loading slot when the decoder worker fails, and raises `maxNodesLoading` from 4 to 8. Without it, a few stalled or failed requests (common through tunnels and proxies) use up every slot and the viewer stops loading detail until the page is reloaded.

The script refuses to run if any snippet it expects is missing, so it is safe to try, but run it only on an unpatched file. Patched files contain the marker `opcviewer patch` (older ones `zameriamto patch`), which the installer checks. It was written for the stock `potree.js` shipped with PotreeConverter 2.1.2 (SHA-256 `80383869db96be35d84415b07c51f3a8b4f86e9b85e6d52dd67ccb165c68a4f0`).
