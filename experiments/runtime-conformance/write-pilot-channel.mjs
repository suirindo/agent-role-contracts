/** Fixed laboratory subprocess transport. Host chooses the script and channel identity.
 * No worker-selected executables, eval, shell, MCP tools, credentials or authority RPCs.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const script = fileURLToPath(new URL('./write-pilot-worker.mjs', import.meta.url));
export function runReferenceWorker(request) {
 const child = spawnSync(process.execPath, ['--permission', '--allow-fs-read=' + script, script], {
  input: JSON.stringify(request), encoding: 'utf8', timeout: 2000, maxBuffer: 1600000,
  env: {}, // no provider tokens or inherited NODE_OPTIONS
 });
 if (child.error || child.status !== 0) throw Error('WORKER_CHANNEL_FAILED');
 return JSON.parse(child.stdout);
}
export async function submitReferenceWorker(channel, operation) {
 const received = runReferenceWorker({ operation: operation.operation, path: operation.path,
  bytes_base64: Buffer.from(operation.bytes).toString('base64') });
 if (Object.keys(received).sort().join(',') !== 'bytes_base64,operation,path' ||
  typeof received.bytes_base64 !== 'string' || received.bytes_base64.length > 1398104) throw Error('WORKER_REQUEST_INVALID');
 const bytes = Buffer.from(received.bytes_base64, 'base64');
 if (bytes.toString('base64') !== received.bytes_base64) throw Error('WORKER_REQUEST_INVALID');
 // Context/identity is the host-bound channel, never returned message fields.
 return channel.submit({ operation: received.operation, path: received.path, bytes });
}
