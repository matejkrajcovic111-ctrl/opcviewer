import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
orig = s

def rep(old, new, count=1):
    global s
    n = s.count(old)
    if n != count:
        sys.exit(f"expected {count} match(es), found {n}: {old[:80]!r}")
    s = s.replace(old, new)

# 1) concurrency 4 -> 8
rep("\tlet maxNodesLoading = 4;", "\tlet maxNodesLoading = 8; // opcviewer patch: was 4")

# 2) helper: range fetch with timeout + status/length validation (inserted before NodeLoader)
rep("\tclass NodeLoader{\n", """\t// opcviewer patch: a stalled or failed range request used to hold one of the
	// maxNodesLoading slots forever (no timeout, no status check), so after a few
	// such hiccups through the tunnel the viewer stopped refining entirely.
	async function zmFetchRange(url, first, last){
		const expected = Number(last - first + 1n);
		const ctrl = new AbortController();
		const timer = setTimeout(() => ctrl.abort(), 20000);
		try{
			const response = await fetch(url, {
				headers: {
					'content-type': 'multipart/byteranges',
					'Range': `bytes=${first}-${last}`,
				},
				signal: ctrl.signal,
			});
			if(response.status !== 206){
				ctrl.abort();
				throw new Error(`HTTP ${response.status} for ${url} bytes=${first}-${last}`);
			}
			const buffer = await response.arrayBuffer();
			if(buffer.byteLength !== expected){
				throw new Error(`short read ${buffer.byteLength}/${expected} for ${url}`);
			}
			return buffer;
		}finally{
			clearTimeout(timer);
		}
	}

	class NodeLoader{
""")

# 3) octree.bin fetch
rep("""					let response = await fetch(urlOctree, {
						headers: {
							'content-type': 'multipart/byteranges',
							'Range': `bytes=${first}-${last}`,
						},
					});

					buffer = await response.arrayBuffer();""",
"""					buffer = await zmFetchRange(urlOctree, first, last);""")

# 4) decoder worker failure must release the slot too (and not reuse a broken worker)
rep("""				let worker = Potree.workerPool.getWorker(workerPath);

				worker.onmessage = function (e) {
""", """				let worker = Potree.workerPool.getWorker(workerPath);

				worker.onerror = function (e) {
					// opcviewer patch: release the loading slot, drop the worker
					worker.onerror = null;
					worker.onmessage = null;
					worker.terminate();
					node.loaded = false;
					node.loading = false;
					Potree.numNodesLoading--;
					console.log(`failed to decode ${node.name}, trying again`, e);
				};

				worker.onmessage = function (e) {
					worker.onerror = null;
""")

# 5) hierarchy.bin fetch
rep("""			let response = await fetch(hierarchyPath, {
				headers: {
					'content-type': 'multipart/byteranges',
					'Range': `bytes=${first}-${last}`,
				},
			});



			let buffer = await response.arrayBuffer();

			this.parseHierarchy(node, buffer);""",
"""			let buffer = await zmFetchRange(hierarchyPath, first, last);

			this.parseHierarchy(node, buffer);""")

open(p, 'w', encoding='utf-8').write(s)
print("patched OK", len(orig), "->", len(s))
