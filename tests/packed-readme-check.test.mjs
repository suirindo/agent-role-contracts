import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { assertPackedReadmes, findReadmeVersionMismatches } from '../scripts/packed-readme-check.mjs';

const version = '0.5.0';
const stale = 'The unversioned package name follows `latest`, which currently remains the stable `0.1.0` release.';
const current = '**Stable package line: `0.5.0`.** npm stable installs use the `latest` dist-tag.';
for (const [name, text] of [
  ['original stale Install sentence', stale],
  ['line-wrapped sentence', stale.replace('which currently', 'which\ncurrently')],
  ['case variation', stale.toUpperCase()],
  ['stale stable banner', '**Stable package line: `0.1.0`.**'],
  ['stale current release', 'Current stable release: v0.1.0.'],
  ['latest points to old version', 'npm `latest` points to `0.1.0`.'],
  ['latest equals old version', 'npm latest = 0.1.0'],
  ['Japanese stable banner', '**安定版: `0.1.0`。**'],
  ['actual Japanese stable-line banner', '**安定版ライン：`0.1.0`。**'],
  ['Japanese current latest', 'npm `latest` は現在も安定版 `0.1.0` です。'],
  ['visible linked version', 'Stable package line: [0.1.0](https://example.test/releases/0.1.0).'],
  ['contradiction after correct banner', `${current}\n\n${stale}`],
  ['claim after a historical paragraph', `Version 0.1.0 was once latest.\n\n${stale}`],
]) test(`reject ${name}`, () => {
  const findings = findReadmeVersionMismatches(text, version);
  assert.equal(findings.length, 1, JSON.stringify(findings));
  assert.equal(findings[0].claimedVersion, '0.1.0');
});
for (const [name, text] of [
  ['current banner', current],
  ['correct current latest', stale.replace('0.1.0', version)],
  ['historical past tense', 'The 0.1.0 release was the stable latest version at that time.'],
  ['explicit old installation pin', '`npm install @netsujo/agent-role-contracts@0.1.0` for historical reproduction.'],
  ['release history link', '[Read the old v0.1.0 release](https://example.test/v0.1.0).'],
  ['history and current claim', '0.1.0 was the previous release. npm latest is 0.5.0.'],
  ['fenced historical example', '```md\n' + stale + '\n```\n' + current],
  ['tilde fenced historical example', '~~~~markdown\n' + stale + '\n~~~~\n' + current],
  ['commented historical example', '<!--\n' + stale + '\n-->\n' + current],
  ['Japanese history', '過去の安定版は0.1.0でした。現在の安定版: 0.5.0。'],
  ['actual Japanese stable-line banner', '**安定版ライン：`0.5.0`。**'],
  ['explicit version-history section', '## Release history\n\n- v0.1.0: initial stable release (formerly latest).\n\n## Install\n\n' + current],
  ['versions only in a link target', 'Stable package line: [0.5.0](https://example.test/0.1.0).'],
]) test(`allow ${name}`, () => assert.deepEqual(findReadmeVersionMismatches(text, version), []));
test('repeated calls do not retain regex state', () => {
  for (let i = 0; i < 3; i++) assert.equal(findReadmeVersionMismatches(stale, version).length, 1);
});
test('reports the actual prose line', () => assert.equal(findReadmeVersionMismatches('# Title\n\n' + stale, version)[0].line, 3));
test('later stable candidate is not hardcoded to 0.5.0', () => {
  assert.equal(findReadmeVersionMismatches(current, '0.6.0').length, 1);
  assert.deepEqual(findReadmeVersionMismatches(current.replace('0.5.0', '0.6.0'), '0.6.0'), []);
});
function fixture(t, overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'arc-readme-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const manifest = { name: '@netsujo/agent-role-contracts', version, files: ['README.md', 'README.ja.md'], publishConfig: { tag: 'latest' }, ...overrides };
  writeFileSync(join(root, 'package.json'), JSON.stringify(manifest));
  writeFileSync(join(root, 'README.md'), current);
  writeFileSync(join(root, 'README.ja.md'), '**安定版: `0.5.0`。**');
  return root;
}
test('both packed README languages pass', t => {
  const result = assertPackedReadmes(fixture(t));
  assert.deepEqual(result.checked, ['README.md', 'README.ja.md']);
  assert.equal(result.currentVersionChecked, true);
});
test('Japanese packed contradiction is rejected', t => {
  const root = fixture(t);
  writeFileSync(join(root, 'README.ja.md'), '安定版: 0.1.0');
  assert.throws(() => assertPackedReadmes(root), /README\.ja\.md.*contradicts/u);
});
test('missing packed README fails rather than reading the source', t => {
  const root = fixture(t); rmSync(join(root, 'README.ja.md'));
  assert.throws(() => assertPackedReadmes(root), /ENOENT/u);
});
test('empty packed README fails', t => {
  const root = fixture(t); writeFileSync(join(root, 'README.md'), '\n ');
  assert.throws(() => assertPackedReadmes(root), /empty/u);
});
test('unexpected packed identity fails', t => assert.throws(() => assertPackedReadmes(fixture(t, { name: 'other' })), /Unexpected/u));
test('preview does not infer registry latest from candidate version', t => {
  const result = assertPackedReadmes(fixture(t, { version: '0.6.0-alpha.1', publishConfig: { tag: 'next' } }));
  assert.equal(result.currentVersionChecked, false);
});
test('latest prerelease is not treated as a stable candidate', t => assert.throws(() => assertPackedReadmes(fixture(t, { version: '0.6.0-alpha.1' })), /prerelease/u));
test('invalid packed version fails', t => assert.throws(() => assertPackedReadmes(fixture(t, { version: 'garbage' })), /Invalid packed version/u));

// The fixture deliberately repairs its source after packing. The check must
// still fail on the old tarball, proving it reads the distributed bytes.
test('real offline tarball: stale packed README fails despite repaired source', { skip: !process.env.npm_execpath }, t => {
  const root = fixture(t); const out = join(root, 'out'); mkdirSync(out);
  writeFileSync(join(root, 'README.md'), stale);
  const run = (args, cwd = root) => {
    const result = spawnSync(process.execPath, [process.env.npm_execpath, ...args], {
      cwd, encoding: 'utf8', timeout: 60000,
      env: { ...process.env, npm_config_cache: join(root, 'cache') },
    });
    assert.equal(result.status, 0, result.stderr || result.error?.message || result.stdout);
    return result.stdout;
  };
  const packed = JSON.parse(run(['pack', '--ignore-scripts', '--json', '--pack-destination', out]))[0];
  writeFileSync(join(root, 'README.md'), current);
  assert.equal(assertPackedReadmes(root).currentVersionChecked, true);
  const consumer = join(root, 'consumer'); mkdirSync(consumer);
  writeFileSync(join(consumer, 'package.json'), '{"private":true}');
  run(['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', join(out, packed.filename)], consumer);
  const installed = join(consumer, 'node_modules', '@netsujo', 'agent-role-contracts');
  assert.equal(readFileSync(join(installed, 'README.md'), 'utf8'), stale);
  assert.throws(() => assertPackedReadmes(installed), /README\.md.*contradicts/u);
  const fixedOut = join(root, 'fixed-out'); mkdirSync(fixedOut);
  const fixedPacked = JSON.parse(run(['pack', '--ignore-scripts', '--json', '--pack-destination', fixedOut]))[0];
  const fixedConsumer = join(root, 'fixed-consumer'); mkdirSync(fixedConsumer);
  writeFileSync(join(fixedConsumer, 'package.json'), '{"private":true}');
  run(['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', join(fixedOut, fixedPacked.filename)], fixedConsumer);
  assert.equal(assertPackedReadmes(join(fixedConsumer, 'node_modules', '@netsujo', 'agent-role-contracts')).currentVersionChecked, true);
});
