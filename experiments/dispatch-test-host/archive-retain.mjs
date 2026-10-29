/**
 * Cancellable archive/retention helper. It remains in its parent's owned process group, as do both ssh children, so the trial's
 * absolute deadline can kill the complete tree while large archive writes, reads and hashing happen off the deadline-owning loop.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { copyFile, open, rm } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';

const MAX = 256 << 20;
let input = '';
for await (const chunk of process.stdin) input += chunk;
const { sshArgs, remote, temporary, retained } = JSON.parse(input);
if (!Array.isArray(sshArgs) || typeof remote !== 'string' || !Array.isArray(temporary) || temporary.length !== 2 || typeof retained !== 'string') throw new Error('bad archive helper input');

async function fetch(file) {
 const child = spawn('ssh', [...sshArgs, remote], { stdio: ['ignore', 'pipe', 'pipe'] });
 let bytes = 0, stderr = '';
 child.stderr.setEncoding('utf8'); child.stderr.on('data', d => { if (stderr.length < 4096) stderr += d; });
 child.stdout.on('data', d => { bytes += d.length; if (bytes > MAX) child.kill('SIGKILL'); });
 const exited = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => code === 0 && bytes <= MAX ? resolve() : reject(new Error('ssh archive exited ' + (code ?? signal) + ': ' + stderr.trim().split('\n')[0]))); });
 await Promise.all([pipeline(child.stdout, createWriteStream(file, { mode: 0o600 })), exited]);
 if (!bytes) throw new Error('archive is empty');
 return bytes;
}

async function hash(file) {
 const digest = createHash('sha256'); let bytes = 0;
 for await (const chunk of createReadStream(file)) { bytes += chunk.length; if (bytes > MAX) throw new Error('archive exceeds 256 MiB'); digest.update(chunk); }
 return { bytes, sha256: 'sha256:' + digest.digest('hex') };
}

try {
 await fetch(temporary[0]); await fetch(temporary[1]);
 const first = await hash(temporary[0]), second = await hash(temporary[1]);
 if (!first.bytes || first.bytes !== second.bytes || first.sha256 !== second.sha256) throw new Error('root is empty or not stable between two reads');
 await copyFile(temporary[0], retained);
 const handle = await open(retained, 'r'); await handle.sync(); await handle.close();
 const readback = await hash(retained);
 if (readback.bytes !== first.bytes || readback.sha256 !== first.sha256) throw new Error('retained archive readback mismatch');
 process.stdout.write(JSON.stringify(first));
} catch (e) {
 await rm(retained, { force: true }).catch(() => {});
 console.error(e.message); process.exitCode = 1;
} finally {
 await Promise.all(temporary.map(file => rm(file, { force: true }).catch(() => {})));
}
