#!/usr/bin/env node
// Offline SSH process double for run-cross-host tests. It never opens a socket; remote commands execute under local sh.
import { appendFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const options = new Map();
for (let i = 0; i < args.length; i++) if (args[i] === '-o') {
 const [key, ...rest] = String(args[++i]).split('='); options.set(key.toLowerCase(), rest.join('='));
}
appendFileSync(process.env.FAKE_SSH_LOG, JSON.stringify({ args, options: Object.fromEntries(options) }) + '\n');
const get = k => options.get(k.toLowerCase());
for (const [k, v] of [['BatchMode', 'yes'], ['ClearAllForwardings', 'yes'], ['StrictHostKeyChecking', 'yes']]) {
 if (get(k) !== v) { process.stderr.write('missing pinned option ' + k + '\n'); process.exit(90); }
}
if (!get('UserKnownHostsFile') || !get('HostKeyAlias')) { process.stderr.write('missing host pin identity\n'); process.exit(91); }

if (args.includes('-G')) {
 const mode = process.env.FAKE_SSH_POLICY ?? 'strict';
 const lines = {
  batchmode: 'yes', clearallforwardings: 'yes', stricthostkeychecking: mode === 'permissive' ? 'false' : 'true',
  hostkeyalias: mode === 'mismatch' ? 'wrong-alias' : get('HostKeyAlias'), userknownhostsfile: get('UserKnownHostsFile'),
  globalknownhostsfile: mode === 'global-known-hosts' ? '/etc/ssh/ssh_known_hosts' : get('GlobalKnownHostsFile'),
  hostkeyalgorithms: get('HostKeyAlgorithms'), verifyhostkeydns: 'false', updatehostkeys: 'false', checkhostip: 'no',
  forwardagent: 'no', forwardx11: 'no', permitlocalcommand: 'no', user: 'fake', port: '22',
 };
 if (process.env.FAKE_SSH_PROXY) lines.proxycommand = process.env.FAKE_SSH_PROXY;
 if (mode === 'proxyjump') lines.proxyjump = 'evil.example';
 if (mode === 'localcommand') lines.localcommand = 'touch /tmp/pwned';
 if (mode === 'knownhostscommand') lines.knownhostscommand = '/tmp/kh';
 process.stdout.write(Object.entries(lines).map(([k, v]) => k + ' ' + v).join('\n') + '\n');
 process.exit(0);
}
const remote = args.at(-1);
if (process.env.FAKE_SSH_HANG_ON && remote.includes(process.env.FAKE_SSH_HANG_ON)) setInterval(() => {}, 1000);
else {
 const child = spawn('/bin/sh', ['-c', remote], { stdio: ['pipe', 'pipe', 'pipe'] });
 process.stdin.pipe(child.stdin); child.stdout.pipe(process.stdout); child.stderr.pipe(process.stderr);
 child.once('exit', (code, signal) => { if (signal) process.kill(process.pid, signal); else process.exit(code ?? 1); });
}
