/**
 * Cross-host TEST receiver set (#69). Runs on the RECEIVER host under the receiver host's own user (e.g. started over SSH),
 * dependency-free (node: builtins only). It is a separate effect observer: every request is appended to its own log on the
 * receiver host, and every accepted POST is recorded BEFORE any (optionally delayed) response.
 *
 * argv: <run_dir> <bind> <spec_json> [max_lifetime_ms]   spec_json: {"pro_head": "...", "receivers": [{"id": "...", "delayMs": 0}]}
 *  bind = an IP address: one HTTP listener per receiver on that address only.
 *  bind = "stdio": NO network listener. Requests arrive as JSON lines on this process's own stdin (i.e. inside the SSH session
 *         that started it) and responses leave as JSON lines on stdout. No port is opened or forwarded.
 * stdin: first line JSON {"secret": <64 hex>, "nonce": <32 hex>} (memory only, never written). EOF on stdin (the sender's
 *        session ended) stops everything and exits; a hard lifetime cap stops it regardless. No persistent service.
 * stdout: one handshake line {"receivers":[{"id","port"}],"host":{...},"bind_host":...}; in stdio mode then one line per response.
 */
import http from 'node:http';
import { createHash, createHmac } from 'node:crypto';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { hostname, userInfo } from 'node:os';
import { join } from 'node:path';

const [runDir, bind, specJson, lifetime = '180000'] = process.argv.slice(2);
if (!runDir || !bind || !specJson) process.exit(2);
const spec = JSON.parse(specJson);
const MAX = 65536, ID = /^[a-z0-9-]{1,32}$/, HEX32 = /^[0-9a-f]{32}$/;
if (!Array.isArray(spec.receivers) || !spec.receivers.length || !spec.receivers.every(r => ID.test(r.id))) process.exit(2);
const self = Object.freeze({ hostname: hostname(), uid: process.getuid(), user: userInfo().username, pid: process.pid,
 platform: process.platform, arch: process.arch, node: process.version });
const sha = b => 'sha256:' + createHash('sha256').update(b).digest('hex');
// In stdio mode the only peer is the SSH session; sshd's SSH_CLIENT names the connecting address as seen by this host.
const sessionPeer = 'ssh-stdio:' + String(process.env.SSH_CLIENT ?? 'unknown').split(' ').slice(0, 2).join(':');

/** The identity proof an endpoint gives for a resolver challenge (mirrored in cross-host.mjs). Only a holder of the per-case secret can produce it. */
function identityProof(secret, { challenge, receiver_id, hostname: h, uid, nonce }) {
 return createHmac('sha256', Buffer.from(secret, 'hex')).update(['arc69-xhost-identity/0.1', challenge, receiver_id, h, String(uid), nonce].join('\n')).digest('hex');
}

/** One receiver's request handling, independent of transport. Returns { status, body, delayMs }; records before returning. */
function makeHandler({ id, delayMs = 0 }, secret, nonce) {
 const log = join(runDir, id + '.jsonl');
 const note = rec => appendFileSync(log, JSON.stringify({ t_ms: Date.now(), receiver_id: id, nonce, ...rec }) + '\n', { mode: 0o600 });
 return ({ peer, method, path, challenge, headers, body, size }) => {
  if (method === 'GET' && path === '/__identity') {
   const ok = HEX32.test(challenge ?? '');
   note({ kind: 'identity_probe', peer, accepted: ok });
   if (!ok) return { status: 400, body: '' };
   const claim = { receiver_id: id, hostname: self.hostname, uid: self.uid, nonce };
   return { status: 200, body: JSON.stringify({ ...claim, challenge, proof: identityProof(secret, { challenge, ...claim }) }) };
  }
  const base = { kind: 'request', peer, method, path, op_digest: headers['x-op-digest'] ?? null, byte_length: size, sha256: size <= MAX ? sha(body) : null };
  // Refusals are recorded as requests but are not effects: wrong path, wrong pinned receiver, wrong trial nonce, oversized.
  const refusal = method !== 'POST' || path !== '/inbox' ? 404 : headers['x-expected-receiver-id'] !== id ? 421
   : headers['x-trial-nonce'] !== nonce ? 421 : size > MAX ? 413 : 0;
  if (refusal) { note({ ...base, accepted: false, status: refusal }); return { status: refusal, body: '' }; }
  note({ ...base, kind: 'effect', accepted: true, status: 204 });
  return { status: 204, body: '', delayMs: Number(delayMs) };
 };
}

const servers = [];
let stopping = false;
function stop(code) {
 if (stopping) return; stopping = true;
 let left = servers.length; if (!left) process.exit(code);
 for (const s of servers) s.close(() => { if (--left === 0) process.exit(code); });
 setTimeout(() => process.exit(code), 3000).unref();
}

async function main() {
 let buf = '';
 const lines = [];
 let wake = null, ended = false;
 process.stdin.setEncoding('utf8');
 process.stdin.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { lines.push(buf.slice(0, i)); buf = buf.slice(i + 1); } wake?.(); });
 process.stdin.on('end', () => { ended = true; wake?.(); });
 const next = async () => { while (!lines.length) { if (ended) return null; await new Promise(r => { wake = r; }); wake = null; } return lines.shift(); };
 const first = await next();
 if (first === null) process.exit(2);
 const { secret, nonce } = JSON.parse(first);
 if (!/^[0-9a-f]{64}$/.test(secret) || !HEX32.test(nonce)) process.exit(2);
 setTimeout(() => stop(3), Number(lifetime)).unref();
 process.on('SIGTERM', () => stop(0)); process.on('SIGHUP', () => stop(0));

 mkdirSync(runDir, { recursive: true, mode: 0o700 });
 writeFileSync(join(runDir, 'manifest.json'), JSON.stringify({ profile: 'arc69-xhost-receiver/0.1', nonce, pro_head: String(spec.pro_head ?? ''),
  started_at_ms: Date.now(), bind_host: bind, session_peer: bind === 'stdio' ? sessionPeer : null, receiver_host: self, receivers: spec.receivers }) + '\n', { mode: 0o600, flag: 'wx' });
 const handlers = Object.fromEntries(spec.receivers.map(r => [r.id, makeHandler(r, secret, nonce)]));

 if (bind === 'stdio') {
  process.stdout.write(JSON.stringify({ receivers: spec.receivers.map(r => ({ id: r.id, port: null })), host: self, bind_host: 'stdio', session_peer: sessionPeer }) + '\n');
  for (let line; (line = await next()) !== null;) {
   let m; try { m = JSON.parse(line); } catch { continue; }
   const h = handlers[m.receiver_id];
   const reply = x => process.stdout.write(JSON.stringify({ seq: m.seq, ...x }) + '\n');
   if (!h) { reply({ status: 404, body: '' }); continue; }
   const body = Buffer.from(String(m.body_b64 ?? ''), 'base64');
   const r = h({ peer: sessionPeer, method: m.method, path: m.path, challenge: m.challenge, headers: m.headers ?? {}, body, size: body.length });
   if (r.delayMs) setTimeout(() => reply({ status: r.status, body: r.body }), r.delayMs); else reply({ status: r.status, body: r.body });
  }
  setTimeout(() => process.exit(0), 2000).unref();   // stdin EOF: let delayed replies flush, then exit
  return;
 }

 process.stdin.on('end', () => stop(0));
 const out = [];
 for (const r of spec.receivers) {
  const handle = handlers[r.id];
  const server = http.createServer((req, res) => {
   const url = new URL(req.url, 'http://x');
   const chunks = []; let size = 0;
   req.on('data', c => { size += c.length; if (size <= MAX) chunks.push(c); });
   req.on('end', () => {
    const x = handle({ peer: req.socket.remoteAddress + ':' + req.socket.remotePort, method: req.method, path: url.pathname,
     challenge: url.searchParams.get('challenge'), headers: req.headers, body: Buffer.concat(chunks), size });
    const send = () => { res.writeHead(x.status, x.body ? { 'content-type': 'application/json' } : {}); res.end(x.body); };
    if (x.delayMs) setTimeout(send, x.delayMs); else send();
   });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, bind, resolve); });
  servers.push(server); out.push({ id: r.id, port: server.address().port });
 }
 process.stdout.write(JSON.stringify({ receivers: out, host: self, bind_host: bind }) + '\n');
}
main().catch(e => { process.stderr.write('remote-receiver: ' + e.message + '\n'); process.exit(4); });
