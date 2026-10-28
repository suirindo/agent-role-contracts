/**
 * Separate loopback receiver for the TEST host. Run as its own child process; it is the independent effect observer.
 * Binds 127.0.0.1 only. Every accepted POST is appended to its own log BEFORE any (optionally delayed) response.
 * argv: <receiver_id> <log_path> [respond_delay_ms]
 */
import http from 'node:http';
import { createHash } from 'node:crypto';
import { appendFileSync } from 'node:fs';

const [id, logPath, delay = '0'] = process.argv.slice(2);
if (!id || !logPath) process.exit(2);
const MAX = 65536;
const server = http.createServer((req, res) => {
 if (req.method === 'GET' && req.url === '/__identity') {
  res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ receiver_id: id })); return;
 }
 if (req.method !== 'POST' || req.url !== '/inbox') { res.writeHead(404).end(); return; }
 // The sender pins the receiver it resolved; a receiver that is not that one refuses without recording an effect.
 if (req.headers['x-expected-receiver-id'] !== id) { res.writeHead(421).end(); return; }
 const chunks = []; let size = 0;
 req.on('data', c => { size += c.length; if (size <= MAX) chunks.push(c); });
 req.on('end', () => {
  if (size > MAX) { res.writeHead(413).end(); return; }
  const body = Buffer.concat(chunks);
  appendFileSync(logPath, JSON.stringify({ receiver_id: id, path: req.url, op_digest: req.headers['x-op-digest'] ?? null,
   byte_length: body.length, sha256: 'sha256:' + createHash('sha256').update(body).digest('hex') }) + '\n', { mode: 0o600 });
  setTimeout(() => res.writeHead(204).end(), Number(delay));
 });
});
server.listen(0, '127.0.0.1', () => process.stdout.write(JSON.stringify({ receiver_id: id, port: server.address().port }) + '\n'));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
