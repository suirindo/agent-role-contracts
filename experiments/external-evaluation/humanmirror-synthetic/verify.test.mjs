import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const HERE = dirname(fileURLToPath(import.meta.url));
const PIN = '9f6771056c47de971202360952af6d41941f7625';
function run(file, args) { const r = spawnSync(file, args, { encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 }); if (r.error) throw r.error; return r; }
function git(...args) { const r = run('git', args); assert.equal(r.status, 0, r.stderr); return r.stdout; }
test('reference and fixture guards fail closed before evaluation', async t => {
  const temp = mkdtempSync(join(tmpdir(), 'arc-humanmirror-guards-'));
  const reference = join(temp, 'reference'), fixture = join(temp, 'fixture');
  try {
    git('clone', '--quiet', '--shared', '--no-checkout', resolve(HERE, '../../..'), reference);
    git('-C', reference, 'checkout', '--quiet', '--detach', PIN);
    cpSync(HERE, fixture, { recursive: true });
    const invoke = () => run(process.execPath, [join(fixture, 'run-comparison.mjs'), '--arc-v1', reference]);
    await t.test('wrong revision', () => {
      git('-C', reference, 'checkout', '--quiet', '--detach', `${PIN}^`);
      const r = invoke(); assert.equal(r.status, 2); assert.match(r.stderr, /Requires exact official/);
      git('-C', reference, 'checkout', '--quiet', '--detach', PIN);
    });
    await t.test('source edit hidden with assume-unchanged', () => {
      const source = join(reference, 'src/finance-profile.mjs'); const original = readFileSync(source);
      git('-C', reference, 'update-index', '--assume-unchanged', 'src/finance-profile.mjs');
      writeFileSync(source, Buffer.concat([original, Buffer.from('\n// hidden mutation\n')]));
      const r = invoke(); assert.equal(r.status, 2); assert.match(r.stderr, /Modified reference bytes/);
      writeFileSync(source, original); git('-C', reference, 'update-index', '--no-assume-unchanged', 'src/finance-profile.mjs');
    });
    await t.test('recipient comparison cannot also change amount', () => {
      const file = join(fixture, 'transaction-b.json'); const value = JSON.parse(readFileSync(file)); value.amount_base_units = '9999'; writeFileSync(file, JSON.stringify(value));
      const r = invoke(); assert.equal(r.status, 2); assert.match(r.stderr, /Only target may differ/);
    });
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
