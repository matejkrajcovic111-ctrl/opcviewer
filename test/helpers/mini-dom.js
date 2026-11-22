// A very small DOM, just enough for the branding script: elements, attributes, text,
// children, and serialising back to HTML so the result can be compared as a string.
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => esc(s).replace(/"/g, '&quot;');

class Node {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.attrs = []; this.children = []; this.style = { setProperty: (k, v) => { this.style[k] = v; } }; this.listeners = {}; this.parentNode = null; }
  setAttribute(k, v) { const a = this.attrs.find((x) => x[0] === k); if (a) a[1] = String(v); else this.attrs.push([k, String(v)]); }
  getAttribute(k) { const a = this.attrs.find((x) => x[0] === k); return a ? a[1] : null; }
  set id(v) { this.setAttribute('id', v); } get id() { return this.getAttribute('id'); }
  set className(v) { this.setAttribute('class', v); } get className() { return this.getAttribute('class') || ''; }
  set href(v) { this.setAttribute('href', v); } get href() { return this.getAttribute('href'); }
  set rel(v) { this.setAttribute('rel', v); } get rel() { return this.getAttribute('rel'); }
  set type(v) { this.setAttribute('type', v); } get type() { return this.getAttribute('type'); }
  set target(v) { this.setAttribute('target', v); }
  set src(v) { this.setAttribute('src', v); }
  set alt(v) { this.setAttribute('alt', v); }
  set sizes(v) { this.setAttribute('sizes', v); }
  set textContent(v) { this.children = [{ text: String(v) }]; }
  get textContent() { return this.children.map((c) => (c.text !== undefined ? c.text : c.textContent)).join(''); }
  appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.children.push(c); return c; }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); c.parentNode = null; return c; }
  addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
  get innerHTML() { return this.children.map((c) => (c.text !== undefined ? esc(c.text) : c.outerHTML)).join(''); }
  get outerHTML() { const t = this.tagName.toLowerCase(); return `<${t}${this.attrs.map(([k, v]) => ` ${k}="${escAttr(v)}"`).join('')}>${this.innerHTML}</${t}>`; }
  all() { return this.children.filter((c) => c.tagName).flatMap((c) => [c, ...c.all()]); }
}

function makeDocument() {
  const html = new Node('html'); const head = html.appendChild(new Node('head')); const body = html.appendChild(new Node('body'));
  return {
    documentElement: html, head, body, readyState: 'complete',
    createElement: (t) => new Node(t),
    createTextNode: (t) => ({ text: t }),
    getElementById: (id) => html.all().find((n) => n.id === id) || null,
    querySelectorAll: (sel) => html.all().filter((n) => sel.split(',').some((s) => {
      const m = /^link\[rel(~?)="([^"]+)"\]$/.exec(s.trim());
      return m && n.tagName === 'LINK' && (m[1] ? (n.rel || '').split(' ').includes(m[2]) : n.rel === m[2]);
    })),
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
    addEventListener: () => {},
  };
}

module.exports = { makeDocument };
