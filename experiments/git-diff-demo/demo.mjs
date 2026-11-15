import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('./', import.meta.url));
const repoRoot = join(here, '..', '..');
const MIN_GIT = [2, 32];
const DECLARED_SCOPE = 'src/greet.mjs';
const OUTSIDE = 'config/release.json';
const OUTSIDE_CODE = 'TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY';
const CASES = [
  { id: 'A', title: 'allowed patch', patch: 'a.patch', paths: [DECLARED_SCOPE], reject: {} },
  { id: 'B', title: 'same patch + one out-of-scope edit', patch: 'b.patch', paths: [OUTSIDE, DECLARED_SCOPE], reject: { [OUTSIDE]: [OUTSIDE_CODE] } },
];

export class DemoError extends Error {}
const fail = (what, next) => { throw new DemoError(`DEMO_ERROR: ${what}${next ? `\n${next}` : ''}`); };
const STOP = 'This demo checks only added or modified tracked files; it stops instead of guessing which path to check. Decide how your own enumeration treats this kind of change before relying on a result.';
const NO_WIDEN = 'The declarations or fixture changed. Do not widen authority or edit the patch to make the demo pass.';

const strict = new TextDecoder('utf-8', { fatal: true });
const shown = value => JSON.stringify(value);
const unsupported = (kind, path) => fail(`unsupported Git change: ${kind} for ${shown(path)}.`, STOP);

function decodeRecord(bytes) {
  try { return strict.decode(bytes); } catch {
    return fail(`a path from Git is not valid UTF-8 (bytes ${Buffer.from(bytes).toString('hex')}).`, STOP);
  }
}

// Parses `git status --porcelain=v2 -z --untracked-files=all --ignored=matching`.
// Accepts only ordinary staged modifications/additions of regular files; anything else stops the demo.
export function parseStatusV2(buffer) {
  const fields = [];
  let start = 0;
  for (let i = 0; i < buffer.length; i++) if (buffer[i] === 0) { fields.push(buffer.subarray(start, i)); start = i + 1; }
  if (start !== buffer.length) fail('Git status output was not NUL-terminated.', 'Rerun the same command; if it repeats, report your Git version.');
  const paths = [];
  for (let i = 0; i < fields.length; i++) {
    const text = decodeRecord(fields[i]);
    const kind = text[0];
    if (kind === '1') {
      const m = /^1 (\S\S) (\S+) (\d+) (\d+) (\d+) ([0-9a-f]+) ([0-9a-f]+) ([\s\S]+)$/.exec(text);
      if (!m) fail(`unreadable Git status record ${shown(text)}.`, STOP);
      const [, xy, sub, , modeIndex, modeWork, , , path] = m;
      if (/[\u0000-\u001f\u007f]/.test(path)) unsupported('a control character in the path', path);
      if (sub !== 'N...') unsupported('submodule change', path);
      if (xy[0] === 'D') unsupported('deletion', path);
      if (xy[0] === 'T') unsupported('file type change', path);
      if (xy[1] !== '.') unsupported(`change outside the index (status ${xy})`, path);
      if (xy[0] !== 'M' && xy[0] !== 'A') unsupported(`status ${xy}`, path);
      if (modeIndex !== '100644' || modeWork !== '100644') unsupported(`non-regular or executable file mode ${modeIndex}/${modeWork}`, path);
      paths.push(path);
    } else if (kind === '2') {
      const m = /^2 \S\S \S+ \d+ \d+ \d+ [0-9a-f]+ [0-9a-f]+ \S+ ([\s\S]+)$/.exec(text);
      const original = fields[++i] === undefined ? '?' : decodeRecord(fields[i]);
      unsupported('rename or copy', `${original} -> ${m ? m[1] : '?'}`);
    } else if (kind === 'u') unsupported('unmerged path', text.slice(2));
    else if (kind === '?') unsupported('untracked file', text.slice(2));
    else if (kind === '!') unsupported('ignored file', text.slice(2));
    else fail(`unexpected Git status record ${shown(text)}.`, STOP);
  }
  if (paths.length === 0) fail('Git reported no changed paths after applying the patch.', 'An empty list would look like a pass, so the demo stops. Check that the patch applies.');
  if (new Set(paths).size !== paths.length) fail('Git listed the same path twice.', STOP);
  return paths.sort();
}

export function parseGitVersion(text) {
  const m = /^git version (\d+)\.(\d+)/.exec(text.trim());
  return m ? [Number(m[1]), Number(m[2])] : null;
}
export const gitVersionSupported = v => Array.isArray(v) && (v[0] > MIN_GIT[0] || (v[0] === MIN_GIT[0] && v[1] >= MIN_GIT[1]));

function listFiles(dir, prefix = '') {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? listFiles(join(dir, entry.name), `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`]);
}

function readJson(path, label) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch (error) {
    return fail(`cannot read ${label} (${error.code ?? error.name}).`, 'Restore the bundled files from a clean clone and rerun the same command.');
  }
}

const sameList = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

export async function runDemo(options = {}) {
  const fixtureDir = options.fixtureDir ?? join(here, 'fixture');
  const arcCli = options.arcCli ?? join(repoRoot, 'bin', 'agent-role-contracts.mjs');
  const gitBin = options.gitBin ?? 'git';
  const out = [];
  let tmp;
  try {
    tmp = mkdtempSync(join(options.tmpRoot ?? tmpdir(), 'arc-git-diff-demo-'));
    const emptyConfig = join(tmp, 'empty.gitconfig'), home = join(tmp, 'home'), hooks = join(tmp, 'hooks'), tasks = join(tmp, 'tasks');
    for (const dir of [home, hooks, tasks]) mkdirSync(dir);
    writeFileSync(emptyConfig, '');
    const env = { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: emptyConfig, GIT_TERMINAL_PROMPT: '0', HOME: home, XDG_CONFIG_HOME: home, USERPROFILE: home, LC_ALL: 'C' };
    for (const key of ['PATH', 'SystemRoot', 'ComSpec', 'PATHEXT']) if (process.env[key] !== undefined) env[key] = process.env[key];
    env.TMPDIR = env.TEMP = env.TMP = tmp;
    const identity = ['-c', 'user.name=ARC Demo', '-c', 'user.email=demo@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', '-c', `core.hooksPath=${hooks}`];
    const spawn = (bin, args, cwd) => spawnSync(bin, args, { cwd, env, timeout: 60000, maxBuffer: 16 * 1024 * 1024 });
    const git = (cwd, args, what) => {
      const r = spawn(gitBin, [...identity, ...args], cwd);
      if (r.error?.code === 'ENOENT') fail(`git was not found on PATH. Install Git ${MIN_GIT.join('.')} or newer, then rerun the same command.`);
      if (r.error || r.status !== 0) fail(`git ${what} failed (${r.error?.code ?? `exit ${r.status}`}): ${String(r.stderr ?? '').split('\n')[0]}`, 'The demo stops here; nothing was checked for this case.');
      return r;
    };

    const versionText = String(git(tmp, ['--version'], 'version').stdout);
    if (!gitVersionSupported(parseGitVersion(versionText))) fail(`unsupported Git version ${shown(versionText.trim())}. Install Git ${MIN_GIT.join('.')} or newer, then rerun the same command.`);

    const bundlePath = join(fixtureDir, 'bundle.json');
    const bundle = readJson(bundlePath, 'fixture/bundle.json');
    const taskTemplate = readJson(join(fixtureDir, 'task.json'), 'fixture/task.json');
    const declared = bundle.roles?.find(r => r.contract?.id === 'implementer')?.contract?.authority?.allowed_write_scopes;
    if (!Array.isArray(declared) || !sameList(declared, [DECLARED_SCOPE])) fail(`the fixture declares write authority ${shown(declared)}, expected exactly [${shown(DECLARED_SCOPE)}].`, NO_WIDEN);
    const expectedVersion = readJson(join(repoRoot, 'package.json'), 'package.json').version;
    if (typeof expectedVersion !== 'string') fail('package.json has no version.', 'Restore package.json from a clean clone.');

    const baseDir = join(fixtureDir, 'base');
    const baseFiles = listFiles(baseDir);
    out.push('ARC #130 demo: unit tests pass, the scope check still flags the extra file.', `Declared write authority: ${DECLARED_SCOPE}`);
    const results = {};
    let arcVersion;

    for (const spec of CASES) {
      const repo = join(tmp, `case-${spec.id}`);
      mkdirSync(repo);
      for (const file of baseFiles) {
        mkdirSync(dirname(join(repo, file)), { recursive: true });
        writeFileSync(join(repo, file), readFileSync(join(baseDir, file)));
      }
      git(repo, ['init', '-q'], 'init');
      git(repo, ['add', '-A'], 'add');
      git(repo, ['commit', '-q', '-m', 'base'], 'commit');
      git(repo, ['apply', '--index', join(fixtureDir, 'patches', spec.patch)], `apply ${spec.patch}`);
      if (options.afterApply) await options.afterApply({ caseId: spec.id, repoDir: repo, git: (args, what = 'hook command') => git(repo, args, what) });

      const status = git(repo, ['status', '--porcelain=v2', '-z', '--untracked-files=all', '--ignored=matching'], 'status').stdout;
      const changed = parseStatusV2(status);
      if (!sameList(changed, spec.paths)) fail(`case ${spec.id} changed paths ${shown(changed)}, expected ${shown(spec.paths)}.`, NO_WIDEN);

      const test = spawn(process.execPath, ['--test', '--test-reporter=tap', 'test/greet.test.mjs'], repo);
      const tap = String(test.stdout ?? '');
      // Node reports a file that defines no tests as one passing file-level entry, so count named tests only.
      const passed = (tap.match(/^ok \d+ - (?:greets a name|keeps a name with a space intact)\r?$/gm) ?? []).length, failed = Number(/^# fail (\d+)$/m.exec(tap)?.[1] ?? NaN);
      if (test.error || test.status !== 0 || failed !== 0) fail(`case ${spec.id} unit tests failed (node --test exit ${test.status ?? test.error?.code}).`, 'The demo needs both cases to pass tests before comparing ARC results.');
      if (passed < 1) fail(`case ${spec.id} unit tests ran no passing test.`, 'A run with zero tests proves nothing, so the demo stops.');

      const lines = [];
      for (const [index, path] of changed.entries()) {
        const taskPath = join(tasks, `${spec.id}-${index}.json`);
        writeFileSync(taskPath, JSON.stringify({ ...taskTemplate, inputs: { ...taskTemplate.inputs, scope: path } }));
        const arc = spawn(process.execPath, [arcCli, 'explain', '--bundle', bundlePath, '--task', taskPath, '--format', 'json'], tmp);
        if (arc.error || arc.status === null || ![0, 1].includes(arc.status)) {
          const first = String(arc.stderr ?? '').split('\n')[0] || arc.error?.code || 'no message';
          fail(`ARC explain could not read its input (exit ${arc.status ?? arc.error?.code}): ${first}`, 'No declaration result exists for this path, so the demo stops.');
        }
        let report;
        try { report = JSON.parse(String(arc.stdout)); } catch { fail(`ARC explain printed output that is not JSON for ${shown(path)}.`, 'The demo stops; it did not get a declaration result.'); }
        if (report?.tool !== 'agent-role-contracts' || report.kind !== 'explain' || report.execution_authorized !== false) fail(`ARC explain returned an unexpected report for ${shown(path)}.`, 'The demo stops; check that bin/agent-role-contracts.mjs is the one from this clone.');
        if (typeof report.version !== 'string' || report.version !== expectedVersion) fail(`ARC reported version ${shown(report.version)}, but package.json says ${shown(expectedVersion)}.`, 'The demo stops so a mismatched CLI is never shown as the checked version.');
        arcVersion = report.version;
        const codes = (report.errors ?? []).map(e => e.code);
        if (arc.status === 0 && report.valid !== true) fail(`ARC explain exit 0 disagreed with valid:${report.valid} for ${shown(path)}.`);
        if (arc.status === 1 && (report.valid !== false || codes.length === 0)) fail(`ARC explain exit 1 had no error codes for ${shown(path)}.`);
        const wanted = spec.reject[path];
        if (wanted === undefined && arc.status !== 0) fail(`case ${spec.id} expected ARC to accept ${path}, but explain exited ${arc.status} (${codes.join(', ')}).`, NO_WIDEN);
        if (wanted !== undefined && arc.status === 0) fail(`case ${spec.id} expected ARC to reject ${path}, but explain exited 0.`, NO_WIDEN);
        if (wanted !== undefined && !sameList(codes, wanted)) fail(`case ${spec.id} expected ARC code ${wanted.join(', ')} for ${path}, got ${codes.join(', ')}.`, NO_WIDEN);
        lines.push(`  ARC explain ${path}: ${arc.status === 0 ? 'PASS' : 'FAIL'} (exit ${arc.status})${codes.length ? ` ${codes.join(', ')}` : ''}`);
      }
      results[spec.id] = { changed, content: readFileSync(join(repo, DECLARED_SCOPE)), flagged: Object.keys(spec.reject) };
      out.push('', `Case ${spec.id}: ${spec.title}`, `  Changed paths (from Git): ${changed.join(', ')}`, '  Unit tests (node --test): PASS (exit 0)', ...lines);
    }

    if (!results.A.content.equals(results.B.content)) fail(`${DECLARED_SCOPE} differs between case A and case B.`, 'The two patches must make the same change to the allowed file; the demo stops.');
    out.push('', `Result: tests passed in both cases; ARC flagged ${results.B.flagged.length} path in case B: ${results.B.flagged.join(', ')}`,
      'Demo complete: every observed result matched the expectation (demo exit 0).',
      `Checked by ARC ${arcVersion}: each path this demo listed from Git, against the declared authority.`,
      'Not checked: code correctness, who made the change, or whether any write was blocked.');
    return { exitCode: 0, stdout: out.join('\n') + '\n', stderr: '' };
  } catch (error) {
    const message = error instanceof DemoError ? error.message : `DEMO_ERROR: unexpected internal error (${error?.code ?? error?.name}): ${String(error?.message).split('\n')[0]}`;
    return { exitCode: 2, stdout: '', stderr: message + '\n' };
  } finally {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  }
}
