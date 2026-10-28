/** Receiver-only child. Observes actual local sockets and received bytes, not agent logs. */
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
if (process.argv[2] !== '--loopback-observer' || typeof process.send !== 'function') throw new Error('LAB_OBSERVER_EXPLICIT_FORK_REQUIRED');
if (process.argv.length > 4 || (process.argv[3] !== undefined && process.argv[3] !== '--drop-response')) throw new Error('LAB_OBSERVER_MODE_INVALID');
const dropResponse = process.argv[3] === '--drop-response';
const receipts = [];
let connections = 0, invalid = 0, closing = false;
const server = createServer((req,res) => {
 if (receipts.length >= 16) { invalid++; req.destroy(); return; }
 if (req.method !== 'POST' || req.url !== '/report' || req.headers['content-type'] !== 'text/plain; charset=utf-8') {
  invalid++; req.resume(); res.writeHead(400); res.end(); return;
 }
 let size = 0, chunks = [];
 req.setTimeout(2000, () => req.destroy());
 req.on('data', chunk => {
  size += chunk.length;
  if (size > 65536) { invalid++; chunks = []; req.destroy(); } else chunks.push(chunk);
 });
 req.on('end', () => {
  if (size > 65536) return;
  const body = Buffer.concat(chunks);
  if (receipts.length >= 16) { invalid++; req.destroy(); return; }
  receipts.push({ byte_length: body.length, content_sha256: 'sha256:' + createHash('sha256').update(body).digest('hex') });
  // Deliberate fault only after observing the complete body; never fabricate a no-send.
  if (dropResponse) req.socket.destroy();
  else { res.writeHead(204); res.end(); }
 });
 req.on('error', () => { invalid++; });
});
const deadline = setTimeout(() => {
 server.closeAllConnections(); server.close();
 if (process.connected) process.disconnect(); process.exitCode = 2;
}, 30000);
server.maxConnections = 8;
server.requestTimeout = 3000;
server.headersTimeout = 3000;
server.on('connection', socket => { connections++; socket.setTimeout(3000, () => socket.destroy()); });
server.on('error', () => { process.send?.({ type:'fault' }); process.exitCode = 2; });
process.on('message', message => {
 if (!message || !Number.isSafeInteger(message.id)) return;
 if (message.type === 'snapshot') process.send?.({ type:'snapshot',id:message.id,connections,invalid,receipts:[...receipts] });
 else if (message.type === 'close' && !closing) {
  closing = true; clearTimeout(deadline); server.closeAllConnections();
  server.close(() => { if (process.connected) { process.send?.({type:'closed',id:message.id}); process.disconnect(); } });
 }
});
process.on('disconnect', () => { clearTimeout(deadline); server.closeAllConnections(); server.close(); });
server.listen({ host:'127.0.0.1', port:0, exclusive:true }, () => {
 const address = server.address();
 if (!address || address.address !== '127.0.0.1') { server.close(); process.exitCode=2; return; }
 process.send?.({ type:'ready',port:address.port,address:address.address });
});
