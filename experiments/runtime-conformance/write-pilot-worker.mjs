/** Fixed synthetic worker. No credentials, authority store, host API or workspace handle.
 * Node permission restrictions are defense in depth, NOT a hostile-code sandbox.
 */
import { writeFileSync, symlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
let input = '';
for await (const chunk of process.stdin) { input += chunk; if (input.length > 1500000) process.exit(2); }
const value = JSON.parse(input);
if (value.probe) {
 const denied = {};
 for (const [name, attempt] of Object.entries({
  direct_filesystem: () => writeFileSync(value.probe, 'bypass'),
  symlink: () => symlinkSync(value.probe, value.probe + '-link'),
  bash: () => spawnSync('/bin/bash', ['-c', 'exit 0']),
  python: () => spawnSync('python3', ['-c', 'pass']),
 })) {
  try { attempt(); denied[name] = false; } catch (error) { denied[name] = error.code === 'ERR_ACCESS_DENIED'; }
 }
 process.stdout.write(JSON.stringify({ denied }));
} else {
 process.stdout.write(JSON.stringify({ operation: value.operation, path: value.path, bytes_base64: value.bytes_base64 }));
}
