const test = require('node:test');
const assert = require('node:assert');
const { slugify } = require('../lib/projects');

test('slugify keeps letters, digits, _ and -, and turns spaces into _', () => {
  assert.strictEqual(slugify('Most Hatne 2026!'), 'Most_Hatne_2026');
});

test('slugify cannot produce a path', () => {
  assert.strictEqual(slugify('../x'), 'x');
  assert.strictEqual(slugify('a/b\\c'), 'abc');
});

test('slugify caps the length at 80 characters', () => {
  assert.strictEqual(slugify('a'.repeat(100)).length, 80);
});
