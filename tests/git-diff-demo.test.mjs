import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitVersionSupported, parseGitVersion, parseStatusV2, runDemo } from '../experiments/git-diff-demo/demo.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const demoDir = join(root, 'experiments', 'git-diff-demo');
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const readme = name => readFileSync(join(demoDir, name), 'utf8').replace(/\r\n/g, '\n');
const transcriptOf = text => {
  const m = text.match(/### Expected output\s+```text\n([\s\S]*?)\n```/);
  assert.ok(m, 'README must contain the expected transcript');
  return m[1] + '\n';
};
const git = (cwd, args) => spawnSync('git', args, { cwd, encoding: 'utf8' });

function scratch(t) {
  const dir = mkdtempSync(join(tmpdir(), 'arc demo test '));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function fixtureCopy(t) {
  const dir = scratch(t);
  const fixtureDir = join(dir, 'fixture');
  cpSync(join(demoDir, 'fixture'), fixtureDir, { recursive: true });
  const tmpRoot = join(dir, 'tmp');
  mkdirSync(tmpRoot);
  return { dir, fixtureDir, tmpRoot };
}

function fakeCli(dir, body) {
  const path = join(dir, 'fake-arc.mjs');
  writeFileSync(path, body);
  return path;
}

async function refuses(t, pattern, options = {}, mutate = () => {}) {
  const env = fixtureCopy(t);
  mutate(env);
  const result = await runDemo({ fixtureDir: env.fixtureDir, tmpRoot: env.tmpRoot, ...(typeof options === 'function' ? options(env) : options) });
  assert.equal(result.exitCode, 2, result.stdout);
  assert.equal(result.stdout, '', 'a refusal must not print a partial transcript');
  assert.match(result.stderr, /^DEMO_ERROR: /);
  assert.match(result.stderr, pattern);
  assert.equal(result.stderr.includes('Demo complete'), false);
  assert.deepEqual(readdirSync(env.tmpRoot), [], 'temporary files must be removed after a refusal');
  return result;
}

test('clean copy runs from another cwd, matches both README transcripts and leaves nothing behind', t => {
  const dir = scratch(t);
  const copy = join(dir, 'clone with space');
  mkdirSync(copy);
  for (const name of ['experiments/git-diff-demo', 'bin', 'src', 'package.json']) {
    cpSync(join(root, name), join(copy, name), { recursive: true });
  }
  const temp = join(dir, 'temp');
  mkdirSync(temp);
  const before = readdirSync(copy, { recursive: true }).sort();
  const started = Date.now();
  const result = spawnSync(process.execPath, [join(copy, 'experiments', 'git-diff-demo', 'run.mjs')], {
    cwd: tmpdir(), encoding: 'utf8', timeout: 60000, env: { ...process.env, TMPDIR: temp, TEMP: temp, TMP: temp },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.ok(Date.now() - started < 15000, 'demo should finish within 15 seconds');
  assert.equal(result.stdout, transcriptOf(readme('README.md')));
  assert.equal(result.stdout, transcriptOf(readme('README.ja.md')));
  assert.deepEqual(readdirSync(copy, { recursive: true }).sort(), before);
  assert.deepEqual(readdirSync(temp), []);
  assert.match(result.stdout, new RegExp(`Checked by ARC ${version.replaceAll('.', '\\.')}:`));
});

test('the real checkout stays clean after a run', () => {
  const before = git(root, ['status', '--porcelain']).stdout;
  const result = spawnSync(process.execPath, [join(demoDir, 'run.mjs')], { encoding: 'utf8', timeout: 60000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(git(root, ['status', '--porcelain']).stdout, before);
});

test('hostile global Git configuration does not change the result', async t => {
  const dir = scratch(t);
  const config = join(dir, 'hostile.gitconfig');
  writeFileSync(config, '[commit]\n\tgpgsign = true\n[core]\n\tautocrlf = true\n\thooksPath = /nonexistent\n[status]\n\trenames = false\n[user]\n\tname =\n');
  const result = spawnSync(process.execPath, [join(demoDir, 'run.mjs')], {
    encoding: 'utf8', timeout: 60000, env: { ...process.env, GIT_CONFIG_GLOBAL: config, HOME: dir, XDG_CONFIG_HOME: dir },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, transcriptOf(readme('README.md')));
});

test('both bundled patches make the same change to the allowed file and B adds exactly one more path', () => {
  const a = readFileSync(join(demoDir, 'fixture', 'patches', 'a.patch'), 'utf8');
  const b = readFileSync(join(demoDir, 'fixture', 'patches', 'b.patch'), 'utf8');
  assert.ok(b.startsWith(a), 'patch B must contain patch A byte for byte');
  assert.deepEqual([...b.slice(a.length).matchAll(/^diff --git a\/(\S+) /gm)].map(m => m[1]), ['config/release.json']);
  const bundle = JSON.parse(readFileSync(join(demoDir, 'fixture', 'bundle.json'), 'utf8'));
  assert.deepEqual(bundle.roles.find(r => r.contract.id === 'implementer').contract.authority.allowed_write_scopes, ['src/greet.mjs']);
});

test('EN and JA READMEs carry the same commands, transcript, order, codes and boundary count', () => {
  const en = readme('README.md'), ja = readme('README.ja.md');
  const blocks = text => [...text.matchAll(/```(\w+)\n([\s\S]*?)\n```/g)].map(m => [m[1], m[2]]);
  assert.deepEqual(blocks(en), blocks(ja));
  assert.equal(blocks(en).length, 2);
  const headings = text => text.split('\n').filter(l => /^#{1,3} /.test(l)).map(l => l.match(/^#+/)[0]);
  assert.deepEqual(headings(en), headings(ja));
  const section = (text, n) => text.split(/^## /m)[n].split('\n').filter(l => /^- /.test(l)).length;
  const boundary = text => text.split(/^## /m).findIndex(s => /^(What was checked|確認したこと)/.test(s));
  assert.equal(section(en, boundary(en)), 5);
  assert.equal(section(ja, boundary(ja)), 5);
  const codes = text => [...new Set(text.match(/\b[A-Z][A-Z_]{8,}\b/g))].sort();
  assert.deepEqual(codes(en).filter(c => c !== 'DEMO_ERROR'), codes(ja).filter(c => c !== 'DEMO_ERROR'));
  const tableRows = text => text.split('\n').filter(l => l.startsWith('| ')).length;
  assert.equal(tableRows(en), tableRows(ja));
  for (const text of [en, ja]) {
    assert.match(text, /source_files_checked|Git/);
    assert.match(text, /exit \*{0}1|終了コード1|exit 1/);
  }
  assert.match(en, /\]\(README\.ja\.md\)/);
  assert.match(ja, /\]\(README\.md\)/);
});

test('own-repo step 3 accepts only exit 0 with valid true, lists codes as examples and stops on exit 2 in EN and JA', () => {
  for (const [name, inputError, onlyZero] of [['README.md', /exit 2 is an input or CLI\/file error/i, /\*\*only\*\* when the exit status is 0.*valid: true.*not an exhaustive list/s], ['README.ja.md', /終了コード2は入力またはCLI\/ファイルのエラー/, /終了コードが0で.*valid: true.*だけ.*網羅した一覧ではありません/s]]) {
    const step = readme(name).split(/^## /m).at(-1).split('\n').find(l => /^3\. /.test(l));
    assert.ok(step, `${name} must have own-repo step 3`);
    assert.match(step, /TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY/);
    assert.match(step, /TASK_WRITE_SCOPE_INVALID/);
    assert.match(step, /\.github/);
    assert.match(step, /\.env/);
    assert.match(step, inputError);
    assert.match(step, onlyZero);
    for (const code of ['JSON_INVALID', 'TASK_TYPE_UNROUTED', 'TASK_INPUT_REQUIRED']) assert.match(step, new RegExp(code));
    assert.doesNotMatch(step, /one of two|二つあります/);
  }
});

test('READMEs make no positive enforcement, guarantee or diff-reading claim and give no unverified editor steps', () => {
  const en = readme('README.md'), ja = readme('README.ja.md');
  const proseEn = en.replace(/```[\s\S]*?```/g, '');
  for (const line of proseEn.split('\n')) {
    if (/\b(blocks?|prevents?|enforces?|guarantees?|secure|reads your diff)\b/i.test(line)) {
      assert.match(line, /\b(not|never|cannot|no)\b/i, `unqualified claim: ${line}`);
    }
  }
  for (const line of ja.replace(/```[\s\S]*?```/g, '').split('\n')) {
    if (/ブロック|強制|防止|防ぎ|保証|安全/.test(line)) {
      assert.match(line, /ない|せん|ません|ず/, `unqualified claim: ${line}`);
    }
  }
  assert.doesNotMatch(en, /Cursor.*(steps|setup)/i);
  assert.match(en, /does not run automatically in Cursor or Claude Code/);
});

test('root READMEs link the demo in one click and keep the existing transcript intact', () => {
  assert.match(readFileSync(join(root, 'README.md'), 'utf8'), /\]\(experiments\/git-diff-demo\/README\.md\)/);
  assert.match(readFileSync(join(root, 'README.ja.md'), 'utf8'), /\]\(experiments\/git-diff-demo\/README\.ja\.md\)/);
  for (const link of ['../adoption/FIRST-TASK.md', '../adoption/README.md', '../adoption/integrations/']) assert.ok(existsSync(join(demoDir, link)), link);
  for (const link of ['../adoption/FIRST-TASK.ja.md', '../adoption/README.ja.md']) assert.ok(existsSync(join(demoDir, link)), link);
});

test('demo source uses no network, shell or install path', () => {
  for (const name of ['run.mjs', 'demo.mjs']) {
    const source = readFileSync(join(demoDir, name), 'utf8');
    assert.doesNotMatch(source, /node:(http|https|net|dns|tls|dgram|http2)|\bfetch\s*\(|\bXMLHttpRequest|shell\s*:|execSync|npm install/, name);
  }
});

test('experiments path is not part of the published package files', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.files.some(f => f.startsWith('experiments')), false);
});

// ---- fail-closed: Git enumeration -------------------------------------------------------------

test('rename is refused', t => refuses(t, /unsupported Git change: rename or copy for "src\/greet\.mjs -> src\/hi\.mjs"/, { afterApply: ({ caseId, git: g }) => { if (caseId === 'A') g(['mv', 'src/greet.mjs', 'src/hi.mjs']); } }));
test('deletion is refused', t => refuses(t, /unsupported Git change: deletion for "config\/release\.json"/, { afterApply: ({ caseId, git: g }) => { if (caseId === 'B') g(['rm', '-qf', 'config/release.json']); } }));
test('untracked file is refused', t => refuses(t, /unsupported Git change: untracked file for "extra\.txt"/, { afterApply: ({ caseId, repoDir }) => { if (caseId === 'A') writeFileSync(join(repoDir, 'extra.txt'), 'x'); } }));
test('ignored file is refused', t => refuses(t, /unsupported Git change: ignored file for "hidden\.txt"/, { afterApply: ({ caseId, repoDir }) => { if (caseId === 'A') { writeFileSync(join(repoDir, '.git', 'info', 'exclude'), 'hidden.txt\n'); writeFileSync(join(repoDir, 'hidden.txt'), 'x'); } } }));
test('submodule entry is refused', t => refuses(t, /unsupported Git change: submodule change for "vendor\/sub"/, { afterApply: ({ caseId, git: g }) => { if (caseId === 'A') g(['update-index', '--add', '--cacheinfo', `160000,${'a'.repeat(40)},vendor/sub`]); } }));
test('working-tree-only edit is refused', t => refuses(t, /change outside the index \(status \.M\) for "config\/release\.json"/, { afterApply: ({ caseId, repoDir }) => { if (caseId === 'A') writeFileSync(join(repoDir, 'config', 'release.json'), '{}\n'); } }));
test('edit staged and then changed again is refused', t => refuses(t, /change outside the index \(status MM\)/, { afterApply: ({ caseId, repoDir }) => { if (caseId === 'A') writeFileSync(join(repoDir, 'src', 'greet.mjs'), '// changed again\n'); } }));
test('empty enumeration is refused', t => refuses(t, /Git reported no changed paths/, { afterApply: ({ caseId, git: g }) => { if (caseId === 'A') g(['reset', '-q', '--hard', 'HEAD']); } }));
test('unexpected extra staged path is refused', t => refuses(t, /case A changed paths \["extra\.txt","src\/greet\.mjs"\], expected \["src\/greet\.mjs"\]/, { afterApply: ({ caseId, repoDir, git: g }) => { if (caseId === 'A') { writeFileSync(join(repoDir, 'extra.txt'), 'x'); g(['add', 'extra.txt']); } } }));
test('index-only mode change is refused', t => refuses(t, /change outside the index \(status MM\) for "src\/greet\.mjs"/, { afterApply: ({ caseId, git: g }) => { if (caseId === 'A') { g(['config', 'core.fileMode', 'true']); g(['update-index', '--chmod=+x', 'src/greet.mjs']); } } }));
test('case B path reset out of the index is refused', t => refuses(t, /change outside the index \(status \.M\) for "config\/release\.json"/, { afterApply: ({ caseId, git: g }) => { if (caseId === 'B') g(['reset', '-q', '--', 'config/release.json']); } }, () => {}));

test('git missing from PATH is refused', t => refuses(t, /git was not found on PATH/, env => ({ gitBin: join(env.dir, 'no-such-git') })));

test('status parser refuses records it cannot interpret', () => {
  const nul = (...parts) => Buffer.concat(parts.map(p => Buffer.concat([Buffer.isBuffer(p) ? p : Buffer.from(p), Buffer.from([0])])));
  const ok = '1 M. N... 100644 100644 100644 ' + 'a'.repeat(40) + ' ' + 'b'.repeat(40) + ' ';
  assert.deepEqual(parseStatusV2(nul(ok + 'src/a b.mjs', ok + 'src/a.mjs')), ['src/a b.mjs', 'src/a.mjs'].sort());
  assert.throws(() => parseStatusV2(Buffer.from(ok + 'src/a.mjs')), /not NUL-terminated/);
  assert.throws(() => parseStatusV2(Buffer.alloc(0)), /no changed paths/);
  assert.throws(() => parseStatusV2(nul(Buffer.concat([Buffer.from(ok), Buffer.from([0xff, 0xfe]), Buffer.from('.mjs')]))), /not valid UTF-8 \(bytes .*fffe/);
  assert.throws(() => parseStatusV2(nul(ok + 'src/a\nb.mjs')), /control character/);
  assert.throws(() => parseStatusV2(nul(ok + 'src/a\u0000'.slice(0, 5) + '\u007f')), /control character/);
  assert.throws(() => parseStatusV2(nul('1 M. S.M. 160000 160000 160000 ' + 'a'.repeat(40) + ' ' + 'b'.repeat(40) + ' sub')), /submodule/);
  assert.throws(() => parseStatusV2(nul('2 R. N... 100644 100644 100644 ' + 'a'.repeat(40) + ' ' + 'b'.repeat(40) + ' R100 new.mjs', 'old.mjs')), /rename or copy for "old\.mjs -> new\.mjs"/);
  assert.throws(() => parseStatusV2(nul('2 R. N... 100644 100644 100644 ' + 'a'.repeat(40) + ' ' + 'b'.repeat(40) + ' R100 new.mjs')), /rename or copy/);
  assert.throws(() => parseStatusV2(nul('u UU N... 100644 100644 100644 100644 ' + 'a'.repeat(40) + ' ' + 'b'.repeat(40) + ' ' + 'c'.repeat(40) + ' x')), /unmerged/);
  assert.throws(() => parseStatusV2(nul('? x.txt')), /untracked/);
  assert.throws(() => parseStatusV2(nul('! x.txt')), /ignored/);
  assert.throws(() => parseStatusV2(nul('# branch.head main')), /unexpected Git status record/);
  assert.throws(() => parseStatusV2(nul(ok.replace('M.', 'D.') + 'x')), /deletion/);
  assert.throws(() => parseStatusV2(nul(ok.replace('M.', 'T.') + 'x')), /type change/);
  assert.throws(() => parseStatusV2(nul(ok.replace('M.', 'R.') + 'x')), /status R\./);
  assert.throws(() => parseStatusV2(nul(ok + 'x', ok + 'x')), /same path twice/);
  assert.throws(() => parseStatusV2(nul('1 garbage')), /unreadable Git status record/);
});

test('git version gate', () => {
  assert.deepEqual(parseGitVersion('git version 2.39.3 (Apple Git-146)\n'), [2, 39]);
  assert.equal(parseGitVersion('not git'), null);
  assert.equal(gitVersionSupported([2, 32]), true);
  assert.equal(gitVersionSupported([2, 31]), false);
  assert.equal(gitVersionSupported([3, 0]), true);
  assert.equal(gitVersionSupported(null), false);
});

// ---- fail-closed: fixture, unit tests and ARC results -----------------------------------------

test('widened declared authority is refused rather than reported', t => refuses(t, /declares write authority \["src\/\*\*"\].*Do not widen authority/s, {}, ({ fixtureDir }) => {
  const path = join(fixtureDir, 'bundle.json');
  const bundle = JSON.parse(readFileSync(path, 'utf8'));
  bundle.roles.find(r => r.contract.id === 'implementer').contract.authority.allowed_write_scopes = ['src/**'];
  writeFileSync(path, JSON.stringify(bundle));
}));

test('patch B that changes the allowed file differently from A is refused', t => refuses(t, /src\/greet\.mjs differs between case A and case B/, {}, ({ fixtureDir }) => {
  const path = join(fixtureDir, 'patches', 'b.patch');
  writeFileSync(path, readFileSync(path, 'utf8').replace('Hello, ${name}!', 'Hello, ${name}!!'));
}));

test('missing fixture file is refused with a recovery action', t => refuses(t, /cannot read fixture\/task\.json \(ENOENT\)\.\nRestore the bundled files/, {}, ({ fixtureDir }) => rmSync(join(fixtureDir, 'task.json'))));

test('failing unit tests are refused', t => refuses(t, /case A unit tests failed \(node --test exit 1\)/, {}, ({ fixtureDir }) => {
  const path = join(fixtureDir, 'base', 'test', 'greet.test.mjs');
  writeFileSync(path, readFileSync(path, 'utf8').replace("/^Hello, Ada/", '/^Goodbye/'));
}));

test('a test file with zero tests is refused', t => refuses(t, /ran no passing test/, {}, ({ fixtureDir }) => {
  writeFileSync(join(fixtureDir, 'base', 'test', 'greet.test.mjs'), "import '../src/greet.mjs';\n");
}));

const report = (extra = {}) => JSON.stringify({ tool: 'agent-role-contracts', version, kind: 'explain', valid: true, execution_authorized: false, errors: [], ...extra });
const cliThat = (body) => env => ({ arcCli: fakeCli(env.dir, body) });

test('ARC exit 2 is refused with its first stderr line', t => refuses(t, /ARC explain could not read its input \(exit 2\): boom/, cliThat("process.stderr.write('boom\\nsecond\\n'); process.exit(2);")));
test('an unrunnable ARC CLI is refused', t => refuses(t, /ARC explain/, env => ({ arcCli: join(env.dir, 'missing.mjs') })));
test('ARC passing the out-of-scope path is refused', t => refuses(t, /case B expected ARC to reject config\/release\.json, but explain exited 0.*Do not widen authority/s, cliThat(`console.log(${JSON.stringify(report())});`)));
test('ARC rejecting the allowed path is refused', t => refuses(t, /case A expected ARC to accept src\/greet\.mjs, but explain exited 1/, cliThat(`console.log(${JSON.stringify(report({ valid: false, errors: [{ code: 'TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY' }] }))}); process.exit(1);`)));
test('ARC rejecting with a different code is refused', t => refuses(t, /expected ARC code TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY for config\/release\.json, got TASK_WRITE_SCOPE_INVALID/,
  cliThat(`const p=process.argv[process.argv.indexOf('--task')+1]; const s=JSON.parse((await import('node:fs')).readFileSync(p,'utf8')).inputs.scope; if (s==='src/greet.mjs') console.log(${JSON.stringify(report())}); else { console.log(${JSON.stringify(report({ valid: false, errors: [{ code: 'TASK_WRITE_SCOPE_INVALID' }] }))}); process.exit(1); }`)));
test('ARC report without a version is refused', t => refuses(t, /reported version undefined/, cliThat(`console.log(${JSON.stringify(JSON.stringify((({ version: _v, ...rest }) => rest)(JSON.parse(report()))))});`)));
test('ARC report with a mismatched version is refused', t => refuses(t, /reported version "0\.0\.0"/, cliThat(`console.log(${JSON.stringify(report({ version: '0.0.0' }))});`)));
test('ARC report claiming execution authorization is refused', t => refuses(t, /unexpected report/, cliThat(`console.log(${JSON.stringify(report({ execution_authorized: true }))});`)));
test('ARC non-JSON output is refused', t => refuses(t, /not JSON/, cliThat("console.log('PASS');")));
test('ARC exit 1 without error codes is refused', t => refuses(t, /exit 1 had no error codes/, cliThat(`console.log(${JSON.stringify(report({ valid: false }))}); process.exit(1);`)));
test('ARC exit 0 contradicting valid:false is refused', t => refuses(t, /exit 0 disagreed with valid:false/, cliThat(`console.log(${JSON.stringify(report({ valid: false }))});`)));
test('ARC killed by a signal / exit 3 is refused', t => refuses(t, /could not read its input \(exit 3\)/, cliThat('process.exit(3);')));
