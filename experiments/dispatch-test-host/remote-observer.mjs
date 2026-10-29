/**
 * Cross-host TEST observer (#69). Runs on the RECEIVER host, as the receiver host's user, as its own process AFTER the receiver
 * sets have stopped. It never talks to the sender: it reads the receiver-written logs under <trial_root>/<case>/ and prints one
 * JSON observation (per-case per-receiver counts, effect hashes, peers, manifests, file hashes/owners) to stdout.
 * Dependency-free (node: builtins only). argv: <trial_root>
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { hostname, userInfo } from 'node:os';
import { join } from 'node:path';

const root = process.argv[2];
if (!root) process.exit(2);
const sha = b => 'sha256:' + createHash('sha256').update(b).digest('hex');
const uid = process.getuid();
const files = [], cases = {}, anomalies = [];
for (const name of readdirSync(root).sort()) {
 const dir = join(root, name);
 if (!statSync(dir).isDirectory() || name === 'bin') continue;
 const c = cases[name] = { manifest: null, receivers: {} };
 for (const f of readdirSync(dir).sort()) {
  const p = join(dir, f), st = statSync(p), bytes = readFileSync(p);
  files.push({ path: name + '/' + f, size: st.size, sha256: sha(bytes), owner_uid: st.uid, mode: (st.mode & 0o777).toString(8) });
  if (st.uid !== uid) anomalies.push('not owned by observer uid: ' + name + '/' + f);
  if (st.mode & 0o022) anomalies.push('group/world writable: ' + name + '/' + f);
  if (f === 'manifest.json') { c.manifest = JSON.parse(bytes.toString('utf8')); continue; }
  if (!f.endsWith('.jsonl')) continue;
  const recs = bytes.toString('utf8').split('\n').filter(Boolean).map(x => JSON.parse(x));
  const effects = recs.filter(r => r.kind === 'effect');
  c.receivers[f.slice(0, -6)] = {
   identity_probes: recs.filter(r => r.kind === 'identity_probe').length,
   refused_requests: recs.filter(r => r.kind === 'request').length,
   effects: effects.length,
   effect_sha256: effects.map(r => r.sha256), effect_byte_length: effects.map(r => r.byte_length), effect_op_digest: effects.map(r => r.op_digest),
   peers: [...new Set(recs.map(r => String(r.peer).replace(/:\d+$/, '')))],
   nonces: [...new Set(recs.map(r => r.nonce))],
   records: recs,
  };
 }
}
process.stdout.write(JSON.stringify({ profile: 'arc69-xhost-observer/0.1', observer: { hostname: hostname(), uid, user: userInfo().username, pid: process.pid,
 node: process.version, observed_at_ms: Date.now() }, trial_root: root, anomalies, files, cases }) + '\n');
