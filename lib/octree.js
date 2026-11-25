// Reads Potree 2 octrees (PotreeConverter 2.x output: metadata.json, hierarchy.bin,
// octree.bin) straight from disk, for the server-side volume calculation. Only point
// positions are decoded. Mirrors Potree 1.8's own loader (OctreeLoader.parseHierarchy,
// DecoderWorker.js and DecoderWorker_brotli.js) so the server sees exactly the points the
// viewer would.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BYTES_PER_HIERARCHY_NODE = 22;
const PROXY = 2;

function openOctree(metadataPath) {
  const meta = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  if (meta.version !== '2.0') throw new Error(`unsupported octree version ${meta.version}`);
  if (meta.encoding !== 'DEFAULT' && meta.encoding !== 'BROTLI') throw new Error(`unsupported encoding ${meta.encoding}`);
  const attrs = meta.attributes || [];
  const posIndex = attrs.findIndex((a) => a.name === 'position' || a.name === 'POSITION_CARTESIAN');
  if (posIndex < 0) throw new Error('octree has no positions');
  if (meta.encoding === 'BROTLI' && posIndex !== 0) throw new Error('BROTLI octree with positions not first');
  const dir = path.dirname(metadataPath);
  const o = {
    meta,
    bytesPerPoint: attrs.reduce((s, a) => s + a.size, 0),
    positionOffset: attrs.slice(0, posIndex).reduce((s, a) => s + a.size, 0),
    fdHierarchy: fs.openSync(path.join(dir, 'hierarchy.bin'), 'r'),
    fdOctree: null,
  };
  try {
    o.fdOctree = fs.openSync(path.join(dir, 'octree.bin'), 'r');
  } catch (err) {
    fs.closeSync(o.fdHierarchy);
    throw err;
  }
  o.root = {
    name: 'r', level: 0, type: PROXY, numPoints: 0, byteOffset: 0, byteSize: 0,
    hierarchyByteOffset: 0, hierarchyByteSize: meta.hierarchy.firstChunkSize,
    min: meta.boundingBox.min.slice(), max: meta.boundingBox.max.slice(),
    spacing: meta.spacing, children: new Array(8).fill(null),
  };
  return o;
}

function closeOctree(o) {
  for (const fd of [o.fdHierarchy, o.fdOctree]) if (fd !== null) fs.closeSync(fd);
  o.fdHierarchy = o.fdOctree = null;
}

function readAt(fd, offset, size) {
  const buf = Buffer.alloc(size);
  let done = 0;
  while (done < size) {
    const n = fs.readSync(fd, buf, done, size - done, offset + done);
    if (!n) throw new Error('octree file is shorter than its hierarchy says');
    done += n;
  }
  return buf;
}

// Potree's octant numbering: bit 0 = z, bit 1 = y, bit 2 = x.
function childBox(min, max, index) {
  const cmin = min.slice(), cmax = max.slice();
  for (const [bit, axis] of [[1, 2], [2, 1], [4, 0]]) {
    const half = (max[axis] - min[axis]) / 2;
    if (index & bit) cmin[axis] += half;
    else cmax[axis] -= half;
  }
  return [cmin, cmax];
}

// A proxy node's children live in a later hierarchy chunk; load it on first use.
// Returns the node, now with its own data and children.
function resolve(o, node) {
  if (node.type !== PROXY) return node;
  const buf = readAt(o.fdHierarchy, node.hierarchyByteOffset, node.hierarchyByteSize);
  const count = buf.length / BYTES_PER_HIERARCHY_NODE;
  const nodes = [node];
  for (let i = 0; i < count; i++) {
    const cur = nodes[i];
    if (!cur) break;
    const at = i * BYTES_PER_HIERARCHY_NODE;
    const type = buf.readUInt8(at);
    const childMask = buf.readUInt8(at + 1);
    const numPoints = buf.readUInt32LE(at + 2);
    const byteOffset = Number(buf.readBigInt64LE(at + 6));
    const byteSize = Number(buf.readBigInt64LE(at + 14));
    cur.numPoints = numPoints;
    if (cur.type !== PROXY && type === PROXY) {
      cur.hierarchyByteOffset = byteOffset;
      cur.hierarchyByteSize = byteSize;
    } else {
      cur.byteOffset = byteOffset;
      cur.byteSize = byteSize;
    }
    cur.type = type;
    if (type === PROXY) continue;
    for (let c = 0; c < 8; c++) {
      if (!(childMask & (1 << c))) continue;
      const [min, max] = childBox(cur.min, cur.max, c);
      const child = {
        name: cur.name + c, level: cur.level + 1, type: 0, numPoints: 0, byteOffset: 0, byteSize: 0,
        min, max, spacing: cur.spacing / 2, children: new Array(8).fill(null),
      };
      cur.children[c] = child;
      nodes.push(child);
    }
  }
  return node;
}

// Potree's DecoderWorker_brotli.js: keeps every third bit of a 24-bit Morton code fragment.
function dealign24b(m) {
  let x = m;
  x = ((x & 0b001000001000001000001000) >> 2) | (x & 0b000001000001000001000001);
  x = ((x & 0b000011000000000011000000) >> 4) | (x & 0b000000000011000000000011);
  x = ((x & 0b000000001111000000000000) >> 8) | (x & 0b000000000000000000001111);
  return x & 0b000000000000000011111111;
}

// World coordinates (x, y, z triples) of a node's points.
function readPositions(o, node) {
  resolve(o, node);
  const n = node.numPoints;
  const out = new Float64Array(n * 3);
  if (!n || !node.byteSize) return out;
  const { scale, offset } = o.meta;
  let buf = readAt(o.fdOctree, node.byteOffset, node.byteSize);
  if (o.meta.encoding === 'BROTLI') {
    buf = zlib.brotliDecompressSync(buf);
    for (let j = 0; j < n; j++) {
      const at = j * 16;
      const mc0 = buf.readUInt32LE(at + 4), mc1 = buf.readUInt32LE(at);
      const mc2 = buf.readUInt32LE(at + 12), mc3 = buf.readUInt32LE(at + 8);
      const lo = (mc3 & 0x00ffffff) >>> 0, mid = ((mc3 >>> 24) | (mc2 << 8)) >>> 0;
      let X = dealign24b(lo) | (dealign24b(mid) << 8);
      let Y = dealign24b(lo >>> 1) | (dealign24b(mid >>> 1) << 8);
      let Z = dealign24b(lo >>> 2) | (dealign24b(mid >>> 2) << 8);
      if (mc1 !== 0 || mc2 !== 0) {
        const lo2 = (mc1 & 0x00ffffff) >>> 0, mid2 = ((mc1 >>> 24) | (mc0 << 8)) >>> 0;
        X = X | (dealign24b(lo2) << 16) | (dealign24b(mid2) << 24);
        Y = Y | (dealign24b(lo2 >>> 1) << 16) | (dealign24b(mid2 >>> 1) << 24);
        Z = Z | (dealign24b(lo2 >>> 2) << 16) | (dealign24b(mid2 >>> 2) << 24);
      }
      out[j * 3] = X * scale[0] + offset[0];
      out[j * 3 + 1] = Y * scale[1] + offset[1];
      out[j * 3 + 2] = Z * scale[2] + offset[2];
    }
  } else {
    const bpp = o.bytesPerPoint, po = o.positionOffset;
    for (let j = 0; j < n; j++) {
      const at = j * bpp + po;
      out[j * 3] = buf.readInt32LE(at) * scale[0] + offset[0];
      out[j * 3 + 1] = buf.readInt32LE(at + 4) * scale[1] + offset[1];
      out[j * 3 + 2] = buf.readInt32LE(at + 8) * scale[2] + offset[2];
    }
  }
  return out;
}

module.exports = { openOctree, closeOctree, resolve, readPositions };
