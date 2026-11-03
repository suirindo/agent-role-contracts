// The portable scope grammar's applicability boundary, as documented in docs/COMPATIBILITY.md ("Path shapes the stable grammar
// cannot express"). These are pins, not a feature request: a grammar change must update the table and this file together.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { explainTask, validateBundle } from '../src/core.mjs';

const fixture = name => JSON.parse(readFileSync(new URL('../examples/' + name + '.json', import.meta.url), 'utf8'));
const probe = (allowed, scope) => {
 const bundle = fixture('team'), task = fixture('task');
 bundle.roles[1].contract.authority.allowed_write_scopes = allowed; task.inputs.scope = scope;
 const r = explainTask(JSON.stringify(bundle), JSON.stringify(task));
 return r.valid ? 'PASS' : [...new Set(r.errors.map(e => e.code))].sort().join(',');
};

const table = [
 // [allowed_write_scopes, task scope, expected]            why
 [['src/**'], 'src/A.TXT', 'PASS'],                          // letters, digits, '.', '_', '-' per segment; case is significant data
 [['src/**'], 'src/a-b_c.d.txt', 'PASS'],
 [['src'], 'src', 'PASS'],                                   // exact scope matches only itself
 [['src'], 'src/a.txt', 'TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY'],
 [['.github/ISSUE_TEMPLATE/**'], '.github/ISSUE_TEMPLATE/x.yml', 'PASS'],   // source main only: explicitly declared root .github (not in npm 1.0.0)
 [['src/**'], '.github/x.yml', 'TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY'],       // a valid path outside the declared scope is a containment failure, not syntax
 [['src/**'], 'src/(ja)/page.tsx', 'TASK_WRITE_SCOPE_INVALID'],              // Next.js route group
 [['src/**'], 'src/[slug]/page.tsx', 'TASK_WRITE_SCOPE_INVALID'],            // dynamic segment
 [['src/**'], 'src/a b.txt', 'TASK_WRITE_SCOPE_INVALID'],                    // whitespace
 [['src/**'], 'src/@scope/a', 'TASK_WRITE_SCOPE_INVALID'],                   // '@'
 [['src/**'], 'src/日本語.md', 'TASK_WRITE_SCOPE_INVALID'],                   // non-ASCII
 [['src/**'], 'src/.env', 'TASK_WRITE_SCOPE_INVALID'],                       // hidden segment below the root
 [['src/**'], 'src/x/.hidden/a', 'TASK_WRITE_SCOPE_INVALID'],
 [['src/**'], './src/a.txt', 'TASK_WRITE_SCOPE_INVALID'],                    // relative prefix
 [['src/**'], 'src/../etc', 'TASK_WRITE_SCOPE_INVALID'],                     // traversal
 [['src/**'], '/src/a.txt', 'TASK_WRITE_SCOPE_INVALID'],                     // absolute
 [['src/**'], 'src\\a.txt', 'TASK_WRITE_SCOPE_INVALID'],                     // backslash separator
 [['src/**'], 'src/', 'TASK_WRITE_SCOPE_INVALID'],                           // trailing separator
 [['src/*.mjs'], 'src/a.mjs', 'WRITE_SCOPE_SYNTAX'],                         // '*' anywhere except a trailing '/**' is not a scope
 [['src/**/*.mjs'], 'src/a.mjs', 'WRITE_SCOPE_SYNTAX'],
 [['.env'], '.env', 'WRITE_SCOPE_SYNTAX'],                                   // hidden root other than .github
];

for (const [allowed, scope, expected] of table) test(`scope grammar: ${JSON.stringify(allowed)} with task scope ${JSON.stringify(scope)} -> ${expected}`, () => {
 assert.equal(probe(allowed, scope), expected);
});

test('an unsupported path shape is reported on the task, so the recorded answer is UNSUPPORTED_REQUIRED_SCOPE in the evaluation, not a widened bundle', () => {
 const bundle = fixture('team'); assert.equal(validateBundle(JSON.stringify(bundle)).valid, true, 'the bundle itself stays valid');
 assert.equal(probe(['src/**'], 'src/(ja)/page.tsx'), 'TASK_WRITE_SCOPE_INVALID');
 assert.equal(probe(['src/**', 'src/(ja)/**'], 'src/(ja)/page.tsx'), 'WRITE_SCOPE_SYNTAX', 'declaring the shape in the bundle does not make it expressible; the bundle is rejected before the task is examined');
});

test('COMPATIBILITY.md carries the boundary table this file pins', () => {
 const doc = readFileSync(new URL('../docs/COMPATIBILITY.md', import.meta.url), 'utf8');
 for (const needle of ['## Path shapes the stable grammar cannot express', 'TASK_WRITE_SCOPE_INVALID', 'WRITE_SCOPE_SYNTAX', '(ja)', 'UNSUPPORTED_REQUIRED_SCOPE', 'tests/scope-grammar-boundary.test.mjs']) assert.ok(doc.includes(needle), needle);
});
