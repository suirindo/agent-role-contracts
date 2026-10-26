/**
 * Read-only collector for bounded Git base/candidate committed trees.
 * Plumbing commands only, scrubbed environment, pinned full object IDs.
 * It never runs hooks, filters, textconv, fsmonitor, candidate code or the network,
 * and every error is reduced to a stable code (no stderr, no local paths).
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const LIMITS = Object.freeze({
  treeBytes: 4 * 1024 * 1024,
  treeEntries: 20000,
  changedPaths: 500,
  fileBytes: 1024 * 1024,
  totalBytes: 8 * 1024 * 1024,
  gitTimeoutMs: 10000,
});

export class EvidenceError extends Error {
  constructor(code) {
    super(code);
    this.name = 'EvidenceError';
    this.code = code;
  }
}

const REGULAR = new Set(['100644', '100755']);
const COMMIT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const UNSAFE_CONFIG = /^(?:filter\.|include\.|includeif\.|core\.worktree$|core\.fsmonitor$|core\.attributesfile$|core\.excludesfile$)/;
const sha256Hex = bytes => createHash('sha256').update(bytes).digest('hex');
const gitEnv = () => ({
  PATH: process.env.PATH ?? '/usr/bin:/bin',
  LC_ALL: 'C',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_TERMINAL_PROMPT: '0',
  // No transport may start, including lazy fetching on Git versions without --no-lazy-fetch.
  GIT_ALLOW_PROTOCOL: '',
  GIT_NO_LAZY_FETCH: '1',
  GIT_OPTIONAL_LOCKS: '0',
  GIT_ATTR_NOSYSTEM: '1',
  HOME: '/nonexistent',
});
const SAFE_FLAGS = ['--no-replace-objects', '--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', '-c', 'core.untrackedCache=false', '--literal-pathspecs'];

function git(prefix, args, { input, max = LIMITS.treeBytes } = {}) {
  const r = spawnSync('git', [...prefix, ...SAFE_FLAGS, ...args], {
    env: gitEnv(), cwd: '/', input, maxBuffer: max, timeout: LIMITS.gitTimeoutMs, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (r.error) {
    if (r.error.code === 'ENOBUFS') throw new EvidenceError('GIT_OUTPUT_LIMIT');
    if (r.error.code === 'ETIMEDOUT') throw new EvidenceError('GIT_TIMEOUT');
    throw new EvidenceError(r.error.code === 'ENOENT' ? 'GIT_UNAVAILABLE' : 'GIT_COMMAND_FAILED');
  }
  if (r.signal) throw new EvidenceError(r.signal === 'SIGTERM' ? 'GIT_TIMEOUT' : 'GIT_COMMAND_FAILED');
  return { status: r.status, stdout: r.stdout };
}
const must = (prefix, args, opts, code = 'GIT_COMMAND_FAILED') => {
  const r = git(prefix, args, opts);
  if (r.status !== 0) throw new EvidenceError(code);
  return r.stdout;
};

function locate(repo) {
  const dir = p => { try { return fs.lstatSync(p).isDirectory(); } catch { return false; } };
  const exists = p => { try { fs.lstatSync(p); return true; } catch { return false; } };
  if (typeof repo !== 'string' || !repo || repo.includes('\0') || !dir(repo)) throw new EvidenceError('REPO_UNREADABLE');
  const abs = path.resolve(repo);
  if (dir(path.join(abs, '.git'))) return { gitDir: path.join(abs, '.git'), workTree: abs };
  if (exists(path.join(abs, 'HEAD')) && dir(path.join(abs, 'objects')) && dir(path.join(abs, 'refs'))) return { gitDir: abs, workTree: null };
  throw new EvidenceError('REPO_UNREADABLE');
}

function parseTree(buf) {
  const map = new Map();
  let at = 0;
  while (at < buf.length) {
    const end = buf.indexOf(0, at);
    if (end < 0) throw new EvidenceError('TREE_PARSE_FAILED');
    const rec = buf.subarray(at, end);
    at = end + 1;
    const tab = rec.indexOf(9);
    const head = tab < 0 ? null : rec.subarray(0, tab).toString('latin1').split(' ');
    if (!head || head.length !== 3 || !/^[0-7]{6}$/.test(head[0]) || !COMMIT_ID.test(head[2])) throw new EvidenceError('TREE_PARSE_FAILED');
    if (map.size >= LIMITS.treeEntries) throw new EvidenceError('TREE_ENTRY_LIMIT');
    const raw = Buffer.from(rec.subarray(tab + 1));
    map.set(raw.toString('latin1'), { raw, mode: head[0], type: head[1], oid: head[2] });
  }
  return map;
}

function decodePath(raw) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(raw); } catch { return null; }
}

export function collect(repo, { base, candidate }) {
  if (!COMMIT_ID.test(base ?? '') || !COMMIT_ID.test(candidate ?? '')) throw new EvidenceError('PIN_INVALID');
  const { gitDir, workTree } = locate(repo);
  const prefix = [`--git-dir=${gitDir}`];
  const format = must(prefix, ['rev-parse', '--show-object-format'], { max: 64 }, 'REPO_UNREADABLE').toString().trim();
  if (!['sha1', 'sha256'].includes(format)) throw new EvidenceError('REPO_UNREADABLE');
  const idLength = format === 'sha1' ? 40 : 64;
  if (base.length !== idLength || candidate.length !== idLength) throw new EvidenceError('PIN_INVALID');

  const pin = commit => {
    const type = git(prefix, ['cat-file', '-t', commit], { max: 64 });
    if (type.status !== 0) throw new EvidenceError('PIN_NOT_FOUND');
    if (type.stdout.toString().trim() !== 'commit') throw new EvidenceError('PIN_NOT_COMMIT');
    const tree = must(prefix, ['rev-parse', '--verify', `${commit}^{tree}`], { max: 128 }).toString().trim();
    if (!COMMIT_ID.test(tree)) throw new EvidenceError('GIT_COMMAND_FAILED');
    return { commit, tree, entries: parseTree(must(prefix, ['ls-tree', '-r', '-z', '--full-tree', tree])) };
  };
  const b = pin(base), c = pin(candidate);
  const anc = git(prefix, ['merge-base', '--is-ancestor', base, candidate], { max: 64 });
  if (anc.status !== 0 && anc.status !== 1) throw new EvidenceError('GIT_COMMAND_FAILED');
  const baselineIsAncestor = anc.status === 0;

  const keys = [...new Set([...b.entries.keys(), ...c.entries.keys()])].sort();
  const changedKeys = keys.filter(k => {
    const x = b.entries.get(k), y = c.entries.get(k);
    return !x || !y || x.oid !== y.oid || x.mode !== y.mode;
  });
  if (changedKeys.length > LIMITS.changedPaths) throw new EvidenceError('CHANGED_PATH_LIMIT');

  // Independent byte measurement. Sizes first, then one bounded batch read.
  const blobs = new Map();
  let total = 0;
  const hashObject = bytes => createHash(format).update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])).digest('hex');
  function fetch(oids) {
    const wanted = [...new Set(oids)].filter(o => !blobs.has(o));
    if (!wanted.length) return;
    const sizes = new Map();
    for (const line of must(prefix, ['cat-file', '--batch-check'], { input: wanted.join('\n') + '\n' }).toString('latin1').split('\n')) {
      const m = /^([0-9a-f]+) (blob) (\d+)$/.exec(line);
      if (m) sizes.set(m[1], Number(m[3]));
    }
    const readable = [];
    for (const oid of wanted) {
      const size = sizes.get(oid);
      if (size === undefined) throw new EvidenceError('GIT_OBJECT_MISSING');
      if (size > LIMITS.fileBytes) blobs.set(oid, { size, state: 'TOO_LARGE' });
      else if (total + size > LIMITS.totalBytes) blobs.set(oid, { size, state: 'BUDGET_EXCEEDED' });
      else { total += size; readable.push(oid); }
    }
    if (!readable.length) return;
    const out = must(prefix, ['cat-file', '--batch'], { input: readable.join('\n') + '\n', max: LIMITS.totalBytes + readable.length * 160 });
    let at = 0;
    for (const oid of readable) {
      const nl = out.indexOf(10, at);
      const m = nl < 0 ? null : /^([0-9a-f]+) blob (\d+)$/.exec(out.subarray(at, nl).toString('latin1'));
      if (!m || m[1] !== oid) throw new EvidenceError('GIT_OBJECT_MISMATCH');
      const len = Number(m[2]);
      const bytes = Buffer.from(out.subarray(nl + 1, nl + 1 + len));
      if (bytes.length !== len || len !== sizes.get(oid) || hashObject(bytes) !== oid) throw new EvidenceError('GIT_OBJECT_MISMATCH');
      at = nl + 1 + len + 1;
      let utf8 = true;
      try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { utf8 = false; }
      blobs.set(oid, { size: len, state: 'OK', bytes, sha256: sha256Hex(bytes), binary: bytes.includes(0) || !utf8 });
    }
  }
  fetch(changedKeys.flatMap(k => [b.entries.get(k), c.entries.get(k)]).filter(e => e && REGULAR.has(e.mode) && e.type === 'blob').map(e => e.oid));

  const side = e => {
    if (!e) return null;
    const out = { mode: e.mode, type: e.type, oid: e.oid };
    const surfaces = [];
    if (e.mode === '120000') surfaces.push('SURFACE_SYMLINK');
    else if (e.mode === '160000' || e.type === 'commit') surfaces.push('SURFACE_SUBMODULE');
    else if (!REGULAR.has(e.mode) || e.type !== 'blob') surfaces.push('SURFACE_UNSUPPORTED_MODE');
    else {
      const o = blobs.get(e.oid);
      out.size = o.size;
      if (o.state === 'TOO_LARGE') surfaces.push('SURFACE_FILE_TOO_LARGE');
      else if (o.state === 'BUDGET_EXCEEDED') surfaces.push('SURFACE_TOTAL_BUDGET_EXCEEDED');
      else {
        out.sha256 = o.sha256;
        out.git_object_verified = true;
        if (o.binary) surfaces.push('SURFACE_BINARY_FILE');
      }
    }
    return { side: out, surfaces };
  };
  const changed = changedKeys.map(k => {
    const x = b.entries.get(k), y = c.entries.get(k);
    const raw = (x ?? y).raw;
    const text = decodePath(raw);
    const sx = side(x), sy = side(y);
    const entry = {
      ...(text === null ? { path_utf8: false, path_hex: raw.toString('hex') } : { path_utf8: true, path: text }),
      status: !x ? 'added' : !y ? 'deleted' : x.oid === y.oid ? 'mode_changed' : 'modified',
      base: sx?.side ?? null,
      candidate: sy?.side ?? null,
      surfaces: [...new Set([...(sx?.surfaces ?? []), ...(sy?.surfaces ?? []), ...(text === null ? ['SURFACE_NON_UTF8_PATH'] : [])])].sort(),
    };
    return entry;
  });
  // Rename candidates: exact blob+mode match, one deleted and one added path only. No similarity heuristics.
  const groups = new Map();
  for (const e of changed) {
    const s = e.status === 'deleted' ? e.base : e.status === 'added' ? e.candidate : null;
    if (!s || e.path_utf8 === false || !REGULAR.has(s.mode)) continue;
    const key = `${s.mode}:${s.oid}`;
    const g = groups.get(key) ?? { deleted: [], added: [] };
    g[e.status].push(e);
    groups.set(key, g);
  }
  for (const g of groups.values()) {
    if (g.deleted.length === 1 && g.added.length === 1) {
      g.deleted[0].rename_candidate_to = g.added[0].path;
      g.added[0].rename_candidate_from = g.deleted[0].path;
    }
  }

  return {
    object_format: format,
    base: { commit: b.commit, tree: b.tree },
    candidate: { commit: c.commit, tree: c.tree },
    baseline_is_ancestor: baselineIsAncestor,
    changed,
    worktree: worktree(prefix, workTree, candidate),
    /** Verified, bounded read of a committed file from either pinned tree. */
    readFile(which, filePath) {
      const e = (which === 'base' ? b : c).entries.get(Buffer.from(filePath, 'utf8').toString('latin1'));
      if (!e) return { state: 'ABSENT' };
      if (!REGULAR.has(e.mode) || e.type !== 'blob') return { state: 'UNSUPPORTED' };
      fetch([e.oid]);
      const o = blobs.get(e.oid);
      if (o.state !== 'OK') return { state: o.state };
      return o.binary ? { state: 'BINARY' } : { state: 'OK', text: o.bytes.toString('utf8') };
    },
  };
}

function worktree(prefix, workTree, candidate) {
  if (!workTree) return { state: 'NOT_APPLICABLE', reason: 'bare_repository', head_matches_candidate: null };
  const head = git(prefix, ['rev-parse', '--verify', 'HEAD^{commit}'], { max: 128 });
  const headMatches = head.status === 0 ? head.stdout.toString().trim() === candidate : null;
  const cfg = git(prefix, ['config', '--file', path.join(prefix[0].slice('--git-dir='.length), 'config'), '--list', '-z'], { max: 1024 * 1024 });
  if (cfg.status !== 0) return { state: 'UNKNOWN', reason: 'WORKTREE_CONFIG_UNSAFE', head_matches_candidate: headMatches };
  const unsafe = cfg.stdout.toString('utf8').split('\0').filter(Boolean).some(item => UNSAFE_CONFIG.test(item.split('\n')[0].toLowerCase()));
  if (unsafe) return { state: 'UNKNOWN', reason: 'WORKTREE_CONFIG_UNSAFE', head_matches_candidate: headMatches };
  let out;
  try {
    out = must([...prefix, `--work-tree=${workTree}`], ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=all']);
  } catch (error) {
    if (error instanceof EvidenceError) return { state: 'UNKNOWN', reason: 'WORKTREE_STATUS_UNAVAILABLE', head_matches_candidate: headMatches };
    throw error;
  }
  const fields = out.toString('latin1').split('\0').filter(Boolean);
  let untracked = false, dirty = false;
  for (let i = 0; i < fields.length; i += 1) {
    const xy = fields[i].slice(0, 2);
    if (xy === '??') untracked = true;
    else dirty = true;
    if (/[RC]/.test(xy)) i += 1;
  }
  return { state: untracked || dirty ? 'DIRTY' : 'CLEAN', untracked, dirty, head_matches_candidate: headMatches };
}
