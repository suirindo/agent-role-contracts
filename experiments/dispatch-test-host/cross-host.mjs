/**
 * Cross-host TEST-host variant (#69): sender/resolver on this host, receiver set on a SEPARATE host and user (started over a
 * pinned-host-key SSH session, or as a local child in offline tests). Same test-owned issuer/registry/actor/policy and adapter
 * as host.mjs; only the receiver placement and destination identity binding differ. NOT production or native host authority.
 *
 * Transports: `bind` = an IP address (HTTP listener per receiver on that address only) or "stdio" (no listener: requests and
 * responses are JSON lines on the receiver process's own stdin/stdout, i.e. inside the SSH session that started it; no port is
 * opened or forwarded on either host).
 *
 * Destination binding (TEST level): the resolver accepts an endpoint as the approved logical target only if the endpoint answers
 * the adapter's challenge with an HMAC over (challenge, receiver_id, hostname, uid, trial nonce) keyed by a per-case secret that
 * was delivered only on the launcher's stdin (memory only, never written), and the claimed hostname/uid equal the expected
 * receiver host. With the SSH launcher the secret travels only inside the SSH channel whose host key is pinned by the caller.
 */
import { spawn } from 'node:child_process';
import { createGroupRegistry, terminateGroup, groupAlive } from './process-group.mjs';
import http from 'node:http';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, mkdtemp, realpath, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDispatchTargetAdapter } from '../task-consumption/dispatch-target.mjs';
import { scenario, render, NOW } from '../task-approval/fixtures.mjs';
import { contextDigest } from '../task-approval/approval.mjs';
import { digest } from '../cross-tool-effects/contract.mjs';
import { PAYLOAD, APPROVED, OTHER, TEST_AUTHORITY } from './host.mjs';

export { PAYLOAD, APPROVED, OTHER, TEST_AUTHORITY };
export const REMOTE_RECEIVER_SCRIPT = new URL('./remote-receiver.mjs', import.meta.url).pathname;
export const REMOTE_OBSERVER_SCRIPT = new URL('./remote-observer.mjs', import.meta.url).pathname;
const sha = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const within = (promise, ms) => new Promise(resolve => { const t = setTimeout(() => resolve(null), ms); promise.then(v => { clearTimeout(t); resolve(v); }); });
// Every child this module spawns is detached (its own process group) and tracked, so an overall deadline can reap whole sessions,
// ProxyCommand descendants included. Resolves { confirmed, unknown }: unknown lists groups whose death could not be confirmed (state UNKNOWN).
const registry = createGroupRegistry();
const track = registry.track;
export const trackChild = track;
export const killTrackedChildren = opts => registry.terminateAll(opts);
export const REAP_BUDGET_MS = 2000;                                              // worst case of one terminateGroup (TERM wait + KILL wait) is bounded by this
const shq = s => "'" + String(s).replace(/'/g, "'\\''") + "'";

/** HMAC identity proof; must match remote-receiver.mjs. */
export function identityProof(secret, { challenge, receiver_id, hostname, uid, nonce }) {
 return createHmac('sha256', Buffer.from(secret, 'hex')).update(['arc69-xhost-identity/0.1', challenge, receiver_id, hostname, String(uid), nonce].join('\n')).digest('hex');
}

/** Offline launcher: the receiver script as a local child (bind 127.0.0.1 or "stdio"), logs under <dir>/<caseName>. */
export const localLauncher = (dir, bind = '127.0.0.1') => ({ caseName, spec }) => ({
 command: process.execPath, args: [REMOTE_RECEIVER_SCRIPT, join(dir, caseName), bind, JSON.stringify(spec)], bind });

/** SSH launcher: the receiver script (already placed at <remoteRoot>/bin) on the remote host, with `bind` (an address or "stdio"). */
export const sshLauncher = ({ sshHost, sshOptions = [], remoteNode, remoteRoot, bind }) => {
 // Fail closed: a receiver session that carries the per-case secret must never run without the caller's host-key pin.
 const opts = sshOptions.filter((x, i) => sshOptions[i - 1] === '-o').map(x => x.toLowerCase());
 for (const need of ['stricthostkeychecking=yes', 'batchmode=yes', 'clearallforwardings=yes']) if (!opts.includes(need)) throw new Error('sshLauncher requires ' + need);
 for (const need of ['userknownhostsfile=', 'hostkeyalias=']) if (!opts.some(o => o.startsWith(need) && o.length > need.length)) throw new Error('sshLauncher requires ' + need);
 return ({ caseName, spec }) => ({
 command: 'ssh', args: [...sshOptions, '-T', sshHost,
  ['exec', remoteNode, remoteRoot + '/bin/remote-receiver.mjs', remoteRoot + '/' + caseName, bind, JSON.stringify(spec)].map(shq).join(' ')], bind });
};

/** Start one receiver set; the secret/nonce go on stdin only. stop() closes stdin (remote exits on EOF), then bounded TERM/KILL. */
export async function startReceiverSet({ command, args, bind }, { secret, nonce, startupTimeoutMs = 30000 }) {
 const child = track(spawn(command, args, { detached: true, stdio: ['pipe', 'pipe', 'pipe'] }));
 let stderr = ''; child.stderr.on('data', d => { if (stderr.length < 4096) stderr += d; });
 const exited = new Promise(r => { child.once('exit', (code, signal) => r({ code, signal })); child.once('error', e => r({ code: null, signal: null, error: e.message })); });
 const stop = async () => {
  try { child.stdin.end(); } catch { /* gone */ }
  let done = await within(exited, 5000);
  if (!done) { try { process.kill(-child.pid, 'SIGTERM'); } catch { /* gone */ } done = await within(exited, 3000); }
  if (!done) { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ } done = await within(exited, 3000); }
  done ??= { code: null, signal: null, unreaped: true };
  // The leader is gone, but a descendant (e.g. ssh ProxyCommand) may still hold the group: confirm the whole group is dead.
  if (groupAlive(child.pid) && !(await terminateGroup(child.pid, { termMs: 500, killMs: 1500 }))) done = { ...done, unreaped: true };
  return done;
 };
 child.stdin.on('error', () => {});
 // Line reader over the child's stdout: first line is the handshake, later lines (stdio mode) are replies by seq.
 const waiting = new Map(); let buf = '', onHandshake = null;
 child.stdout.setEncoding('utf8');
 child.stdout.on('data', d => {
  buf += d; let i;
  while ((i = buf.indexOf('\n')) >= 0) {
   const line = buf.slice(0, i); buf = buf.slice(i + 1);
   if (onHandshake) { const f = onHandshake; onHandshake = null; f(line); continue; }
   let m; try { m = JSON.parse(line); } catch { continue; }
   const w = waiting.get(m.seq); if (w) { waiting.delete(m.seq); w(m); }   // late replies to timed-out calls are dropped
  }
 });
 let seq = 0;
 const call = (msg, timeoutMs) => new Promise((resolve, reject) => {
  const id = ++seq;
  const t = setTimeout(() => { waiting.delete(id); reject(new Error('timeout')); }, timeoutMs);
  waiting.set(id, m => { clearTimeout(t); resolve({ status: m.status, body: m.body ?? '' }); });
  child.stdin.write(JSON.stringify({ seq: id, ...msg }) + '\n');
 });
 let timer;
 try {
  child.stdin.write(JSON.stringify({ secret, nonce }) + '\n');
  const line = await new Promise((resolve, reject) => {
   onHandshake = resolve;
   timer = setTimeout(() => reject(new Error('receiver set startup timeout')), startupTimeoutMs);
   exited.then(x => reject(new Error('receiver set exited early ' + JSON.stringify(x) + ' ' + stderr.trim())));
  });
  const hs = JSON.parse(line);
  if (!Array.isArray(hs.receivers) || hs.bind_host !== bind) throw new Error('bad handshake');
  const stdio = bind === 'stdio';
  if (!stdio && !hs.receivers.every(r => Number.isInteger(r.port) && r.port > 0 && r.port < 65536)) throw new Error('bad handshake');
  const receivers = Object.fromEntries(hs.receivers.map(r => [r.id, stdio ? { transport: 'stdio', call } : { transport: 'http', host: bind, port: r.port }]));
  return { receivers, host: hs.host, bind_host: hs.bind_host, session_peer: hs.session_peer ?? null, pid: child.pid, stop, stderr: () => stderr };
 } catch (e) { await stop(); throw e; } finally { clearTimeout(timer); }
}

/** One request to a receiver endpoint over its transport. */
function request(ep, { path, method, headers = {}, challenge }, body, timeoutMs) {
 if (ep.transport === 'stdio') {
  return ep.call({ receiver_id: ep.id, method, path, challenge, headers, body_b64: body ? Buffer.from(body).toString('base64') : '' }, timeoutMs);
 }
 return new Promise((resolve, reject) => {
  const req = http.request({ host: ep.host, port: ep.port, path: challenge ? path + '?challenge=' + challenge : path, method, headers, agent: false, timeout: timeoutMs }, res => {
   const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
  });
  req.on('timeout', () => req.destroy(new Error('timeout'))); req.on('error', reject); req.end(body);
 });
}


/**
 * sets: [{ name, launcher, receivers: [{ id, target, delayMs }], trusted: boolean }]. Only `trusted` sets receive the case secret;
 * an untrusted set (e.g. a wrong-host impostor) gets an unrelated secret it cannot use to prove the trusted identity.
 * Routes are '<set>:<receiver_id>'. expected: { hostname, uid } of the trusted receiver host.
 */
export async function createCrossHostTestHost({ caseName, sets, expected, nonce, proHead = '', sendTimeoutMs = 2000, resolveTimeoutMs = 3000 }) {
 const secret = randomBytes(32).toString('hex');      // memory only
 const work = await realpath(await mkdtemp(join(tmpdir(), 'arc69-xhost-'))); await chmod(work, 0o700);
 const store = join(work, 'store'); await mkdir(store, { mode: 0o700 });
 const started = [], endpoints = {}, identities = new Map(), resolved = new Map();
 const state = { route: null, resolves: 0, sends: 0, hostCalls: 0, resolutions: [], sendOutcomes: [] };
 const revisions = new Map();
 const close = async () => {
  const exits = await Promise.allSettled(started.map(s => s.set.stop()));
  await rm(work, { recursive: true, force: true });
  return exits.map((x, i) => ({ set: started[i].name, exit: x.value ?? String(x.reason) }));
 };
 try {
  for (const s of sets) {
   const set = await startReceiverSet(s.launcher({ caseName, spec: { pro_head: proHead, receivers: s.receivers.map(({ id, delayMs = 0 }) => ({ id, delayMs })) } }),
    { secret: s.trusted ? secret : randomBytes(32).toString('hex'), nonce });
   started.push({ name: s.name, set, trusted: s.trusted });
   for (const r of s.receivers) { endpoints[s.name + ':' + r.id] = { ...set.receivers[r.id], id: r.id }; identities.set(r.id, r.target); }  }
  state.route = Object.keys(endpoints)[0];
  const host = {
   now: () => NOW,
   currentRevision: async id => { state.hostCalls++; return revisions.get(id) ?? null; },
   transport: {
    async resolve(op, challenge) {
     state.hostCalls++; state.resolves++;
     const route = state.route, ep = endpoints[route];
     const opDigest = digest('arc-dtb-operation/0.1', op);
     const rec = { route, endpoint: !ep ? null : ep.transport === 'stdio' ? 'stdio:' + route : ep.host + ':' + ep.port, checks: {} };
     state.resolutions.push(rec);
     let claim = {};
     try { claim = JSON.parse((await request(ep, { path: '/__identity', method: 'GET', challenge }, undefined, resolveTimeoutMs)).body); }
     catch (e) { rec.error = e.message; throw e; }
     const want = identityProof(secret, { challenge, receiver_id: String(claim.receiver_id), hostname: String(claim.hostname), uid: claim.uid, nonce });
     const got = Buffer.from(String(claim.proof ?? ''), 'hex'), wantB = Buffer.from(want, 'hex');
     Object.assign(rec.checks, { challenge: claim.challenge === challenge, nonce: claim.nonce === nonce, hostname: claim.hostname === expected.hostname,
      uid: claim.uid === expected.uid, proof: got.length === wantB.length && timingSafeEqual(got, wantB) });
     rec.claimed = { receiver_id: claim.receiver_id, hostname: claim.hostname, uid: claim.uid };
     const verified = Object.values(rec.checks).every(Boolean) && claim.receiver_id === ep.id;
     const target = verified ? identities.get(claim.receiver_id) : undefined;
     rec.identity_verified = verified; rec.target_known = Boolean(target);
     if (target) resolved.set(opDigest, route);
     return { producer: { component: 'test-host-cross-host-connector' }, operation_digest: opDigest, challenge, resolved_at_ms: NOW,
      resolution_status: 'RESOLVED', final: target ?? OTHER, final_hop_verified: Boolean(target), hops: [] };
    },
    async send(op, bytes) {
     state.hostCalls++; state.sends++;
     const opDigest = digest('arc-dtb-operation/0.1', op), route = resolved.get(opDigest);
     resolved.delete(opDigest);
     if (!route) throw new Error('no pinned resolution');
     const ep = endpoints[route];
     let res;
     try {
      res = await request(ep, { path: '/inbox', method: 'POST', headers: { 'content-type': 'application/octet-stream',
       'x-op-digest': opDigest, 'x-expected-receiver-id': ep.id, 'x-trial-nonce': nonce } }, Buffer.from(bytes), sendTimeoutMs);
     } catch (e) { state.sendOutcomes.push({ route, error: e.message }); throw e; }
     state.sendOutcomes.push({ route, status: res.status });
     if (res.status !== 204) throw new Error('receiver status ' + res.status);
    },
   },
  };
  const adapter = await createDispatchTargetAdapter({ root: store, destinations: { 'lab.receiver': APPROVED }, host, timeoutMs: resolveTimeoutMs + 1000 });
  let tail = Promise.resolve();
  const serialized = fn => { const run = tail.then(fn, fn); tail = run.catch(() => {}); return run; };
  async function issue({ body = PAYLOAD, requestId = 'test-host-req-1', revision = 1, mutate = () => {}, tamper = x => x } = {}) {
   const s = await scenario(f => {
    f.request.content_sha256 = sha(body); f.request.byte_length = body.length; f.request.destination_ref = 'lab.receiver';
    f.contract.destinations = ['lab.receiver']; f.contract.flows[0].destination_ref = 'lab.receiver';
    for (const x of f.provenance.sources) x.content_sha256 = sha(body);
   });
   Object.assign(s.context, { request_id: requestId, request_revision: revision, actor_principal: 'test-host-actor' });
   s.registry.keys[0].issuer_id = 'test-host-issuer'; s.payload.issuer_id = 'test-host-issuer';
   s.payload.receipt_id = 'test-host-receipt-' + requestId + '-' + revision + '-' + randomBytes(4).toString('hex');
   s.payload.context_digest = contextDigest(s.context);
   mutate(s);
   if (!revisions.has(requestId)) revisions.set(requestId, 1);
   return tamper(render(s), s);
  }
  return {
   state, endpoints, revisions, store, issue, close,
   receiverHosts: Object.fromEntries(started.map(s => [s.name, { ...s.set.host, bind_host: s.set.bind_host, trusted: s.trusted, session_peer: s.set.session_peer, launcher_pid: s.set.pid }])),
   dispatch: (approvalInput, payloadBytes = PAYLOAD) => serialized(() => adapter.dispatch({ approvalInput, payloadBytes })),
   setRoute: r => { state.route = r; },
  };
 } catch (e) { try { await close(); } catch { /* original error wins */ } throw e; }
}

/** Run remote-observer.mjs from `command`/`args` (local node or ssh) and parse its single JSON line. Rejects only after its process group is reaped. */
export function observe(command, args, timeoutMs = 60000) {
 return new Promise((resolve, reject) => {
  const child = track(spawn(command, args, { detached: true, stdio: ['ignore', 'pipe', 'pipe'] }));
  let out = '', err = '', settled = false;
  const reaped = async note => (await terminateGroup(child.pid, { termMs: 500, killMs: 1500 })) ? note : note + ' (UNKNOWN: process group ' + child.pid + ' not confirmed reaped)';
  const fail = async msg => { if (settled) return; settled = true; clearTimeout(t); reject(new Error(await reaped(msg))); };
  const t = setTimeout(() => { settled = true; reaped('observer timeout').then(m => reject(new Error(m))); }, timeoutMs);
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { err += d; });
  child.once('error', e => fail('observer spawn failed: ' + e.message));
  child.once('exit', async code => {
   if (settled) return; settled = true; clearTimeout(t);
   const tail = groupAlive(child.pid) ? await reaped('') : '';                   // leftover descendants of an exited observer are killed too
   if (code !== 0) return reject(new Error('observer exit ' + code + ' ' + err.trim() + tail));
   if (tail) return reject(new Error('observer left a process group' + tail));
   try { resolve({ raw: out, json: JSON.parse(out) }); } catch (e) { reject(e); }
  });
 });
}
