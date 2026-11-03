// docs/STATUS.md is the single place for evaluation counters and gates. Each row must say when it was confirmed and where from.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const text = readFileSync(new URL('../docs/STATUS.md', import.meta.url), 'utf8');
const section = name => { const m = text.split(/^## /m).find(s => s.startsWith(name)); assert.ok(m, 'section ' + name); return m; };
const rows = body => body.split('\n').filter(l => /^\|/.test(l)).slice(2).map(l => l.split('|').slice(1, -1).map(c => c.trim()));

for (const name of ['Counters', 'Gates and decisions']) test(`STATUS.md ${name}: every row has a value, an ISO date and a GitHub source`, () => {
 const r = rows(section(name)); assert.ok(r.length >= 3, 'table has rows');
 for (const [item, value, asOf, source] of r) {
  assert.ok(item && value, 'row is filled: ' + item);
  assert.match(asOf, /^20\d\d-\d\d-\d\d$/, 'As of date for ' + item);
  assert.match(source, /\]\(https:\/\/github\.com\/suirindo\/agent-role-contracts\/(issues|pull)\/\d+/, 'source link for ' + item);
 }
});
