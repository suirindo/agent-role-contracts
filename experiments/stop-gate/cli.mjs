#!/usr/bin/env node
// Stop gate CLI: node experiments/stop-gate/cli.mjs --bundle B --task T --handoff H [--format json|text] [--core <module>]
// Exit 0: the stop is recorded consistently (ACCEPT_COMPLETE or ACCEPT_HANDOFF). Exit 1: REJECT. Exit 2: argument/input error.
import { closeSync, constants, existsSync, fstatSync, lstatSync, openSync, readSync } from 'node:fs';
import { evaluateStop, exitCodeFor, renderText } from './stop-gate.mjs';

const MAX_INPUT_BYTES = 1024 * 1024;
const fail = (code, detail = '') => { process.stderr.write(`STOP_GATE_ERROR: ${code}${detail ? ' ' + detail : ''}\n`); process.exit(2); };

function readDeclaration(path) {
 // Mirror the stable CLI: a regular file, no symlink at the final component, bounded size, read through the opened descriptor.
 if (lstatSync(path).isSymbolicLink()) throw new Error('INPUT_SYMLINK_REFUSED');
 const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0));
 try {
  const s = fstatSync(fd); if (!s.isFile()) throw new Error('INPUT_NOT_REGULAR_FILE'); if (s.size > MAX_INPUT_BYTES) throw new Error('INPUT_TOO_LARGE');
  const bytes = Buffer.alloc(MAX_INPUT_BYTES + 1); let n = 0;
  for (let r = 1; r > 0 && n <= MAX_INPUT_BYTES; n += r) r = readSync(fd, bytes, n, bytes.length - n, null);
  if (n > MAX_INPUT_BYTES) throw new Error('INPUT_TOO_LARGE');
  return bytes.subarray(0, n).toString('utf8');
 } finally { closeSync(fd); }
}

const args = process.argv.slice(2), opts = { format: 'json' };
for (let i = 0; i < args.length; i++) {
 const key = args[i];
 if (!/^--(bundle|task|handoff|format|core)$/.test(key) || i + 1 >= args.length) fail('USAGE', '--bundle B --task T --handoff H [--format json|text] [--core <module>]');
 opts[key.slice(2)] = args[++i];
}
for (const k of ['bundle', 'task', 'handoff']) if (!opts[k]) fail('USAGE', `--${k} is required`);
if (!['json', 'text'].includes(opts.format)) fail('USAGE', '--format must be json or text');

// Default core: this repository's source when the gate runs from its checkout, otherwise the installed stable package.
const sibling = new URL('../../src/core.mjs', import.meta.url);
const coreSpecifier = opts.core ?? (existsSync(sibling) ? sibling.href : '@netsujo/agent-role-contracts/core');
let core; try { core = await import(coreSpecifier); } catch (e) { fail('CORE_UNAVAILABLE', coreSpecifier); }
if (typeof core.validateHandoff !== 'function') fail('CORE_UNAVAILABLE', 'module does not export validateHandoff');

let inputs; try { inputs = { bundleJson: readDeclaration(opts.bundle), taskJson: readDeclaration(opts.task), handoffJson: readDeclaration(opts.handoff) }; }
catch (e) { fail(/^INPUT_/.test(e.message) ? e.message : 'INPUT_UNREADABLE', e.code ?? ''); }

const report = evaluateStop(inputs, core);
process.stdout.write(opts.format === 'text' ? renderText(report) : JSON.stringify(report, null, 2) + '\n');
process.exit(exitCodeFor(report));
