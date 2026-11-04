// Review-input hygiene (CONTRIBUTING.md): an experiment must import src/ and schemas/, not carry byte-identical copies of them.
// Vendored copies have made independent review inputs large enough to be refused or left indeterminate. Copies that already
// exist on purpose are listed with their reason; a new copy fails here until it is removed or deliberately listed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const posix = p => relative(root, p).split(sep).join('/');
// An installed dependency (for example the adoption kit's locked published 1.0.0 consumer, #108) is not a vendored copy.
const walk = (dir, out = []) => { for (const name of readdirSync(dir)) { if (name === 'node_modules') continue; const p = join(dir, name); statSync(p).isDirectory() ? walk(p, out) : out.push(p); } return out; };
const digest = p => createHash('sha256').update(readFileSync(p)).digest('hex');

// Frozen snapshot of the core used by the D1 explanation prototype (PR #79); tree.json pins it so the explanation stays
// reproducible against the exact bytes it was reviewed with. Remove an entry when the copy is removed.
// strict-json.mjs (positioned JSON_INVALID detail, #110) and version.mjs (1.0.1 bump) are no longer listed: the source moved on
// while the frozen copies kept the reviewed bytes that tree.json pins, so they are no longer byte-identical review-input duplicates.
const ALLOWED = new Map(['contract-checks.mjs', 'core.mjs', 'report.mjs', 'schema.mjs', 'schemas.core.generated.mjs', 'task-lifecycle.mjs']
 .map(f => ['experiments/d1-property/src/' + f, 'frozen D1 explanation snapshot (PR #79), pinned by experiments/d1-property/tree.json']));

const canonical = new Map();
for (const d of ['src', 'schemas']) for (const p of walk(join(root, d))) canonical.set(digest(p), posix(p));
const copies = walk(join(root, 'experiments')).map(p => [posix(p), canonical.get(digest(p))]).filter(([, c]) => c);

test('no experiment carries an unlisted byte-identical copy of a src/ or schemas/ file', () => {
 const unlisted = copies.filter(([p]) => !ALLOWED.has(p)).map(([p, c]) => `${p} copies ${c}; import it instead, or list it with a reason`);
 assert.deepEqual(unlisted, []);
});

test('every listed copy still exists as a copy, so the list cannot go stale silently', () => {
 const present = new Set(copies.map(([p]) => p));
 assert.deepEqual([...ALLOWED.keys()].filter(p => !present.has(p)), []);
});
